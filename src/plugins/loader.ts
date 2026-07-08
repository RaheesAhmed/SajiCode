import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parsePluginManifest, type PluginManifest } from "./manifest.js";
import type { MCPServerConfig } from "../mcp/config.js";

export type PluginLayer = "user" | "project";

export interface LoadedPlugin {
  manifest: PluginManifest;
  rootPath: string;
  layer: PluginLayer;
}

export interface PluginContributions {
  plugins: LoadedPlugin[];
  agentSpecPaths: string[];
  skillRoots: string[];
  mcpServers: MCPServerConfig[];
}

export function getUserPluginsDir(): string {
  return path.join(os.homedir(), ".sajicode", "plugins");
}

export function getProjectPluginsDir(projectPath: string): string {
  return path.join(projectPath, ".sajicode", "plugins");
}

async function listPluginDirs(rootDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const dirs: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(rootDir, entry.name, "plugin.json");
      try {
        await fs.access(manifestPath);
        dirs.push(path.join(rootDir, entry.name));
      } catch {
        // skip non-plugin folders
      }
    }
    return dirs.sort();
  } catch {
    return [];
  }
}

async function loadPluginFromDir(
  rootPath: string,
  layer: PluginLayer,
): Promise<LoadedPlugin | null> {
  try {
    const raw = await fs.readFile(path.join(rootPath, "plugin.json"), "utf-8");
    const manifest = parsePluginManifest(JSON.parse(raw));
    return { manifest, rootPath, layer };
  } catch {
    return null;
  }
}

export async function discoverPlugins(
  projectPath: string,
): Promise<LoadedPlugin[]> {
  const byName = new Map<string, LoadedPlugin>();

  const userDirs = await listPluginDirs(getUserPluginsDir());
  for (const dir of userDirs) {
    const plugin = await loadPluginFromDir(dir, "user");
    if (plugin) byName.set(plugin.manifest.name, plugin);
  }

  const projectDirs = await listPluginDirs(getProjectPluginsDir(projectPath));
  for (const dir of projectDirs) {
    const plugin = await loadPluginFromDir(dir, "project");
    if (plugin) byName.set(plugin.manifest.name, plugin);
  }

  return Array.from(byName.values()).sort((a, b) =>
    a.manifest.name.localeCompare(b.manifest.name),
  );
}

async function loadPluginMcpServers(
  plugin: LoadedPlugin,
): Promise<MCPServerConfig[]> {
  if (!plugin.manifest.capabilities.includes("mcp")) return [];

  const mcpPath = path.join(plugin.rootPath, "mcp.json");
  try {
    const raw = await fs.readFile(mcpPath, "utf-8");
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, Record<string, unknown>> };
    const servers: MCPServerConfig[] = [];

    for (const [name, cfg] of Object.entries(parsed.mcpServers ?? {})) {
      servers.push({
        name: `${plugin.manifest.name}__${name}`,
        transport: (cfg["transport"] as MCPServerConfig["transport"])
          ?? (cfg["url"] ? "streamable_http" : "stdio"),
        command: cfg["command"] as string | undefined,
        args: cfg["args"] as string[] | undefined,
        url: cfg["url"] as string | undefined,
        env: cfg["env"] as Record<string, string> | undefined,
        headers: cfg["headers"] as Record<string, string> | undefined,
        agents: cfg["agents"] as string[] | undefined,
        toolFilter: cfg["toolFilter"] as MCPServerConfig["toolFilter"],
        enabled: cfg["enabled"] !== false,
        disabled: cfg["disabled"] === true,
      });
    }

    return servers;
  } catch {
    return [];
  }
}

export async function loadPluginContributions(
  projectPath: string,
): Promise<PluginContributions> {
  const plugins = await discoverPlugins(projectPath);
  const agentSpecPaths: string[] = [];
  const skillRoots: string[] = [];
  const mcpServers: MCPServerConfig[] = [];

  for (const plugin of plugins) {
    if (plugin.manifest.capabilities.includes("agents")) {
      agentSpecPaths.push(path.join(plugin.rootPath, "agents"));
    }
    if (plugin.manifest.capabilities.includes("skills")) {
      skillRoots.push(path.join(plugin.rootPath, "skills"));
    }
    if (plugin.manifest.capabilities.includes("mcp")) {
      mcpServers.push(...(await loadPluginMcpServers(plugin)));
    }
  }

  return { plugins, agentSpecPaths, skillRoots, mcpServers };
}

export async function installPluginFromPath(
  sourcePath: string,
  targetLayer: PluginLayer,
  projectPath: string,
): Promise<string> {
  const resolved = path.resolve(sourcePath);
  const manifestRaw = await fs.readFile(path.join(resolved, "plugin.json"), "utf-8");
  const manifest = parsePluginManifest(JSON.parse(manifestRaw));

  const targetRoot =
    targetLayer === "project"
      ? getProjectPluginsDir(projectPath)
      : getUserPluginsDir();

  const dest = path.join(targetRoot, manifest.name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(resolved, dest, { recursive: true, force: true });

  return dest;
}

export async function removePlugin(
  pluginName: string,
  projectPath: string,
): Promise<boolean> {
  const projectPath_ = path.join(getProjectPluginsDir(projectPath), pluginName);
  const userPath = path.join(getUserPluginsDir(), pluginName);

  for (const target of [projectPath_, userPath]) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

export function formatPluginList(plugins: LoadedPlugin[]): string {
  if (plugins.length === 0) {
    return "No plugins loaded.\nInstall with: sajicode plugin add ./my-plugin";
  }

  const lines = [
    "PLUGINS (project overrides user):",
    "",
    ...plugins.map((p) => {
      const caps = p.manifest.capabilities.join(", ") || "none";
      return `  • ${p.manifest.name} v${p.manifest.version} [${p.layer}]\n    ${p.manifest.description ?? ""}\n    Capabilities: ${caps}\n    Path: ${p.rootPath}`;
    }),
    "",
    `Total: ${plugins.length}`,
  ];
  return lines.join("\n");
}

export function formatPluginConsent(plugin: LoadedPlugin): string {
  const perms = plugin.manifest.permissions;
  const lines = [
    `Plugin "${plugin.manifest.name}" v${plugin.manifest.version} requests:`,
    `  Capabilities: ${plugin.manifest.capabilities.join(", ")}`,
  ];
  if (perms?.network?.length) {
    lines.push(`  Network: ${perms.network.join(", ")}`);
  }
  lines.push(`  Shell: ${perms?.shell ? "yes" : "no"}`);
  lines.push(`  Filesystem: ${perms?.filesystem ?? "project-only"}`);
  return lines.join("\n");
}
