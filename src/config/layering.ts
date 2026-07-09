import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ConfigFileInput } from "./schema.js";
import { safeParseConfigFile, findUnknownConfigKeys } from "./schema.js";

const CONFIG_DIR = ".sajicode";
const CONFIG_FILE = "config.json";
const LOCAL_CONFIG_FILE = "config.local.json";

export function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".sajicode", CONFIG_FILE);
}

export function getProjectConfigPath(projectPath: string): string {
  return path.join(projectPath, CONFIG_DIR, CONFIG_FILE);
}

export function getLocalConfigPath(projectPath: string): string {
  return path.join(projectPath, CONFIG_DIR, LOCAL_CONFIG_FILE);
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function deepMergeConfig(
  base: ConfigFileInput,
  overlay: ConfigFileInput,
): ConfigFileInput {
  return {
    ...base,
    ...overlay,
    model: { ...(base.model ?? {}), ...(overlay.model ?? {}) },
    modelConfig: { ...(base.modelConfig ?? {}), ...(overlay.modelConfig ?? {}) },
    humanInTheLoop: overlay.humanInTheLoop
      ? {
          ...base.humanInTheLoop,
          ...overlay.humanInTheLoop,
          tools: {
            ...(base.humanInTheLoop?.tools ?? {}),
            ...(overlay.humanInTheLoop.tools ?? {}),
          },
          allowedCommands:
            overlay.humanInTheLoop.allowedCommands
            ?? base.humanInTheLoop?.allowedCommands,
        }
      : base.humanInTheLoop,
    whatsapp: { ...(base.whatsapp ?? {}), ...(overlay.whatsapp ?? {}) },
    hooks: { ...(base.hooks ?? {}), ...(overlay.hooks ?? {}) },
    modelRouting: overlay.modelRouting
      ? { ...(base.modelRouting ?? {}), ...overlay.modelRouting }
      : base.modelRouting,
    budget: overlay.budget
      ? { ...(base.budget ?? {}), ...overlay.budget }
      : base.budget,
    sandbox: overlay.sandbox
      ? { ...(base.sandbox ?? {}), ...overlay.sandbox }
      : base.sandbox,
    asyncSubagents: overlay.asyncSubagents
      ? { ...(base.asyncSubagents ?? {}), ...overlay.asyncSubagents }
      : base.asyncSubagents,
    policies: overlay.policies
      ? { ...(base.policies ?? {}), ...overlay.policies }
      : base.policies,
    vault: overlay.vault ? { ...(base.vault ?? {}), ...overlay.vault } : base.vault,
    offline: overlay.offline
      ? { ...(base.offline ?? {}), ...overlay.offline }
      : base.offline,
    codeGraph: overlay.codeGraph
      ? { ...(base.codeGraph ?? {}), ...overlay.codeGraph }
      : base.codeGraph,
    compression: overlay.compression
      ? { ...(base.compression ?? {}), ...overlay.compression }
      : base.compression,
    daemon: overlay.daemon
      ? { ...(base.daemon ?? {}), ...overlay.daemon }
      : base.daemon,
    browser: overlay.browser
      ? { ...(base.browser ?? {}), ...overlay.browser }
      : base.browser,
    pluginRegistryUrl: overlay.pluginRegistryUrl ?? base.pluginRegistryUrl,
  };
}

function applyEnvOverrides(config: ConfigFileInput): ConfigFileInput {
  const model = { ...(config.model ?? config.modelConfig ?? {}) };

  if (process.env["SAJICODE_PROVIDER"]) {
    model.provider = process.env["SAJICODE_PROVIDER"];
  }
  if (process.env["SAJICODE_MODEL"]) {
    model.modelName = process.env["SAJICODE_MODEL"];
  }
  if (process.env["SAJICODE_BASE_URL"]) {
    model.baseUrl = process.env["SAJICODE_BASE_URL"];
  }
  if (process.env["SAJICODE_API_KEY"]) {
    model.apiKey = process.env["SAJICODE_API_KEY"];
  }

  return {
    ...config,
    model,
    riskTolerance:
      (process.env["SAJICODE_RISK"] as ConfigFileInput["riskTolerance"])
      ?? config.riskTolerance,
  };
}

export interface ConfigLayerSource {
  layer: "defaults" | "global" | "project" | "local" | "env";
  path?: string;
}

export interface LayeredConfigFileResult {
  fileConfig: ConfigFileInput;
  warnings: string[];
  sources: ConfigLayerSource[];
}

export async function loadLayeredConfigFile(
  projectPath: string,
): Promise<LayeredConfigFileResult> {
  const warnings: string[] = [];
  const sources: ConfigLayerSource[] = [{ layer: "defaults" }];

  let merged: ConfigFileInput = {};

  const globalPath = getGlobalConfigPath();
  const globalRaw = await readJsonFile(globalPath);
  if (globalRaw) {
    const parsed = safeParseConfigFile(globalRaw);
    if (parsed.success) {
      merged = deepMergeConfig(merged, parsed.data);
      sources.push({ layer: "global", path: globalPath });
    } else {
      warnings.push(`Invalid global config: ${parsed.error}`);
    }
  }

  const projectConfigPath = getProjectConfigPath(projectPath);
  const projectRaw = await readJsonFile(projectConfigPath);
  if (projectRaw) {
    const unknown = findUnknownConfigKeys(projectRaw);
    if (unknown.length > 0) {
      warnings.push(`Unknown keys in project config (ignored): ${unknown.join(", ")}`);
    }
    const parsed = safeParseConfigFile(projectRaw);
    if (parsed.success) {
      merged = deepMergeConfig(merged, parsed.data);
      sources.push({ layer: "project", path: projectConfigPath });
    } else {
      warnings.push(parsed.error);
    }
  } else {
    warnings.push(`No project config at ${projectConfigPath} — using defaults + global`);
  }

  const localPath = getLocalConfigPath(projectPath);
  const localRaw = await readJsonFile(localPath);
  if (localRaw) {
    const parsed = safeParseConfigFile(localRaw);
    if (parsed.success) {
      merged = deepMergeConfig(merged, parsed.data);
      sources.push({ layer: "local", path: localPath });
    } else {
      warnings.push(`Invalid local config: ${parsed.error}`);
    }
  }

  const withEnv = applyEnvOverrides(merged);
  if (
    process.env["SAJICODE_PROVIDER"]
    || process.env["SAJICODE_MODEL"]
    || process.env["SAJICODE_RISK"]
    || process.env["SAJICODE_BASE_URL"]
    || process.env["SAJICODE_API_KEY"]
  ) {
    sources.push({ layer: "env" });
  }

  return { fileConfig: withEnv, warnings, sources };
}
