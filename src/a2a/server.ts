import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { ProjectConfig, OnboardingResult } from "../types/index.js";
import { buildAgentCard } from "./agent-card.js";
import type { A2aSendTaskRequest, A2aTask, A2aTaskState } from "./types.js";
import {
  isAsyncCapability,
  runCapabilitySync,
  skillToPrompt,
} from "../server/capabilities.js";
import { createJob, getJob } from "../server/jobs.js";
import { runDispatchJob } from "../server/dispatch.js";

export interface A2aServerContext {
  projectPath: string;
  config: ProjectConfig;
  onboardingResult: OnboardingResult;
  publicUrl: string;
}

const tasks = new Map<string, A2aTask>();

function nowIso(): string {
  return new Date().toISOString();
}

function createTaskRecord(
  skill: A2aSendTaskRequest["skill"],
  message: string,
  taskId?: string,
): A2aTask {
  const id = taskId ?? `a2a-${randomUUID()}`;
  const task: A2aTask = {
    id,
    skill,
    state: "submitted",
    messages: [{ role: "user", parts: [{ type: "text", text: message }] }],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  tasks.set(id, task);
  return task;
}

function patchTask(id: string, patch: Partial<A2aTask>): A2aTask | undefined {
  const existing = tasks.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch, updatedAt: nowIso() };
  tasks.set(id, updated);
  return updated;
}

async function executeTask(
  ctx: A2aServerContext,
  task: A2aTask,
): Promise<void> {
  patchTask(task.id, { state: "working" });

  try {
    const { prompt, onboarding } = skillToPrompt(task.skill, task.messages[0]?.parts[0]?.text ?? "");

    if (isAsyncCapability(task.skill)) {
      createJob(task.id, prompt);
      await runDispatchJob(task.id, ctx.projectPath, ctx.config, onboarding, prompt);
      const job = getJob(task.id);
      const resultText = job?.result ?? job?.error ?? "No result";
      const state: A2aTaskState = job?.status === "completed" ? "completed" : "failed";

      patchTask(task.id, {
        state,
        messages: [
          ...task.messages,
          { role: "agent", parts: [{ type: "text", text: resultText }] },
        ],
        ...(job?.error ? { error: job.error } : {}),
      });
      return;
    }

    const syncResult = await runCapabilitySync(
      task.skill,
      ctx.projectPath,
      ctx.config,
      prompt,
    );

    patchTask(task.id, {
      state: "completed",
      messages: [
        ...task.messages,
        { role: "agent", parts: [{ type: "text", text: syncResult }] },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    patchTask(task.id, {
      state: "failed",
      error: message,
      messages: [
        ...task.messages,
        { role: "agent", parts: [{ type: "text", text: `Error: ${message}` }] },
      ],
    });
  }
}

export function mountA2aRoutes(app: Express, ctx: A2aServerContext): void {
  app.get("/.well-known/agent.json", (_req: Request, res: Response) => {
    res.json(buildAgentCard(ctx.publicUrl));
  });

  app.post("/a2a/tasks/send", async (req: Request, res: Response) => {
    const body = req.body as A2aSendTaskRequest;
    const skill = body?.skill;
    const message = String(body?.message ?? "").trim();

    if (!skill) {
      res.status(400).json({ error: "skill is required" });
      return;
    }

    const task = createTaskRecord(skill, message, body.taskId);
    res.status(202).json({ task });

    void executeTask(ctx, task);
  });

  app.get("/a2a/tasks/:taskId", (req: Request, res: Response) => {
    const taskId = String(req.params["taskId"] ?? "");
    const task = tasks.get(taskId) ?? lookupJobAsTask(taskId);
    if (!task) {
      res.status(404).json({ error: "task not found" });
      return;
    }
    res.json({ task });
  });
}

function lookupJobAsTask(jobId: string): A2aTask | undefined {
  const job = getJob(jobId);
  if (!job) return undefined;

  const state: A2aTaskState =
    job.status === "completed" ? "completed"
    : job.status === "failed" ? "failed"
    : job.status === "running" ? "working"
    : "submitted";

  return {
    id: job.jobId,
    skill: "sajicode_build",
    state,
    messages: [
      { role: "user", parts: [{ type: "text", text: job.prompt }] },
      ...(job.result
        ? [{ role: "agent" as const, parts: [{ type: "text" as const, text: job.result }] }]
        : []),
    ],
    createdAt: job.createdAt,
    updatedAt: job.completedAt ?? job.startedAt ?? job.createdAt,
    ...(job.error ? { error: job.error } : {}),
  };
}

export function clearA2aTasksForTests(): void {
  tasks.clear();
}

export function seedA2aTask(task: A2aTask): void {
  tasks.set(task.id, task);
}
