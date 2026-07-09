import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AIMessage } from "@langchain/core/messages";
import type { LLMResult } from "@langchain/core/outputs";
import {
  recordUsage,
  sumSessionCost,
  costByAgent,
  checkBudget,
  estimateCostUsd,
} from "../src/observability/usage-tracker.js";
import { extractUsageFromLlmResult } from "../src/observability/usage-metadata.js";
import { estimateCostFromUsage, isLocalOllamaProvider } from "../src/observability/model-pricing.js";

describe("usage tracker", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-usage-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("extracts usage_metadata from LangChain LLMResult (recommended path)", () => {
    const output: LLMResult = {
      generations: [[{
        text: "hi",
        message: new AIMessage({
          content: "hi",
          usage_metadata: {
            input_tokens: 120,
            output_tokens: 45,
            total_tokens: 165,
          },
        }),
      }]],
      llmOutput: {},
    };

    const usage = extractUsageFromLlmResult(output);
    expect(usage?.input_tokens).toBe(120);
    expect(usage?.output_tokens).toBe(45);
  });

  it("charges zero for local Ollama without env overrides", () => {
    expect(isLocalOllamaProvider("ollama")).toBe(true);
    expect(
      estimateCostFromUsage(50_000, 10_000, {
        model: "llama3.1",
        provider: "ollama",
        baseUrl: "http://localhost:11434",
      }),
    ).toBe(0);
  });

  it("uses model-specific pricing for known cloud models", () => {
    const cost = estimateCostFromUsage(1_000_000, 500_000, {
      model: "gpt-4o-mini",
      provider: "openai",
    });
    expect(cost).toBeCloseTo(0.15 + 0.3, 4);
  });

  it("records and aggregates session usage", async () => {
    await recordUsage(tmpDir, {
      sessionId: "sess-1",
      agentName: "backend-lead",
      model: "gpt-4o-mini",
      provider: "openai",
      inputTokens: 500,
      outputTokens: 200,
    });
    await recordUsage(tmpDir, {
      sessionId: "sess-1",
      agentName: "frontend-lead",
      model: "gpt-4o-mini",
      provider: "openai",
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

  it("legacy estimateCostUsd delegates to model pricing", () => {
    const cost = estimateCostUsd(1000, 1000, "gpt-4o-mini", "openai");
    expect(cost).toBeGreaterThan(0);
  });
});
