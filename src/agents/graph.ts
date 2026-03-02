/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */

import { StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AgentState } from "../types/state.js";
import { plannerNode } from "./nodes/planner.js";
import { createSpecialistNode } from "./nodes/specialist.js";
import { allTools } from "../tools/index.js";
import { AIMessage } from "@langchain/core/messages";

const backendNode = createSpecialistNode("backend");
const frontendNode = createSpecialistNode("frontend");

const toolNode = new ToolNode(allTools);

function routePlanner(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

  // If the main agent called real tools, route to ToolNode
  if (lastMessage?.tool_calls?.length) {
    return "tools";
  }

  // Otherwise route based on next_agent (delegation or end)
  const next = state.next_agent;
  if (next === "__end__") return "__end__";
  return next;
}

function routeSpecialist(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  if (lastMessage?.tool_calls?.length) {
    return "tools";
  }
  return "planner";
}

export function buildGraph() {
  const graph = new StateGraph(AgentState)
    .addNode("planner", plannerNode)
    .addNode("backend", backendNode)
    .addNode("frontend", frontendNode)
    .addNode("tools", toolNode)
    .addEdge("__start__", "planner")

    // Main agent routing: can go to tools, specialists, or end
    .addConditionalEdges("planner", routePlanner, {
      "tools": "tools",
      "planner": "planner",
      "backend": "backend",
      "frontend": "frontend",
      "__end__": "__end__",
    })

    // Specialists: tools or back to planner
    .addConditionalEdges("backend", routeSpecialist, {
      "tools": "tools",
      "planner": "planner",
    })
    .addConditionalEdges("frontend", routeSpecialist, {
      "tools": "tools",
      "planner": "planner",
    })

    // After tool execution, route back to whoever called
    .addConditionalEdges("tools", (state) => state.next_agent, {
      "planner": "planner",
      "backend": "backend",
      "frontend": "frontend",
    });

  return graph;
}
