import { ChatOllama } from "@langchain/ollama";
import type { ModelConfig } from "../types/config.js";

export function createOllamaProvider(config: ModelConfig): ChatOllama {
  return new ChatOllama({
    model: config.modelName,
    temperature: config.temperature ?? 0,
    maxRetries: config.maxRetries ?? 2,
    baseUrl: config.baseUrl ?? "http://localhost:11434",
  });
}
