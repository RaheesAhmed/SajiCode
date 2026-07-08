import type { ProjectConfig, OnboardingResult } from "../types/index.js";
import { createSajiCode, finalizeSession } from "../agents/index.js";
import { generateThreadId } from "../memory/index.js";
import { augmentInputWithMemoryContext } from "../memory/turn-context.js";
import { setAuditProjectPath } from "../agents/context-guard.js";
import { updateJob } from "./jobs.js";

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

export async function runDispatchJob(
  jobId: string,
  projectPath: string,
  config: ProjectConfig,
  onboardingResult: OnboardingResult,
  prompt: string,
): Promise<void> {
  updateJob(jobId, { status: "running", startedAt: new Date().toISOString() });

  let mcpClient: { close: () => Promise<void> } | null = null;

  try {
    setAuditProjectPath(projectPath);
    const threadId = generateThreadId();
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

    updateJob(jobId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      result: responseText.trim() || "Task completed with no text output.",
    });

    await finalizeSession(projectPath, threadId);
  } catch (error) {
    updateJob(jobId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (mcpClient) await mcpClient.close().catch(() => undefined);
  }
}
