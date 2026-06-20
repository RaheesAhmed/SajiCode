import fs from "fs/promises";
import path from "path";
import type { ModelConfig, ProjectConfig, RiskTolerance, HumanInTheLoopConfig, WhatsAppConfig } from "../types/index.js";

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
    // Shell execution with security checks
    execute: { allowedDecisions: ["approve", "edit", "reject"] },
    // File operations
    delete_file: { allowedDecisions: ["approve", "reject"] },
    write_file: false, // Auto-approve writes (security checks handle dangerous patterns)
    edit_file: false,  // Auto-approve edits
    // Memory operations (auto-approve - agents need memory access)
    read_memory_index: false,
    read_topic: false,
    write_memory_topic: false,
    search_transcripts: false,
    append_transcript: false,
  },
  allowedCommands: [
    // Package managers
    "npm install",
    "npm run",
    "npm test",
    "npx tsc",
    "npx tsx",
    // Safe file operations
    "mkdir",
    "touch",
    "cat ",
    "echo ",
    // Safe navigation
    "cd ",
    "pwd",
    "ls ",
    "dir ",
    // Safe git operations
    "git status",
    "git log",
    "git diff",
    "git branch",
    // Node/Python execution (security checks will catch dangerous patterns)
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
