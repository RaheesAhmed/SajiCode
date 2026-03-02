/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */

import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { AgentState } from "../../types/state.js";
import { buildSystemPrompt } from "../../prompts/system.js";
import { allTools } from "../../tools/index.js";
import { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const PlanSchema = z.object({
  milestones: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.enum(["pending", "in_progress", "completed", "failed"]),
      assignee: z.enum(["planner", "backend", "frontend", "security", "devops"]),
      requirements: z.array(z.string()),
    })
  ),
  next_agent: z.enum(["planner", "backend", "frontend", "security", "devops", "__end__"]),
});

const delegatePlanTool = {
  name: "delegate_to_specialist",
  description: "Create a multi-step project plan and delegate the first task to a specialist agent. ONLY use this when the user's request requires a complex multi-step build involving backend/frontend/security/devops work. Do NOT use for simple questions, file reads, or single actions.",
  schema: PlanSchema,
};

export async function plannerNode(
  state: typeof AgentState.State,
  config: RunnableConfig
): Promise<Partial<typeof AgentState.State>> {
  const configurable = config.configurable ?? {};
  const llm = configurable["llm"] as BaseChatModel;
  if (!llm) throw new Error("LLM not configured. Pass llm in configurable.");

  if (!llm.bindTools) {
    throw new Error("LLM does not support bindTools. Please use a compatible model.");
  }

  const modelWithTools = llm.bindTools([delegatePlanTool, ...allTools]);

  const basePrompt = await buildSystemPrompt(state.projectPath, state.userLevel);

  const plannerInstructions = `

## Your Identity
You are OpenAgent — the main AI software engineer. You handle ALL user requests directly.

## Your Tools
You have full access to the file system, shell commands, memory, and project context tools.
Use them directly to read files, write code, run commands, etc.

## When to Delegate
You also lead a team of specialist sub-agents. ONLY delegate when the task requires complex, multi-step work:
- **backend**: Node.js, Databases, API design, Server-side logic
- **frontend**: React, UI/UX, CSS, Client-side logic
- **security**: Auditing, risk assessment
- **devops**: Deployment, CI/CD

To delegate, call the 'delegate_to_specialist' tool with milestones and next_agent.

## Current Plan
${state.milestones.length > 0 ? JSON.stringify(state.milestones, null, 2) : "No active plan."}

## Decision Rules
1. User asks a question → Answer directly. No delegation.
2. User asks to read/write a file → Use your tools directly.
3. User asks to run a command → Use run_command directly.
4. User asks to build a complex app → Create plan, delegate to specialists.
5. ALWAYS respond with clear Markdown.`;

  const systemContent = basePrompt + plannerInstructions;

  const messages = [
    new SystemMessage(systemContent),
    ...state.messages,
  ];

  const response = await modelWithTools.invoke(messages);

  const delegateCall = response.tool_calls?.find((tc) => tc.name === "delegate_to_specialist");
  const realToolCalls = response.tool_calls?.filter((tc) => tc.name !== "delegate_to_specialist") ?? [];

  let partialState: Partial<typeof AgentState.State> = {};

  if (delegateCall) {
    const args = delegateCall.args as z.infer<typeof PlanSchema>;
    partialState.milestones = args.milestones;
    partialState.next_agent = args.next_agent as any;

    // Strip delegate_to_specialist from message so ToolNode doesn't see it
    partialState.messages = [new AIMessage({
      content: response.content,
      tool_calls: realToolCalls,
      additional_kwargs: response.additional_kwargs,
    })];
  } else if (realToolCalls.length > 0) {
    // Planner called real tools (read_file, run_command, etc.) — route to ToolNode then back
    partialState.messages = [response];
    partialState.next_agent = "planner";
  } else {
    // General chat response — return to user
    partialState.messages = [response];
    partialState.next_agent = "__end__";
  }

  return partialState;
}
