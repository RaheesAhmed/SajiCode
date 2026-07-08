import type { CompiledSubAgent } from "deepagents";
import { createAllRegisteredAgents, type AgentRegistryOptions } from "./agent-registry.js";

export async function createAllDomainHeads(
  projectPath: string,
  registryOptions: AgentRegistryOptions,
  extraSpecDirs: string[] = [],
): Promise<CompiledSubAgent[]> {
  return createAllRegisteredAgents(projectPath, registryOptions, extraSpecDirs);
}
