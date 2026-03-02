/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */


import { MemorySaver } from "@langchain/langgraph";

export function createCheckpointer(): MemorySaver {
  return new MemorySaver();
}
