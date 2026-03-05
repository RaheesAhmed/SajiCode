#!/usr/bin/env node

import chalk from "chalk";
import readline from "readline";
import { Command } from "@langchain/langgraph";
import { loadConfig, ensureProjectDir } from "./config/index.js";
import { createSajiCode, createInitAgent } from "./agents/index.js";
import { generateThreadId } from "./memory/index.js";
import { StreamRenderer, type InterruptInfo } from "./cli/renderer.js";
import { hasSajiCodeMd } from "./agents/context.js";
import { createCollectProjectContextTool } from "./tools/context-tools.js";
import type { OnboardingResult, HumanInTheLoopConfig } from "./types/index.js";
import { input as inquirerInput, select as inquirerSelect } from "@inquirer/prompts";
import { ChannelRouter } from "./channels/router.js";
import { WhatsAppAdapter } from "./channels/whatsapp.js";
import { runHook } from "./utils/hooks.js";

const ORANGE = chalk.hex("#FF8C00");
const GY = chalk.gray;
const G = chalk.green;
const YL = chalk.yellow;
const RD = chalk.red;
const CY = chalk.cyan;


/**
 * Check if a shell command should be auto-approved based on allowedCommands prefixes.
 */
function isCommandAllowed(command: string, allowedCommands: string[]): boolean {
  const cmd = command.trim();
  return allowedCommands.some((prefix) => cmd.startsWith(prefix.trim()));
}

/**
 * Full HITL decision loop.
 * Shows the interrupt, asks the user once per action, returns the decisions array
 * that deepagents expects in Command({ resume: { decisions } }).
 */
async function collectDecisions(
  renderer: StreamRenderer,
  interrupt: InterruptInfo,
  hitl: HumanInTheLoopConfig
): Promise<Array<{ type: string; editedAction?: { name: string; args: Record<string, unknown> } }>> {
  const decisions: Array<{ type: string; editedAction?: { name: string; args: Record<string, unknown> } }> = [];

  for (const action of interrupt.actionRequests) {
    const cfg = interrupt.reviewConfigs.find((r) => r.actionName === action.name);
    const allowed = cfg?.allowedDecisions ?? ["approve", "reject"];

    // ── Auto-approve if command matches allowedCommands list ──────────────
    if (action.name === "execute" && action.args["command"]) {
      const cmd = String(action.args["command"]);
      if (isCommandAllowed(cmd, hitl.allowedCommands)) {
        renderer.printAutoApproved(cmd);
        decisions.push({ type: "approve" });
        continue;
      }
    }

    // ── Interactive approval using @inquirer/prompts ──────────────────────

    const choices = allowed.map((d) => {
      if (d === "approve") return { name: "Approve original action", value: "approve" };
      if (d === "reject")  return { name: "Reject action", value: "reject" };
      if (d === "edit")    return { name: "Edit arguments and approve", value: "edit" };
      return { name: d, value: d };
    });

    try {
      const answer = await inquirerSelect({
        message: `Action to take for [${CY(action.name)}]:`,
        choices,
      });

      if (answer === "approve") {
        decisions.push({ type: "approve" });
      } else if (answer === "reject") {
        decisions.push({ type: "reject" });
      } else if (answer === "edit") {
        const rawEdit = await inquirerInput({
          message: "New args JSON (press Enter to keep original):",
          default: JSON.stringify(action.args),
        });

        if (rawEdit.trim() && rawEdit !== JSON.stringify(action.args)) {
          try {
            const editedArgs = JSON.parse(rawEdit);
            decisions.push({
              type: "edit",
              editedAction: { name: action.name, args: editedArgs },
            });
          } catch {
            console.log(`  ${RD("✗")} Invalid JSON — rejecting instead`);
            decisions.push({ type: "reject" });
          }
        } else {
          // Empty or unchanged = approve original
          decisions.push({ type: "approve" });
        }
      } else {
        decisions.push({ type: "reject" });
      }
    } catch (e) {
      // User pressed Ctrl+C during select prompt
      console.log(`  ${RD("✗")} Cancelled — rejecting action`);
      decisions.push({ type: "reject" });
    }
  }

  return decisions;
}

/**
 * Run one agent turn, handling any number of HITL interrupts inside the same turn.
 * The agent keeps streaming; after every interrupt we collect decisions and resume.
 */
async function runAgentTurn(
  agent: any,
  sessionConfig: Record<string, any>,
  initialInput: any,
  renderer: StreamRenderer,
  hitl: HumanInTheLoopConfig | undefined
): Promise<void> {
  let input: any = initialInput;

  while (true) {
    const stream = await agent.stream(input, {
      ...sessionConfig,
      streamMode: ["updates", "messages", "custom"],
      subgraphs: true,
    });

    const interrupt = await renderer.processMultiStream(stream as any);

    // No interrupt → turn is finished
    if (!interrupt) break;

    // HITL is disabled (shouldn't happen but be safe)
    if (!hitl?.enabled) break;

    // Show the full interrupt block, then collect one decision per action
    renderer.printInterrupt(interrupt);
    const decisions = await collectDecisions(renderer, interrupt, hitl);

    // Resume with decisions — docs say: new Command({ resume: { decisions } })
    input = new Command({ resume: { decisions } });
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const projectPath = process.cwd();
  const cliArgs = parseArgs(process.argv.slice(2));
  const renderer = new StreamRenderer(cliArgs.headless);

  if (!cliArgs.headless) renderer.printHeader();

  await ensureProjectDir(projectPath);
  const config = await loadConfig(projectPath);

  if (cliArgs.provider) config.modelConfig.provider = cliArgs.provider;
  if (cliArgs.model)    config.modelConfig.modelName = cliArgs.model;

  const threadId = generateThreadId();
  const onboardingResult: OnboardingResult = {
    experienceLevel: "expert",
    projectDescription: "",
    projectType: "general",
    features: [],
    stackPreferences: {},
  };

  const hasContext = await hasSajiCodeMd(projectPath);

  renderer.printSessionInfo({
    model: config.modelConfig.modelName,
    project: projectPath,
    thread: threadId,
    hasContext,
    hitlEnabled: config.humanInTheLoop?.enabled ?? false,
  });

  renderer.startSpinner("Initializing agent team...");

  let agent: any;
  let sessionConfig: Record<string, any>;
  let mcpServerNames: string[] = [];

  try {
    const result = await createSajiCode({ config, onboardingResult, threadId });
    agent = result.agent;
    sessionConfig = result.sessionConfig;
    const mcpClient = result.mcpClient;
    mcpServerNames = mcpClient.getServerNames();

    const cleanupAndExit = async (code: number) => {
      runHook("onExit", config.hooks, projectPath);
      await mcpClient.close();
      process.exit(code);
    };
    process.on("SIGINT", () => cleanupAndExit(0));
    process.on("SIGTERM", () => cleanupAndExit(0));
  } catch (error) {
    renderer.stopSpinner();
    renderer.printError(error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }

  renderer.stopSpinner();
  if (mcpServerNames.length > 0) {
    const label = chalk.hex("#666666");
    const value = chalk.hex("#AAAAAA");
    const G = chalk.green;
    console.log(`  ${label("mcp")}       ${G("●")} ${value(mcpServerNames.join(", "))}`);
    console.log(chalk.hex("#444444")("  ─────────────────────────────────────────────────── "));
    console.log("");
  }
  renderer.printReady();

  // ── Start WhatsApp channel if requested ───────────────────────────────
  const waEnabled = config.whatsapp?.enabled || cliArgs.channels?.includes("whatsapp");
  if (waEnabled) {
    const waConfig = config.whatsapp ?? { enabled: true, mode: "admin" as const };
    const modeLabel = waConfig.mode === "personal" ? "Personal Bot" : "Admin";
    console.log(chalk.hex("#FF8C00")(`  ─── Starting WhatsApp (${modeLabel} Mode) ────────────────`));
    const router = new ChannelRouter(config, onboardingResult);
    const waAdapter = new WhatsAppAdapter(projectPath, waConfig);
    router.addAdapter(waAdapter);
    await router.start();
  }

  // ── Headless Mode Execution ───────────────────────────────────────────
  if (cliArgs.headless) {
    if (!cliArgs.task) {
      console.error(chalk.red("\n  ✗ Fatal: --task is required when running in headless mode\n"));
      process.exit(1);
    }

    try {
      runHook("preTask", config.hooks, projectPath);
      await runAgentTurn(
        agent,
        sessionConfig,
        { messages: [{ role: "user", content: cliArgs.task }] },
        renderer,
        config.humanInTheLoop
      );
      runHook("postTask", config.hooks, projectPath);
      runHook("onExit", config.hooks, projectPath);
      process.exit(0);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.log(chalk.red(`\n  ✗ ${err.message}\n`));
      process.exit(1);
    }
  }

  while (true) {
    let resolved = false;
    const input = await new Promise<string | null>((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: ORANGE(">_ "),
      });

      rl.prompt();

      rl.on("line", (line) => {
        resolved = true;
        rl.close();
        resolve(line);
      });

      rl.on("SIGINT", () => {
        resolved = true;
        rl.close();
        resolve(null);
      });

      rl.on("close", () => {
        if (!resolved) resolve(null);
      });
    });

    if (input === null) {
      console.log(G("\n👋 Goodbye!\n"));
      runHook("onExit", config.hooks, projectPath);
      process.exit(0);
    }

    const trimmed = input.trim();
    if (!trimmed) continue;

    // ── Built-in commands ─────────────────────────────────────────────────
    if (trimmed === "/exit" || trimmed === "/quit" || trimmed === "/q") {
      console.log(G("\n👋 Goodbye!\n"));
      runHook("onExit", config.hooks, projectPath);
      process.exit(0);
    }

    if (trimmed === "/help") { printHelp(); continue; }

    if (trimmed === "/status") {
      const hitl = config.humanInTheLoop;
      console.log(GY(`\n  Thread:   ${threadId}`));
      console.log(GY(`  Model:    ${config.modelConfig.modelName}`));
      console.log(GY(`  Project:  ${projectPath}`));
      const ctx = await hasSajiCodeMd(projectPath);
      console.log(ctx ? G(`  Context:  ✓`) : GY(`  Context:  none`));
      console.log(hitl?.enabled
        ? YL(`  Approval: ON — ${Object.keys(hitl.tools).join(", ")}`)
        : GY(`  Approval: off`)
      );
      console.log("");
      continue;
    }

    if (trimmed === "/clear") { console.clear(); renderer.printHeader(); continue; }

    if (trimmed === "/init") { await runInit(config, renderer); continue; }

    // ── Agent turn ────────────────────────────────────────────────────────
    try {
      runHook("preTask", config.hooks, projectPath);
      await runAgentTurn(
        agent,
        sessionConfig,
        { messages: [{ role: "user", content: trimmed }] },
        renderer,
        config.humanInTheLoop
      );
      runHook("postTask", config.hooks, projectPath);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.log(chalk.red(`\n  ✗ ${err.message}\n`));
    }

    console.log("");
  }
}

// ── /init command ─────────────────────────────────────────────────────────────

async function runInit(
  config: any,
  renderer: StreamRenderer
): Promise<void> {
  console.log("");
  renderer.startSpinner("Scanning project...");

  try {
    const contextTool = createCollectProjectContextTool(config.projectPath);
    const contextResult = await contextTool.invoke({});
    renderer.stopSpinner("Project scanned");
    renderer.startSpinner("Generating SAJICODE.md...");

    const initThreadId = `init-${Date.now()}`;
    const { agent, sessionConfig } = await createInitAgent(config, initThreadId);
    renderer.stopSpinner();

    await runAgentTurn(
      agent,
      sessionConfig,
      {
        messages: [{
          role: "user",
          content: `Here is the full project context (already collected):\n\n${contextResult}\n\nBased on this data, write SAJICODE.md to the PROJECT ROOT at ${config.projectPath}/SAJICODE.md using the write_file tool. Format it as a clean markdown document. Do NOT scan the project again — all data is above.`,
        }],
      },
      renderer,
      config.humanInTheLoop
    );

    console.log(G(`  ✓ Generated SAJICODE.md at project root\n`));
  } catch (error) {
    renderer.stopSpinner();
    const err = error instanceof Error ? error : new Error(String(error));
    console.log(chalk.red(`  ✗ Init failed: ${err.message}\n`));
  }
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp(): void {
  const dim   = chalk.hex("#555555");
  const label = chalk.hex("#FF9500");
  const desc  = chalk.hex("#888888");
  console.log("");
  console.log(dim("  ─── Commands ──────────────────────────────"));
  console.log(`  ${label("/init")}     ${desc("Scan project → generate SAJICODE.md")}`);
  console.log(`  ${label("/status")}   ${desc("Show session + approval settings")}`);
  console.log(`  ${label("/clear")}    ${desc("Clear terminal")}`);
  console.log(`  ${label("/help")}     ${desc("Show this menu")}`);
  console.log(`  ${label("/exit")}     ${desc("Exit SajiCode")}`);
  console.log(dim("  ──────────────────────────────────────────"));
  console.log("");
}

// ── CLI arg parser ─────────────────────────────────────────────────────────────

interface CliArgs { 
  provider?: string; 
  model?: string; 
  channels?: string[];
  headless?: boolean;
  task?: string; 
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if ((arg === "-p" || arg === "--provider") && next) { result.provider = next; i++; }
    else if ((arg === "-m" || arg === "--model") && next) { result.model = next; i++; }
    else if ((arg === "-c" || arg === "--channels") && next) {
      result.channels = next.split(",").map((c) => c.trim().toLowerCase());
      i++;
    }
    else if (arg === "--headless" || arg === "-H") { result.headless = true; }
    else if ((arg === "-t" || arg === "--task") && next) { result.task = next; i++; }
  }
  return result;
}

main().catch((error) => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  process.exit(1);
});
