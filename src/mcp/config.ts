import path from "node:path";
import fs from "node:fs/promises";

export type MCPTransport = "stdio" | "sse" | "streamable_http" | "http";

export interface MCPToolFilter {
  allow?: string[];
  deny?: string[];
}

export interface MCPServerConfig {
  name: string;
  transport: MCPTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  agents?: string[];
  toolFilter?: MCPToolFilter;
  enabled: boolean;
  disabled: boolean;
  lazy?: boolean;
}

export interface MCPConfigFile {
  mcpServers: Record<string, Omit<MCPServerConfig, "name" | "enabled" | "disabled" | "transport"> & {
    transport?: MCPTransport;
    enabled?: boolean;
    disabled?: boolean;
  }>;
}

const ENV_VAR_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

export function interpolateEnvString(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (_, key: string) => process.env[key] ?? "");
}

export function interpolateEnvRecord(
  record: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!record) return undefined;
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(record)) {
    result[key] = interpolateEnvString(val);
  }
  return result;
}

export function isRemoteTransport(transport: MCPTransport): boolean {
  return transport === "sse" || transport === "streamable_http" || transport === "http";
}

export function getMcpConfigPath(projectPath: string): string {
  return path.join(projectPath, ".sajicode", "mcp.json");
}

export async function loadMcpConfigFile(
  projectPath: string,
): Promise<{ servers: MCPServerConfig[]; error?: string }> {
  const configPath = getMcpConfigPath(projectPath);

  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as MCPConfigFile & { servers?: MCPConfigFile["mcpServers"] };
    const serverEntries = parsed.mcpServers ?? parsed.servers ?? {};

    const servers: MCPServerConfig[] = [];

    for (const [name, cfg] of Object.entries(serverEntries)) {
      const transport = cfg.transport ?? (cfg.url ? "streamable_http" : "stdio");
      const enabled = cfg.enabled !== false;
      const disabled = cfg.disabled === true;

      servers.push({
        name,
        transport,
        command: cfg.command,
        args: cfg.args?.map((arg) =>
          interpolateEnvString(arg.replace("{{projectPath}}", projectPath)),
        ),
        url: cfg.url ? interpolateEnvString(cfg.url) : undefined,
        env: interpolateEnvRecord(cfg.env),
        headers: interpolateEnvRecord(cfg.headers),
        agents: cfg.agents,
        toolFilter: cfg.toolFilter,
        enabled,
        disabled,
        lazy: cfg.lazy,
      });
    }

    return { servers };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { servers: [] };
    }
    return {
      servers: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function mergeMcpServerConfigs(
  base: MCPServerConfig[],
  overlay: MCPServerConfig[],
): MCPServerConfig[] {
  const byName = new Map<string, MCPServerConfig>();
  for (const server of base) {
    byName.set(server.name, server);
  }
  for (const server of overlay) {
    byName.set(server.name, server);
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function serverVisibleToAgent(
  server: MCPServerConfig,
  agentName: string,
): boolean {
  if (!server.agents || server.agents.length === 0) return true;
  if (server.agents.includes("*")) return true;
  if (agentName === "pm-agent" && server.agents.includes("pm-agent")) return true;
  return server.agents.includes(agentName);
}

export function toolPassesFilter(
  toolName: string,
  filter: MCPToolFilter | undefined,
): boolean {
  if (!filter) return true;

  if (filter.deny?.some((pattern) => toolName.includes(pattern))) {
    return false;
  }

  if (filter.allow && filter.allow.length > 0) {
    return filter.allow.some((pattern) => toolName.includes(pattern));
  }

  return true;
}

export function buildClientServerEntry(
  server: MCPServerConfig,
  _projectPath: string,
): Record<string, unknown> {
  if (isRemoteTransport(server.transport)) {
    if (!server.url) {
      throw new Error(`MCP server "${server.name}" requires url for ${server.transport}`);
    }
    return {
      url: server.url,
      transport: server.transport === "http" ? "streamable_http" : server.transport,
      ...(server.headers ? { headers: server.headers } : {}),
    };
  }

  if (!server.command) {
    throw new Error(`MCP server "${server.name}" requires command for stdio transport`);
  }

  return {
    command: server.command,
    args: server.args ?? [],
    transport: "stdio" as const,
    ...(server.env ? { env: server.env } : {}),
  };
}

export async function saveMcpServerConfig(
  projectPath: string,
  serverName: string,
  serverConfig: Record<string, unknown>,
): Promise<string> {
  const configPath = getMcpConfigPath(projectPath);
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  let existing: MCPConfigFile = { mcpServers: {} };
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as MCPConfigFile & { servers?: MCPConfigFile["mcpServers"] };
    existing = { mcpServers: parsed.mcpServers ?? parsed.servers ?? {} };
  } catch {
    // new file
  }

  existing.mcpServers[serverName] = serverConfig as MCPConfigFile["mcpServers"][string];
  await fs.writeFile(configPath, JSON.stringify(existing, null, 2), "utf-8");
  return configPath;
}
