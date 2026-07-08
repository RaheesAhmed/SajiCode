import type { ProjectConfig } from "../types/index.js";

export function applyOfflineMode(config: ProjectConfig): ProjectConfig {
  if (!config.offline?.enabled) return config;

  const modelConfig = {
    ...config.modelConfig,
    provider: config.offline.provider ?? "ollama",
    ...(config.offline.baseUrl ? { baseUrl: config.offline.baseUrl } : {}),
    ...(config.offline.modelName ? { modelName: config.offline.modelName } : {}),
  };

  return {
    ...config,
    modelConfig,
    offline: { ...config.offline, enabled: true },
  };
}

export function isOfflineMode(config: ProjectConfig): boolean {
  return config.offline?.enabled === true;
}

/** Disable LangSmith / external telemetry when offline. */
export function applyOfflineEnvironment(): void {
  process.env["LANGSMITH_TRACING"] = "false";
  process.env["LANGCHAIN_TRACING_V2"] = "false";
  delete process.env["TAVILY_API_KEY"];
}
