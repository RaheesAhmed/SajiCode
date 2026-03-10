import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

const IGNORED_DIRS = [
  "node_modules", "dist", "build", "coverage", ".git",
  ".next", ".nuxt", "__pycache__", ".cache", ".turbo",
  ".sajicode", ".vscode", ".idea", "vendor", "target",
];

interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

async function searchWithGrep(
  projectPath: string,
  pattern: string,
  options: { fileGlob?: string | undefined; maxResults?: number; caseSensitive?: boolean }
): Promise<SearchMatch[]> {
  const maxResults = options.maxResults ?? 30;
  const args: string[] = [
    "--line-number",
    "--no-heading",
    "--color=never",
    "--max-count=5",
    `--max-count=${Math.min(maxResults, 100)}`,
  ];

  if (!options.caseSensitive) args.push("--ignore-case");

  for (const dir of IGNORED_DIRS) {
    args.push(`--exclude-dir=${dir}`);
  }

  if (options.fileGlob) {
    args.push(`--include=${options.fileGlob}`);
  }

  args.push("--recursive", pattern, projectPath);

  try {
    const { stdout } = await execFileAsync("grep", args, {
      maxBuffer: 1024 * 1024,
      timeout: 15000,
    });

    const matches: SearchMatch[] = [];
    for (const line of stdout.split("\n").filter(Boolean)) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const filePart = line.substring(0, colonIdx);
      const rest = line.substring(colonIdx + 1);
      const secondColon = rest.indexOf(":");
      if (secondColon === -1) continue;

      const lineNum = parseInt(rest.substring(0, secondColon), 10);
      const content = rest.substring(secondColon + 1).trim();

      if (!isNaN(lineNum)) {
        matches.push({
          file: path.relative(projectPath, filePart).replace(/\\/g, "/"),
          line: lineNum,
          content: content.substring(0, 200),
        });
      }

      if (matches.length >= maxResults) break;
    }
    return matches;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return searchWithNodeFallback(projectPath, pattern, options);
    }
    if (error.status === 1) return [];
    throw error;
  }
}

async function searchWithNodeFallback(
  projectPath: string,
  pattern: string,
  options: { fileGlob?: string | undefined; maxResults?: number; caseSensitive?: boolean }
): Promise<SearchMatch[]> {
  const maxResults = options.maxResults ?? 30;
  const regex = new RegExp(pattern, options.caseSensitive ? "g" : "gi");
  const matches: SearchMatch[] = [];

  async function walk(dir: string): Promise<void> {
    if (matches.length >= maxResults) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (matches.length >= maxResults) return;
        if (entry.name.startsWith(".") || IGNORED_DIRS.includes(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (![".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".md", ".json", ".css", ".html"].includes(ext)) continue;

          if (options.fileGlob) {
            const globExt = options.fileGlob.replace("*", "");
            if (!entry.name.endsWith(globExt)) continue;
          }

          try {
            const content = await fs.readFile(fullPath, "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i]!)) {
                matches.push({
                  file: path.relative(projectPath, fullPath).replace(/\\/g, "/"),
                  line: i + 1,
                  content: lines[i]!.trim().substring(0, 200),
                });
                if (matches.length >= maxResults) return;
              }
              regex.lastIndex = 0;
            }
          } catch { /* skip unreadable */ }
        }
      }
    } catch { /* skip */ }
  }

  await walk(projectPath);
  return matches;
}

function formatSearchResults(matches: SearchMatch[], query: string): string {
  if (matches.length === 0) return `No matches found for "${query}".`;

  const byFile = new Map<string, SearchMatch[]>();
  for (const m of matches) {
    if (!byFile.has(m.file)) byFile.set(m.file, []);
    byFile.get(m.file)!.push(m);
  }

  const lines: string[] = [`Found ${matches.length} matches for "${query}" in ${byFile.size} files:`, ""];
  for (const [file, fileMatches] of byFile) {
    lines.push(`📄 ${file}:`);
    for (const m of fileMatches) {
      lines.push(`  L${m.line}: ${m.content}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function createCodeSearchTool(projectPath: string) {
  return tool(
    async (input: {
      query: string;
      fileType?: string;
      maxResults?: number;
      caseSensitive?: boolean;
    }) => {
      const matches = await searchWithGrep(projectPath, input.query, {
        fileGlob: input.fileType,
        maxResults: input.maxResults ?? 30,
        caseSensitive: input.caseSensitive ?? false,
      });
      return formatSearchResults(matches, input.query);
    },
    {
      name: "code_search",
      description:
        "Search the codebase for a pattern across all files. Returns matching lines with file paths and line numbers. " +
        "MUCH faster than reading files one by one. Use this FIRST to find relevant code before using read_file. " +
        "For large repos (1000+ files), this is the only efficient way to find what you need.",
      schema: z.object({
        query: z.string().describe("Search pattern (text or regex). Examples: 'handleSubmit', 'async function create', 'import.*express'"),
        fileType: z.string().optional().describe("Filter by file extension glob (e.g. '*.ts', '*.py', '*.tsx')"),
        maxResults: z.number().optional().describe("Maximum results to return (default: 30)"),
        caseSensitive: z.boolean().optional().describe("Case-sensitive search (default: false)"),
      }),
    }
  );
}

export function createFindSymbolTool(projectPath: string) {
  return tool(
    async (input: { symbol: string; fileType?: string }) => {
      const symbolPatterns = [
        `function ${input.symbol}`,
        `class ${input.symbol}`,
        `interface ${input.symbol}`,
        `type ${input.symbol}`,
        `const ${input.symbol}`,
        `export.*${input.symbol}`,
        `def ${input.symbol}`,
      ];

      const allMatches: SearchMatch[] = [];
      for (const pattern of symbolPatterns) {
        const matches = await searchWithGrep(projectPath, pattern, {
          fileGlob: input.fileType,
          maxResults: 10,
          caseSensitive: true,
        });
        allMatches.push(...matches);
      }

      const unique = allMatches.filter(
        (m, i, arr) => arr.findIndex((x) => x.file === m.file && x.line === m.line) === i
      );

      if (unique.length === 0) return `Symbol "${input.symbol}" not found in the codebase.`;

      const lines: string[] = [`Found "${input.symbol}" defined in ${unique.length} locations:`, ""];
      for (const m of unique) {
        lines.push(`📍 ${m.file}:${m.line} → ${m.content}`);
      }
      return lines.join("\n");
    },
    {
      name: "find_symbol",
      description:
        "Find where a specific function, class, type, or variable is DEFINED in the codebase. " +
        "Unlike code_search (which finds all occurrences), this specifically looks for definitions. " +
        "Use when you need to understand how something is implemented before modifying it.",
      schema: z.object({
        symbol: z.string().describe("Symbol name to find (e.g. 'UserService', 'handleLogin', 'BookmarkType')"),
        fileType: z.string().optional().describe("Filter by file extension glob (e.g. '*.ts')"),
      }),
    }
  );
}

export function createCodeSearchTools(projectPath: string) {
  return [
    createCodeSearchTool(projectPath),
    createFindSymbolTool(projectPath),
  ];
}
