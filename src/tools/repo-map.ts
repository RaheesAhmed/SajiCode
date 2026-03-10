import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

const IGNORED_DIRS = new Set([
  "node_modules", "dist", "build", "coverage", ".git",
  ".next", ".nuxt", "__pycache__", ".cache", ".turbo",
  ".sajicode", ".vscode", ".idea", "vendor", "target",
  ".svelte-kit", ".output", "out", ".vercel", ".netlify",
]);

const IGNORED_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  ".DS_Store", "Thumbs.db", ".env", ".env.local",
]);

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".cs",
  ".rb", ".php", ".swift", ".vue", ".svelte",
]);

const SYMBOL_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/,
    /^export\s+(?:default\s+)?class\s+(\w+)/,
    /^export\s+(?:const|let|var)\s+(\w+)/,
    /^export\s+(?:default\s+)?interface\s+(\w+)/,
    /^export\s+(?:default\s+)?type\s+(\w+)/,
    /^export\s+(?:default\s+)?enum\s+(\w+)/,
    /^(?:async\s+)?function\s+(\w+)/,
    /^class\s+(\w+)/,
    /^interface\s+(\w+)/,
    /^type\s+(\w+)\s*=/,
    /^enum\s+(\w+)/,
  ],
  python: [
    /^def\s+(\w+)\s*\(/,
    /^async\s+def\s+(\w+)\s*\(/,
    /^class\s+(\w+)/,
  ],
  go: [
    /^func\s+(\w+)\s*\(/,
    /^func\s+\(\w+\s+\*?\w+\)\s+(\w+)\s*\(/,
    /^type\s+(\w+)\s+struct/,
    /^type\s+(\w+)\s+interface/,
  ],
  java: [
    /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+(\w+)/,
    /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?[\w<>,\s]+\s+(\w+)\s*\(/,
    /^\s*(?:public|private|protected)?\s*interface\s+(\w+)/,
    /^\s*(?:public|private|protected)?\s*enum\s+(\w+)/,
  ],
  ruby: [
    /^class\s+(\w+)/,
    /^module\s+(\w+)/,
    /^def\s+(\w+)/,
  ],
  rust: [
    /^pub\s+(?:async\s+)?fn\s+(\w+)/,
    /^(?:async\s+)?fn\s+(\w+)/,
    /^pub\s+struct\s+(\w+)/,
    /^struct\s+(\w+)/,
    /^pub\s+enum\s+(\w+)/,
    /^pub\s+trait\s+(\w+)/,
    /^impl\s+(\w+)/,
  ],
  php: [
    /^\s*(?:public|private|protected)?\s*function\s+(\w+)/,
    /^\s*class\s+(\w+)/,
    /^\s*interface\s+(\w+)/,
  ],
};

function getLanguage(ext: string): string {
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"].includes(ext)) return "typescript";
  if (ext === ".py") return "python";
  if (ext === ".go") return "go";
  if ([".java", ".kt"].includes(ext)) return "java";
  if (ext === ".rb") return "ruby";
  if (ext === ".rs") return "rust";
  if (ext === ".php") return "php";
  return "typescript";
}

function extractSignature(line: string): string {
  return line.replace(/\{.*$/, "").replace(/\s+/g, " ").trim();
}

interface FileMap {
  path: string;
  symbols: string[];
  lineCount: number;
}

async function scanFile(filePath: string, rootPath: string): Promise<FileMap | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const ext = path.extname(filePath).toLowerCase();
    const lang = getLanguage(ext);
    const patterns = SYMBOL_PATTERNS[lang] ?? SYMBOL_PATTERNS["typescript"];

    const symbols: string[] = [];
    for (const line of lines) {
      const trimmed = line.trimStart();
      for (const pattern of patterns!) {
        const match = trimmed.match(pattern);
        if (match) {
          symbols.push(extractSignature(trimmed));
          break;
        }
      }
    }

    if (symbols.length === 0) return null;

    return {
      path: path.relative(rootPath, filePath).replace(/\\/g, "/"),
      symbols,
      lineCount: lines.length,
    };
  } catch {
    return null;
  }
}

async function walkForCodeFiles(
  dir: string,
  maxFiles: number,
  maxDepth: number,
  depth = 0,
): Promise<string[]> {
  if (depth >= maxDepth) return [];

  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
      if (IGNORED_FILES.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await walkForCodeFiles(fullPath, maxFiles - files.length, maxDepth, depth + 1);
        files.push(...subFiles);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (CODE_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch { /* skip unreadable dirs */ }

  return files;
}

function formatRepoMap(fileMaps: FileMap[], projectName: string): string {
  const lines: string[] = [`# ${projectName} — Codebase Map`, ""];

  const byDir = new Map<string, FileMap[]>();
  for (const fm of fileMaps) {
    const dir = path.dirname(fm.path) || ".";
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(fm);
  }

  const sortedDirs = [...byDir.keys()].sort();
  for (const dir of sortedDirs) {
    lines.push(`## ${dir}/`);
    const dirFiles = byDir.get(dir)!.sort((a, b) => a.path.localeCompare(b.path));
    for (const fm of dirFiles) {
      const basename = path.basename(fm.path);
      lines.push(`### ${basename} (${fm.lineCount} lines)`);
      for (const sym of fm.symbols) {
        lines.push(`  - ${sym}`);
      }
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Total: ${fileMaps.length} files, ${fileMaps.reduce((s, f) => s + f.lineCount, 0)} lines`);
  return lines.join("\n");
}

export function createRepoMapTool(projectPath: string) {
  return tool(
    async ({ maxFiles, maxDepth, directory }: { maxFiles?: number; maxDepth?: number; directory?: string }) => {
      const effectiveMaxFiles = maxFiles ?? 1000;
      const effectiveMaxDepth = maxDepth ?? 10;
      const scanRoot = directory ? path.join(projectPath, directory) : projectPath;

      const codeFiles = await walkForCodeFiles(scanRoot, effectiveMaxFiles, effectiveMaxDepth);

      const scanResults = await Promise.all(
        codeFiles.map(f => scanFile(f, projectPath)),
      );

      const fileMaps = scanResults.filter((r): r is FileMap => r !== null);

      const projectName = directory ?? path.basename(projectPath);
      const totalCodeFiles = codeFiles.length;
      const map = formatRepoMap(fileMaps, projectName);
      const scaleNote = totalCodeFiles >= 500
        ? `\n\n⚠️ LARGE REPO (${totalCodeFiles} files scanned). Use code_search and find_symbol to locate specific code — do NOT read files one by one.`
        : totalCodeFiles >= 100
          ? `\n\n📌 Medium repo (${totalCodeFiles} files). Use code_search for targeted lookups.`
          : "";
      return map + scaleNote;
    },
    {
      name: "collect_repo_map",
      description:
        "Scan the project codebase and return a condensed symbol-level map showing all files with their function, class, interface, type, and export definitions. " +
        "Use this FIRST before reading individual files — it gives you the full codebase overview in ~50 tokens per file instead of ~500+ per read_file call. " +
        "After reviewing the map, use read_file to deep-dive into specific files you need.",
      schema: z.object({
        maxFiles: z.number().optional().describe("Maximum files to scan (default: 1000). Use lower values for faster scans."),
        maxDepth: z.number().optional().describe("Maximum directory depth (default: 10)"),
        directory: z.string().optional().describe("Scan only this subdirectory (e.g. 'src/server'). Leave empty for full project scan."),
      }),
    },
  );
}
