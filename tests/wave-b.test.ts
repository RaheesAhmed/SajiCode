import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isCronDue, parseIntervalMs } from "../src/tasks/cron.js";
import {
  addTask,
  listTasks,
  cancelTask,
  claimNextRunnableTask,
  completeTask,
} from "../src/tasks/queue.js";
import {
  parseHeartbeatMarkdown,
  evaluateHeartbeat,
  isHeartbeatOkResponse,
} from "../src/daemon/heartbeat.js";
import { requestHandoff, listHandoffs } from "../src/agents/handoff.js";
import { consolidateProjectMemory } from "../src/memory/consolidation.js";
import { recordExperience } from "../src/memory/experience-replay.js";

describe("cron", () => {
  it("matches exact minute and hour", () => {
    const date = new Date("2026-07-09T03:00:00");
    expect(isCronDue("0 3 * * *", date)).toBe(true);
    expect(isCronDue("30 3 * * *", date)).toBe(false);
  });

  it("parses interval strings", () => {
    expect(parseIntervalMs("30m")).toBe(1_800_000);
    expect(parseIntervalMs("2h")).toBe(7_200_000);
  });
});

describe("task queue", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-tasks-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("queues and claims tasks by priority", async () => {
    await addTask(tmpDir, { prompt: "low", priority: 2 });
    await addTask(tmpDir, { prompt: "high", priority: 9 });

    const claimed = await claimNextRunnableTask(tmpDir);
    expect(claimed?.prompt).toBe("high");
  });

  it("cancels tasks", async () => {
    const task = await addTask(tmpDir, { prompt: "cancel me" });
    expect(await cancelTask(tmpDir, task.id)).toBe(true);
    const listed = await listTasks(tmpDir, { status: "cancelled" });
    expect(listed.some((t) => t.id === task.id)).toBe(true);
  });

  it("completes recurring every tasks back to queued", async () => {
    const task = await addTask(tmpDir, {
      prompt: "repeat",
      every: "30m",
    });
    const claimed = await claimNextRunnableTask(tmpDir);
    expect(claimed?.id).toBe(task.id);
    await completeTask(tmpDir, task.id, "done");
    const updated = (await listTasks(tmpDir)).find((t) => t.id === task.id);
    expect(updated?.status).toBe("queued");
    expect(updated?.nextRunAt).toBeTruthy();
  });
});

describe("heartbeat", () => {
  it("parses checklist items", () => {
    const items = parseHeartbeatMarkdown(
      "- [ ] Fix CI\n- [x] Done item\n",
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.checked).toBe(false);
    expect(items[1]?.checked).toBe(true);
  });

  it("detects HEARTBEAT_OK responses", () => {
    expect(isHeartbeatOkResponse("All clear. HEARTBEAT_OK")).toBe(true);
    expect(isHeartbeatOkResponse("Dispatching fix-ci")).toBe(false);
  });

  it("returns ok when all items checked", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-hb-"));
    await fs.mkdir(path.join(tmpDir, ".sajicode"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, ".sajicode", "HEARTBEAT.md"),
      "- [x] All done\n",
      "utf-8",
    );

    const evaluation = await evaluateHeartbeat(tmpDir);
    expect(evaluation.ok).toBe(true);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

describe("handoffs", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-handoff-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates handoff with linked task", async () => {
    const record = await requestHandoff(tmpDir, {
      from: "backend-lead",
      to: "frontend-lead",
      reason: "API contract ready",
      context: "POST /api/users documented",
    });

    expect(record.taskId).toBeTruthy();
    const handoffs = await listHandoffs(tmpDir, "frontend-lead", "pending");
    expect(handoffs.some((h) => h.id === record.id)).toBe(true);
  });
});

describe("consolidation", () => {
  it("merges duplicate experiences", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-consol-"));

    await recordExperience(tmpDir, {
      taskType: "api",
      techStack: ["node"],
      agent: "backend-lead",
      outcome: "success",
      description: "Added auth route",
      lessons: ["Use middleware for JWT"],
      tags: [],
    });

    await recordExperience(tmpDir, {
      taskType: "api",
      techStack: ["node"],
      agent: "backend-lead",
      outcome: "success",
      description: "Added auth route",
      lessons: ["Use middleware for JWT", "Validate tokens early"],
      tags: [],
    });

    const report = await consolidateProjectMemory(tmpDir);
    expect(report.experiencesAfter).toBeLessThan(report.experiencesBefore + 1);
    expect(report.mergedLessons).toBeGreaterThan(0);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
