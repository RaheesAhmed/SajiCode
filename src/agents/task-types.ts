/**
 * Represents a single task node in the task graph.
 * Each task has an ID, assigned agent, description, dependencies, and status.
 */
export interface TaskNode {
  id: string;
  agent: string;
  description: string;
  dependencies: string[];
  estimatedTime: number;
  priority: number;
  status: "pending" | "running" | "completed" | "blocked" | "failed";
  result?: unknown;
  error?: Error;
}

/**
 * Tracks progress of a single task.
 */
export interface TaskProgress {
  taskId: string;
  status: TaskNode["status"];
  progress: number;
  message: string;
}

export type TaskStatus = TaskNode["status"];

/**
 * Represents the load information for an agent.
 */
export interface AgentLoad {
  agent: string;
  currentLoad: number;
  maxLoad: number;
  avgCompletionTime: number;
}

/**
 * Event payloads for task graph events.
 */
export interface TaskEventPayload {
  taskId: string;
}

export interface TaskCompletedPayload extends TaskEventPayload {
  result?: unknown;
}

export interface TaskFailedPayload extends TaskEventPayload {
  error: Error;
}

export interface TaskBlockedPayload extends TaskEventPayload {
  blockedBy: string;
}

export interface AllCompletePayload {
  total: number;
  completed: number;
  progress: TaskProgress[];
}