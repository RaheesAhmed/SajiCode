import fs from "fs/promises";
import path from "path";
import type { ModelConfig, ProjectConfig, RiskTolerance, HumanInTheLoopConfig, WhatsAppConfig } from "../types/index.js";

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: "ollama",
  modelName: "minimax-m2.5:cloud",
  temperature: 0,
  maxRetries: 3,
  baseUrl: "http://localhost:11434",
};

const DEFAULT_HUMAN_IN_THE_LOOP: HumanInTheLoopConfig = {
  enabled: false,
  tools: {
    execute: { allowedDecisions: ["approve", "edit", "reject"] },
    delete_file: { allowedDecisions: ["approve", "reject"] },
  },
  allowedCommands: [
    "npm install",
    "npm run",
    "npx tsc",
    "npx tsx",
    "mkdir",
    "node ",
    "dir ",
    "ls ",
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

export async function loadConfig(projectPath: string): Promise<ProjectConfig> {
  const configPath = path.join(projectPath, CONFIG_DIR, CONFIG_FILE);
  const defaults = getDefaultConfig(projectPath);

  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const fileConfig = JSON.parse(raw) as Partial<{
      model: Partial<ModelConfig>;
      riskTolerance: RiskTolerance;
      humanInTheLoop: Partial<HumanInTheLoopConfig>;
      whatsapp: Partial<WhatsAppConfig>;
      hooks: Partial<import("../types/index.js").HooksConfig>;
    }>;

    return {
      projectPath,
      modelConfig: {
        ...defaults.modelConfig,
        ...(fileConfig.model ?? {}),
      },
      riskTolerance: fileConfig.riskTolerance ?? defaults.riskTolerance,
      humanInTheLoop: {
        ...defaults.humanInTheLoop!,
        ...(fileConfig.humanInTheLoop ?? {}),
        tools: {
          ...defaults.humanInTheLoop!.tools,
          ...(fileConfig.humanInTheLoop?.tools ?? {}),
        },
        allowedCommands: fileConfig.humanInTheLoop?.allowedCommands
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
  } catch {
    // No config file — write the default so user can see/edit it
    await ensureDefaultConfig(projectPath, defaults);
    return defaults;
  }
}

async function ensureDefaultConfig(
  projectPath: string,
  config: ProjectConfig
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
    // non-fatal — config is optional
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
