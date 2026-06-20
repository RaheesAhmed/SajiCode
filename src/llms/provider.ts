import { ChatOllama } from "@langchain/ollama";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ModelConfig } from "../types/index.js";
import { ChatOpenRouter } from "@langchain/openrouter";

export async function createModel(config: ModelConfig): Promise<BaseChatModel> {
  const provider = config.provider.toLowerCase();

  switch (provider) {
    case "ollama":
      return new ChatOllama({
        model: config.modelName,
        temperature: config.temperature ?? 0,
        maxRetries: config.maxRetries ?? 3,
        baseUrl: config.baseUrl ?? "http://localhost:11434",
      });

    case "openai": {
      const { ChatOpenAI } = await import("@langchain/openai");
      return new ChatOpenAI({
        model: config.modelName,
        temperature: config.temperature ?? 0,
        maxRetries: config.maxRetries ?? 3,
        maxTokens: config.maxTokens ?? 4096,
        apiKey: config.apiKey ?? process.env["OPENAI_API_KEY"],
        configuration: {
          baseURL: config.baseUrl ?? process.env["OPENAI_BASE_URL"],
        },
      });
    }

   case "openrouter": {
    return new ChatOpenRouter({
      model: config.modelName,
      temperature: config.temperature ?? 0,
      maxRetries: config.maxRetries ?? 3,
      maxTokens: config.maxTokens ?? 4096,
      apiKey: config.apiKey ?? process.env["OPENROUTER_API_KEY"],
      baseURL: config.baseUrl ?? process.env["OPENROUTER_BASE_URL"],
    });
   }

    case "anthropic": {
      const mod = await import("@langchain/anthropic" as string);
      const AnthropicChat = mod.ChatAnthropic;
      return new AnthropicChat({
        model: config.modelName,
        temperature: config.temperature ?? 0,
        maxRetries: config.maxRetries ?? 3,
        apiKey: config.apiKey ?? process.env["ANTHROPIC_API_KEY"],
      });
    }

    case "google": {
      const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
      const apiKey = config.apiKey
        ?? process.env["GOOGLE_API_KEY"]
        ?? process.env["GEMINI_API_KEY"]
        ?? process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
      if (!apiKey) {
        throw new Error(
          "Google API key required. Set one of: GOOGLE_API_KEY, GEMINI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY"
        );
      }
      return new ChatGoogleGenerativeAI({
        model: config.modelName,
        temperature: config.temperature ?? 0,
        maxRetries: config.maxRetries ?? 3,
        apiKey,
      });
    }

    default:
      throw new Error(
        `Unknown provider "${provider}". Supported: ollama, openai, anthropic, google`
      );
  }
}
