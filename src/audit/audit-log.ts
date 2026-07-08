import fs from "node:fs/promises";
import path from "node:path";

export interface AuditEntry {
  timestamp: string;
  event: "tool_call" | "tool_result" | "tool_error" | "hook" | "session";
  agentName?: string;
  sessionId?: string;
  toolName?: string;
  argsHash?: string;
  outcome?: "allow" | "block" | "warn" | "error";
  detail?: string;
}

const AUDIT_FILE = "audit.jsonl";

function getAuditPath(projectPath: string): string {
  return path.join(projectPath, ".sajicode", AUDIT_FILE);
}

function hashArgs(args: unknown): string {
  try {
    const raw = JSON.stringify(args ?? {});
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  } catch {
    return "unhashable";
  }
}

export async function appendAuditEntry(
  projectPath: string,
  entry: Omit<AuditEntry, "timestamp"> & { timestamp?: string },
): Promise<void> {
  const filePath = getAuditPath(projectPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const line: AuditEntry = {
    timestamp: entry.timestamp ?? new Date().toISOString(),
    event: entry.event,
    ...(entry.agentName ? { agentName: entry.agentName } : {}),
    ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
    ...(entry.toolName ? { toolName: entry.toolName } : {}),
    ...(entry.argsHash ? { argsHash: entry.argsHash } : {}),
    ...(entry.outcome ? { outcome: entry.outcome } : {}),
    ...(entry.detail ? { detail: entry.detail.slice(0, 500) } : {}),
  };

  await fs.appendFile(filePath, `${JSON.stringify(line)}\n`, "utf-8");
}

export async function auditToolCall(
  projectPath: string,
  toolName: string,
  args: unknown,
  agentName?: string,
): Promise<void> {
  await appendAuditEntry(projectPath, {
    event: "tool_call",
    toolName,
    argsHash: hashArgs(args),
    ...(agentName ? { agentName } : {}),
    outcome: "allow",
  });
}

export async function auditToolBlock(
  projectPath: string,
  toolName: string,
  reason: string,
  agentName?: string,
): Promise<void> {
  await appendAuditEntry(projectPath, {
    event: "tool_error",
    toolName,
    ...(agentName ? { agentName } : {}),
    outcome: "block",
    detail: reason,
  });
}

export async function readRecentAuditEntries(
  projectPath: string,
  limit = 50,
): Promise<AuditEntry[]> {
  const filePath = getAuditPath(projectPath);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as AuditEntry);
  } catch {
    return [];
  }
}
