import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import path from "path";
import fs from "fs/promises";
import os from "os";

export interface MCPServerStatus {
  name: string;
  status: "connected" | "failed" | "disabled";
  toolCount: number;
  error?: string;
}

export class MCPClientManager {
  private client: MultiServerMCPClient | null = null;
  private projectPath: string;
  private serverNames: string[] = [];
  private serverStatuses: MCPServerStatus[] = [];
  private cachedTools: any[] | null = null;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async initialize(): Promise<void> {
    this.cachedTools = null;
    this.serverStatuses = [];

    try {
      const rawServers = await this.loadMCPServersConfig();
      const names = Object.keys(rawServers);
      if (names.length === 0) {
        this.client = null;
        this.serverNames = [];
        return;
      }

      const mcpServers: Record<string, any> = {};
      const isWin = os.platform() === "win32";

      for (const [name, cfg] of Object.entries(rawServers)) {
        if (isWin) {
          mcpServers[name] = {
            ...cfg,
            command: "cmd",
            args: ["/c", `${cfg.command} ${(cfg.args ?? []).join(" ")} 2>nul`],
          };
        } else {
          const originalCmd = `${cfg.command} ${(cfg.args ?? []).join(" ")}`;
          mcpServers[name] = {
            ...cfg,
            command: "sh",
            args: ["-c", `${originalCmd} 2>/dev/null`],
          };
        }
      }

      this.client = new MultiServerMCPClient({
        mcpServers,
        onConnectionError: "ignore",
      });
      this.serverNames = names;

      const toolsByServer = await this.client.initializeConnections();

      for (const name of names) {
        const tools = toolsByServer[name];
        if (tools && tools.length > 0) {
          this.serverStatuses.push({
            name,
            status: "connected",
            toolCount: tools.length,
          });
        } else {
          this.serverStatuses.push({
            name,
            status: "failed",
            toolCount: 0,
            error: "No tools returned — server may have failed to start",
          });
        }
      }
    } catch (error: any) {
      this.client = null;
      this.serverNames = [];
      this.serverStatuses = [{
        name: "(config)",
        status: "failed",
        toolCount: 0,
        error: error?.message ?? String(error),
      }];
    }
  }

  private async loadMCPServersConfig(): Promise<Record<string, any>> {
    const configPath = path.join(this.projectPath, ".sajicode", "mcp.json");

    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);
      const mcpServers: Record<string, any> = {};

      for (const [serverName, serverConfig] of Object.entries(
        config.mcpServers || config.servers || {},
      )) {
        const server = serverConfig as any;

        if (server.enabled !== false && server.disabled !== true) {
          const processedArgs =
            server.args?.map((arg: string) =>
              arg.replace("{{projectPath}}", this.projectPath),
            ) || [];

          mcpServers[serverName] = {
            command: server.command,
            args: processedArgs,
            transport: server.transport || "stdio",
            ...(server.env && { env: server.env }),
          };
        } else {
          this.serverStatuses.push({
            name: serverName,
            status: "disabled",
            toolCount: 0,
          });
        }
      }

      return mcpServers;
    } catch {
      return {};
    }
  }

  async getTools(): Promise<any[]> {
    if (this.cachedTools) return this.cachedTools;
    if (!this.client) return [];

    try {
      const toolsByServer = await this.client.initializeConnections();
      const wrapped: any[] = [];

      for (const [serverName, tools] of Object.entries(toolsByServer)) {
        for (const tool of tools) {
          wrapped.push(this.wrapTool(tool, serverName));
        }
      }

      this.cachedTools = wrapped;
      return wrapped;
    } catch (error) {
      console.error("Error loading MCP tools:", error);
      return [];
    }
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
            `💡 Suggestion: Check prerequisites, verify input parameters, or try an alternative approach.`
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

    const lines = this.serverStatuses.map((s) => {
      if (s.status === "connected") {
        return `  ✓ ${s.name} (${s.toolCount} tools)`;
      }
      if (s.status === "disabled") {
        return `  ○ ${s.name} (disabled)`;
      }
      return `  ✗ ${s.name}${s.error ? `: ${s.error}` : ""}`;
    });

    return ["MCP servers:", ...lines].join("\n");
  }

  getServerStatuses(): MCPServerStatus[] {
    return [...this.serverStatuses];
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        this.client = null;
        this.cachedTools = null;
      } catch {
        // Silent close
      }
    }
  }

  isInitialized(): boolean {
    return this.client !== null;
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
