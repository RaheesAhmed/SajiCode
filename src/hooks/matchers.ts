import type { HookMatcher, HookPayload } from "./types.js";

export function globToRegExp(glob: string): RegExp {
  let pattern = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  pattern = pattern
    .replace(/\*\*/g, "§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§/g, ".*");
  return new RegExp(`^${pattern}$`, "i");
}

export function pathMatchesGlob(filePath: string, glob: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return globToRegExp(glob).test(normalized);
}

export function pathMatchesAnyGlob(filePath: string, globs: string[]): boolean {
  return globs.some((glob) => pathMatchesGlob(filePath, glob));
}

export function matchesHookMatcher(
  matcher: HookMatcher | undefined,
  payload: HookPayload,
): boolean {
  if (!matcher) return true;

  if (matcher.toolName && payload.toolName !== matcher.toolName) {
    return false;
  }

  if (matcher.agentName && payload.agentName !== matcher.agentName) {
    return false;
  }

  if (matcher.status && payload.status !== matcher.status) {
    return false;
  }

  if (matcher.argsPattern) {
    const haystack = JSON.stringify(payload.args ?? {});
    try {
      if (!new RegExp(matcher.argsPattern, "i").test(haystack)) {
        return false;
      }
    } catch {
      if (!haystack.toLowerCase().includes(matcher.argsPattern.toLowerCase())) {
        return false;
      }
    }
  }

  if (matcher.paths && matcher.paths.length > 0) {
    const paths = payload.paths ?? payload.files ?? [];
    if (paths.length === 0) return false;
    const anyMatch = paths.some((p) =>
      matcher.paths!.some((glob) => pathMatchesGlob(p, glob)),
    );
    if (!anyMatch) return false;
  }

  return true;
}

export function extractFilePathsFromToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): string[] {
  const paths: string[] = [];

  if (toolName === "write_file" || toolName === "edit_file") {
    const filePath = args["file_path"] ?? args["path"];
    if (typeof filePath === "string") paths.push(filePath);
  }

  if (toolName === "apply_file_batch") {
    const operations = args["operations"];
    if (Array.isArray(operations)) {
      for (const op of operations) {
        if (op && typeof op === "object") {
          const fp = (op as { filePath?: string }).filePath;
          if (typeof fp === "string") paths.push(fp);
        }
      }
    }
  }

  return paths;
}

export const FILE_WRITE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "apply_file_batch",
]);

export const SHELL_TOOLS = new Set(["execute"]);
