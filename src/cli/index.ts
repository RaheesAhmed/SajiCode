#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { Command, CommanderError } from "commander";
import chalk from "chalk";
import { loadConfig, saveConfig, ensureProjectDir, resolveConfigForDoctor } from "../config/index.js";
import {
  listSkillsForDisplay,
  scaffoldSkill,
  addSkillFromPath,
  lintSkills,
  formatLintResults,
} from "../skills/manager.js";
import {
  loadMcpConfigFile,
  saveMcpServerConfig,
} from "../mcp/config.js";
import {
  testMcpServer,
  formatMcpListReport,
  getMcpAuthInstructions,
} from "../mcp/health.js";
import {
  discoverPlugins,
  installPluginFromPath,
  removePlugin,
  formatPluginList,
  formatPluginConsent,
} from "../plugins/registry.js";
import { formatCostsReport } from "../observability/usage-tracker.js";
import { fetchLatestCiFailureLog } from "../tools/deploy-tools.js";

/** Heavy agent stack — only load for build/resume/audit, not config-doctor. */
async function loadAgentRuntime() {
  const [agents, memory, rendererMod, turnContext, gitSession, contextGuard] =
    await Promise.all([
      import("../agents/index.js"),
      import("../memory/index.js"),
      import("./renderer.js"),
      import("../memory/turn-context.js"),
      import("../tools/git-session.js"),
      import("../agents/context-guard.js"),
    ]);

  return {
    createSajiCode: agents.createSajiCode,
    runOnboarding: agents.runOnboarding,
    finalizeSession: agents.finalizeSession,
    generateThreadId: memory.generateThreadId,
    saveCurrentThread: memory.saveCurrentThread,
    loadCurrentThread: memory.loadCurrentThread,
    threadHasCheckpoint: memory.threadHasCheckpoint,
    listRecentThreadIds: memory.listRecentThreadIds,
    StreamRenderer: rendererMod.StreamRenderer,
    augmentInputWithMemoryContext: turnContext.augmentInputWithMemoryContext,
    startGitSession: gitSession.startGitSession,
    getSessionId: gitSession.getSessionId,
    createGitSessionTools: gitSession.createGitSessionTools,
    setAuditProjectPath: contextGuard.setAuditProjectPath,
  };
}

const ORANGE = chalk.hex("#FF8C00");
const program = new Command();

program
  .name("sajicode")
  .description(ORANGE("🤖 SajiCode — The first AI engineering team you can install in one command"))
  .version("1.0.0");

program
  .command("build")
  .description("Start the full agent team on a task")
  .argument("[prompt...]", "What to build")
  .option("-m, --model <model>", "Ollama model to use", "minimax-m2.5:cloud")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("-H, --headless", "Run in headless mode (no UI, ideal for CI/CD)", false)
  .action(async (promptParts: string[], options: { model: string; path: string; headless: boolean }) => {
    const {
      createSajiCode,
      runOnboarding,
      finalizeSession,
      generateThreadId,
      saveCurrentThread,
      StreamRenderer,
      augmentInputWithMemoryContext,
      startGitSession,
      setAuditProjectPath,
    } = await loadAgentRuntime();

    const projectPath = options.path;
    const userPrompt = promptParts.join(" ").trim() || undefined;

    try {
      await ensureProjectDir(projectPath);
      setAuditProjectPath(projectPath);
      const config = await loadConfig(projectPath);

      if (options.model !== "minimax-m2.5:cloud") {
        config.modelConfig.modelName = options.model;
      }

      // Start a git session: create branch + before-tag for safe revert
      try {
        const sessionId = await startGitSession(projectPath);
        console.log(chalk.gray(`  Session: ${sessionId} (branch: sajicode/session-${sessionId})`));
      } catch {
        // Non-fatal: some projects may not be git repos or have no git installed
      }

      const renderer = new StreamRenderer(options.headless);
      if (!options.headless) renderer.printHeader();

      const onboardingResult = await runOnboarding(userPrompt, options.headless);

      if (!options.headless) renderer.printTeamAssembled();
      renderer.startSpinner("PM Agent is planning milestones...");

      const threadId = generateThreadId();
      await saveCurrentThread(projectPath, threadId);
      const { agent, sessionConfig, mcpClient } = await createSajiCode({
        config,
        onboardingResult,
        threadId,
      });

      const mcpReport = mcpClient.formatStartupReport();
      if (mcpClient.getServerCount() > 0) {
        console.log(chalk.gray(mcpReport));
      }

      renderer.stopSpinner("Agent team initialized");

      const initialMessage = buildInitialMessage(onboardingResult);

      console.log(chalk.gray(`\n  Thread: ${threadId}`));
      console.log(chalk.gray(`  Model: ${config.modelConfig.modelName}`));
      console.log(chalk.gray(`  Project: ${projectPath}\n`));

      const streamInput = await augmentInputWithMemoryContext(projectPath, {
          messages: [{ role: "user", content: initialMessage }],
        });

      const stream = await agent.stream(
        streamInput,
        {
          ...sessionConfig,
          streamMode: ["updates", "messages", "custom"],
          subgraphs: true,
        }
      );

      await renderer.processMultiStream(stream as any);
      if (!options.headless) renderer.printComplete();

      await finalizeSession(projectPath, threadId);
      await mcpClient.close();
    } catch (error) {
      const renderer = new StreamRenderer(options.headless);
      renderer.printError(error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Initialize SajiCode in the current directory")
  .action(async () => {
    const projectPath = process.cwd();

    try {
      await ensureProjectDir(projectPath);
      const config = await loadConfig(projectPath);
      await saveConfig(config);

      console.log(chalk.green("✅ SajiCode initialized in this directory"));
      console.log(chalk.gray(`  Config: ${projectPath}/.sajicode/config.json`));
      console.log(chalk.gray(`  Model: ${config.modelConfig.modelName}`));
    } catch (error) {
      console.error(chalk.red("❌ Failed to initialize:", error));
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show current team status and active milestones")
  .action(() => {
    console.log(ORANGE.bold("🤖 SajiCode — Status"));
    console.log(chalk.gray("No active session. Use `sajicode build` to start."));
  });

program
  .command("config")
  .description("Set API keys, model, and preferences")
  .option("-m, --model <model>", "Set default model")
  .option("--base-url <url>", "Set Ollama base URL")
  .option("--risk <level>", "Set risk tolerance (low, medium, high)")
  .action(async (options: { model?: string; baseUrl?: string; risk?: string }) => {
    const projectPath = process.cwd();
    const config = await loadConfig(projectPath);

    if (options.model) {
      config.modelConfig.modelName = options.model;
      console.log(chalk.green(`  Model set to: ${options.model}`));
    }

    if (options.baseUrl) {
      config.modelConfig.baseUrl = options.baseUrl;
      console.log(chalk.green(`  Base URL set to: ${options.baseUrl}`));
    }

    if (options.risk && ["low", "medium", "high"].includes(options.risk)) {
      config.riskTolerance = options.risk as "low" | "medium" | "high";
      console.log(chalk.green(`  Risk tolerance set to: ${options.risk}`));
    }

    await saveConfig(config);
    console.log(chalk.green("✅ Configuration saved"));
  });

program
  .command("audit")
  .description("Run the Security Agent on the current codebase")
  .action(async () => {
    const {
      createSajiCode,
      generateThreadId,
      StreamRenderer,
    } = await loadAgentRuntime();

    const projectPath = process.cwd();
    const config = await loadConfig(projectPath);
    const renderer = new StreamRenderer();

    renderer.printHeader();
    console.log(chalk.hex("#FF8C00")("🔒 Running Security Audit...\n"));

    const onboardingResult = {
      experienceLevel: "expert" as const,
      projectDescription: "Run a comprehensive security audit on this codebase",
      projectType: "audit",
      features: ["security"],
      stackPreferences: {},
    };

    try {
      const { agent, sessionConfig, mcpClient } = await createSajiCode({
        config,
        onboardingResult,
        threadId: generateThreadId(),
      });

      const stream = await agent.stream(
        {
          messages: [{
            role: "user",
            content: "Run a comprehensive security audit on this project. Check for vulnerabilities, exposed secrets, dependency issues, and OWASP Top 10 compliance. Use grep to search source files, run npm audit, and provide a detailed security report.",
          }],
        },
        {
          ...sessionConfig,
          streamMode: ["updates", "messages", "custom"],
          subgraphs: true,
        }
      );

      await renderer.processMultiStream(stream as any);
      renderer.printComplete();
      await mcpClient.close();
    } catch (error) {
      renderer.printError(error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
  });

program
  .command("undo")
  .description("Undo the last file change made by an agent")
  .argument("<file>", "Path to the file to restore")
  .action(async (file: string) => {
    const { undoFileChange } = await import("../tools/file-tracker.js");
    const projectPath = process.cwd();
    try {
      const result = await undoFileChange(projectPath, file);
      console.log(result.includes("✅") ? chalk.green(result) : chalk.yellow(result));
    } catch (error) {
      console.error(chalk.red("❌ Failed to undo:"), error);
      process.exit(1);
    }
  });

program
  .command("snapshots")
  .description("List recent file snapshots taken by agents")
  .action(async () => {
    const { listRecentSnapshots } = await import("../tools/file-tracker.js");
    const projectPath = process.cwd();
    try {
      const result = await listRecentSnapshots(projectPath);
      console.log(chalk.cyan(result));
    } catch (error) {
      console.error(chalk.red("❌ Failed to list snapshots:"), error);
      process.exit(1);
    }
  });

program
  .command("standup")
  .description("Show daily briefing: recent commits, unfinished work, outdated deps, next steps")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (options: { path: string }) => {
    const { generateStandupBriefing } = await import("../tools/standup.js");
    const projectPath = options.path;
    try {
      const briefing = await generateStandupBriefing(projectPath);
      console.log(chalk.cyan(briefing));
    } catch (error) {
      console.error(chalk.red("❌ Failed to generate standup:"), error);
      process.exit(1);
    }
  });

program
  .command("revert")
  .description("Revert all agent changes in the current session back to the before-session state")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("--agent <name>", "Revert only commits made by a specific agent")
  .option("--session <id>", "Specific session ID to revert (defaults to current session)")
  .action(async (options: { path: string; agent?: string; session?: string }) => {
    const { createGitSessionTools, getSessionId } = await import("../tools/git-session.js");
    const projectPath = options.path;
    const gitTools = createGitSessionTools(projectPath);
    const revertSessionTool = gitTools[1]!;
    const revertAgentWorkTool = gitTools[2]!;

    try {
      if (options.agent) {
        console.log(chalk.yellow(`  Reverting commits by agent: ${options.agent}...`));
        const result = await (revertAgentWorkTool as any).invoke({ agentName: options.agent });
        console.log(chalk.green(result));
      } else {
        const sessionId = options.session ?? (await getSessionId(projectPath)) ?? undefined;
        if (!sessionId) {
          console.error(chalk.red("❌ No active session found. Use --session to specify a session ID."));
          process.exit(1);
        }
        console.log(chalk.yellow(`  Reverting session: ${sessionId}...`));
        const result = await (revertSessionTool as any).invoke({ sessionId });
        console.log(chalk.green(result));
      }
    } catch (error) {
      console.error(chalk.red("❌ Revert failed:"), error);
      process.exit(1);
    }
  });

program
  .command("resume")
  .description("Resume the last agent session from a LangGraph checkpoint")
  .option("-t, --thread <id>", "Thread ID to resume (defaults to last saved thread)")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("-H, --headless", "Run in headless mode (no UI)", false)
  .option("--message <text>", "Optional message to send after resume")
  .action(async (options: {
    thread?: string;
    path: string;
    headless: boolean;
    message?: string;
  }) => {
    const {
      createSajiCode,
      loadCurrentThread,
      listRecentThreadIds,
      threadHasCheckpoint,
      saveCurrentThread,
      StreamRenderer,
      augmentInputWithMemoryContext,
      setAuditProjectPath,
    } = await loadAgentRuntime();

    const projectPath = options.path;

    try {
      await ensureProjectDir(projectPath);
      setAuditProjectPath(projectPath);
      const config = await loadConfig(projectPath);

      let threadId = options.thread ?? (await loadCurrentThread(projectPath)) ?? undefined;

      if (!threadId) {
        const recent = await listRecentThreadIds(projectPath, 5);
        if (recent.length === 0) {
          console.error(chalk.red("❌ No checkpoint found. Run `sajicode build` first."));
          process.exit(1);
        }
        threadId = recent[0]!;
        console.log(chalk.yellow(`  Using most recent thread: ${threadId}`));
      }

      const hasCheckpoint = await threadHasCheckpoint(projectPath, threadId);
      if (!hasCheckpoint) {
        console.error(chalk.red(`❌ No checkpoint found for thread: ${threadId}`));
        const recent = await listRecentThreadIds(projectPath, 5);
        if (recent.length > 0) {
          console.log(chalk.gray(`  Recent threads: ${recent.join(", ")}`));
        }
        process.exit(1);
      }

      await saveCurrentThread(projectPath, threadId);

      const renderer = new StreamRenderer(options.headless);
      if (!options.headless) renderer.printHeader();

      const onboardingResult = {
        experienceLevel: "expert" as const,
        projectDescription: "Resume previous session",
        projectType: "general",
        features: [],
        stackPreferences: {},
      };

      renderer.startSpinner("Restoring agent team from checkpoint...");

      const { agent, sessionConfig, mcpClient } = await createSajiCode({
        config,
        onboardingResult,
        threadId,
      });

      renderer.stopSpinner("Session restored");
      console.log(chalk.gray(`\n  Thread: ${threadId}`));
      console.log(chalk.gray(`  Model: ${config.modelConfig.modelName}`));
      console.log(chalk.gray(`  Project: ${projectPath}\n`));

      if (mcpClient.getServerCount() > 0) {
        console.log(chalk.gray(mcpClient.formatStartupReport()));
      }

      const resumeMessage = options.message
        ?? "Continue from where we left off. Review the current state and proceed with the next steps.";

      const streamInput = await augmentInputWithMemoryContext(projectPath, {
        messages: [{ role: "user", content: resumeMessage }],
      });

      const stream = await agent.stream(
        streamInput,
        {
          ...sessionConfig,
          streamMode: ["updates", "messages", "custom"],
          subgraphs: true,
        },
      );

      await renderer.processMultiStream(stream as any);
      if (!options.headless) renderer.printComplete();

      await mcpClient.close();
    } catch (error) {
      const renderer = new StreamRenderer(options.headless);
      renderer.printError(error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
  });

const mcpCmd = program
  .command("mcp")
  .description("Manage MCP servers (.sajicode/mcp.json)");

mcpCmd
  .command("list")
  .description("List configured MCP servers")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (options: { path: string }) => {
    const { servers, error } = await loadMcpConfigFile(options.path);
    if (error) console.log(chalk.yellow(`Warning: ${error}`));
    console.log(chalk.cyan(formatMcpListReport(servers)));
  });

mcpCmd
  .command("add")
  .description("Add or update an MCP server in mcp.json")
  .argument("<name>", "Server name")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("--command <cmd>", "Stdio command")
  .option("--args <args>", "Comma-separated args")
  .option("--url <url>", "Remote MCP URL")
  .option("--transport <type>", "stdio | sse | streamable_http", "stdio")
  .option("--agents <agents>", "Comma-separated agent names")
  .action(async (name: string, options: {
    path: string;
    command?: string;
    args?: string;
    url?: string;
    transport: string;
    agents?: string;
  }) => {
    const entry: Record<string, unknown> = {
      transport: options.transport,
    };
    if (options.command) entry["command"] = options.command;
    if (options.args) entry["args"] = options.args.split(",").map((a) => a.trim());
    if (options.url) entry["url"] = options.url;
    if (options.agents) entry["agents"] = options.agents.split(",").map((a) => a.trim());

    const saved = await saveMcpServerConfig(options.path, name, entry);
    console.log(chalk.green(`Saved MCP server "${name}" to ${saved}`));
  });

mcpCmd
  .command("test")
  .description("Test connectivity to an MCP server")
  .argument("<name>", "Server name")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (name: string, options: { path: string }) => {
    console.log(chalk.gray(`Testing MCP server "${name}"...`));
    const result = await testMcpServer(options.path, name);
    console.log(
      result.ok
        ? chalk.green(`✓ ${result.message} (${result.toolCount} tools, ${result.transport})`)
        : chalk.red(`✗ ${result.message}`),
    );
    if (!result.ok) process.exit(1);
  });

mcpCmd
  .command("auth")
  .description("Show auth setup instructions for a remote MCP server")
  .argument("<name>", "Server name")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (name: string, options: { path: string }) => {
    const { servers } = await loadMcpConfigFile(options.path);
    const server = servers.find((s) => s.name === name);
    console.log(chalk.cyan(getMcpAuthInstructions(name, server)));
  });

const pluginCmd = program
  .command("plugin")
  .description("Manage SajiCode plugins");

pluginCmd
  .command("list")
  .description("List loaded plugins and capabilities")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (options: { path: string }) => {
    const plugins = await discoverPlugins(options.path);
    console.log(chalk.cyan(formatPluginList(plugins)));
  });

pluginCmd
  .command("add")
  .description("Install a plugin from a local folder path")
  .argument("<source>", "Path to plugin folder containing plugin.json")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("--user", "Install to ~/.sajicode/plugins instead of project", false)
  .option("-y, --yes", "Skip consent summary", false)
  .action(async (source: string, options: { path: string; user: boolean; yes: boolean }) => {
    const layer = options.user ? "user" : "project";
    const plugins = await discoverPlugins(options.path);
    const resolved = path.resolve(source);
    const manifestRaw = await fs.readFile(path.join(resolved, "plugin.json"), "utf-8");
    const { parsePluginManifest } = await import("../plugins/manifest.js");
    const manifest = parsePluginManifest(JSON.parse(manifestRaw));
    const preview = {
      manifest,
      rootPath: resolved,
      layer,
    } as import("../plugins/loader.js").LoadedPlugin;

    if (!options.yes) {
      console.log(chalk.yellow(formatPluginConsent(preview)));
    }

    const dest = await installPluginFromPath(source, layer, options.path);
    console.log(chalk.green(`Installed plugin to ${dest}`));
    if (plugins.some((p) => p.manifest.name === manifest.name)) {
      console.log(chalk.gray("Note: replaced existing plugin with the same name."));
    }
  });

pluginCmd
  .command("remove")
  .description("Remove an installed plugin")
  .argument("<name>", "Plugin name")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (name: string, options: { path: string }) => {
    const removed = await removePlugin(name, options.path);
    if (removed) {
      console.log(chalk.green(`Removed plugin "${name}"`));
    } else {
      console.error(chalk.red(`Plugin "${name}" not found`));
      process.exit(1);
    }
  });

const skillCmd = program
  .command("skill")
  .description("Manage agent skills (layered: project > user > bundled)");

skillCmd
  .command("list")
  .description("List all skills and their source layer")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (options: { path: string }) => {
    console.log(chalk.cyan(await listSkillsForDisplay(options.path)));
  });

skillCmd
  .command("new")
  .description("Scaffold a new skill with valid SKILL.md frontmatter")
  .argument("<name>", "Skill folder name")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("--user", "Create in ~/.sajicode/skills instead of project", false)
  .action(async (name: string, options: { path: string; user: boolean }) => {
    const layer = options.user ? "user" : "project";
    const result = await scaffoldSkill(name, layer, options.path);
    console.log(chalk.green(result));
  });

skillCmd
  .command("add")
  .description("Install a skill from a local folder path")
  .argument("<source>", "Path to skill folder containing SKILL.md")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("--user", "Install to user layer instead of project", false)
  .action(async (source: string, options: { path: string; user: boolean }) => {
    const layer = options.user ? "user" : "project";
    const result = await addSkillFromPath(source, layer, options.path);
    console.log(result.startsWith("No ") ? chalk.yellow(result) : chalk.green(result));
  });

skillCmd
  .command("lint")
  .description("Validate skill frontmatter and structure")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (options: { path: string }) => {
    const results = await lintSkills(options.path);
    console.log(chalk.cyan(formatLintResults(results)));
    if (results.some((r) => !r.ok)) process.exit(1);
  });

program
  .command("fix-ci")
  .description("Fetch latest failed CI log and run headless agent to fix it")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("-H, --headless", "Run without UI", true)
  .action(async (options: { path: string; headless: boolean }) => {
    const {
      createSajiCode,
      generateThreadId,
      StreamRenderer,
      setAuditProjectPath,
    } = await loadAgentRuntime();

    const projectPath = options.path;
    await ensureProjectDir(projectPath);
    setAuditProjectPath(projectPath);

    const ciLog = await fetchLatestCiFailureLog(projectPath);
    if (!ciLog.ok) {
      console.error(chalk.red(`❌ ${ciLog.log}`));
      process.exit(1);
    }

    const config = await loadConfig(projectPath);
    const renderer = new StreamRenderer(true);
    const threadId = generateThreadId();

    console.log(chalk.yellow("🔧 SajiCode fix-ci — analyzing failed pipeline...\n"));
    if (ciLog.runUrl) {
      console.log(chalk.gray(`  Run: ${ciLog.runUrl}\n`));
    }

    const { agent, sessionConfig, mcpClient } = await createSajiCode({
      config,
      onboardingResult: {
        experienceLevel: "expert",
        projectDescription: "Fix failing CI pipeline",
        projectType: "fix-ci",
        features: ["ci-fix"],
        stackPreferences: {},
      },
      threadId,
    });

    const prompt = [
      "The CI pipeline failed. Fix the issue locally, verify with npm run build && npm test, then summarize changes.",
      "",
      "Failed CI log:",
      ciLog.log,
    ].join("\n");

    try {
      const stream = await agent.stream(
        { messages: [{ role: "user", content: prompt }] },
        {
          ...sessionConfig,
          streamMode: ["updates", "messages", "custom"],
          subgraphs: true,
        },
      );
      await renderer.processMultiStream(stream as any);
      await mcpClient.close();
    } catch (error) {
      renderer.printError(error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
  });

program
  .command("costs")
  .description("Show estimated API usage costs")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("-d, --days <days>", "Report window in days", "7")
  .action(async (options: { path: string; days: string }) => {
    const days = Number.parseInt(options.days, 10) || 7;
    console.log(chalk.cyan(await formatCostsReport(options.path, days)));
  });

program
  .command("config-doctor")
  .description("Validate .sajicode/config.json and report issues")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (options: { path: string }) => {
    const projectPath = options.path;

    try {
      const { config, warnings, sources } = await resolveConfigForDoctor(projectPath);

      console.log(ORANGE.bold("🩺 SajiCode Config Doctor"));
      console.log(chalk.gray(`  Project: ${projectPath}\n`));

      console.log(chalk.gray("  Config layers (later overrides earlier):"));
      for (const source of sources) {
        console.log(chalk.gray(`    • ${source}`));
      }
      console.log("");

      if (warnings.length === 0) {
        console.log(chalk.green("✅ Config is valid — no warnings"));
      } else {
        console.log(chalk.yellow("⚠️  Warnings:"));
        for (const warning of warnings) {
          console.log(chalk.yellow(`  • ${warning}`));
        }
      }

      console.log(chalk.gray("\n  Resolved config:"));
      console.log(chalk.gray(`    Model:    ${config.modelConfig.modelName}`));
      console.log(chalk.gray(`    Provider: ${config.modelConfig.provider}`));
      console.log(chalk.gray(`    Risk:     ${config.riskTolerance}`));
      console.log(chalk.gray(`    HITL:     ${config.humanInTheLoop?.enabled ? "enabled" : "disabled"}`));
      if (config.modelRouting) {
        console.log(chalk.gray(`    Routing:  planner=${config.modelRouting.planner ?? "(default)"}, leads=${config.modelRouting.leads ?? "(default)"}`));
      }
      if (config.budget?.perSession) {
        console.log(chalk.gray(`    Budget:   $${config.budget.perSession}/session (${config.budget.action ?? "warn"})`));
      }
    } catch (error) {
      console.error(chalk.red("❌ Config doctor failed:"), error);
      process.exit(1);
    }
  });

function buildInitialMessage(result: import("../types/index.js").OnboardingResult): string {
  const lines = [
    `Build the following project: ${result.projectDescription}`,
    "",
    `User experience level: ${result.experienceLevel}`,
    `Project type: ${result.projectType}`,
  ];

  if (result.features.length > 0) {
    lines.push(`Required features: ${result.features.join(", ")}`);
  }

  const prefs = result.stackPreferences;
  if (prefs.framework) lines.push(`Framework: ${prefs.framework}`);
  if (prefs.database) lines.push(`Database: ${prefs.database}`);

  lines.push(
    "",
    "Start by creating a plan with write_todos, then delegate tasks to your specialist subagents.",
    "Use the backend-agent, frontend-agent, test-agent, security-agent, review-agent, and deploy-agent as needed.",
    "Each subagent has access to filesystem tools and shell execution."
  );

  return lines.join("\n");
}

program.parseAsync(process.argv)
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    if (error instanceof CommanderError) {
      process.exit(error.code === "commander.helpDisplayed" ? 0 : 1);
    }
    console.error(error);
    process.exit(1);
  });
