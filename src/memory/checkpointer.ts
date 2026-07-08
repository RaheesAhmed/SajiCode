import path from "node:path";
import fs from "node:fs/promises";
import { MemorySaver } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const CHECKPOINT_DB = "checkpoints.db";
const THREAD_FILE = "current-thread.txt";

export type ProjectCheckpointer = SqliteSaver | MemorySaver;

let cachedCheckpointer: ProjectCheckpointer | null = null;
let cachedProjectPath: string | null = null;

export function getCheckpointDbPath(projectPath: string): string {
  return path.join(projectPath, ".sajicode", CHECKPOINT_DB);
}

export async function getCheckpointer(projectPath: string): Promise<ProjectCheckpointer> {
  if (cachedCheckpointer && cachedProjectPath === projectPath) {
    return cachedCheckpointer;
  }

  const dbPath = getCheckpointDbPath(projectPath);
  await fs.mkdir(path.dirname(dbPath), { recursive: true });

  try {
    cachedCheckpointer = SqliteSaver.fromConnString(dbPath);
    cachedProjectPath = projectPath;
    return cachedCheckpointer;
  } catch {
    cachedCheckpointer = new MemorySaver();
    cachedProjectPath = projectPath;
    return cachedCheckpointer;
  }
}

export async function saveCurrentThread(
  projectPath: string,
  threadId: string,
): Promise<void> {
  const filePath = path.join(projectPath, ".sajicode", THREAD_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, threadId, "utf-8");
}

export async function loadCurrentThread(projectPath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(
      path.join(projectPath, ".sajicode", THREAD_FILE),
      "utf-8",
    );
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export async function threadHasCheckpoint(
  projectPath: string,
  threadId: string,
): Promise<boolean> {
  const checkpointer = await getCheckpointer(projectPath);
  if (!("get" in checkpointer)) return false;

  try {
    const checkpoint = await checkpointer.get({
      configurable: { thread_id: threadId },
    });
    return checkpoint != null;
  } catch {
    return false;
  }
}

export async function listRecentThreadIds(
  projectPath: string,
  limit = 10,
): Promise<string[]> {
  const checkpointer = await getCheckpointer(projectPath);
  if (!("list" in checkpointer)) return [];

  const threadIds = new Set<string>();

  try {
    for await (const entry of checkpointer.list({})) {
      const threadId = entry.config?.configurable?.["thread_id"];
      if (typeof threadId === "string" && threadId.length > 0) {
        threadIds.add(threadId);
        if (threadIds.size >= limit) break;
      }
    }
  } catch {
    return [];
  }

  return Array.from(threadIds);
}

export function resetCheckpointerCache(): void {
  cachedCheckpointer = null;
  cachedProjectPath = null;
}
