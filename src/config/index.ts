import fs from "fs/promises";
import path from "path";
import type { ModelConfig, ProjectConfig, HumanInTheLoopConfig } from "../types/index.js";
import {
  safeParseConfigFile,
  findUnknownConfigKeys,
  type ConfigFileInput,
} from "./schema.js";

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
  const configPath = path.join(projectPath, CONFIG_DIR, CONFIG_FILE);
  const defaults = getDefaultConfig(projectPath);

  try {
    const rawText = await fs.readFile(configPath, "utf-8");
    const rawJson = JSON.parse(rawText) as Record<string, unknown>;
    const parsed = safeParseConfigFile(rawJson);

    if (!parsed.success) {
      console.warn(parsed.error);
      return defaults;
    }

    const unknownKeys = findUnknownConfigKeys(rawJson);
    if (unknownKeys.length > 0) {
      console.warn(
        `Unknown keys in .sajicode/config.json (ignored): ${unknownKeys.join(", ")}`,
      );
    }

    return mergeConfigFromFile(projectPath, defaults, parsed.data);
  } catch {
    await ensureDefaultConfig(projectPath, defaults);
    return defaults;
  }
}

export async function resolveConfigForDoctor(
  projectPath: string,
): Promise<{ config: ProjectConfig; warnings: string[] }> {
  const configPath = path.join(projectPath, CONFIG_DIR, CONFIG_FILE);
  const defaults = getDefaultConfig(projectPath);
  const warnings: string[] = [];

  try {
    const rawText = await fs.readFile(configPath, "utf-8");
    const rawJson = JSON.parse(rawText) as Record<string, unknown>;
    const parsed = safeParseConfigFile(rawJson);

    if (!parsed.success) {
      warnings.push(parsed.error);
      return { config: defaults, warnings };
    }

    const unknownKeys = findUnknownConfigKeys(rawJson);
    if (unknownKeys.length > 0) {
      warnings.push(`Unknown keys ignored: ${unknownKeys.join(", ")}`);
    }

    return {
      config: mergeConfigFromFile(projectPath, defaults, parsed.data),
      warnings,
    };
  } catch (error) {
    warnings.push(`No config file at ${configPath} — using defaults`);
    return { config: defaults, warnings };
  }
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
