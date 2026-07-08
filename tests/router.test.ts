import { describe, it, expect } from "vitest";
import {
  resolveModelNameForAgent,
  resolveModelConfigForAgent,
  resolveFallbackModelConfig,
} from "../src/llms/router.js";
import type { ModelConfig, ModelRoutingConfig } from "../src/types/index.js";

const baseConfig: ModelConfig = {
  provider: "openai",
  modelName: "gpt-4o-mini",
};

const routing: ModelRoutingConfig = {
  planner: "claude-opus-4",
  leads: "claude-sonnet-4-6",
  cheap: "claude-haiku-4-5",
  fallback: "gpt-4o-mini",
  perAgent: { "review-agent": "claude-opus-4" },
  cheapAgents: ["standup-agent"],
};

describe("model router", () => {
  it("returns base model when routing is undefined", () => {
    expect(resolveModelNameForAgent("backend-lead", baseConfig)).toBe("gpt-4o-mini");
  });

  it("routes PM to planner tier", () => {
    expect(resolveModelNameForAgent("pm-agent", baseConfig, routing)).toBe(
      "claude-opus-4",
    );
  });

  it("routes leads to leads tier", () => {
    expect(resolveModelNameForAgent("backend-lead", baseConfig, routing)).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("routes init-agent to cheap tier", () => {
    expect(resolveModelNameForAgent("init-agent", baseConfig, routing)).toBe(
      "claude-haiku-4-5",
    );
  });

  it("respects perAgent overrides", () => {
    expect(resolveModelNameForAgent("review-agent", baseConfig, routing)).toBe(
      "claude-opus-4",
    );
  });

  it("resolves full model config with overrides", () => {
    const config = resolveModelConfigForAgent("backend-lead", baseConfig, routing);
    expect(config.modelName).toBe("claude-sonnet-4-6");
    expect(config.provider).toBe("openai");
  });

  it("resolves fallback model config", () => {
    const fallback = resolveFallbackModelConfig(baseConfig, routing);
    expect(fallback?.modelName).toBe("gpt-4o-mini");
  });
});
