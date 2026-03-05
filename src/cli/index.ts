#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, saveConfig, ensureProjectDir } from "../config/index.js";
import { createSajiCode, runOnboarding } from "../agents/index.js";
import { generateThreadId } from "../memory/index.js";
import { StreamRenderer } from "./renderer.js";
import { undoFileChange, listRecentSnapshots } from "../tools/file-tracker.js";

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
    const projectPath = options.path;
    const userPrompt = promptParts.join(" ").trim() || undefined;

    try {
      await ensureProjectDir(projectPath);
      const config = await loadConfig(projectPath);

      if (options.model !== "minimax-m2.5:cloud") {
        config.modelConfig.modelName = options.model;
      }

      const renderer = new StreamRenderer(options.headless);
      if (!options.headless) renderer.printHeader();

      const onboardingResult = await runOnboarding(userPrompt, options.headless);

      if (!options.headless) renderer.printTeamAssembled();
      renderer.startSpinner("PM Agent is planning milestones...");

      const threadId = generateThreadId();
      const { agent, sessionConfig } = await createSajiCode({
        config,
        onboardingResult,
        threadId,
      });

      renderer.stopSpinner("Agent team initialized");

      const initialMessage = buildInitialMessage(onboardingResult);

      console.log(chalk.gray(`\n  Thread: ${threadId}`));
      console.log(chalk.gray(`  Model: ${config.modelConfig.modelName}`));
      console.log(chalk.gray(`  Project: ${projectPath}\n`));

      const stream = await agent.stream(
        {
          messages: [{ role: "user", content: initialMessage }],
        },
        {
          ...sessionConfig,
          streamMode: ["updates", "messages", "custom"],
          subgraphs: true,
        }
      );

      await renderer.processMultiStream(stream as any);
      if (!options.headless) renderer.printComplete();
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
      const { agent, sessionConfig } = await createSajiCode({
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
    const projectPath = process.cwd();
    try {
      const result = await listRecentSnapshots(projectPath);
      console.log(chalk.cyan(result));
    } catch (error) {
      console.error(chalk.red("❌ Failed to list snapshots:"), error);
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

program.parse();
