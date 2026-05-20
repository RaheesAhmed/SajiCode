/**
 * Task graph tools for dependency-aware PM planning.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TaskGraph } from "../agents/task-graph.js";
import { WorkloadBalancer } from "../agents/workload-balancer.js";
import type { TaskNode } from "../agents/task-types.js";

const DEFAULT_AGENTS = [
  "backend-lead",
  "frontend-lead",
  "fullstack-lead",
  "qa-lead",
  "security-lead",
  "deploy-lead",
  "data-ai-lead",
  "platform-lead",
  "mobile-lead",
  "review-agent",
];

const taskGraphs = new Map<string, TaskGraph>();
const workloadBalancers = new Map<string, WorkloadBalancer>();

function normalizeTask(input: {
  id: string;
  agent?: string;
  description: string;
  dependencies?: string[];
  estimatedTime?: number;
  priority?: number;
}): TaskNode {
  return {
    id: input.id,
    agent: input.agent ?? "",
    description: input.description,
    dependencies: input.dependencies ?? [],
    estimatedTime: input.estimatedTime ?? 60,
    priority: input.priority ?? 5,
    status: "pending",
  };
}

export function getTaskGraph(sessionId: string): TaskGraph {
  if (!taskGraphs.has(sessionId)) {
    taskGraphs.set(sessionId, new TaskGraph());
  }
  return taskGraphs.get(sessionId)!;
}

export function getWorkloadBalancer(sessionId: string): WorkloadBalancer {
  if (!workloadBalancers.has(sessionId)) {
    const balancer = new WorkloadBalancer();
    for (const agent of DEFAULT_AGENTS) {
      balancer.registerAgent(agent);
    }
    workloadBalancers.set(sessionId, balancer);
  }
  return workloadBalancers.get(sessionId)!;
}

export function clearTaskGraphSession(sessionId: string): void {
  taskGraphs.delete(sessionId);
  workloadBalancers.delete(sessionId);
}

export function createTaskGraphTools(projectPath: string) {
  const sessionId = projectPath;

  return [
    tool(
      async () => {
        clearTaskGraphSession(sessionId);
        getTaskGraph(sessionId);
        getWorkloadBalancer(sessionId);
        return "Task graph created for this session.";
      },
      {
        name: "create_task_graph",
        description: "Reset and create a dependency-aware task graph for medium or large parallel work.",
        schema: z.object({}),
      },
    ),
    tool(
      async (input: {
        id: string;
        agent?: string;
        description: string;
        dependencies?: string[];
        estimatedTime?: number;
        priority?: number;
      }) => {
        const graph = getTaskGraph(sessionId);
        const task = normalizeTask(input);
        graph.addTask(task);
        graph.buildGraph();
        return `Task "${task.id}" added for ${task.agent || "auto-assignment"}.`;
      },
      {
        name: "add_task_node",
        description:
          "Add a task to the active task graph. Use dependencies for tasks that must complete before this one can run.",
        schema: z.object({
          id: z.string().describe("Stable task id, such as backend-api or frontend-ui"),
          agent: z.string().optional().describe("Preferred agent. Leave empty to assign automatically."),
          description: z.string().describe("Concrete work to complete"),
          dependencies: z.array(z.string()).optional().describe("Task ids that must complete first"),
          estimatedTime: z.number().optional().describe("Estimated task duration in seconds"),
          priority: z.number().optional().describe("Priority from 1 to 10, where 10 is highest"),
        }),
      },
    ),
    tool(
      async (input: { from: string; to: string }) => {
        const graph = getTaskGraph(sessionId);
        graph.addDependency(input.from, input.to);
        graph.buildGraph();
        return `Dependency added: "${input.to}" waits for "${input.from}".`;
      },
      {
        name: "add_task_dependency",
        description: "Add a dependency where task 'to' cannot run until task 'from' completes.",
        schema: z.object({
          from: z.string().describe("Task that must complete first"),
          to: z.string().describe("Task that depends on the first task"),
        }),
      },
    ),
    tool(
      async () => {
        const tasks = getTaskGraph(sessionId).getExecutableTasks();
        return JSON.stringify(
          tasks.map((taskNode) => ({
            id: taskNode.id,
            agent: taskNode.agent,
            description: taskNode.description,
            priority: taskNode.priority,
            estimatedTime: taskNode.estimatedTime,
          })),
          null,
          2,
        );
      },
      {
        name: "get_executable_tasks",
        description: "Return pending task graph nodes whose dependencies are complete and can be dispatched now.",
        schema: z.object({}),
      },
    ),
    tool(
      async (input: { taskId: string }) => {
        getTaskGraph(sessionId).markTaskRunning(input.taskId);
        return `Task "${input.taskId}" marked running.`;
      },
      {
        name: "mark_task_running",
        description: "Mark a task graph node as running immediately before dispatching it.",
        schema: z.object({ taskId: z.string() }),
      },
    ),
    tool(
      async (input: { taskId: string; result?: string }) => {
        const graph = getTaskGraph(sessionId);
        graph.markTaskComplete(input.taskId, input.result);
        return JSON.stringify(graph.getProgress(), null, 2);
      },
      {
        name: "mark_task_complete",
        description: "Mark a task graph node complete and return updated graph progress.",
        schema: z.object({
          taskId: z.string(),
          result: z.string().optional(),
        }),
      },
    ),
    tool(
      async (input: { taskId: string; error: string }) => {
        const graph = getTaskGraph(sessionId);
        graph.markTaskFailed(input.taskId, new Error(input.error));
        return JSON.stringify(graph.getProgress(), null, 2);
      },
      {
        name: "mark_task_failed",
        description: "Mark a task graph node failed and block dependent tasks.",
        schema: z.object({
          taskId: z.string(),
          error: z.string(),
        }),
      },
    ),
    tool(
      async () => JSON.stringify(getTaskGraph(sessionId).getProgress(), null, 2),
      {
        name: "get_task_graph_progress",
        description: "Return status and progress for every task in the active graph.",
        schema: z.object({}),
      },
    ),
    tool(
      async (input: { domain?: string }) => {
        const balancer = getWorkloadBalancer(sessionId);
        return JSON.stringify(balancer.getAvailableAgents(input.domain), null, 2);
      },
      {
        name: "get_available_agents",
        description: "Return registered agents that are currently below capacity, optionally filtered by domain text.",
        schema: z.object({ domain: z.string().optional() }),
      },
    ),
    tool(
      async (input: {
        taskId: string;
        agent?: string;
        description: string;
        dependencies?: string[];
        estimatedTime?: number;
        priority?: number;
      }) => {
        const balancer = getWorkloadBalancer(sessionId);
        const task = normalizeTask({
          id: input.taskId,
          agent: input.agent,
          description: input.description,
          dependencies: input.dependencies,
          estimatedTime: input.estimatedTime,
          priority: input.priority,
        });
        const assignedAgent = balancer.assignTask(task);

        if (!assignedAgent) {
          return JSON.stringify({ success: false, message: "No available agents" });
        }

        return JSON.stringify({ success: true, assignedAgent });
      },
      {
        name: "assign_task_agent",
        description: "Assign a task to the best currently available agent and reserve that agent capacity.",
        schema: z.object({
          taskId: z.string(),
          agent: z.string().optional().describe("Preferred agent or domain hint"),
          description: z.string(),
          dependencies: z.array(z.string()).optional(),
          estimatedTime: z.number().optional(),
          priority: z.number().optional(),
        }),
      },
    ),
    tool(
      async (input: { agent: string; duration: number }) => {
        getWorkloadBalancer(sessionId).trackAgentComplete(input.agent, input.duration);
        return JSON.stringify(getWorkloadBalancer(sessionId).getAllLoads(), null, 2);
      },
      {
        name: "track_agent_complete",
        description: "Release agent capacity and update historical completion time after a delegated task completes.",
        schema: z.object({
          agent: z.string(),
          duration: z.number().describe("Duration in milliseconds"),
        }),
      },
    ),
    tool(
      async () => JSON.stringify(getWorkloadBalancer(sessionId).getAllLoads(), null, 2),
      {
        name: "get_agent_loads",
        description: "Return current load, max load, and average completion time for all registered agents.",
        schema: z.object({}),
      },
    ),
  ];
}
