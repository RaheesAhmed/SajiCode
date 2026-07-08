import { createDeepAgent, CompositeBackend, StoreBackend } from "deepagents";
import { createExecuteTool } from "../tools/shell-wrapper.js";
import { createShellBackend } from "../tools/sandbox-backend.js";
import { InMemoryStore } from "@langchain/langgraph-checkpoint";
import type { ProjectConfig, OnboardingResult, HumanInTheLoopConfig } from "../types/index.js";
import { createPmPrompt } from "../prompts/pm.js";
import { judgmentMiddleware } from "./judgment.js";
import { loadProjectContext, INIT_SYSTEM_PROMPT, ensureSajiCodeDir } from "./context.js";
import { createContextTools } from "../tools/context-tools.js";
import { createWebSearchTool } from "../tools/web-search.js";
import { createRepoMapTool } from "../tools/repo-map.js";
import { createAllDomainHeads } from "./domain-heads.js";
import {
  buildAsyncSubAgentSpecs,
  isAsyncSubagentsEnabled,
  stopAgentProtocolSession,
} from "./async-subagents.js";
import { getActiveAgentProtocolServer, startAgentProtocolSession } from "./local-agent-protocol.js";
import { loadAllSpecs, createAgentRegistryTools } from "./agent-registry.js";
import { createModelForAgent } from "../llms/model-factory.js";
import { getAllSkillPaths } from "../utils/skills.js";
import { loadPluginContributions } from "../plugins/registry.js";
import { MCPClientManager } from "../mcp/MCPClient.js";
import { createContextBriefingTool } from "../tools/context-briefing.js";
import { createExperienceTools } from "../tools/experience-tools.js";
import { createSessionStateTools } from "../memory/session-state.js";
import { contextGuardMiddleware, setAuditProjectPath } from "./context-guard.js";
import { hookMiddleware } from "./hook-middleware.js";
import { policyMiddleware, setPolicyContext } from "../policy/middleware.js";
import { setCompressionConfig, compressionMiddleware } from "../context/compression-middleware.js";
import { isCompressionEnabled } from "../context/compression.js";
import { resolvePolicies } from "../policy/loader.js";
import { isOfflineMode } from "../config/offline.js";
import { setHookContext, emitHookAsync } from "../hooks/hook-engine.js";
import {
  toolRetryMiddleware,
  modelRetryMiddleware,
  contextEditingMiddleware,
  ClearToolUsesEdit,
} from "langchain";
import { createGitTools } from "../tools/git-tools.js";
import { createFileTrackerTools } from "../tools/file-tracker.js";

import { createDependencyOrderTool } from "../tools/dependency-graph.js";
import { createCodeSearchTools } from "../tools/code-search.js";
import { createCodeGraphTools } from "../tools/codegraph-tools.js";
import { createMemoryTools } from "../tools/memory-tools.js";
import { createTaskGraphTools } from "../tools/task-graph-tools.js";
import { createIntelligenceTools } from "../tools/intelligence-tools.js";
import { createTeamContextTools } from "../tools/team-context.js";
import { initThreeLayerMemory, loadPointerIndex, formatPointerIndexForPrompt } from "../memory/three-layer-memory.js";
import { createGitSessionTools } from "../tools/git-session.js";
import { createProjectDnaTools } from "../memory/project-dna.js";
import { createRepoLoaderTools } from "../tools/repo-loader.js";
import { createContractTools } from "../tools/contract-tools.js";
import { createPatternTools } from "../memory/pattern-library.js";
import { createValidationTools } from "../tools/validation-tools.js";
import { createStandupTools } from "../tools/standup.js";
import { createMessagingTools } from "../tools/messaging-tools.js";
import { createSemanticMemoryTools } from "../tools/semantic-memory-tools.js";
import { createAdrTools } from "../tools/adr-tools.js";
import { createDebateTools } from "../tools/debate-tools.js";
import {
  resolveActivePersona,
  formatPersonaForPrompt,
  formatNonDeveloperGuidance,
} from "../persona/index.js";
import { createPromoteSkillTool } from "../skills/promote.js";
import { createSmokeCheckTools } from "../tools/verification-ladder.js";
import { createDeployTools, createCiTools } from "../tools/deploy-tools.js";
import { finalizeSession } from "../observability/session-end.js";
import { getCheckpointer, saveCurrentThread } from "../memory/index.js";

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

  setAuditProjectPath(config.projectPath);
  setHookContext({
    projectPath: config.projectPath,
    hooks: config.hooks,
    defaultAgentName: "pm-agent",
  });

  const resolvedPolicies = await resolvePolicies(
    config.projectPath,
    config.policies,
  );
  setPolicyContext({
    projectPath: config.projectPath,
    sessionId: threadId,
    policies: resolvedPolicies,
  });
  setCompressionConfig(
    isCompressionEnabled(config.compression) ? (config.compression ?? { enabled: true }) : null,
  );
  await saveCurrentThread(config.projectPath, threadId);
  emitHookAsync("sessionStart", {
    sessionId: threadId,
    projectPath: config.projectPath,
  });

  const model = await createModelForAgent(
    "pm-agent",
    config.modelConfig,
    config.modelRouting,
    {
      projectPath: config.projectPath,
      sessionId: threadId,
      ...(config.budget ? { budget: config.budget } : {}),
    },
  );

  // Initialize three-layer memory structure
  await initThreeLayerMemory(config.projectPath);
  
  // Load memory pointer index (Layer 1 - always loaded)
  const memoryIndex = await loadPointerIndex(config.projectPath);
  const memoryPrompt = formatPointerIndexForPrompt(memoryIndex);

  const projectContext = await loadProjectContext(config.projectPath);
  const contextPrompt = buildContextPrompt(onboardingResult);
  const persona = await resolveActivePersona(config.projectPath);
  const pmPrompt = createPmPrompt(config.projectPath, {
    asyncSubagents: isAsyncSubagentsEnabled(config.asyncSubagents),
  });
  const fullSystemPrompt = [
    pmPrompt,
    formatPersonaForPrompt(persona),
    formatNonDeveloperGuidance(onboardingResult.experienceLevel),
    memoryPrompt,
    projectContext,
    contextPrompt,
  ].filter(Boolean).join("\n\n");

  const checkpointer = await getCheckpointer(config.projectPath);
  const store = new InMemoryStore();
  const contextTools = createContextTools(config.projectPath);
  const repoMapTool = createRepoMapTool(config.projectPath);

  const pluginContributions = await loadPluginContributions(config.projectPath);

  const mcpClient = new MCPClientManager(config.projectPath);
  mcpClient.addServerConfigs(pluginContributions.mcpServers);
  await mcpClient.initialize();
  const mcpTools = await mcpClient.getToolsForAgent("pm-agent");

  await ensureSajiCodeDir(config.projectPath);

  const asyncEnabled = isAsyncSubagentsEnabled(config.asyncSubagents);
  let agentProtocolUrl = config.asyncSubagents?.url?.replace(/\/$/, "") ?? "";

  if (asyncEnabled && !agentProtocolUrl) {
    const session = await startAgentProtocolSession([]);
    agentProtocolUrl = session.url;
  }

  const factoryOptions = {
    mcpClient,
    checkpointer,
    pluginSkillRoots: pluginContributions.skillRoots,
    baseModelConfig: config.modelConfig,
    sandbox: config.sandbox,
    vault: config.vault,
    offline: isOfflineMode(config),
    ...(agentProtocolUrl
      ? {
          agentProtocolUrl,
          ...(config.asyncSubagents?.headers
            ? { agentProtocolHeaders: config.asyncSubagents.headers }
            : {}),
        }
      : {}),
  };

  const domainHeads = await createAllDomainHeads(
    config.projectPath,
    {
      ...factoryOptions,
      baseModelConfig: config.modelConfig,
      modelRouting: config.modelRouting,
      sessionId: threadId,
      offline: isOfflineMode(config),
      ...(config.budget ? { budget: config.budget } : {}),
    },
    pluginContributions.agentSpecPaths,
  );

  const protocolServer = getActiveAgentProtocolServer();
  if (protocolServer) {
    for (const head of domainHeads) {
      protocolServer.registerGraph(
        head.name,
        head.runnable as { invoke: (input: unknown, config?: Record<string, unknown>) => Promise<unknown> },
      );
    }
  }

  const asyncSpecs =
    asyncEnabled && agentProtocolUrl
      ? buildAsyncSubAgentSpecs(domainHeads, {
          url: agentProtocolUrl,
          ...(config.asyncSubagents?.headers
            ? { headers: config.asyncSubagents.headers }
            : {}),
        })
      : [];

  const subagents = asyncSpecs.length > 0
    ? [...asyncSpecs, ...domainHeads]
    : domainHeads;
  const agentSpecs = await loadAllSpecs(pluginContributions.agentSpecPaths);
  const registryTools = createAgentRegistryTools(agentSpecs);
  const interruptOn = buildInterruptOn(config.humanInTheLoop);

  const contextBriefingTool = createContextBriefingTool(config.projectPath);
  const experienceTools = createExperienceTools(config.projectPath, config.modelConfig);
  const sessionStateTools = createSessionStateTools(config.projectPath);
  
  const dependencyOrderTool = createDependencyOrderTool();
  const codeSearchTools = createCodeSearchTools(config.projectPath);
  const codeGraphEnabled = config.codeGraph?.enabled !== false;
  const codeGraphTools = codeGraphEnabled
    ? createCodeGraphTools(config.projectPath)
    : [];
  const taskGraphTools = createTaskGraphTools(config.projectPath);
  const intelligenceTools = createIntelligenceTools(config.projectPath);
  const teamContextTools = createTeamContextTools(config.projectPath);

  // Build the shell backend for the PM agent
  const offline = isOfflineMode(config);

  const shellBackend = createShellBackend({
    rootDir: config.projectPath,
    projectPath: config.projectPath,
    ...(config.sandbox ? { sandbox: config.sandbox } : {}),
    ...(config.vault ? { vault: config.vault } : {}),
  });
  const executeTool = createExecuteTool(shellBackend);

  // Create streaming execute tool for shell commands with progress events
  
  
  // Create three-layer memory tools
  const memoryTools = createMemoryTools(config.projectPath);

  const agent = await createDeepAgent({
    name: "pm-agent",
    model,
    systemPrompt: fullSystemPrompt,
    store,
    backend: (agentConfig: any) => new CompositeBackend(
      shellBackend,
      { "/memories/": new StoreBackend(agentConfig) },
    ),
    tools: [
      executeTool,
      ...contextTools,
      repoMapTool,
      createWebSearchTool(undefined, 3, offline),
      contextBriefingTool,
      ...experienceTools,
      ...sessionStateTools,
      ...mcpTools,
      ...createGitTools(config.projectPath),
      ...createFileTrackerTools(config.projectPath),
      
      dependencyOrderTool,
      ...codeSearchTools,
      ...codeGraphTools,
      ...taskGraphTools,
      ...intelligenceTools,
      ...teamContextTools,
      // Streaming execute tool for shell commands with progress events
      
      // Add three-layer memory tools
      ...memoryTools,
      // Beast-level intelligence tools
      ...createGitSessionTools(config.projectPath),
      ...createProjectDnaTools(config.projectPath),
      createRepoLoaderTools(config.projectPath),
      ...createContractTools(config.projectPath),
      ...createPatternTools(config.projectPath),
      ...createValidationTools(config.projectPath),
      ...createStandupTools(config.projectPath),
      ...createMessagingTools(config.projectPath, "pm-agent"),
      ...createSemanticMemoryTools(config.projectPath, config.modelConfig),
      ...createAdrTools(config.projectPath),
      ...createDebateTools(config.modelConfig, config.modelRouting),
      createPromoteSkillTool(config.projectPath),
      ...createSmokeCheckTools(config.projectPath),
      ...createDeployTools(config.projectPath),
      ...createCiTools(config.projectPath),
      // Dynamic agent registry: list_available_agents + pick_best_agent
      ...registryTools,
    ] as any,
    subagents: subagents as any,
    middleware: [
      // Clear old tool results at ~125k tokens — keeps PM context lean without a second LLM call
      contextEditingMiddleware({
        edits: [new ClearToolUsesEdit({ trigger: { tokens: 500_000 }, keep: { messages: 8 }, excludeTools: ["task"] })],
      }),
      // Resilience: auto-retry transient model + tool failures with exponential backoff
      modelRetryMiddleware({ maxRetries: 2, initialDelayMs: 1_000 }),
      toolRetryMiddleware({ maxRetries: 2, initialDelayMs: 500, onFailure: "continue" }),
      // Business logic guards (innermost — run closest to the actual tool calls)
      judgmentMiddleware,
      hookMiddleware,
      policyMiddleware,
      ...(isCompressionEnabled(config.compression) ? [compressionMiddleware] : []),
      contextGuardMiddleware,
    ] as any,
    checkpointer,
    skills: getAllSkillPaths(config.projectPath, pluginContributions.skillRoots) as any,
    ...(interruptOn ? { interruptOn } : {}),
  } as any);

  const sessionConfig = {
    configurable: {
      thread_id: threadId,
    },
    
    recursionLimit: 500,
  };

  return { agent, sessionConfig, mcpClient };
}

export { finalizeSession, stopAgentProtocolSession };

export async function createInitAgent(
  config: ProjectConfig,
  threadId: string
): Promise<{ agent: any; sessionConfig: Record<string, any> }> {
  const model = await createModelForAgent(
    "init-agent",
    config.modelConfig,
    config.modelRouting,
    {
      projectPath: config.projectPath,
      sessionId: threadId,
      ...(config.budget ? { budget: config.budget } : {}),
    },
  );

  const backend = createShellBackend({
    rootDir: config.projectPath,
    projectPath: config.projectPath,
    ...(config.sandbox ? { sandbox: config.sandbox } : {}),
    ...(config.vault ? { vault: config.vault } : {}),
  });

  const checkpointer = await getCheckpointer(config.projectPath);
  const offline = isOfflineMode(config);
  const contextTools = createContextTools(config.projectPath);
  const repoMapTool = createRepoMapTool(config.projectPath);

  await ensureSajiCodeDir(config.projectPath);
  const pluginContributions = await loadPluginContributions(config.projectPath);

  const agent = await createDeepAgent({
    name: "init-agent",
    model,
    skills: getAllSkillPaths(config.projectPath, pluginContributions.skillRoots) as any,
    systemPrompt: INIT_SYSTEM_PROMPT,
    backend,
    tools: [...contextTools, repoMapTool, createWebSearchTool(undefined, 3, offline)] as any,
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

// Task Graph & Parallelization exports
export { TaskGraph } from "./task-graph.js";
export type { TaskNode, TaskProgress, TaskEventPayload, TaskCompletedPayload, TaskFailedPayload, TaskBlockedPayload, AllCompletePayload } from "./task-types.js";
export { WorkloadBalancer } from "./workload-balancer.js";
export type { AgentLoad } from "./task-types.js";



