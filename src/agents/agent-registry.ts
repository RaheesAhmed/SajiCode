import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { CompiledSubAgent } from "deepagents";
import { createAgentFromSpec, AGENT_PRESETS, type AgentSpec, type AgentFactoryOptions } from "./agent-factory.js";
import { createModelForAgent } from "../llms/model-factory.js";
import type { ModelConfig, ModelRoutingConfig, BudgetConfig } from "../types/index.js";

export interface AgentRegistryOptions extends AgentFactoryOptions {
  baseModelConfig: ModelConfig;
  modelRouting?: ModelRoutingConfig;
  sessionId: string;
  budget?: BudgetConfig;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPECS_DIR = path.join(__dirname, "specs");

// ── JSON spec shape (what lives in src/agents/specs/*.json) ───────────────────

interface AgentSpecJson {
  name: string;
  role: string;
  description: string;
  territory: string[];
  forbiddenPaths: string[];
  identity: string;
  primarySkills: string[];
  expertise: string;
  skillsToRead: string[];
  scaffolding?: Record<string, string>;
  standards: string[];
  artifactFormat: string;
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(json: AgentSpecJson): string {
  const roleLabel = json.role.charAt(0).toUpperCase() + json.role.slice(1).replace(/-/g, " ");
  const lines: string[] = [
    `You are a Staff ${roleLabel} Engineer on the SajiCode team.`,
    `EXPERTISE: ${json.expertise}`,
    "",
    "SKILLS TO READ before writing code:",
    ...json.skillsToRead.map((s) => `  • ${s}`),
  ];

  if (json.scaffolding && Object.keys(json.scaffolding).length > 0) {
    lines.push(
      "",
      "SCAFFOLDING (new projects only — skip if modifying existing code):",
    );
    for (const [label, cmd] of Object.entries(json.scaffolding)) {
      lines.push(`  → ${label}: execute("${cmd}")`);
    }
    lines.push(
      "  → NEVER manually create package.json, tsconfig.json, or framework config files.",
    );
  }

  lines.push("", "STANDARDS:");
  for (const s of json.standards) {
    lines.push(`  → ${s}`);
  }

  lines.push("", `ARTIFACT FORMAT: ${json.artifactFormat}`);
  return lines.join("\n");
}

// ── Spec file loading ─────────────────────────────────────────────────────────

async function loadSpecsFromDir(dir: string): Promise<AgentSpecJson[]> {
  try {
    const files = await readdir(dir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    return Promise.all(
      jsonFiles.map(async (f) => {
        const content = await readFile(path.join(dir, f), "utf-8");
        return JSON.parse(content) as AgentSpecJson;
      }),
    );
  } catch {
    return [];
  }
}

export async function loadAllSpecs(extraSpecDirs: string[] = []): Promise<AgentSpecJson[]> {
  const allSpecs: AgentSpecJson[] = [];

  for (const dir of extraSpecDirs) {
    allSpecs.push(...(await loadSpecsFromDir(dir)));
  }

  allSpecs.push(...(await loadSpecsFromDir(SPECS_DIR)));

  const byName = new Map<string, AgentSpecJson>();
  for (const spec of allSpecs) {
    byName.set(spec.name, spec);
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function jsonToAgentSpec(json: AgentSpecJson): AgentSpec {
  return {
    name: json.name,
    role: json.role,
    description: json.description,
    territory: json.territory,
    forbiddenPaths: json.forbiddenPaths,
    identity: json.identity,
    primarySkills: json.primarySkills,
    systemPrompt: buildSystemPrompt(json),
  };
}

// ── Main factory ──────────────────────────────────────────────────────────────

/**
 * Load all JSON specs from specs/ and create CompiledSubAgents.
 * Falls back to AGENT_PRESETS if no JSON specs are found.
 */
export async function createAllRegisteredAgents(
  projectPath: string,
  options: AgentRegistryOptions,
  extraSpecDirs: string[] = [],
): Promise<CompiledSubAgent[]> {
  const jsonSpecs = await loadAllSpecs(extraSpecDirs);
  const factoryOptions: AgentFactoryOptions = {
    mcpClient: options.mcpClient,
    mcpTools: options.mcpTools,
    checkpointer: options.checkpointer,
    pluginSkillRoots: options.pluginSkillRoots,
    baseModelConfig: options.baseModelConfig,
  };

  if (jsonSpecs.length > 0) {
    return Promise.all(
      jsonSpecs.map(async (json) => {
        const model = await createModelForAgent(
          json.name,
          options.baseModelConfig,
          options.modelRouting,
          {
            projectPath,
            sessionId: options.sessionId,
            ...(options.budget ? { budget: options.budget } : {}),
          },
        );
        return createAgentFromSpec(
          jsonToAgentSpec(json),
          model,
          projectPath,
          factoryOptions,
        );
      }),
    );
  }

  return Promise.all(
    Object.values(AGENT_PRESETS).map(async (spec) => {
      const model = await createModelForAgent(
        spec.name,
        options.baseModelConfig,
        options.modelRouting,
        {
          projectPath,
          sessionId: options.sessionId,
          ...(options.budget ? { budget: options.budget } : {}),
        },
      );
      return createAgentFromSpec(spec, model, projectPath, factoryOptions);
    }),
  );
}

// ── PM tools for dynamic agent selection ─────────────────────────────────────

export function createAgentRegistryTools(specs: AgentSpecJson[]) {
  const listAgentsTool = tool(
    async (): Promise<string> => {
      if (specs.length === 0) {
        return "No agents registered. Using default team.";
      }
      const header = [
        "AVAILABLE SPECIALIST AGENTS:",
        "",
        "| Agent Name              | Primary Skills             | Use For |",
        "|-------------------------|---------------------------|---------|",
      ];
      const rows = specs.map(
        (s) =>
          `| ${s.name.padEnd(23)} | ${s.primarySkills.slice(0, 3).join(", ").padEnd(25)} | ${s.description.split(".")[0]} |`,
      );
      return [...header, ...rows, "", `Total: ${specs.length} agents available.`].join("\n");
    },
    {
      name: "list_available_agents",
      description:
        "Lists all available specialist agents with their primary skills and use cases. " +
        "Call this when you need to decide which agent(s) to dispatch for a task.",
      schema: z.object({}),
    },
  );

  const pickBestAgentTool = tool(
    async ({
      task,
      context,
    }: {
      task: string;
      context?: string;
    }): Promise<string> => {
      const roster = specs
        .map(
          (s) =>
            `• ${s.name} [${s.primarySkills.join(", ")}]\n  → ${s.description}`,
        )
        .join("\n\n");

      return [
        `TASK: "${task}"`,
        context ? `CONTEXT: ${context}` : "",
        "",
        "AVAILABLE AGENTS:",
        roster,
        "",
        "SELECTION RULES:",
        "  • Fullstack work → dispatch backend-lead + frontend-lead in PARALLEL",
        "  • Next.js 14+ App Router → nextjs-specialist (preferred over frontend-lead)",
        "  • Python API → python-api-specialist (preferred over backend-lead)",
        "  • RAG / embeddings / vector DB → ai-rag-specialist",
        "  • LLM agent / chatbot → data-ai-lead",
        "  • 3D / WebGL / Three.js → 3d-web-specialist",
        "  • Performance audit → performance-specialist",
        "  • MCP server → mcp-specialist",
        "  • Docker / CI/CD → deploy-lead",
        "  • Security audit → security-lead",
        "  • Research / comparisons / ADRs → research-lead",
        "  • Test coverage → qa-lead",
        "  • Final quality gate → review-agent (run LAST)",
        "",
        "Dispatch multiple task() calls in ONE response for parallel execution.",
      ]
        .filter(Boolean)
        .join("\n");
    },
    {
      name: "pick_best_agent",
      description:
        "Given a task description, returns a ranked recommendation of which agent(s) to dispatch " +
        "and whether to run them in parallel. Use before any task() dispatch for unfamiliar domains.",
      schema: z.object({
        task: z
          .string()
          .describe("What needs to be built or done"),
        context: z
          .string()
          .optional()
          .describe("Additional project context (stack, existing code, constraints)"),
      }),
    },
  );

  return [listAgentsTool, pickBestAgentTool];
}
