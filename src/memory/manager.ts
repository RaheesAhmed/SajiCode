/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */


import type { MemorySaver, InMemoryStore } from "@langchain/langgraph";
import { createCheckpointer } from "./checkpointer.js";
import { createLongTermStore } from "./store.js";
import { PersistentStorage, globalStorage } from "./storage.js";

export class MemoryManager {
  private checkpointer: MemorySaver;
  private store: InMemoryStore;
  private persistent: PersistentStorage;

  constructor() {
    this.checkpointer = createCheckpointer();
    this.store = createLongTermStore();
    this.persistent = globalStorage;
  }

  async initialize(): Promise<void> {
    await this.persistent.initialize();
  }

  getCheckpointer(): MemorySaver {
    return this.checkpointer;
  }

  getStore(): InMemoryStore {
    return this.store;
  }

  getStorage(): PersistentStorage {
    return this.persistent;
  }
}
