import { EventEmitter } from "events";
import type { TaskNode, TaskProgress, TaskEventPayload, TaskCompletedPayload, TaskFailedPayload, TaskBlockedPayload, AllCompletePayload } from "./task-types.js";

/**
 * TaskGraph manages a directed acyclic graph (DAG) of tasks with dependencies.
 * Extends EventEmitter to emit events for task state changes.
 * 
 * @example
 * const graph = new TaskGraph();
 * graph.addTask({ id: "task1", agent: "backend", description: "Create API", dependencies: [], estimatedTime: 30, priority: 1, status: "pending" });
 * graph.addTask({ id: "task2", agent: "frontend", description: "Create UI", dependencies: ["task1"], estimatedTime: 20, priority: 2, status: "pending" });
 * graph.buildGraph();
 * const executable = graph.getExecutableTasks(); // Returns task1
 */
export class TaskGraph extends EventEmitter {
  private tasks: Map<string, TaskNode> = new Map();
  private adjacencyList: Map<string, Set<string>> = new Map();
  private reverseAdjacency: Map<string, Set<string>> = new Map();

  /**
   * Add a task node to the graph.
   * @param node - The task node to add
   * @throws Error if task with same ID already exists
   */
  addTask(node: TaskNode): void {
    if (this.tasks.has(node.id)) {
      throw new Error(`Task with ID "${node.id}" already exists`);
    }
    this.tasks.set(node.id, { ...node, dependencies: [...node.dependencies] });
    this.adjacencyList.set(node.id, new Set());
    this.reverseAdjacency.set(node.id, new Set());
  }

  /**
   * Add a dependency relationship between tasks.
   * @param from - ID of the task that must complete first
   * @param to - ID of the dependent task
   * @throws Error if either task doesn't exist
   */
  addDependency(from: string, to: string): void {
    if (!this.tasks.has(from)) {
      throw new Error(`Task "${from}" does not exist`);
    }
    if (!this.tasks.has(to)) {
      throw new Error(`Task "${to}" does not exist`);
    }
    if (from === to) {
      throw new Error(`Task cannot depend on itself`);
    }

    this.adjacencyList.get(from)!.add(to);
    this.reverseAdjacency.get(to)!.add(from);

    const target = this.tasks.get(to)!;
    if (!target.dependencies.includes(from)) {
      target.dependencies.push(from);
    }
  }

  /**
   * Build the graph structure. Validates for cycles.
   * @throws Error if circular dependency detected
   */
  buildGraph(): void {
    for (const taskId of this.tasks.keys()) {
      this.adjacencyList.set(taskId, new Set());
      this.reverseAdjacency.set(taskId, new Set());
    }

    for (const [taskId, task] of this.tasks) {
      for (const dependencyId of task.dependencies) {
        if (!this.tasks.has(dependencyId)) {
          throw new Error(`Task "${taskId}" depends on missing task "${dependencyId}"`);
        }
        if (dependencyId === taskId) {
          throw new Error(`Task cannot depend on itself`);
        }

        this.adjacencyList.get(dependencyId)!.add(taskId);
        this.reverseAdjacency.get(taskId)!.add(dependencyId);
      }
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);

      for (const dependent of this.adjacencyList.get(taskId) || []) {
        if (!visited.has(dependent)) {
          if (detectCycle(dependent)) return true;
        } else if (recursionStack.has(dependent)) {
          return true;
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const taskId of this.tasks.keys()) {
      if (!visited.has(taskId)) {
        if (detectCycle(taskId)) {
          throw new Error("Circular dependency detected in task graph");
        }
      }
    }
  }

  /**
   * Get all tasks that are ready to execute (no pending dependencies).
   * @returns Array of executable tasks sorted by priority
   */
  getExecutableTasks(): TaskNode[] {
    const executable: TaskNode[] = [];

    for (const [taskId, task] of this.tasks) {
      if (task.status !== "pending") continue;

      const deps = this.reverseAdjacency.get(taskId) || new Set();
      const allDepsCompleted = Array.from(deps).every(
        (depId) => this.tasks.get(depId)?.status === "completed"
      );

      if (allDepsCompleted) {
        executable.push(task);
      }
    }

    return executable.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.estimatedTime - b.estimatedTime;
    });
  }

  /**
   * Mark a task as completed with optional result.
   * @param taskId - ID of the completed task
   * @param result - Optional result data from the task execution
   */
  markTaskComplete(taskId: string, result?: unknown): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" does not exist`);
    }

    task.status = "completed";
    task.result = result;

    this.emit("task:completed", { taskId, result } as TaskCompletedPayload);
    this.checkBlockedTasks();
    this.checkAllComplete();
  }

  /**
   * Mark a task as running.
   * @param taskId - ID of the task that started execution
   */
  markTaskRunning(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" does not exist`);
    }
    if (task.status !== "pending") {
      throw new Error(`Task "${taskId}" cannot start from status "${task.status}"`);
    }

    task.status = "running";
    this.emit("task:started", { taskId } as TaskEventPayload);
  }

  /**
   * Mark a task as failed with an error.
   * @param taskId - ID of the failed task
   * @param error - The error that caused the failure
   */
  markTaskFailed(taskId: string, error: Error): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" does not exist`);
    }

    task.status = "failed";
    task.error = error;

    this.emit("task:failed", { taskId, error } as TaskFailedPayload);
    this.blockDependentTasks(taskId);
  }

  /**
   * Get progress information for all tasks.
   * @returns Array of TaskProgress objects
   */
  getProgress(): TaskProgress[] {
    const progress: TaskProgress[] = [];

    for (const [taskId, task] of this.tasks) {
      let taskProgress = 0;
      let message = "";

      switch (task.status) {
        case "pending":
          taskProgress = 0;
          message = "Waiting to start";
          break;
        case "running":
          taskProgress = 50;
          message = "In progress";
          break;
        case "completed":
          taskProgress = 100;
          message = "Completed successfully";
          break;
        case "blocked":
          taskProgress = 0;
          message = "Blocked by failed dependency";
          break;
        case "failed":
          taskProgress = 0;
          message = task.error?.message ? `Failed: ${task.error.message}` : "Failed";
          break;
      }

      progress.push({ taskId, status: task.status, progress: taskProgress, message });
    }

    return progress;
  }

  /**
   * Get all blocked tasks.
   * @returns Array of blocked TaskNode objects
   */
  getBlockedTasks(): TaskNode[] {
    const blocked: TaskNode[] = [];

    for (const [, task] of this.tasks) {
      if (task.status === "blocked") {
        blocked.push(task);
      }
    }

    return blocked;
  }

  /**
   * Get a task by ID.
   * @param taskId - ID of the task
   * @returns The task node or undefined
   */
  getTask(taskId: string): TaskNode | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks in the graph.
   * @returns Map of all tasks
   */
  getAllTasks(): Map<string, TaskNode> {
    return new Map(this.tasks);
  }

  /** Get the number of tasks in the graph. */
  get taskCount(): number {
    return this.tasks.size;
  }

  /** Get the number of completed tasks. */
  get completedCount(): number {
    let count = 0;
    for (const [, task] of this.tasks) {
      if (task.status === "completed") count++;
    }
    return count;
  }

  /** Check if any tasks are now unblocked after a task completion. */
  private checkBlockedTasks(): void {
    for (const [taskId, task] of this.tasks) {
      if (task.status !== "pending") continue;

      const deps = this.reverseAdjacency.get(taskId) || new Set();
      const allDepsCompleted = Array.from(deps).every(
        (depId) => this.tasks.get(depId)?.status === "completed"
      );

      if (allDepsCompleted) {
        this.emit("task:ready", { taskId } as TaskEventPayload);
      }
    }
  }

  /** Block all tasks that depend on a failed task. */
  private blockDependentTasks(failedTaskId: string): void {
    const dependents = this.adjacencyList.get(failedTaskId) || new Set();

    for (const dependentId of dependents) {
      const dependent = this.tasks.get(dependentId);
      if (dependent && (dependent.status === "pending" || dependent.status === "running")) {
        dependent.status = "blocked";
        this.emit("task:blocked", { taskId: dependentId, blockedBy: failedTaskId } as TaskBlockedPayload);
        this.blockDependentTasks(dependentId);
      }
    }
  }

  /** Check if all tasks are complete. */
  private checkAllComplete(): void {
    const allComplete = Array.from(this.tasks.values()).every(
      (task) => task.status === "completed" || task.status === "blocked"
    );

    if (allComplete) {
      this.emit("all:complete", {
        total: this.tasks.size,
        completed: this.completedCount,
        progress: this.getProgress(),
      } as AllCompletePayload);
    }
  }
}
