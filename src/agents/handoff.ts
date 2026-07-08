import fs from "node:fs/promises";
import path from "node:path";
import { sendMessage } from "./message-bus.js";
import { addTask } from "../tasks/queue.js";

export type HandoffStatus = "pending" | "accepted" | "completed" | "cancelled";

export interface HandoffRecord {
  id: string;
  from: string;
  to: string;
  reason: string;
  context: string;
  status: HandoffStatus;
  createdAt: string;
  updatedAt: string;
  taskId?: string;
  blocking: boolean;
}

export interface HandoffStore {
  version: 1;
  handoffs: HandoffRecord[];
}

const HANDOFFS_FILE = ".sajicode/handoffs.json";

function generateId(): string {
  return `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loadStore(projectPath: string): Promise<HandoffStore> {
  const filePath = path.join(projectPath, HANDOFFS_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as HandoffStore;
  } catch {
    return { version: 1, handoffs: [] };
  }
}

async function saveStore(projectPath: string, store: HandoffStore): Promise<void> {
  const filePath = path.join(projectPath, HANDOFFS_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (store.handoffs.length > 200) {
    store.handoffs = store.handoffs.slice(-200);
  }
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export interface RequestHandoffInput {
  from: string;
  to: string;
  reason: string;
  context: string;
  blocking?: boolean;
  enqueueTask?: boolean;
}

export async function requestHandoff(
  projectPath: string,
  input: RequestHandoffInput,
): Promise<HandoffRecord> {
  const store = await loadStore(projectPath);
  const now = new Date().toISOString();

  const record: HandoffRecord = {
    id: generateId(),
    from: input.from,
    to: input.to,
    reason: input.reason,
    context: input.context,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    blocking: input.blocking ?? true,
  };

  if (input.enqueueTask !== false) {
    const task = await addTask(projectPath, {
      prompt: [
        `Handoff from ${input.from} to ${input.to}: ${input.reason}`,
        "",
        input.context,
      ].join("\n"),
      kind: "agent",
      priority: input.blocking ? 8 : 6,
      source: `handoff:${record.id}`,
    });
    record.taskId = task.id;
  }

  store.handoffs.push(record);
  await saveStore(projectPath, store);

  await sendMessage(projectPath, {
    from: input.from,
    to: input.to,
    subject: `Handoff: ${input.reason}`,
    body: input.context,
    blocking: input.blocking ?? true,
  });

  return record;
}

export async function listHandoffs(
  projectPath: string,
  agentName?: string,
  status?: HandoffStatus,
): Promise<HandoffRecord[]> {
  const store = await loadStore(projectPath);
  return store.handoffs.filter((h) => {
    if (agentName && h.to !== agentName && h.from !== agentName) return false;
    if (status && h.status !== status) return false;
    return true;
  });
}

export async function acceptHandoff(
  projectPath: string,
  handoffId: string,
  agentName: string,
): Promise<HandoffRecord | null> {
  const store = await loadStore(projectPath);
  const record = store.handoffs.find((h) => h.id === handoffId);
  if (!record || record.to !== agentName) return null;

  record.status = "accepted";
  record.updatedAt = new Date().toISOString();
  await saveStore(projectPath, store);
  return record;
}

export async function completeHandoff(
  projectPath: string,
  handoffId: string,
): Promise<HandoffRecord | null> {
  const store = await loadStore(projectPath);
  const record = store.handoffs.find((h) => h.id === handoffId);
  if (!record) return null;

  record.status = "completed";
  record.updatedAt = new Date().toISOString();
  await saveStore(projectPath, store);
  return record;
}

export function formatHandoffs(records: HandoffRecord[]): string {
  if (records.length === 0) return "No handoffs.";

  return [
    "Agent handoffs:",
    "",
    ...records.map(
      (h) =>
        `• ${h.id} [${h.status}] ${h.from} → ${h.to}: ${h.reason}\n  ${h.context.slice(0, 200)}`,
    ),
  ].join("\n");
}
