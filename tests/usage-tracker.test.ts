import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  recordUsage,
  sumSessionCost,
  costByAgent,
  checkBudget,
  estimateCostUsd,
} from "../src/observability/usage-tracker.js";

describe("usage tracker", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-usage-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("estimates cost from token counts", () => {
    const cost = estimateCostUsd(1000, 1000);
    expect(cost).toBeGreaterThan(0);
  });

  it("records and aggregates session usage", async () => {
    await recordUsage(tmpDir, {
      sessionId: "sess-1",
      agentName: "backend-lead",
      model: "gpt-4o",
      inputTokens: 500,
      outputTokens: 200,
    });
    await recordUsage(tmpDir, {
      sessionId: "sess-1",
      agentName: "frontend-lead",
      model: "gpt-4o",
      inputTokens: 300,
      outputTokens: 100,
    });

    const store = JSON.parse(
      await fs.readFile(path.join(tmpDir, ".sajicode/usage.json"), "utf-8"),
    );

    expect(sumSessionCost(store, "sess-1")).toBeGreaterThan(0);
    expect(Object.keys(costByAgent(store, "sess-1"))).toHaveLength(2);
  });

  it("warns when approaching session budget", () => {
    const result = checkBudget(4.2, { perSession: 5, action: "warn" });
    expect(result.allowed).toBe(true);
    expect(result.warning).toContain("84%");
  });

  it("blocks when budget exceeded with pause action", () => {
    const result = checkBudget(6, { perSession: 5, action: "pause" });
    expect(result.allowed).toBe(false);
  });
});
