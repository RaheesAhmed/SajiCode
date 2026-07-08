import {
  getCheckpointer,
  saveCurrentThread,
  loadCurrentThread,
  threadHasCheckpoint,
  listRecentThreadIds,
  getCheckpointDbPath,
  resetCheckpointerCache,
} from "./checkpointer.js";

export function generateThreadId(): string {
  return `sajicode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSessionConfig(threadId?: string) {
  return {
    configurable: {
      thread_id: threadId ?? generateThreadId(),
    },
  };
}

export {
  getCheckpointer,
  saveCurrentThread,
  loadCurrentThread,
  threadHasCheckpoint,
  listRecentThreadIds,
  getCheckpointDbPath,
  resetCheckpointerCache,
};
