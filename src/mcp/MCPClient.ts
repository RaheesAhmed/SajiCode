import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import {
  buildClientServerEntry,
  isRemoteTransport,
  loadMcpConfigFile,
  mergeMcpServerConfigs,
  serverVisibleToAgent,
  toolPassesFilter,
  type MCPServerConfig,
} from "./config.js";
import { wrapStdioForPlatform } from "./health.js";

export interface MCPServerStatus {
  name: string;
  status: "connected" | "failed" | "disabled" | "lazy";
  toolCount: number;
  transport: string;
  agents?: string[];
  error?: string;
}

export class MCPClientManager {
  private client: MultiServerMCPClient | null = null;
  private projectPath: string;
  private serverConfigs: MCPServerConfig[] = [];
  private serverNames: string[] = [];
  private serverStatuses: MCPServerStatus[] = [];
  private toolsByServer: Record<string, any[]> = {};
  private wrappedToolsByServer: Record<string, any[]> = {};
  private toolsByAgentCache = new Map<string, any[]>();
  private connected = false;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  addServerConfigs(extra: MCPServerConfig[]): void {
    this.serverConfigs = mergeMcpServerConfigs(this.serverConfigs, extra);
  }

  async initialize(): Promise<void> {
    this.toolsByAgentCache.clear();
    this.wrappedToolsByServer = {};
    this.toolsByServer = {};
    this.connected = false;
    this.serverStatuses = [];

    const { servers, error } = await loadMcpConfigFile(this.projectPath);
    if (error) {
      this.serverStatuses.push({
        name: "(config)",
        status: "failed",
        toolCount: 0,
        transport: "unknown",
        error: `Invalid mcp.json: ${error}`,
      });
      return;
    }

    this.serverConfigs = mergeMcpServerConfigs(this.serverConfigs, servers);
    const activeServers = this.serverConfigs.filter(
      (s) => s.enabled && !s.disabled,
    );

    if (activeServers.length === 0) {
      this.client = null;
      this.serverNames = [];
      for (const s of this.serverConfigs.filter((x) => x.disabled || !x.enabled)) {
        this.serverStatuses.push({
          name: s.name,
          status: "disabled",
          toolCount: 0,
          transport: s.transport,
          agents: s.agents,
        });
      }
      return;
    }

    const mcpServers: Record<string, unknown> = {};
    const eagerServers: MCPServerConfig[] = [];
    const lazyServers: MCPServerConfig[] = [];

    for (const server of activeServers) {
      if (server.lazy) {
        lazyServers.push(server);
        this.serverStatuses.push({
          name: server.name,
          status: "lazy",
          toolCount: 0,
          transport: server.transport,
          agents: server.agents,
        });
        continue;
      }
      eagerServers.push(server);
    }

    for (const server of this.serverConfigs.filter((s) => s.disabled || !s.enabled)) {
      this.serverStatuses.push({
        name: server.name,
        status: "disabled",
        toolCount: 0,
        transport: server.transport,
        agents: server.agents,
      });
    }

    if (eagerServers.length === 0 && lazyServers.length > 0) {
      this.serverNames = activeServers.map((s) => s.name);
      this.client = null;
      return;
    }

    try {
      for (const server of eagerServers) {
        mcpServers[server.name] = this.buildRuntimeServerEntry(server);
      }

      this.client = new MultiServerMCPClient({
        mcpServers: mcpServers as Record<string, any>,
        onConnectionError: "ignore",
      });
      this.serverNames = activeServers.map((s) => s.name);

      this.toolsByServer = await this.client.initializeConnections();
      this.connected = true;

      for (const server of eagerServers) {
        const tools = this.toolsByServer[server.name] ?? [];
        this.wrappedToolsByServer[server.name] = tools.map((tool) =>
          this.wrapTool(tool, server.name),
        );

        if (tools.length > 0) {
          this.serverStatuses.push({
            name: server.name,
            status: "connected",
            toolCount: tools.length,
            transport: server.transport,
            agents: server.agents,
          });
        } else {
          this.serverStatuses.push({
            name: server.name,
            status: "failed",
            toolCount: 0,
            transport: server.transport,
            agents: server.agents,
            error: "No tools returned — server may have failed to start",
          });
        }
      }
    } catch (err: unknown) {
      this.client = null;
      this.serverNames = [];
      this.serverStatuses.push({
        name: "(runtime)",
        status: "failed",
        toolCount: 0,
        transport: "unknown",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private buildRuntimeServerEntry(server: MCPServerConfig): Record<string, unknown> {
    if (isRemoteTransport(server.transport)) {
      return buildClientServerEntry(server, this.projectPath);
    }
    return wrapStdioForPlatform(server);
  }

  private async ensureLazyServerConnected(serverName: string): Promise<void> {
    const server = this.serverConfigs.find((s) => s.name === serverName);
    if (!server || this.wrappedToolsByServer[serverName]) return;

    try {
      const entry = this.buildRuntimeServerEntry(server);
      const client = new MultiServerMCPClient({
        mcpServers: { [serverName]: entry as any },
        onConnectionError: "throw",
      });
      const toolsByServer = await client.initializeConnections();
      const tools = toolsByServer[serverName] ?? [];
      this.wrappedToolsByServer[serverName] = tools.map((tool) =>
        this.wrapTool(tool, serverName),
      );
      this.toolsByServer[serverName] = tools;

      const statusIndex = this.serverStatuses.findIndex((s) => s.name === serverName);
      const status: MCPServerStatus = {
        name: serverName,
        status: tools.length > 0 ? "connected" : "failed",
        toolCount: tools.length,
        transport: server.transport,
        agents: server.agents,
        ...(tools.length === 0
          ? { error: "No tools returned after lazy connect" }
          : {}),
      };
      if (statusIndex >= 0) {
        this.serverStatuses[statusIndex] = status;
      } else {
        this.serverStatuses.push(status);
      }

      if (!this.client) {
        await client.close();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.serverStatuses.push({
        name: serverName,
        status: "failed",
        toolCount: 0,
        transport: server.transport,
        agents: server.agents,
        error: message,
      });
      this.wrappedToolsByServer[serverName] = [];
    }
  }

  async getToolsForAgent(agentName: string): Promise<any[]> {
    if (this.toolsByAgentCache.has(agentName)) {
      return this.toolsByAgentCache.get(agentName)!;
    }

    const lazyNames = this.serverConfigs
      .filter((s) => s.enabled && !s.disabled && s.lazy)
      .map((s) => s.name);

    for (const name of lazyNames) {
      if (serverVisibleToAgent(
        this.serverConfigs.find((s) => s.name === name)!,
        agentName,
      )) {
        await this.ensureLazyServerConnected(name);
      }
    }

    const tools: any[] = [];

    for (const server of this.serverConfigs) {
      if (!server.enabled || server.disabled) continue;
      if (!serverVisibleToAgent(server, agentName)) continue;

      const serverTools = this.wrappedToolsByServer[server.name] ?? [];
      for (const tool of serverTools) {
        const originalName = tool.name.includes("__")
          ? tool.name.split("__").slice(1).join("__")
          : tool.name;
        if (toolPassesFilter(originalName, server.toolFilter)) {
          tools.push(tool);
        }
      }
    }

    this.toolsByAgentCache.set(agentName, tools);
    return tools;
  }

  async getTools(): Promise<any[]> {
    return this.getToolsForAgent("pm-agent");
  }

  private wrapTool(tool: any, serverName: string): any {
    const originalName = tool.name;
    const prefixedName = `${serverName}__${originalName}`;

    const wrappedTool = Object.create(tool);
    wrappedTool.name = prefixedName;
    wrappedTool.description = `[${serverName} MCP] ${tool.description || ""}`;

    if (typeof tool.invoke === "function") {
      const originalInvoke = tool.invoke.bind(tool);
      wrappedTool.invoke = async (input: any) => {
        try {
          const result = await originalInvoke(input);
          if (typeof result === "string") return result;
          if (result && typeof result === "object") {
            try {
              return JSON.stringify(result, null, 2);
            } catch {
              return String(result);
            }
          }
          return String(result);
        } catch (error: any) {
          const errorMessage = error?.message || String(error);
          return (
            `❌ MCP tool '${originalName}' on server '${serverName}' returned an error: ${errorMessage}\n\n` +
            `💡 Suggestion: Check prerequisites, verify input parameters, or try: sajicode mcp auth ${serverName}`
          );
        }
      };
    }

    return wrappedTool;
  }

  formatStartupReport(): string {
    if (this.serverStatuses.length === 0) {
      return "MCP: no servers configured (.sajicode/mcp.json)";
    }

    const parts = this.serverStatuses.map((s) => {
      if (s.status === "connected") {
        return `${s.name} ✓ (${s.toolCount} tools)`;
      }
      if (s.status === "disabled") {
        return `${s.name} ○ disabled`;
      }
      if (s.status === "lazy") {
        return `${s.name} ◔ lazy`;
      }
      const authHint = s.error?.match(/401|403|unauthorized|auth/i)
        ? ` — run: sajicode mcp auth ${s.name}`
        : "";
      return `${s.name} ✗${s.error ? `: ${s.error}${authHint}` : ""}`;
    });

    return `⚡ MCP: ${parts.join(" · ")}`;
  }

  getServerStatuses(): MCPServerStatus[] {
    return [...this.serverStatuses];
  }

  getServerConfigs(): MCPServerConfig[] {
    return [...this.serverConfigs];
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // ignore
      }
    }
    this.client = null;
    this.toolsByAgentCache.clear();
  }

  isInitialized(): boolean {
    return this.connected || this.serverConfigs.some((s) => s.lazy);
  }

  getServerCount(): number {
    return this.serverNames.length;
  }

  getServerNames(): string[] {
    return this.serverNames;
  }

  getClient(): MultiServerMCPClient | null {
    return this.client;
  }
}

// MCPClientManager — shared MCP client with per-agent scoping