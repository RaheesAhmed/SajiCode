import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createOllamaProvider } from "./ollama.js";
import type { ModelConfig } from "../types/config.js";

export function createLLMProvider(config: ModelConfig): BaseChatModel {
  switch (config.provider) {
    case "ollama":
      return createOllamaProvider(config);

    case "openai":
      return new ChatOpenAI({
        model: config.modelName,
        temperature: config.temperature ?? 0,
        maxRetries: config.maxRetries ?? 2,
        apiKey: config.apiKey,
      });

    case "google":
      return new ChatGoogleGenerativeAI({
        model: config.modelName,
        temperature: config.temperature ?? 0,
        maxRetries: config.maxRetries ?? 2,
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      });

    case "groq":
      return new ChatOpenAI({
        model: config.modelName,
        temperature: config.temperature ?? 0,
        maxRetries: config.maxRetries ?? 2,
        apiKey: config.apiKey,
        configuration: {
          baseURL: "https://api.groq.com/openai/v1",
        },
      });

    default: {
      const exhaustiveCheck: never = config.provider;
      throw new Error(`Unsupported provider: ${exhaustiveCheck}`);
    }
  }
}
