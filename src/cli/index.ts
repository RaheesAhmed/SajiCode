/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */

import { Command } from "commander";
import dotenv from "dotenv";
import { startRepl } from "./repl.js";
import type { RuntimeConfig, LLMProvider } from "../types/config.js";

dotenv.config();

const DEFAULT_PROVIDER: LLMProvider = "ollama";
const DEFAULT_MODEL = "minimax-m2.5:cloud";

function resolveConfig(options: {
  provider?: string;
  model?: string;
  apiKey?: string;
}): RuntimeConfig {
  const provider = (options.provider ?? process.env["OPENAGENT_PROVIDER"] ?? DEFAULT_PROVIDER) as LLMProvider;
  const modelName = options.model ?? process.env["OPENAGENT_MODEL"] ?? DEFAULT_MODEL;
  const resolvedApiKey = options.apiKey
    ?? process.env["OPENAI_API_KEY"]
    ?? process.env["GOOGLE_API_KEY"]
    ?? process.env["GEMINI_API_KEY"]
    ?? process.env["GROQ_API_KEY"];

  return {
    model: {
      provider,
      modelName,
      ...(resolvedApiKey ? { apiKey: resolvedApiKey } : {}),
      temperature: 0,
    },
    projectPath: process.cwd(),
    userId: process.env["USER"] ?? process.env["USERNAME"] ?? "default",
    userLevel: "expert",
    verbose: false,
  };
}

const program = new Command();

program
  .name("openagent")
  .description("⚡ OpenAgent — AI Software Engineer CLI")
  .version("1.0.0")
  .option("-p, --provider <provider>", "LLM provider (ollama, openai, google, groq)")
  .option("-m, --model <model>", "Model name (e.g. qwen3:0.6b, gpt-4o)")
  .option("-k, --api-key <key>", "API key for the provider")
  .action(async (options: { provider?: string; model?: string; apiKey?: string }) => {
    const config = resolveConfig(options);
    await startRepl(config);
  });

program
  .command("init")
  .description("Scan project and create OPENAGENT.MD for full project awareness")
  .action(async () => {
    const { scanProject } = await import("./scanner.js");
    await scanProject(process.cwd());
  });

program
  .command("chat <message>")
  .description("Send a one-shot message")
  .option("-p, --provider <provider>", "LLM provider")
  .option("-m, --model <model>", "Model name")
  .option("-k, --api-key <key>", "API key")
  .action(async (message: string, options: { provider?: string; model?: string; apiKey?: string }) => {
    const config = resolveConfig(options);

    const { createOpenAgent } = await import("../agents/factory.js");
    const { HumanMessage } = await import("@langchain/core/messages");

    const agent = await createOpenAgent(config);
    const invokeConfig = agent.getInvokeConfig();

    const result = await agent.graph.invoke(
      { messages: [new HumanMessage(message)] },
      invokeConfig,
    );

    const lastMsg = result.messages[result.messages.length - 1];
    if (lastMsg && typeof lastMsg.content === "string") {
      console.log(lastMsg.content);
    }
  });

program.parse();
