/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */

import { InMemoryStore } from "@langchain/langgraph";

export function createLongTermStore(): InMemoryStore {
  return new InMemoryStore();
}
