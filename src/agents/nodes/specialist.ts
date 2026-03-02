/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */

import { SystemMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { AgentState } from "../../types/state.js";
import { buildSystemPrompt } from "../../prompts/system.js";
import { allTools } from "../../tools/index.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

type SpecialistType = "backend" | "frontend" | "security" | "devops";

export function createSpecialistNode(role: SpecialistType) {
  return async function specialistNode(
    state: typeof AgentState.State,
    config: RunnableConfig
  ): Promise<Partial<typeof AgentState.State>> {
     const configurable = config.configurable ?? {};
     const llm = configurable["llm"] as BaseChatModel;
     if (!llm) throw new Error("LLM not configured");

    const currentMilestone = state.milestones.find(
      (m) => (m.status === "in_progress" || m.status === "pending") && m.assignee === role
    );

    const basePrompt = await buildSystemPrompt(state.projectPath, state.userLevel);

    const specialistInstructions = `

## Role
You are a world-class ${role} engineer working under OpenAgent's direction.

## Current Task
${currentMilestone?.title ?? "General Assistance"}

## Requirements
${JSON.stringify(currentMilestone?.requirements ?? [])}

## Instructions
- Write code, read files, run commands using tools.
- Do NOT hallucinate file contents — always read first.
- If the task is finished, return a final answer beginning with "TASK_COMPLETED:" followed by a summary.
- If you need to perform actions, call the tools.`;

    const systemPrompt = basePrompt + specialistInstructions;

    if (!llm.bindTools) {
        throw new Error("LLM does not support bindTools");
    }

    const modelWithTools = llm.bindTools(allTools);

    const messages = [
        new SystemMessage(systemPrompt),
        ...state.messages,
    ];

    const response = await modelWithTools.invoke(messages);

    return {
      messages: [response],
    };
  };
}
