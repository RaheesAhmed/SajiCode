import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const BLOCKED_DIRECTORIES = new Set([
  "node_modules", ".git", ".next", ".nuxt", "dist", "build",
  ".cache", ".turbo", "__pycache__", "coverage", ".svelte-kit",
]);

const BLOCKED_GLOBS_PATTERNS = [
  /\.d\.ts$/,
  /\.map$/,
  /\.lock$/,
  /node_modules/,
  /\.git\//,
];

const fileReadCache = new Map<string, { summary: string; timestamp: number }>();

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — files rarely change during a build session

function isBlockedPath(filePath: string): { blocked: boolean; reason: string } {
  const normalized = filePath.replace(/\\/g, "/");

  for (const dir of BLOCKED_DIRECTORIES) {
    if (normalized.includes(`/${dir}/`) || normalized.endsWith(`/${dir}`)) {
      const lastSegment = normalized.split("/").pop() ?? "";
      if (lastSegment === dir) {
        return { blocked: true, reason: `⛔ BLOCKED: Do not scan '${dir}'. This wastes context. Use package.json for dependency info.` };
      }
      if (normalized.includes(`/${dir}/`)) {
        return { blocked: true, reason: `⛔ BLOCKED: Do not scan '${dir}'. This wastes context. Use package.json for dependency info.` };
      }
    }
  }

  for (const pattern of BLOCKED_GLOBS_PATTERNS) {
    if (pattern.test(normalized)) {
      return { blocked: true, reason: `⛔ BLOCKED: File '${filePath}' matches blocked pattern. Skip generated/vendored files.` };
    }
  }

  return { blocked: false, reason: "" };
}

function getFileSummary(filePath: string, content: string): string {
  const lines = content.split("\n");
  const previewLines = lines.slice(0, 10).join("\n");
  return `[CACHED — already read this session] ${filePath} (${lines.length} lines)\n` +
    `Preview:\n${previewLines}\n...(${lines.length - 10} more lines)\n` +
    `→ You already read this file. Use the information you have. Do NOT re-read.`;
}

function isCached(filePath: string): boolean {
  const entry = fileReadCache.get(filePath);
  if (!entry) return false;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    fileReadCache.delete(filePath);
    return false;
  }
  return true;
}

function cacheFile(filePath: string, content: string): void {
  fileReadCache.set(filePath, {
    summary: getFileSummary(filePath, content),
    timestamp: Date.now(),
  });
}

export function resetContextGuardCache(): void {
  fileReadCache.clear();
}

export const contextGuardMiddleware = createMiddleware({
  name: "ContextGuardMiddleware",
  // @ts-expect-error - DeepAgents middleware typing
  wrapToolCall: async (
    request: { toolCall: { name: string; args: Record<string, unknown> } },
    handler: (req: unknown) => Promise<unknown>
  ) => {
    const { name: toolName, args } = request.toolCall;

    // Block directory listing on excluded directories
    if (toolName === "list_dir" || toolName === "ls" || toolName === "glob") {
      const targetPath = (args["path"] ?? args["directory"] ?? args["pattern"] ?? "") as string;
      const { blocked, reason } = isBlockedPath(targetPath);
      if (blocked) {
        return new ToolMessage({
          name: toolName,
          content: reason,
          tool_call_id: (request.toolCall as any).id || "unknown",
          status: "error",
        });
      }
    }

    // Block read_file on excluded paths
    if (toolName === "read_file") {
      const filePath = (args["file_path"] ?? args["path"] ?? "") as string;

      const { blocked, reason } = isBlockedPath(filePath);
      if (blocked) {
        return new ToolMessage({
          name: toolName,
          content: reason,
          tool_call_id: (request.toolCall as any).id || "unknown",
          status: "error",
        });
      }

      // Return cached summary for duplicate reads
      if (isCached(filePath)) {
        const cached = fileReadCache.get(filePath)!;
        return new ToolMessage({
          name: toolName,
          content: cached.summary,
          tool_call_id: (request.toolCall as any).id || "unknown",
        });
      }
    }

    // Auto-fix write_todos: LLMs sometimes stringify the array or use wrong status values
    if (toolName === "write_todos") {
      let todos = args["todos"];
      if (typeof todos === "string") {
        try { todos = JSON.parse(todos as string); } catch { /* let it fail */ }
      }
      if (Array.isArray(todos)) {
        const validStatuses = new Set(["pending", "in_progress", "completed"]);
        const fixTodos = (items: any[]): any[] => items.map((item: any) => {
          const fixed = { ...item };
          if (!validStatuses.has(fixed.status)) {
            fixed.status = "pending";
          }
          if (Array.isArray(fixed.todos)) {
            fixed.todos = fixTodos(fixed.todos);
          }
          return fixed;
        });
        request.toolCall.args = { ...args, todos: fixTodos(todos) };
      }
    }

    // Execute the actual tool call
    const result = await handler(request) as any;

    // Cache read_file results for deduplication
    if (toolName === "read_file" && result) {
      const filePath = (args["file_path"] ?? args["path"] ?? "") as string;
      const content = typeof result === "string"
        ? result
        : (result?.content ?? "");
      if (typeof content === "string" && content.length > 0) {
        cacheFile(filePath, content);
      }
    }

    return result;

    // --- Post-write: auto tsc check for TypeScript files ---
    // Disabled for now — will enable after testing the basic middleware flow
  },
});

export async function runQuickTscCheck(filePath: string): Promise<string> {
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized.endsWith(".ts") && !normalized.endsWith(".tsx")) return "";

  try {
    await execFileAsync("npx", ["tsc", "--noEmit", "--pretty"], {
      timeout: 15000,
      maxBuffer: 512 * 1024,
    });
    return "";
  } catch (error: any) {
    const output = (error.stdout ?? "") + (error.stderr ?? "");
    const relevantErrors = output
      .split("\n")
      .filter((line: string) => line.includes("error TS"))
      .slice(0, 5)
      .join("\n");
    return relevantErrors ? `\n⚠️ TypeScript errors detected:\n${relevantErrors}` : "";
  }
}
