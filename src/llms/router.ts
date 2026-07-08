import type { ModelConfig, ModelRoutingConfig } from "../types/index.js";

export type ModelTier = "planner" | "leads" | "cheap";

export function resolveModelNameForAgent(
  agentName: string,
  baseConfig: ModelConfig,
  routing?: ModelRoutingConfig,
): string {
  if (!routing) return baseConfig.modelName;

  if (routing.perAgent?.[agentName]) {
    return routing.perAgent[agentName]!;
  }

  if (agentName === "pm-agent" || agentName === "review-agent") {
    return routing.planner ?? baseConfig.modelName;
  }

  if (
    agentName === "init-agent"
    || agentName.includes("standup")
    || routing.cheapAgents?.includes(agentName)
  ) {
    return routing.cheap ?? baseConfig.modelName;
  }

  return routing.leads ?? baseConfig.modelName;
}

export function resolveModelConfigForAgent(
  agentName: string,
  baseConfig: ModelConfig,
  routing?: ModelRoutingConfig,
): ModelConfig {
  const modelName = resolveModelNameForAgent(agentName, baseConfig, routing);
  if (modelName === baseConfig.modelName) {
    return baseConfig;
  }
  return { ...baseConfig, modelName };
}

export function resolveFallbackModelConfig(
  baseConfig: ModelConfig,
  routing?: ModelRoutingConfig,
): ModelConfig | null {
  if (!routing?.fallback) return null;
  return {
    ...baseConfig,
    modelName: routing.fallback,
    provider: routing.fallbackProvider ?? baseConfig.provider,
  };
}
