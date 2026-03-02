/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */


export type LLMProvider = "ollama" | "openai" | "google" | "groq";

export interface ModelConfig {
  provider: LLMProvider;
  modelName: string;
  apiKey?: string;
  temperature?: number;
  baseUrl?: string;
  maxRetries?: number;
}

export interface RuntimeConfig {
  model: ModelConfig;
  projectPath: string;
  userId: string;
  userLevel: "beginner" | "intermediate" | "expert";
  verbose: boolean;
}
