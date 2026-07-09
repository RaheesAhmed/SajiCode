import type { A2aAgentCard, A2aSendTaskRequest, A2aTask } from "./types.js";

export async function fetchAgentCard(baseUrl: string): Promise<A2aAgentCard> {
  const url = `${baseUrl.replace(/\/$/, "")}/.well-known/agent.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch agent card: HTTP ${response.status}`);
  }
  return (await response.json()) as A2aAgentCard;
}

export async function sendA2aTask(
  baseUrl: string,
  request: A2aSendTaskRequest,
): Promise<A2aTask> {
  const url = `${baseUrl.replace(/\/$/, "")}/a2a/tasks/send`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`A2A task send failed: HTTP ${response.status} — ${text}`);
  }

  const body = (await response.json()) as { task: A2aTask };
  return body.task;
}

export async function pollA2aTask(
  baseUrl: string,
  taskId: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<A2aTask> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  const url = `${baseUrl.replace(/\/$/, "")}/a2a/tasks/${encodeURIComponent(taskId)}`;

  while (Date.now() < deadline) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new Error(`A2A task poll failed: HTTP ${response.status}`);
    }

    const body = (await response.json()) as { task: A2aTask };
    if (body.task.state === "completed" || body.task.state === "failed") {
      return body.task;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`A2A task ${taskId} timed out after ${timeoutMs}ms`);
}

export async function delegateToExternalAgent(
  agentUrl: string,
  message: string,
  skill = "sajicode_build",
): Promise<{ task: A2aTask; responseText: string }> {
  const submitted = await sendA2aTask(agentUrl, { skill: skill as A2aSendTaskRequest["skill"], message });
  const finished = await pollA2aTask(agentUrl, submitted.id);
  const agentMessage = finished.messages.find((m) => m.role === "agent");
  const responseText = agentMessage?.parts.map((p) => p.text).join("\n") ?? "";
  return { task: finished, responseText };
}
