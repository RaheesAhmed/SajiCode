import type { CompiledSubAgent } from "deepagents";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAllRegisteredAgents } from "./agent-registry.js";

export async function createAllDomainHeads(
  model: BaseChatModel,
  projectPath: string,
): Promise<CompiledSubAgent[]> {
  return createAllRegisteredAgents(model, projectPath);
}
