import fs from "fs/promises";
import path from "path";
import type { ModelConfig, ProjectConfig, HumanInTheLoopConfig } from "../types/index.js";
import type { ConfigFileInput } from "./schema.js";
import { loadLayeredConfigFile } from "./layering.js";
import { applyOfflineMode, applyOfflineEnvironment } from "./offline.js";

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: "ollama",
  modelName: "minimax-m2.5:cloud",
  temperature: 0,
  maxRetries: 3,
  maxTokens: 4096,
  baseUrl: "http://localhost:11434",
};

const DEFAULT_HUMAN_IN_THE_LOOP: HumanInTheLoopConfig = {
  enabled: false,
  tools: {
    execute: { allowedDecisions: ["approve", "edit", "reject"] },
    delete_file: { allowedDecisions: ["approve", "reject"] },
    write_file: false,
    edit_file: false,
    read_memory_index: false,
    read_topic: false,
    write_memory_topic: false,
    search_transcripts: false,
    append_transcript: false,
  },
  allowedCommands: [
    "npm install",
    "npm run",
    "npm test",
    "npx tsc",
    "npx tsx",
    "mkdir",
    "touch",
    "cat ",
    "echo ",
    "cd ",
    "pwd",
    "ls ",
    "dir ",
    "git status",
    "git log",
    "git diff",
    "git branch",
    "node ",
    "python ",
    "python3 ",
  ],
};

const CONFIG_DIR = ".sajicode";
const CONFIG_FILE = "config.json";

export function getDefaultConfig(projectPath: string): ProjectConfig {
  return {
    projectPath,
    modelConfig: { ...DEFAULT_MODEL_CONFIG },
    riskTolerance: "medium",
    humanInTheLoop: { ...DEFAULT_HUMAN_IN_THE_LOOP },
    whatsapp: { enabled: false, mode: "admin" },
    hooks: {},
  };
}

function mergeConfigFromFile(
  projectPath: string,
  defaults: ProjectConfig,
  fileConfig: ConfigFileInput,
): ProjectConfig {
  const modelFromFile = fileConfig.model ?? fileConfig.modelConfig ?? {};

  return {
    projectPath,
    modelConfig: {
      ...defaults.modelConfig,
      ...modelFromFile,
    },
    ...(fileConfig.modelRouting ? { modelRouting: fileConfig.modelRouting } : {}),
    ...(fileConfig.budget ? { budget: fileConfig.budget } : {}),
    ...(fileConfig.sandbox ? { sandbox: fileConfig.sandbox } : {}),
    ...(fileConfig.asyncSubagents ? { asyncSubagents: fileConfig.asyncSubagents } : {}),
    ...(fileConfig.policies ? { policies: fileConfig.policies } : {}),
    ...(fileConfig.vault ? { vault: fileConfig.vault } : {}),
    ...(fileConfig.offline ? { offline: fileConfig.offline } : {}),
    ...(fileConfig.codeGraph ? { codeGraph: fileConfig.codeGraph } : {}),
    ...(fileConfig.compression ? { compression: fileConfig.compression } : {}),
    ...(fileConfig.daemon ? { daemon: fileConfig.daemon } : {}),
    ...(fileConfig.browser ? { browser: fileConfig.browser } : {}),
    ...(fileConfig.a2a ? { a2a: fileConfig.a2a } : {}),
    ...(fileConfig.guardian ? { guardian: fileConfig.guardian } : {}),
    ...(fileConfig.pluginRegistryUrl
      ? { pluginRegistryUrl: fileConfig.pluginRegistryUrl }
      : {}),
    riskTolerance: fileConfig.riskTolerance ?? defaults.riskTolerance,
    humanInTheLoop: {
      ...defaults.humanInTheLoop!,
      ...(fileConfig.humanInTheLoop ?? {}),
      tools: {
        ...defaults.humanInTheLoop!.tools,
        ...(fileConfig.humanInTheLoop?.tools ?? {}),
      },
      allowedCommands:
        fileConfig.humanInTheLoop?.allowedCommands
        ?? defaults.humanInTheLoop!.allowedCommands,
    },
    whatsapp: {
      ...defaults.whatsapp!,
      ...(fileConfig.whatsapp ?? {}),
    },
    hooks: {
      ...defaults.hooks,
      ...(fileConfig.hooks ?? {}),
    },
  };
}

export async function loadConfig(projectPath: string): Promise<ProjectConfig> {
  const defaults = getDefaultConfig(projectPath);
  const layered = await loadLayeredConfigFile(projectPath);

  for (const warning of layered.warnings) {
    if (!warning.includes("No project config")) {
      console.warn(warning);
    }
  }

  const hasProjectLayer = layered.sources.some((s) => s.layer === "project");
  if (!hasProjectLayer) {
    await ensureDefaultConfig(projectPath, defaults);
    const retry = await loadLayeredConfigFile(projectPath);
    return applyOfflineIfRequested(
      mergeConfigFromFile(projectPath, defaults, retry.fileConfig),
    );
  }

  return applyOfflineIfRequested(
    mergeConfigFromFile(projectPath, defaults, layered.fileConfig),
  );
}

function applyOfflineIfRequested(config: ProjectConfig): ProjectConfig {
  if (process.env["SAJICODE_OFFLINE"] === "1" || process.env["SAJICODE_OFFLINE"] === "true") {
    config.offline = { ...config.offline, enabled: true };
  }
  if (config.offline?.enabled) {
    applyOfflineEnvironment();
    return applyOfflineMode(config);
  }
  return config;
}

export async function resolveConfigForDoctor(
  projectPath: string,
): Promise<{ config: ProjectConfig; warnings: string[]; sources: string[] }> {
  const defaults = getDefaultConfig(projectPath);
  const layered = await loadLayeredConfigFile(projectPath);

  const sources = layered.sources.map((s) =>
    s.path ? `${s.layer} (${s.path})` : s.layer,
  );

  return {
    config: applyOfflineIfRequested(
      mergeConfigFromFile(projectPath, defaults, layered.fileConfig),
    ),
    warnings: layered.warnings,
    sources,
  };
}

async function ensureDefaultConfig(
  projectPath: string,
  config: ProjectConfig,
): Promise<void> {
  try {
    const configDir = path.join(projectPath, CONFIG_DIR);
    const configPath = path.join(configDir, CONFIG_FILE);
    await fs.mkdir(configDir, { recursive: true });
    const serializable = {
      model: config.modelConfig,
      riskTolerance: config.riskTolerance,
      humanInTheLoop: config.humanInTheLoop,
      whatsapp: config.whatsapp,
      hooks: config.hooks,
    };
    await fs.writeFile(configPath, JSON.stringify(serializable, null, 2), "utf-8");
  } catch {
    // non-fatal
  }
}

export async function saveConfig(config: ProjectConfig): Promise<void> {
  const configDir = path.join(config.projectPath, CONFIG_DIR);
  const configPath = path.join(configDir, CONFIG_FILE);

  await fs.mkdir(configDir, { recursive: true });

  const serializable = {
    model: config.modelConfig,
    riskTolerance: config.riskTolerance,
    humanInTheLoop: config.humanInTheLoop,
    whatsapp: config.whatsapp,
    hooks: config.hooks,
  };

  await fs.writeFile(configPath, JSON.stringify(serializable, null, 2), "utf-8");
}

export async function ensureProjectDir(projectPath: string): Promise<void> {
  const sajicodeDir = path.join(projectPath, CONFIG_DIR);
  await fs.mkdir(sajicodeDir, { recursive: true });
}
