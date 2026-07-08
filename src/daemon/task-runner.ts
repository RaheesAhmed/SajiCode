import fs from "node:fs/promises";
import path from "node:path";
import type { ProjectConfig, OnboardingResult } from "../types/index.js";
import { createSajiCode, finalizeSession } from "../agents/index.js";
import { generateThreadId } from "../memory/index.js";
import { augmentInputWithMemoryContext } from "../memory/turn-context.js";
import { setAuditProjectPath } from "../agents/context-guard.js";
import type { TaskRecord } from "../tasks/queue.js";
import { completeTask, failTask } from "../tasks/queue.js";
import { runSleepConsolidation } from "../memory/consolidation.js";

function extractTextFromStreamChunk(chunk: unknown): string {
  const [, mode, data] = chunk as [string[], string, unknown];
  if (mode !== "messages") return "";

  const items = Array.isArray(data) ? data : [data];
  let text = "";
  for (const m of items) {
    const item = m as { _getType?: () => string; type?: string; content?: unknown };
    const type = item?._getType?.() ?? item?.type ?? "";
    if (type !== "ai") continue;
    const content = item?.content;
    if (typeof content === "string") text += content;
    else if (Array.isArray(content)) {
      for (const block of content) {
        if (typeof block === "string") text += block;
        else if (
          block &&
          typeof block === "object" &&
          (block as { type?: string; text?: string }).type === "text"
        ) {
          text += (block as { text?: string }).text ?? "";
        }
      }
    }
  }
  return text;
}

const DEFAULT_ONBOARDING: OnboardingResult = {
  experienceLevel: "expert",
  projectDescription: "Daemon background task",
  projectType: "daemon",
  features: [],
  stackPreferences: {},
};

export async function runAgentTask(
  projectPath: string,
  config: ProjectConfig,
  prompt: string,
  onboardingResult: OnboardingResult = DEFAULT_ONBOARDING,
): Promise<string> {
  setAuditProjectPath(projectPath);
  const threadId = generateThreadId();
  let mcpClient: { close: () => Promise<void> } | null = null;

  try {
    const { agent, sessionConfig, mcpClient: mcp } = await createSajiCode({
      config: { ...config, projectPath },
      onboardingResult,
      threadId,
    });
    mcpClient = mcp;

    const streamInput = await augmentInputWithMemoryContext(projectPath, {
      messages: [{ role: "user", content: prompt }],
    });

    const stream = await agent.stream(streamInput, {
      ...sessionConfig,
      streamMode: ["updates", "messages", "custom"],
      subgraphs: true,
    });

    let responseText = "";
    for await (const chunk of stream) {
      responseText += extractTextFromStreamChunk(chunk);
    }

    await finalizeSession(projectPath, threadId);
    return responseText.trim() || "Task completed with no text output.";
  } finally {
    if (mcpClient) await mcpClient.close().catch(() => undefined);
  }
}

export async function executeTaskRecord(
  projectPath: string,
  config: ProjectConfig,
  task: TaskRecord,
): Promise<void> {
  try {
    if (task.kind === "consolidation") {
      const report = await runSleepConsolidation(projectPath);
      await completeTask(projectPath, task.id, report);
      return;
    }

    const result = await runAgentTask(projectPath, config, task.prompt);
    await completeTask(projectPath, task.id, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failTask(projectPath, task.id, message);
    throw error;
  }
}

export function getDaemonPidPath(projectPath: string): string {
  return path.join(projectPath, ".sajicode", "daemon.pid");
}

export async function writeDaemonPid(projectPath: string, pid: number): Promise<void> {
  const pidPath = getDaemonPidPath(projectPath);
  await fs.mkdir(path.dirname(pidPath), { recursive: true });
  await fs.writeFile(pidPath, String(pid), "utf-8");
}

export async function readDaemonPid(projectPath: string): Promise<number | null> {
  try {
    const raw = await fs.readFile(getDaemonPidPath(projectPath), "utf-8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export async function clearDaemonPid(projectPath: string): Promise<void> {
  await fs.rm(getDaemonPidPath(projectPath), { force: true }).catch(() => undefined);
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
