/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */

import * as readline from "readline";
import chalk from "chalk";
import { HumanMessage } from "@langchain/core/messages";
import type { RuntimeConfig } from "../types/config.js";
import { createOpenAgent } from "../agents/factory.js";
import {
  showBanner,
  separator,
  info,
  dim,
  error,
  createSpinner,
  formatToolCall,
  PROMPT_SYMBOL,
  showPlan,
} from "./ui.js";

export async function startRepl(runtimeConfig: RuntimeConfig): Promise<void> {
  showBanner();
  separator();
  info(`${chalk.bold(runtimeConfig.model.provider)} · ${chalk.bold(runtimeConfig.model.modelName)}`);
  info(chalk.dim(runtimeConfig.projectPath));
  separator();
  dim("Type a message or /exit to quit.\n");

  const agent = await createOpenAgent(runtimeConfig);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    rl.question(`\n${PROMPT_SYMBOL}`, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed === "/exit" || trimmed === "/quit") {
        dim("Goodbye 👋");
        rl.close();
        process.exit(0);
      }

      try {
        await streamResponse(agent, trimmed);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
      }

      prompt();
    });
  };

  rl.on("close", () => {
    process.exit(0);
  });

  prompt();
}

async function streamResponse(
  agent: Awaited<ReturnType<typeof createOpenAgent>>,
  userMessage: string,
): Promise<void> {
  const invokeConfig = agent.getInvokeConfig();

  const spinner = createSpinner("Thinking…");
  spinner.start();

  const stream = await agent.graph.stream(
    { messages: [new HumanMessage(userMessage)] },
    { ...invokeConfig, streamMode: ["messages", "updates"] as const },
  );

  let currentAgent = "";
  let hasStreamedContent = false;

  for await (const [mode, chunk] of stream) {
    if (mode === "messages") {
      const [messageChunk, metadata] = chunk;
      const nodeName = metadata["langgraph_node"] as string;

      // Skip tool node — tool call/results shown via updates mode
      if (nodeName === "tools") continue;

      if (spinner.isSpinning) spinner.stop();

      // Print agent header on switch
      if (nodeName !== currentAgent) {
        if (hasStreamedContent) console.log("");
        currentAgent = nodeName;
        hasStreamedContent = false;

        if (currentAgent === "planner") {
          console.log(chalk.hex("#A855F7")("\n"));
        } else {
          const color = getAgentColor(currentAgent);
          console.log(color(`\n👤 ${currentAgent.toUpperCase()}:`));
        }
      }

      // Stream text content token-by-token LIVE
      if (messageChunk.content) {
        const text = typeof messageChunk.content === "string"
          ? messageChunk.content
          : JSON.stringify(messageChunk.content);

        if (text) {
          process.stdout.write(chalk.white(text));
          hasStreamedContent = true;
        }
      }
    } else if (mode === "updates") {
      const updates = chunk as Record<string, any>;

      // Show tool calls with ⚡ icon
      if (updates["tools"]) {
        // Tool execution completed — spinner already shows "Running..."
        if (spinner.isSpinning) spinner.stop();
      }

      // Show planner plan + handoffs
      if (updates["planner"]) {
        const plannerState = updates["planner"];

        // Show milestones if a plan was created
        if (plannerState.milestones && plannerState.milestones.length > 0) {
          if (spinner.isSpinning) spinner.stop();
          if (hasStreamedContent) console.log("");
          showPlan(plannerState.milestones);
          hasStreamedContent = false;
        }

        // Show handoff to specialist
        if (plannerState.next_agent &&
            plannerState.next_agent !== "__end__" &&
            plannerState.next_agent !== "planner") {
          if (spinner.isSpinning) spinner.stop();
          console.log(chalk.dim(`\n👉 Handoff to: ${chalk.bold(plannerState.next_agent)}\n`));
          spinner.text = `${plannerState.next_agent} is working...`;
          spinner.start();
          hasStreamedContent = false;
        }

        // If planner is looping back (calling tools), show spinner
        if (plannerState.next_agent === "planner") {
          // Check for tool calls in the last message
          const lastMsg = plannerState.messages?.[plannerState.messages.length - 1];
          if (lastMsg?.tool_calls?.length) {
            if (hasStreamedContent) {
              console.log("\n");
              hasStreamedContent = false;
            }
            for (const tc of lastMsg.tool_calls) {
              console.log(formatToolCall(tc.name, tc.args ?? {}));
            }
            spinner.text = `Running ${lastMsg.tool_calls[0].name}...`;
            spinner.start();
          }
        }
      }

      // Show specialist updates
      const specialistKey = Object.keys(updates).find(k =>
        ["backend", "frontend", "security", "devops"].includes(k)
      );
      if (specialistKey) {
        const specialistState = updates[specialistKey];
        if (specialistState.milestones && specialistState.milestones.length > 0) {
          if (spinner.isSpinning) spinner.stop();
          showPlan(specialistState.milestones);
        }
        if (spinner.isSpinning) spinner.stop();
        console.log(chalk.dim(`\n👈 Returning to planner\n`));
        spinner.text = "Planner is reviewing...";
        spinner.start();
        hasStreamedContent = false;
      }
    }
  }

  // Final newline after streamed content
  if (hasStreamedContent) console.log("");
  if (spinner.isSpinning) spinner.stop();
}

function getAgentColor(agent: string): (text: string) => string {
  switch (agent) {
    case "backend": return chalk.green;
    case "frontend": return chalk.magenta;
    case "security": return chalk.yellow;
    case "devops": return chalk.cyan;
    default: return chalk.white;
  }
}
