import { createDeepAgent, CompositeBackend, StoreBackend } from "deepagents";
import { SafeShellBackend } from "../tools/shell-wrapper.js";
import { MemorySaver } from "@langchain/langgraph";
import { InMemoryStore } from "@langchain/langgraph-checkpoint";
import type { ProjectConfig, OnboardingResult, HumanInTheLoopConfig } from "../types/index.js";
import { createPmPrompt } from "../prompts/pm.js";
import { judgmentMiddleware } from "./judgment.js";
import { loadProjectContext, INIT_SYSTEM_PROMPT, ensureSajiCodeDir } from "./context.js";
import { createContextTools } from "../tools/context-tools.js";
import { createWebSearchTool } from "../tools/web-search.js";
import { createRepoMapTool } from "../tools/repo-map.js";
import { createAllDomainHeads } from "./domain-heads.js";
import { createModel } from "../llms/provider.js";
import { getAllSkillPaths } from "../utils/skills.js";
import { MCPClientManager } from "../mcp/MCPClient.js";
import { createContextBriefingTool } from "../tools/context-briefing.js";
import { createExperienceTools } from "../tools/experience-tools.js";
import { createSessionStateTools } from "../memory/session-state.js";
import { contextGuardMiddleware } from "./context-guard.js";
import { createGitTools } from "../tools/git-tools.js";
import { createFileTrackerTools } from "../tools/file-tracker.js";

function buildInterruptOn(
  hitl: HumanInTheLoopConfig | undefined
): Record<string, boolean | { allowedDecisions: string[] }> | undefined {
  if (!hitl?.enabled) return undefined;
  const result: Record<string, boolean | { allowedDecisions: string[] }> = {};
  for (const [toolName, cfg] of Object.entries(hitl.tools)) {
    if (cfg === false) continue;
    result[toolName] = cfg === true ? true : { allowedDecisions: cfg.allowedDecisions };
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export interface SajiCodeOptions {
  config: ProjectConfig;
  onboardingResult: OnboardingResult;
  threadId: string;
}

export async function createSajiCode(
  options: SajiCodeOptions
): Promise<{ agent: any; sessionConfig: Record<string, any>; mcpClient: MCPClientManager }> {
  const { config, onboardingResult, threadId } = options;

  const model = await createModel(config.modelConfig);

  const projectContext = await loadProjectContext(config.projectPath);
  const contextPrompt = buildContextPrompt(onboardingResult);
  const pmPrompt = createPmPrompt(config.projectPath);
  const fullSystemPrompt = [
    pmPrompt,
    projectContext,
    contextPrompt,
  ].filter(Boolean).join("\n\n");

  const checkpointer = new MemorySaver();
  const store = new InMemoryStore();
  const contextTools = createContextTools(config.projectPath);
  const repoMapTool = createRepoMapTool(config.projectPath);

  const mcpClient = new MCPClientManager(config.projectPath);
  await mcpClient.initialize();
  const mcpTools = await mcpClient.getTools();

  await ensureSajiCodeDir(config.projectPath);

  const domainHeads = await createAllDomainHeads(model, config.projectPath);
  const interruptOn = buildInterruptOn(config.humanInTheLoop);

  const contextBriefingTool = createContextBriefingTool(config.projectPath);
  const experienceTools = createExperienceTools(config.projectPath);
  const sessionStateTools = createSessionStateTools(config.projectPath);

  const agent = await createDeepAgent({
    name: "pm-agent",
    model,
    systemPrompt: fullSystemPrompt,
    store,
    backend: (agentConfig: any) => new CompositeBackend(
      new SafeShellBackend({
        rootDir: config.projectPath,
        projectPath: config.projectPath,
      }),
      { "/memories/": new StoreBackend(agentConfig) }
    ),
    tools: [
      ...contextTools,
      repoMapTool,
      createWebSearchTool(),
      contextBriefingTool,
      ...experienceTools,
      ...sessionStateTools,
      ...mcpTools,
      ...createGitTools(config.projectPath),
      ...createFileTrackerTools(config.projectPath),
    ] as any,
    subagents: domainHeads as any,
    middleware: [judgmentMiddleware, contextGuardMiddleware] as any,
    checkpointer,
    skills: getAllSkillPaths() as any,
    ...(interruptOn ? { interruptOn } : {}),
  } as any);

  const sessionConfig = {
    configurable: {
      thread_id: threadId,
    },
    recursionLimit: 150,
  };

  return { agent, sessionConfig, mcpClient };
}

export async function createInitAgent(
  config: ProjectConfig,
  threadId: string
): Promise<{ agent: any; sessionConfig: Record<string, any> }> {
  const model = await createModel(config.modelConfig);

  const backend = new SafeShellBackend({
    rootDir: config.projectPath,
    projectPath: config.projectPath,
  });

  const checkpointer = new MemorySaver();
  const contextTools = createContextTools(config.projectPath);
  const repoMapTool = createRepoMapTool(config.projectPath);

  await ensureSajiCodeDir(config.projectPath);

  const agent = await createDeepAgent({
    name: "init-agent",
    model,
    skills: getAllSkillPaths() as any,
    systemPrompt: INIT_SYSTEM_PROMPT,
    backend,
    tools: [...contextTools, repoMapTool, createWebSearchTool()] as any,
    checkpointer,
  });

  const sessionConfig = {
    configurable: { thread_id: threadId },
    recursionLimit: 300,
  };

  return { agent, sessionConfig };
}

function buildContextPrompt(result: OnboardingResult): string {
  if (!result.projectDescription) return "";

  const lines = [
    "## Current Request Context",
    "",
    `**User Level**: ${result.experienceLevel}`,
    `**Project Type**: ${result.projectType}`,
  ];

  if (result.projectDescription) {
    lines.push(`**Description**: ${result.projectDescription}`);
  }

  if (result.features.length > 0) {
    lines.push(`**Features**: ${result.features.join(", ")}`);
  }

  const prefs = result.stackPreferences;
  if (prefs.framework) lines.push(`**Framework**: ${prefs.framework}`);
  if (prefs.database) lines.push(`**Database**: ${prefs.database}`);
  if (prefs.auth) lines.push(`**Auth**: ${prefs.auth}`);
  if (prefs.hosting) lines.push(`**Hosting**: ${prefs.hosting}`);

  return lines.join("\n");
}

export { runOnboarding } from "./onboarding.js";
