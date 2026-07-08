import type { AsyncSubAgent, CompiledSubAgent } from "deepagents";
import type { AsyncSubagentsConfig } from "../types/index.js";
import {
  startAgentProtocolSession,
  stopAgentProtocolSession,
} from "./local-agent-protocol.js";

export function isAsyncSubagentsEnabled(config?: AsyncSubagentsConfig): boolean {
  return config?.enabled !== false;
}

export function buildAsyncSubAgentSpecs(
  leads: CompiledSubAgent[],
  options: { url: string; headers?: Record<string, string> },
): AsyncSubAgent[] {
  return leads.map((lead) => ({
    name: lead.name,
    description: lead.description,
    graphId: lead.name,
    url: options.url,
    ...(options.headers ? { headers: options.headers } : {}),
  }));
}

export interface AsyncSubagentSession {
  url: string;
  asyncSpecs: AsyncSubAgent[];
}

/**
 * Start embedded Agent Protocol (when no external url) and build async lead specs.
 * Returns empty asyncSpecs when disabled or when leads list is empty.
 */
export async function prepareAsyncSubagentSession(
  leads: CompiledSubAgent[],
  config?: AsyncSubagentsConfig,
): Promise<AsyncSubagentSession | null> {
  if (!isAsyncSubagentsEnabled(config) || leads.length === 0) {
    return null;
  }

  let url = config?.url?.replace(/\/$/, "") ?? "";

  if (!url) {
    const graphs = leads.map((lead) => ({
      graphId: lead.name,
      runnable: lead.runnable as { invoke: (input: unknown, config?: Record<string, unknown>) => Promise<unknown> },
    }));
    const session = await startAgentProtocolSession(graphs, {
      ...(config?.port != null ? { port: config.port } : {}),
    });
    url = session.url;
  }

  return {
    url,
    asyncSpecs: buildAsyncSubAgentSpecs(leads, {
      url,
      ...(config?.headers ? { headers: config.headers } : {}),
    }),
  };
}

export { stopAgentProtocolSession };
