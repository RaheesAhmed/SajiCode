import fs from "node:fs/promises";
import path from "node:path";
import { isCronDue, parseIntervalMs } from "./cron.js";

export type TaskStatus =
  | "queued"
  | "planning"
  | "running"
  | "verifying"
  | "done"
  | "failed"
  | "blocked"
  | "cancelled";

export type TaskKind = "agent" | "heartbeat" | "consolidation";

export interface TaskRecord {
  id: string;
  prompt: string;
  kind: TaskKind;
  status: TaskStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  cron?: string;
  every?: string;
  retries: number;
  maxRetries: number;
  result?: string;
  error?: string;
  source?: string;
}

export interface TaskStore {
  version: 1;
  tasks: TaskRecord[];
}

const TASKS_FILE = ".sajicode/tasks.json";

function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function tasksPath(projectPath: string): string {
  return path.join(projectPath, TASKS_FILE);
}

export async function loadTaskStore(projectPath: string): Promise<TaskStore> {
  try {
    const raw = await fs.readFile(tasksPath(projectPath), "utf-8");
    return JSON.parse(raw) as TaskStore;
  } catch {
    return { version: 1, tasks: [] };
  }
}

export async function saveTaskStore(
  projectPath: string,
  store: TaskStore,
): Promise<void> {
  await fs.mkdir(path.dirname(tasksPath(projectPath)), { recursive: true });
  if (store.tasks.length > 500) {
    store.tasks = store.tasks.slice(-500);
  }
  await fs.writeFile(tasksPath(projectPath), JSON.stringify(store, null, 2), "utf-8");
}

export interface AddTaskInput {
  prompt: string;
  kind?: TaskKind;
  priority?: number;
  cron?: string;
  every?: string;
  maxRetries?: number;
  source?: string;
}

export async function addTask(
  projectPath: string,
  input: AddTaskInput,
): Promise<TaskRecord> {
  const store = await loadTaskStore(projectPath);
  const now = new Date().toISOString();

  const task: TaskRecord = {
    id: generateId(),
    prompt: input.prompt.trim(),
    kind: input.kind ?? "agent",
    status: "queued",
    priority: input.priority ?? 5,
    createdAt: now,
    updatedAt: now,
    retries: 0,
    maxRetries: input.maxRetries ?? 3,
    ...(input.cron ? { cron: input.cron } : {}),
    ...(input.every ? { every: input.every } : {}),
    ...(input.source ? { source: input.source } : {}),
  };

  store.tasks.push(task);
  await saveTaskStore(projectPath, store);
  return task;
}

export async function listTasks(
  projectPath: string,
  options: { status?: TaskStatus; limit?: number } = {},
): Promise<TaskRecord[]> {
  const store = await loadTaskStore(projectPath);
  let tasks = [...store.tasks];

  if (options.status) {
    tasks = tasks.filter((t) => t.status === options.status);
  }

  tasks.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const limit = options.limit ?? 50;
  return tasks.slice(0, limit);
}

export async function getTask(
  projectPath: string,
  taskId: string,
): Promise<TaskRecord | undefined> {
  const store = await loadTaskStore(projectPath);
  return store.tasks.find((t) => t.id === taskId);
}

export async function updateTask(
  projectPath: string,
  taskId: string,
  patch: Partial<TaskRecord>,
): Promise<TaskRecord | undefined> {
  const store = await loadTaskStore(projectPath);
  const index = store.tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return undefined;

  const updated: TaskRecord = {
    ...store.tasks[index]!,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store.tasks[index] = updated;
  await saveTaskStore(projectPath, store);
  return updated;
}

export async function cancelTask(
  projectPath: string,
  taskId: string,
): Promise<boolean> {
  const updated = await updateTask(projectPath, taskId, { status: "cancelled" });
  return updated != null;
}

export async function claimNextRunnableTask(
  projectPath: string,
): Promise<TaskRecord | null> {
  const store = await loadTaskStore(projectPath);
  const now = Date.now();

  const runnable = store.tasks
    .filter((t) => t.status === "queued" || t.status === "blocked")
    .filter((t) => {
      if (!t.nextRunAt) return true;
      return Date.parse(t.nextRunAt) <= now;
    })
    .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));

  const task = runnable[0];
  if (!task) return null;

  task.status = "running";
  task.startedAt = new Date().toISOString();
  task.updatedAt = task.startedAt;
  await saveTaskStore(projectPath, store);
  return task;
}

export async function completeTask(
  projectPath: string,
  taskId: string,
  result: string,
): Promise<void> {
  const task = await getTask(projectPath, taskId);
  if (!task) return;

  const now = new Date();
  const patch: Partial<TaskRecord> = {
    status: "done",
    completedAt: now.toISOString(),
    result,
    lastRunAt: now.toISOString(),
  };

  if (task.cron || task.every) {
    patch.status = "queued";
    patch.startedAt = undefined;
    patch.completedAt = undefined;
    if (task.every) {
      const ms = parseIntervalMs(task.every);
      if (ms) patch.nextRunAt = new Date(now.getTime() + ms).toISOString();
    } else if (task.cron) {
      patch.nextRunAt = now.toISOString();
    }
  }

  await updateTask(projectPath, taskId, patch);
}

export async function failTask(
  projectPath: string,
  taskId: string,
  error: string,
): Promise<void> {
  const task = await getTask(projectPath, taskId);
  if (!task) return;

  const retries = task.retries + 1;
  if (retries >= task.maxRetries) {
    await updateTask(projectPath, taskId, {
      status: "failed",
      error,
      retries,
      completedAt: new Date().toISOString(),
    });
    return;
  }

  const backoffMs = Math.min(60_000 * retries, 900_000);
  await updateTask(projectPath, taskId, {
    status: "queued",
    error,
    retries,
    nextRunAt: new Date(Date.now() + backoffMs).toISOString(),
    startedAt: undefined,
  });
}

export async function getDueScheduledTasks(projectPath: string): Promise<TaskRecord[]> {
  const store = await loadTaskStore(projectPath);
  const now = new Date();

  return store.tasks.filter((task) => {
    if (task.status === "cancelled" || task.status === "failed") return false;
    if (task.status === "running") return false;

    if (task.every) {
      if (!task.nextRunAt) return true;
      return Date.parse(task.nextRunAt) <= now.getTime();
    }

    if (task.cron) {
      const lastRun = task.lastRunAt ? new Date(task.lastRunAt) : undefined;
      return isCronDue(task.cron, now, lastRun);
    }

    return false;
  });
}

export async function enqueueDueScheduledTasks(projectPath: string): Promise<number> {
  const due = await getDueScheduledTasks(projectPath);
  let count = 0;

  for (const task of due) {
    if (task.status !== "queued") {
      await updateTask(projectPath, task.id, { status: "queued" });
    }
    count++;
  }

  return count;
}

export function formatTaskList(tasks: TaskRecord[]): string {
  if (tasks.length === 0) return "No tasks in queue.";

  const lines = ["Task queue:", ""];
  for (const t of tasks) {
    const schedule = t.cron ? ` cron=${t.cron}` : t.every ? ` every=${t.every}` : "";
    lines.push(
      `• ${t.id} [${t.status}] p${t.priority} ${t.kind}${schedule}`,
      `  ${t.prompt.slice(0, 120)}${t.prompt.length > 120 ? "…" : ""}`,
    );
  }
  return lines.join("\n");
}

export async function recoverStaleRunningTasks(
  projectPath: string,
  staleAfterMs = 2 * 60 * 60 * 1000,
): Promise<number> {
  const store = await loadTaskStore(projectPath);
  const now = Date.now();
  let count = 0;

  for (const task of store.tasks) {
    if (task.status !== "running" || !task.startedAt) continue;
    if (now - Date.parse(task.startedAt) < staleAfterMs) continue;
    task.status = "queued";
    task.startedAt = undefined;
    task.updatedAt = new Date().toISOString();
    count++;
  }

  if (count > 0) await saveTaskStore(projectPath, store);
  return count;
}
