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
  installPluginFromNpm,
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
  .option("--offline", "Air-gapped mode: Ollama only, no web search or telemetry", false)
  .action(async (promptParts: string[], options: { model: string; path: string; headless: boolean; offline: boolean }) => {
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
      let config = await loadConfig(projectPath);

      if (options.offline) {
        config = {
          ...config,
          offline: { ...config.offline, enabled: true },
        };
        const offlineMod = await import("../config/offline.js");
        offlineMod.applyOfflineEnvironment();
        config = offlineMod.applyOfflineMode(config);
      }

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
  .command("install")
  .description("Install a plugin from the registry or npm package name")
  .argument("<name>", "Registry name or npm package (e.g. sajicode-plugin-stripe)")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("--user", "Install to ~/.sajicode/plugins instead of project", false)
  .option("-y, --yes", "Skip consent summary", false)
  .action(async (name: string, options: { path: string; user: boolean; yes: boolean }) => {
    const layer = options.user ? "user" : "project";
    const config = await loadConfig(options.path);
    const {
      fetchPluginRegistry,
      resolveRegistryEntry,
    } = await import("../plugins/registry-index.js");

    const entries = await fetchPluginRegistry(config.pluginRegistryUrl);
    const entry = resolveRegistryEntry(entries, name);
    const packageName = entry?.npm ?? name;

    if (entry && !options.yes) {
      console.log(
        chalk.yellow(
          `Installing ${entry.name}@${entry.version} from npm (${packageName})\n${entry.description}`,
        ),
      );
    }

    try {
      const dest = await installPluginFromNpm(packageName, layer, options.path);
      console.log(chalk.green(`Installed plugin to ${dest}`));
    } catch (error) {
      console.error(chalk.red("Plugin install failed:"), error);
      process.exit(1);
    }
  });

pluginCmd
  .command("search")
  .description("Search the plugin registry")
  .argument("[query]", "Search term")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (query: string | undefined, options: { path: string }) => {
    const config = await loadConfig(options.path);
    const {
      fetchPluginRegistry,
      searchRegistry,
      formatRegistryResults,
    } = await import("../plugins/registry-index.js");
    const entries = await fetchPluginRegistry(config.pluginRegistryUrl);
    const results = searchRegistry(entries, query ?? "");
    console.log(chalk.cyan(formatRegistryResults(results)));
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
  .command("serve")
  .description("Start long-running team server (HTTP dashboard + optional channels)")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("--port <port>", "HTTP port", "3920")
  .option("--host <host>", "Bind address", "127.0.0.1")
  .option("--whatsapp", "Attach WhatsApp channel when enabled in config", false)
  .option("--telegram", "Attach Telegram bot (TELEGRAM_BOT_TOKEN env)", false)
  .option("--slack", "Attach Slack events (SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET env)", false)
  .option("--offline", "Air-gapped mode: Ollama only, no web search or telemetry", false)
  .action(async (options: {
    path: string;
    port: string;
    host: string;
    whatsapp: boolean;
    telegram: boolean;
    slack: boolean;
    offline: boolean;
  }) => {
    const { startServeServer } = await import("../server/index.js");
    const projectPath = path.resolve(options.path);
    await ensureProjectDir(projectPath);
    let config = await loadConfig(projectPath);
    config.projectPath = projectPath;

    if (options.offline) {
      config = {
        ...config,
        offline: { ...config.offline, enabled: true },
      };
      const offlineMod = await import("../config/offline.js");
      offlineMod.applyOfflineEnvironment();
      config = offlineMod.applyOfflineMode(config);
    }

    const onboardingResult = {
      experienceLevel: "expert" as const,
      projectDescription: "Server mode — remote task dispatch",
      projectType: "server",
      features: [],
      stackPreferences: {},
    };

    const handle = await startServeServer({
      projectPath,
      config,
      onboardingResult,
      port: Number.parseInt(options.port, 10) || 3920,
      host: options.host,
      enableWhatsApp: options.whatsapp,
      enableTelegram: options.telegram,
      enableSlack: options.slack,
    });

    const shutdown = async () => {
      console.log(chalk.gray("\nShutting down server..."));
      await handle.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  });

const daemonCmd = program
  .command("daemon")
  .description("Long-running daemon (serve + task queue + heartbeat)");

daemonCmd
  .command("start")
  .description("Start the always-on daemon")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("--port <port>", "HTTP port", "3920")
  .option("--host <host>", "Bind address", "127.0.0.1")
  .option("--whatsapp", "Attach WhatsApp channel when enabled in config", false)
  .option("--telegram", "Attach Telegram bot (TELEGRAM_BOT_TOKEN env)", false)
  .option("--slack", "Attach Slack events (SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET env)", false)
  .option("--offline", "Air-gapped mode: Ollama only", false)
  .action(async (options: {
    path: string;
    port: string;
    host: string;
    whatsapp: boolean;
    telegram: boolean;
    slack: boolean;
    offline: boolean;
  }) => {
    const { startDaemon } = await import("../daemon/index.js");
    const projectPath = path.resolve(options.path);
    await ensureProjectDir(projectPath);
    let config = await loadConfig(projectPath);
    config.projectPath = projectPath;

    if (options.offline) {
      config = { ...config, offline: { ...config.offline, enabled: true } };
      const offlineMod = await import("../config/offline.js");
      offlineMod.applyOfflineEnvironment();
      config = offlineMod.applyOfflineMode(config);
    }

    const onboardingResult = {
      experienceLevel: "expert" as const,
      projectDescription: "Daemon mode — background tasks and heartbeat",
      projectType: "daemon",
      features: [],
      stackPreferences: {},
    };

    const handle = await startDaemon({
      projectPath,
      config,
      onboardingResult,
      port: Number.parseInt(options.port, 10) || 3920,
      host: options.host,
      enableWhatsApp: options.whatsapp,
      enableTelegram: options.telegram,
      enableSlack: options.slack,
    });

    void handle;
    const shutdown = async () => {
      console.log(chalk.gray("\nShutting down daemon..."));
      await handle.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  });

daemonCmd
  .command("stop")
  .description("Stop a running daemon via PID file")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (options: { path: string }) => {
    const {
      readDaemonPid,
      clearDaemonPid,
      isProcessRunning,
    } = await import("../daemon/task-runner.js");

    const projectPath = path.resolve(options.path);
    const pid = await readDaemonPid(projectPath);

    if (!pid || !isProcessRunning(pid)) {
      console.log(chalk.yellow("Daemon is not running."));
      await clearDaemonPid(projectPath);
      return;
    }

    try {
      process.kill(pid, "SIGTERM");
      console.log(chalk.green(`Sent SIGTERM to daemon (pid ${pid})`));
    } catch (error) {
      console.error(chalk.red("Failed to stop daemon:"), error);
      process.exit(1);
    }

    await clearDaemonPid(projectPath);
  });

daemonCmd
  .command("status")
  .description("Check if the daemon is running")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (options: { path: string }) => {
    const { readDaemonPid, isProcessRunning } = await import("../daemon/task-runner.js");
    const projectPath = path.resolve(options.path);
    const pid = await readDaemonPid(projectPath);

    if (pid && isProcessRunning(pid)) {
      console.log(chalk.green(`Daemon running (pid ${pid})`));
    } else {
      console.log(chalk.yellow("Daemon is not running."));
    }
  });

daemonCmd
  .command("install")
  .description("Generate OS service install instructions")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (options: { path: string }) => {
    const { generateServiceInstall } = await import("../daemon/service-install.js");
    const projectPath = path.resolve(options.path);
    await ensureProjectDir(projectPath);
    const result = await generateServiceInstall(projectPath);
    console.log(chalk.cyan(result.instructions));
    if (result.artifactPath) {
      console.log(chalk.gray(`\nArtifact: ${result.artifactPath}`));
    }
  });

const taskCmd = program
  .command("task")
  .description("Durable cross-session task queue");

taskCmd
  .command("add")
  .description("Enqueue a background task")
  .argument("<prompt...>", "Task description")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("--priority <n>", "Priority 1-10 (default 5)", "5")
  .option("--cron <expr>", "Cron schedule (5-field, e.g. '0 3 * * 1')")
  .option("--every <interval>", "Repeat interval (e.g. 30m, 2h, 1d)")
  .option("--kind <kind>", "Task kind: agent|consolidation|heartbeat", "agent")
  .action(async (
    promptParts: string[],
    options: { path: string; priority: string; cron?: string; every?: string; kind: string },
  ) => {
    const { addTask } = await import("../tasks/queue.js");
    const prompt = promptParts.join(" ").trim();
    if (!prompt) {
      console.error(chalk.red("Prompt is required."));
      process.exit(1);
    }

    const kind = options.kind as "agent" | "consolidation" | "heartbeat";
    const task = await addTask(path.resolve(options.path), {
      prompt,
      kind,
      priority: Number.parseInt(options.priority, 10) || 5,
      ...(options.cron ? { cron: options.cron } : {}),
      ...(options.every ? { every: options.every } : {}),
      source: "cli",
    });

    console.log(chalk.green(`Queued task ${task.id} [${task.status}]`));
  });

taskCmd
  .command("list")
  .description("List tasks in the queue")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("--status <status>", "Filter by status")
  .action(async (options: { path: string; status?: string }) => {
    const { listTasks, formatTaskList } = await import("../tasks/queue.js");
    const tasks = await listTasks(path.resolve(options.path), {
      ...(options.status ? { status: options.status as import("../tasks/queue.js").TaskStatus } : {}),
    });
    console.log(chalk.cyan(formatTaskList(tasks)));
  });

taskCmd
  .command("cancel")
  .description("Cancel a queued task")
  .argument("<taskId>", "Task ID")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .action(async (taskId: string, options: { path: string }) => {
    const { cancelTask } = await import("../tasks/queue.js");
    const ok = await cancelTask(path.resolve(options.path), taskId);
    if (ok) {
      console.log(chalk.green(`Cancelled ${taskId}`));
    } else {
      console.error(chalk.red(`Task ${taskId} not found.`));
      process.exit(1);
    }
  });

program
  .command("sbom")
  .description("Generate CycloneDX SBOM for the project")
  .option("-p, --path <path>", "Project directory", process.cwd())
  .option("-o, --output <file>", "Output path (default: .sajicode/sbom.json)")
  .option("--provenance", "Also print release provenance checklist", false)
  .action(async (options: { path: string; output?: string; provenance: boolean }) => {
    const { generateSbom, formatProvenanceReport } = await import("../compliance/sbom.js");
    try {
      const out = await generateSbom({
        projectPath: options.path,
        ...(options.output ? { outputPath: options.output } : {}),
      });
      console.log(chalk.green(`SBOM written to ${out}`));
      if (options.provenance) {
        console.log(chalk.cyan("\n" + (await formatProvenanceReport(options.path))));
      }
    } catch (error) {
      console.error(chalk.red("SBOM generation failed:"), error);
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
