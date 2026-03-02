/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */


import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { globalStorage } from "../memory/storage.js";

export const saveMemoryTool = tool(
  async (input: { key: string; value: string }) => {
    await globalStorage.saveMemory(input.key, input.value);
    return `✅ Saved to persistent memory: "${input.key}" = "${input.value}"`;
  },
  {
    name: "save_memory",
    description: "Save a fact or preference to persistent memory. Survives across sessions and restarts. Use for user name, preferred stack, project context, etc.",
    schema: z.object({
      key: z.string().describe("Unique key (e.g. 'user_name', 'preferred_stack')"),
      value: z.string().describe("The value to remember"),
    }),
  }
);

export const recallMemoriesTool = tool(
  async (input: { query: string }) => {
    const results = await globalStorage.searchMemories(input.query);
    if (results.length === 0) return "No memories found matching that query.";

    return results
      .map((item) => `• ${item.key}: ${item.value}`)
      .join("\n");
  },
  {
    name: "recall_memories",
    description: "Search persistent memory for saved facts and preferences.",
    schema: z.object({
      query: z.string().describe("Search query to find relevant memories"),
    }),
  }
);

export const allMemoryTools = [saveMemoryTool, recallMemoriesTool];
