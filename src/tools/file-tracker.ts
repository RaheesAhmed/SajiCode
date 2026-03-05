import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SNAPSHOT_DIR = ".sajicode/snapshots";
const MAX_SNAPSHOTS = 50;

interface FileSnapshot {
  filePath: string;
  content: string;
  timestamp: string;
  agentName: string;
}

async function ensureSnapshotDir(projectPath: string): Promise<string> {
  const dir = path.join(projectPath, SNAPSHOT_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function getSnapshotIndex(projectPath: string): Promise<FileSnapshot[]> {
  const indexPath = path.join(projectPath, SNAPSHOT_DIR, "index.json");
  try {
    const data = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveSnapshotIndex(
  projectPath: string,
  snapshots: FileSnapshot[],
): Promise<void> {
  const indexPath = path.join(projectPath, SNAPSHOT_DIR, "index.json");
  const trimmed = snapshots.slice(-MAX_SNAPSHOTS);
  await fs.writeFile(indexPath, JSON.stringify(trimmed, null, 2));
}

export async function undoFileChange(projectPath: string, filePath: string): Promise<string> {
  const index = await getSnapshotIndex(projectPath);
  const matching = index.filter((s) => s.filePath === filePath);

  if (matching.length === 0) {
    return `No snapshots found for ${filePath}. Cannot undo.`;
  }

  const latest = matching[matching.length - 1]!;
  const snapshotPath = path.join(projectPath, SNAPSHOT_DIR, latest.content);

  let originalContent: string;
  try {
    originalContent = await fs.readFile(snapshotPath, "utf-8");
  } catch {
    return `Snapshot file missing: ${latest.content}. Cannot undo.`;
  }

  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectPath, filePath);

  await fs.writeFile(absPath, originalContent);

  const updated = index.filter((s) => s !== latest);
  await saveSnapshotIndex(projectPath, updated);

  return `✅ Restored ${filePath} to snapshot from ${new Date(latest.timestamp).toLocaleTimeString()} (by ${latest.agentName})`;
}

export async function listRecentSnapshots(projectPath: string): Promise<string> {
  const index = await getSnapshotIndex(projectPath);
  if (index.length === 0) return "No file snapshots recorded.";

  const lines = index.slice(-20).map((s) => {
    const time = new Date(s.timestamp).toLocaleTimeString();
    return `  ${time} | ${s.agentName.padEnd(20)} | ${s.filePath}`;
  });

  return [
    `File Snapshots (${index.length} total, showing last 20):`,
    "",
    ...lines,
  ].join("\n");
}

export function createFileTrackerTools(projectPath: string) {
  const snapshotFile = tool(
    async ({ filePath, agentName }: { filePath: string; agentName: string }) => {
      await ensureSnapshotDir(projectPath);

      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(projectPath, filePath);

      let content: string;
      try {
        content = await fs.readFile(absPath, "utf-8");
      } catch {
        return `File does not exist yet: ${filePath} — no snapshot needed.`;
      }

      const timestamp = new Date().toISOString();
      const safeName = filePath.replace(/[/\\:]/g, "_").replace(/^_/, "");
      const snapshotFileName = `${Date.now()}_${safeName}`;
      const snapshotPath = path.join(projectPath, SNAPSHOT_DIR, snapshotFileName);

      await fs.writeFile(snapshotPath, content);

      const index = await getSnapshotIndex(projectPath);
      index.push({ filePath, content: snapshotFileName, timestamp, agentName });
      await saveSnapshotIndex(projectPath, index);

      return `Snapshot saved for ${filePath} by ${agentName}`;
    },
    {
      name: "snapshot_file",
      description:
        "Save a snapshot of a file BEFORE modifying it. " +
        "Call this before write_file or edit_file on critical files. " +
        "Enables undo if the change breaks something.",
      schema: z.object({
        filePath: z.string().describe("Relative or absolute path of the file to snapshot"),
        agentName: z.string().describe("Name of the agent making the change"),
      }),
    },
  );

  const undoLastChange = tool(
    async ({ filePath }: { filePath: string }) => {
      const index = await getSnapshotIndex(projectPath);
      const matching = index.filter((s) => s.filePath === filePath);

      if (matching.length === 0) {
        return `No snapshots found for ${filePath}. Cannot undo.`;
      }

      const latest = matching[matching.length - 1]!;
      const snapshotPath = path.join(projectPath, SNAPSHOT_DIR, latest.content);

      let originalContent: string;
      try {
        originalContent = await fs.readFile(snapshotPath, "utf-8");
      } catch {
        return `Snapshot file missing: ${latest.content}. Cannot undo.`;
      }

      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(projectPath, filePath);

      await fs.writeFile(absPath, originalContent);

      const updated = index.filter((s) => s !== latest);
      await saveSnapshotIndex(projectPath, updated);

      return `Restored ${filePath} to snapshot from ${latest.timestamp} (by ${latest.agentName})`;
    },
    {
      name: "undo_file_change",
      description:
        "Restore a file to its last snapshot. " +
        "Use when an agent's modification broke something and you need to revert.",
      schema: z.object({
        filePath: z.string().describe("Path of the file to restore"),
      }),
    },
  );

  const listSnapshots = tool(
    async () => {
      const index = await getSnapshotIndex(projectPath);
      if (index.length === 0) return "No file snapshots recorded.";

      const lines = index.slice(-20).map((s) => {
        const time = new Date(s.timestamp).toLocaleTimeString();
        return `  ${time} | ${s.agentName.padEnd(20)} | ${s.filePath}`;
      });

      return [
        `File Snapshots (${index.length} total, showing last 20):`,
        "",
        ...lines,
      ].join("\n");
    },
    {
      name: "list_snapshots",
      description: "List all recorded file snapshots for debugging or review.",
      schema: z.object({}),
    },
  );

  return [snapshotFile, undoLastChange, listSnapshots];
}
