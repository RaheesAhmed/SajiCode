import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import type { MCPServerConfig } from "./config.js";
import { loadMcpConfigFile } from "./config.js";

export interface MCPHealthResult {
  server: string;
  ok: boolean;
  toolCount: number;
  transport: string;
  message: string;
}

export async function testMcpServer(
  projectPath: string,
  serverName: string,
): Promise<MCPHealthResult> {
  const { servers, error } = await loadMcpConfigFile(projectPath);
  if (error) {
    return {
      server: serverName,
      ok: false,
      toolCount: 0,
      transport: "unknown",
      message: `Failed to read mcp.json: ${error}`,
    };
  }

  const server = servers.find((s) => s.name === serverName);
  if (!server) {
    return {
      server: serverName,
      ok: false,
      toolCount: 0,
      transport: "unknown",
      message: `Server "${serverName}" not found in .sajicode/mcp.json`,
    };
  }

  if (server.disabled || !server.enabled) {
    return {
      server: serverName,
      ok: false,
      toolCount: 0,
      transport: server.transport,
      message: "Server is disabled",
    };
  }

  try {
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    const { buildClientServerEntry } = await import("./config.js");
    const entry = buildClientServerEntry(server, projectPath);

    const client = new MultiServerMCPClient({
      mcpServers: { [serverName]: entry } as Record<string, any>,
      onConnectionError: "throw",
    });

    const toolsByServer = await client.initializeConnections();
    await client.close();

    const tools = toolsByServer[serverName] ?? [];
    return {
      server: serverName,
      ok: tools.length > 0,
      toolCount: tools.length,
      transport: server.transport,
      message:
        tools.length > 0
          ? `Connected — ${tools.length} tool(s) available`
          : "Connected but no tools returned",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const authHint = message.match(/401|403|unauthorized|auth/i)
      ? ` — run: sajicode mcp auth ${serverName}`
      : "";
    return {
      server: serverName,
      ok: false,
      toolCount: 0,
      transport: server.transport,
      message: `${message}${authHint}`,
    };
  }
}

export function formatMcpListReport(servers: MCPServerConfig[]): string {
  if (servers.length === 0) {
    return "No MCP servers configured.\nAdd one with: sajicode mcp add <name> --command ...";
  }

  const lines = [
    "MCP servers (.sajicode/mcp.json):",
    "",
    "| Server | Transport | Agents | Status |",
    "|--------|-----------|--------|--------|",
    ...servers.map((s) => {
      const agents =
        s.agents && s.agents.length > 0 ? s.agents.join(", ") : "all";
      const status = s.disabled || !s.enabled ? "disabled" : "enabled";
      return `| ${s.name} | ${s.transport} | ${agents} | ${status} |`;
    }),
  ];

  return lines.join("\n");
}

export function getMcpAuthInstructions(
  serverName: string,
  server?: MCPServerConfig,
): string {
  const lines = [
    `MCP auth setup for "${serverName}":`,
    "",
    "OAuth device-flow is provider-specific. Typical steps:",
    "  1. Create an API token or OAuth app with the MCP provider",
    "  2. Export credentials as environment variables",
    "  3. Reference them in .sajicode/mcp.json using ${ENV_VAR} syntax",
    "",
    "Example mcp.json entry:",
    "{",
    `  "mcpServers": {`,
    `    "${serverName}": {`,
    '      "url": "https://provider.example/mcp",',
    '      "transport": "streamable_http",',
    '      "headers": { "Authorization": "Bearer ${PROVIDER_TOKEN}" },',
    '      "agents": ["backend-lead"]',
    "    }",
    "  }",
    "}",
  ];

  if (server?.url) {
    lines.push("", `Configured URL: ${server.url}`);
  }

  return lines.join("\n");
}

export async function ensureMcpConfigDir(projectPath: string): Promise<string> {
  const dir = path.join(projectPath, ".sajicode");
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, "mcp.json");
}

export function wrapStdioForPlatform(
  server: MCPServerConfig,
): Record<string, unknown> {
  const isWin = os.platform() === "win32";
  const base = {
    command: server.command!,
    args: server.args ?? [],
    transport: "stdio" as const,
    ...(server.env ? { env: server.env } : {}),
  };

  if (isWin) {
    return {
      ...base,
      command: "cmd",
      args: ["/c", `${server.command} ${(server.args ?? []).join(" ")} 2>nul`],
    };
  }

  const originalCmd = `${server.command} ${(server.args ?? []).join(" ")}`;
  return {
    ...base,
    command: "sh",
    args: ["-c", `${originalCmd} 2>/dev/null`],
  };
}
