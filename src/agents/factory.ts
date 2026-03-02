/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */

import { v4 as uuidv4 } from "uuid";
import { buildGraph } from "./graph.js";
import { createLLMProvider } from "../llms/provider.js";
import { MemoryManager } from "../memory/manager.js";
import type { RuntimeConfig } from "../types/config.js";

export async function createOpenAgent(runtimeConfig: RuntimeConfig) {
  const llm = createLLMProvider(runtimeConfig.model);
  const memoryManager = new MemoryManager();
  await memoryManager.initialize();

  const graph = buildGraph();

  const compiledGraph = graph.compile({
    checkpointer: memoryManager.getCheckpointer(),
    store: memoryManager.getStore(),
  });

  const threadId = uuidv4();

  function getInvokeConfig(overrideThreadId?: string) {
    return {
      configurable: {
        thread_id: overrideThreadId ?? threadId,
        llm,
        userId: runtimeConfig.userId,
      },
    };
  }

  return {
    graph: compiledGraph,
    threadId,
    config: runtimeConfig,
    getInvokeConfig,
    memoryManager,
  };
}
