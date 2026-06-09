import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

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

interface CacheEntry {
  content: string;     // full file content — never truncated
  timestamp: number;   // ms epoch when we cached it
  mtimeMs: number;     // file mtime at time of caching (to detect external writes)
}

const fileReadCache = new Map<string, CacheEntry>();

// Reduced from 30 min to 3 min. Files change frequently during a build session.
const CACHE_TTL_MS = 3 * 60 * 1000;

// Paths invalidated by recent write/edit operations within this session.
const writtenPaths = new Set<string>();

function stringifyToolContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";

  if (content instanceof Uint8Array) {
    return `[binary content: ${content.byteLength} bytes]`;
  }

  if (ArrayBuffer.isView(content)) {
    return `[binary content: ${content.byteLength} bytes]`;
  }

  if (content instanceof ArrayBuffer) {
    return `[binary content: ${content.byteLength} bytes]`;
  }

  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === "string") return block;
      if (block && typeof block === "object") {
        const maybeText = (block as any).text;
        if (typeof maybeText === "string") return maybeText;

        const maybeContent = (block as any).content;
        if (typeof maybeContent === "string") return maybeContent;
      }
      return safeStringify(block);
    }).join("\n");
  }

  if (content && typeof content === "object") {
    const maybeContent = (content as any).content;
    if (typeof maybeContent === "string") return maybeContent;
    return safeStringify(content);
  }

  return String(content);
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, current) => {
    if (current instanceof Uint8Array) {
      return `[binary content: ${current.byteLength} bytes]`;
    }
    if (ArrayBuffer.isView(current)) {
      return `[binary content: ${current.byteLength} bytes]`;
    }
    if (current instanceof ArrayBuffer) {
      return `[binary content: ${current.byteLength} bytes]`;
    }
    if (current && typeof current === "object") {
      if (seen.has(current)) return "[Circular]";
      seen.add(current);
    }
    return current;
  }, 2) ?? "";
}

function normalizeMessageContent(message: unknown): unknown {
  const looksLikeToolMessage = ToolMessage.isInstance(message)
    || Boolean(
      message
      && typeof message === "object"
      && (message as any).type === "tool"
      && "tool_call_id" in (message as any)
    );

  if (looksLikeToolMessage) {
    const toolMessage = message as any;
    if (typeof toolMessage.content !== "string") {
      toolMessage.content = stringifyToolContent(toolMessage.content);
    }
    return toolMessage;
  }
  return message;
}

export function normalizeToolResultContent(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;

  if (
    ToolMessage.isInstance(result)
    || Boolean((result as any).type === "tool" && "tool_call_id" in (result as any))
  ) {
    return normalizeMessageContent(result);
  }

  const value = result as any;
  if (Array.isArray(value.messages)) {
    value.messages = value.messages.map(normalizeMessageContent);
  }

  if (value.update && Array.isArray(value.update.messages)) {
    value.update.messages = value.update.messages.map(normalizeMessageContent);
  }

  if ("content" in value && typeof value.content !== "string") {
    value.content = stringifyToolContent(value.content);
  }

  return value;
}

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

/**
 * Get the file's mtime in milliseconds, or -1 if the file doesn't exist.
 */
async function getFileMtimeMs(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtimeMs;
  } catch {
    return -1;
  }
}

/**
 * Returns cached content only when:
 *   1. An entry exists
 *   2. TTL has not expired
 *   3. The file has NOT been modified since we cached it (mtime check)
 *   4. The path was NOT written in this session (explicit invalidation)
 */
async function getCachedContent(filePath: string): Promise<string | null> {
  // Explicit write-invalidation wins immediately
  if (writtenPaths.has(filePath)) {
    fileReadCache.delete(filePath);
    return null;
  }

  const entry = fileReadCache.get(filePath);
  if (!entry) return null;

  // TTL check
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    fileReadCache.delete(filePath);
    return null;
  }

  // File-modification check: if the file was changed since we cached it, evict
  const currentMtime = await getFileMtimeMs(filePath);
  if (currentMtime > entry.mtimeMs) {
    fileReadCache.delete(filePath);
    return null;
  }

  return entry.content;
}

async function cacheFile(filePath: string, content: string): Promise<void> {
  const mtimeMs = await getFileMtimeMs(filePath);
  fileReadCache.set(filePath, {
    content,
    timestamp: Date.now(),
    mtimeMs,
  });
}

/**
 * Mark a path as written so any subsequent read_file is forced to re-read from disk.
 * Called when write_file, edit_file, or apply_file_batch are executed.
 */
function invalidateWrittenPath(rawPath: string): void {
  // Normalize to forward slashes for consistent key matching
  const normalized = rawPath.replace(/\\/g, "/");
  writtenPaths.add(normalized);
  writtenPaths.add(rawPath); // keep the original too for safety

  // Also evict from in-memory read cache
  for (const key of fileReadCache.keys()) {
    if (key.replace(/\\/g, "/") === normalized) {
      fileReadCache.delete(key);
    }
  }
}

export function resetContextGuardCache(): void {
  fileReadCache.clear();
  writtenPaths.clear();
}

export const contextGuardMiddleware = createMiddleware({
  name: "ContextGuardMiddleware",
  // @ts-expect-error - DeepAgents middleware typing
  wrapToolCall: async (
    request: { toolCall: { name: string; args: Record<string, unknown> } },
    handler: (req: unknown) => Promise<unknown>
  ) => {
    const { name: toolName, args } = request.toolCall;

    // ── Block directory listing on excluded directories ─────────────────────
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

    // ── Block read_file on excluded paths; serve full content from cache ────
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

      // Return FULL cached content (no truncation) when the file hasn't changed
      const cachedContent = await getCachedContent(filePath);
      if (cachedContent !== null) {
        return new ToolMessage({
          name: toolName,
          content: cachedContent,
          tool_call_id: (request.toolCall as any).id || "unknown",
        });
      }
    }

    // ── Invalidate cache for write/edit operations ───────────────────────────
    if (toolName === "write_file" || toolName === "edit_file") {
      const filePath = (args["file_path"] ?? args["path"] ?? "") as string;
      if (filePath) invalidateWrittenPath(filePath);
    }

    // apply_file_batch carries an array of operations
    if (toolName === "apply_file_batch") {
      const operations = args["operations"];
      if (Array.isArray(operations)) {
        for (const op of operations) {
          if (op && typeof op === "object" && typeof op.filePath === "string") {
            invalidateWrittenPath(op.filePath);
          }
        }
      }
    }

    // ── Auto-fix write_todos ─────────────────────────────────────────────────
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

    // ── Execute the actual tool call ─────────────────────────────────────────
    const result = normalizeToolResultContent(await handler(request)) as any;

    // ── Cache the full read_file content after a live read ───────────────────
    if (toolName === "read_file" && result) {
      const filePath = (args["file_path"] ?? args["path"] ?? "") as string;
      const content = typeof result === "string"
        ? result
        : (result?.content ?? result?.update?.messages?.at?.(-1)?.content ?? result?.messages?.at?.(-1)?.content ?? "");
      if (typeof content === "string" && content.length > 0) {
        await cacheFile(filePath, content);
      }
    }

    return result;
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
