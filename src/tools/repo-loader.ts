import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  "__pycache__",
  ".cache",
  ".turbo",
  ".sajicode",
  ".venv",
  "venv",
  "_pycache_",
]);

const IGNORED_EXTENSIONS = new Set([
  ".map",
  ".lock",
  ".min.js",
  ".min.css",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".gz",
]);

const KEY_FILES = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "Dockerfile",
  "docker-compose.yml",
  ".env.example",
  "README.md",
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".py"]);

const MAX_FILE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 150_000;

interface FileEntry {
  relPath: string;
  absPath: string;
  priority: number;
}

async function collectFiles(
  rootDir: string,
  focus?: string,
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  async function walk(dir: string): Promise<void> {
    let items: Dirent[];
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of items) {
      if (IGNORED_DIRS.has(item.name)) continue;

      const absPath = path.join(dir, item.name);
      const relPath = path.relative(rootDir, absPath);

      if (item.isDirectory()) {
        await walk(absPath);
        continue;
      }

      const ext = path.extname(item.name).toLowerCase();

      // Check IGNORED_EXTENSIONS — also check compound extensions like .min.js
      const lowerName = item.name.toLowerCase();
      if (
        IGNORED_EXTENSIONS.has(ext) ||
        lowerName.endsWith(".min.js") ||
        lowerName.endsWith(".min.css")
      ) {
        continue;
      }

      const isKey = KEY_FILES.includes(item.name);
      const isSource = SOURCE_EXTENSIONS.has(ext);
      const isFocused = focus
        ? relPath.toLowerCase().includes(focus.toLowerCase())
        : false;

      // Priority: 0 = key files, 1 = focus-matched, 2 = source files, 3 = others
      let priority: number;
      if (isKey) {
        priority = 0;
      } else if (isFocused) {
        priority = 1;
      } else if (isSource) {
        priority = 2;
      } else {
        priority = 3;
      }

      entries.push({ relPath, absPath, priority });
    }
  }

  await walk(rootDir);
  return entries.sort(
    (a, b) => a.priority - b.priority || a.relPath.localeCompare(b.relPath),
  );
}

export async function loadFullRepo(
  projectPath: string,
  options: { maxChars?: number; focus?: string } = {},
): Promise<string> {
  const maxChars = options.maxChars ?? MAX_TOTAL_CHARS;
  const focus = options.focus;

  const files = await collectFiles(projectPath, focus);
  const sections: string[] = [];
  let totalChars = 0;
  let loadedCount = 0;

  for (const { relPath, absPath } of files) {
    if (totalChars >= maxChars) break;

    let content: string;
    try {
      content = await fs.readFile(absPath, "utf-8");
    } catch {
      continue;
    }

    const lineCount = content.split("\n").length;
    let displayContent = content;

    if (content.length > MAX_FILE_CHARS) {
      const truncated = content.slice(0, MAX_FILE_CHARS);
      const truncatedLines = content.slice(MAX_FILE_CHARS).split("\n").length - 1;
      displayContent = `${truncated}\n[...truncated ${truncatedLines} lines]`;
    }

    const header = `--- [${relPath}] (${lineCount} lines) ---`;
    const block = `${header}\n${displayContent}`;
    sections.push(block);
    totalChars += block.length;
    loadedCount++;
  }

  const metaLine = `Files loaded: ${loadedCount} | Total chars: ${totalChars} | Project: ${projectPath}`;

  return [
    "=== FULL REPOSITORY CONTEXT ===",
    metaLine,
    "",
    sections.join("\n\n"),
    "",
    "=== END REPOSITORY CONTEXT ===",
  ].join("\n");
}

export function createRepoLoaderTools(projectPath: string) {
  return tool(
    async ({ focus }: { focus?: string }) => {
      const result = await loadFullRepo(projectPath, { focus });
      const fileMatch = result.match(/Files loaded: (\d+)/);
      const charMatch = result.match(/Total chars: (\d+)/);
      const filesLoaded = fileMatch?.[1] ?? "?";
      const charsLoaded = charMatch?.[1] ?? "?";
      console.log(
        `[repo-loader] Loaded ${filesLoaded} files, ${charsLoaded} chars${focus ? ` (focus: "${focus}")` : ""}`,
      );
      return result;
    },
    {
      name: "load_full_repo",
      description:
        "Load the full repository source into context. Returns all source files, configs, and key documents " +
        "formatted as a single string. Files are prioritized: key config files first, then TypeScript/JS/Python " +
        "source files, then others. Individual files are truncated at 8000 chars and the total is capped at 150k chars. " +
        "Optionally provide a focus substring to prioritize files matching that path.",
      schema: z.object({
        focus: z
          .string()
          .optional()
          .describe(
            "Optional path substring to emphasize. Files whose relative path contains this string are loaded first.",
          ),
      }),
    },
  );
}
