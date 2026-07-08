import fs from "node:fs/promises";
import path from "node:path";

const GRAPH_VERSION = 1;
const GRAPH_FILE = "codegraph.json";

const IGNORED_DIRS = new Set([
  "node_modules", "dist", "build", "coverage", ".git",
  ".next", ".nuxt", "__pycache__", ".cache", ".turbo",
  ".sajicode", ".vscode", ".idea", "vendor", "target",
]);

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".cs", ".rb", ".php",
]);

const SYMBOL_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/,
    /^export\s+(?:default\s+)?class\s+(\w+)/,
    /^export\s+(?:const|let|var)\s+(\w+)/,
    /^export\s+(?:default\s+)?interface\s+(\w+)/,
    /^export\s+(?:default\s+)?type\s+(\w+)/,
    /^(?:async\s+)?function\s+(\w+)/,
    /^class\s+(\w+)/,
  ],
  python: [/^def\s+(\w+)\s*\(/, /^class\s+(\w+)/],
  go: [/^func\s+(\w+)\s*\(/, /^type\s+(\w+)\s+struct/],
};

const IMPORT_PATTERNS = [
  /^import\s+(?:type\s+)?(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']+)["']/,
  /^import\s+["']([^"']+)["']/,
  /^import\s+(\w+)/,
  /^from\s+(\S+)\s+import/,
  /^require\s*\(\s*["']([^"']+)["']\s*\)/,
];

export interface GraphSymbol {
  name: string;
  kind: "function" | "class" | "variable" | "type" | "other";
  line: number;
  signature: string;
}

export interface GraphFileEntry {
  mtimeMs: number;
  lineCount: number;
  symbols: GraphSymbol[];
  imports: string[];
  /** Symbol names referenced in this file (heuristic call graph). */
  references: string[];
  rank: number;
}

export interface CodeGraphSnapshot {
  version: number;
  projectPath: string;
  builtAt: string;
  files: Record<string, GraphFileEntry>;
}

const storeCache = new Map<string, CodeGraphIndex>();

function graphPath(projectPath: string): string {
  return path.join(projectPath, ".sajicode", GRAPH_FILE);
}

function getLanguage(ext: string): string {
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "typescript";
  if (ext === ".py") return "python";
  if (ext === ".go") return "go";
  return "typescript";
}

function classifySymbol(line: string): GraphSymbol["kind"] {
  if (/class\s/.test(line)) return "class";
  if (/interface\s|type\s/.test(line)) return "type";
  if (/function\s|def\s|fn\s/.test(line)) return "function";
  if (/const\s|let\s|var\s/.test(line)) return "variable";
  return "other";
}

function extractSymbols(content: string, ext: string): GraphSymbol[] {
  const lang = getLanguage(ext);
  const patterns = SYMBOL_PATTERNS[lang] ?? SYMBOL_PATTERNS["typescript"]!;
  const symbols: GraphSymbol[] = [];

  content.split("\n").forEach((line, index) => {
    const trimmed = line.trimStart();
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match?.[1]) {
        symbols.push({
          name: match[1],
          kind: classifySymbol(trimmed),
          line: index + 1,
          signature: trimmed.replace(/\{.*$/, "").trim(),
        });
        break;
      }
    }
  });

  return symbols;
}

function extractImports(content: string): string[] {
  const imports = new Set<string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    for (const pattern of IMPORT_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match?.[1]) imports.add(match[1]);
    }
  }
  return [...imports];
}

function extractReferences(content: string, knownSymbols: Set<string>): string[] {
  const refs = new Set<string>();
  for (const name of knownSymbols) {
    const pattern = new RegExp(`\\b${name}\\b`);
    if (pattern.test(content)) refs.add(name);
  }
  return [...refs];
}

function computePageRanks(files: Record<string, GraphFileEntry>): void {
  const keys = Object.keys(files);
  if (keys.length === 0) return;

  const scores = new Map<string, number>();
  for (const key of keys) scores.set(key, 1);

  for (let iter = 0; iter < 20; iter++) {
    const next = new Map<string, number>();
    for (const key of keys) next.set(key, 0.15);

    for (const [filePath, entry] of Object.entries(files)) {
      const outLinks = new Set<string>();
      for (const imp of entry.imports) {
        const resolved = resolveImportPath(filePath, imp);
        if (resolved && files[resolved]) outLinks.add(resolved);
      }
      for (const ref of entry.references) {
        for (const [otherPath, other] of Object.entries(files)) {
          if (otherPath === filePath) continue;
          if (other.symbols.some((s) => s.name === ref)) outLinks.add(otherPath);
        }
      }

      const share = scores.get(filePath)! / Math.max(outLinks.size, 1);
      for (const target of outLinks) {
        next.set(target, (next.get(target) ?? 0) + 0.85 * share);
      }
    }

    for (const key of keys) scores.set(key, next.get(key)!);
  }

  for (const key of keys) {
    files[key]!.rank = scores.get(key) ?? 1;
  }
}

function resolveImportPath(fromFile: string, importPath: string): string | null {
  if (importPath.startsWith(".")) {
    const dir = path.dirname(fromFile);
    let resolved = path.posix.normalize(path.posix.join(dir, importPath));
    if (!resolved.endsWith(".ts") && !resolved.endsWith(".js")) {
      resolved += ".ts";
    }
    return resolved;
  }
  return null;
}

async function walkCodeFiles(dir: string, root: string, depth = 0): Promise<string[]> {
  if (depth > 12) return [];
  const files: string[] = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkCodeFiles(full, root, depth + 1)));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXTENSIONS.has(ext)) {
        files.push(path.relative(root, full).replace(/\\/g, "/"));
      }
    }
  }

  return files;
}

export class CodeGraphIndex {
  private snapshot: CodeGraphSnapshot;

  private constructor(snapshot: CodeGraphSnapshot) {
    this.snapshot = snapshot;
  }

  static async load(projectPath: string): Promise<CodeGraphIndex> {
    const cached = storeCache.get(projectPath);
    if (cached) return cached;

    const filePath = graphPath(projectPath);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as CodeGraphSnapshot;
      if (parsed.version === GRAPH_VERSION && parsed.projectPath === projectPath) {
        const index = new CodeGraphIndex(parsed);
        storeCache.set(projectPath, index);
        return index;
      }
    } catch {
      // build fresh
    }

    const index = new CodeGraphIndex({
      version: GRAPH_VERSION,
      projectPath,
      builtAt: new Date().toISOString(),
      files: {},
    });
    storeCache.set(projectPath, index);
    return index;
  }

  async save(): Promise<void> {
    const filePath = graphPath(this.snapshot.projectPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    this.snapshot.builtAt = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(this.snapshot, null, 2), "utf-8");
  }

  get isEmpty(): boolean {
    return Object.keys(this.snapshot.files).length === 0;
  }

  async buildFullIndex(): Promise<number> {
    const root = this.snapshot.projectPath;
    const relPaths = await walkCodeFiles(root, root);
    let updated = 0;

    for (const relPath of relPaths) {
      const changed = await this.updateFile(relPath);
      if (changed) updated++;
    }

    this.recomputeRanks();
    await this.save();
    return updated;
  }

  async updateFile(relPath: string): Promise<boolean> {
    const normalized = relPath.replace(/\\/g, "/");
    const absPath = path.join(this.snapshot.projectPath, normalized);

    let stat;
    try {
      stat = await fs.stat(absPath);
    } catch {
      delete this.snapshot.files[normalized];
      return true;
    }

    const existing = this.snapshot.files[normalized];
    if (existing && existing.mtimeMs === stat.mtimeMs) return false;

    const content = await fs.readFile(absPath, "utf-8");
    const ext = path.extname(normalized).toLowerCase();
    const symbols = extractSymbols(content, ext);
    const imports = extractImports(content);
    const allSymbolNames = new Set(
      Object.values(this.snapshot.files).flatMap((f) => f.symbols.map((s) => s.name)),
    );
    for (const sym of symbols) allSymbolNames.add(sym.name);

    this.snapshot.files[normalized] = {
      mtimeMs: stat.mtimeMs,
      lineCount: content.split("\n").length,
      symbols,
      imports,
      references: extractReferences(content, allSymbolNames),
      rank: 1,
    };

    return true;
  }

  recomputeRanks(): void {
    computePageRanks(this.snapshot.files);
  }

  findCallers(symbolName: string): Array<{ file: string; line: number; snippet: string }> {
    const hits: Array<{ file: string; line: number; snippet: string }> = [];
    const needle = symbolName.trim();
    if (!needle) return hits;

    for (const [filePath, entry] of Object.entries(this.snapshot.files)) {
      if (!entry.references.includes(needle)) continue;
      hits.push({
        file: filePath,
        line: entry.symbols[0]?.line ?? 1,
        snippet: `references ${needle}`,
      });
    }

    return hits.sort((a, b) => a.file.localeCompare(b.file));
  }

  impactOf(symbolName: string): { definedIn: string | null; affectedFiles: string[] } {
    let definedIn: string | null = null;
    for (const [filePath, entry] of Object.entries(this.snapshot.files)) {
      if (entry.symbols.some((s) => s.name === symbolName)) {
        definedIn = filePath;
        break;
      }
    }

    const affected = new Set<string>();
    for (const [filePath, entry] of Object.entries(this.snapshot.files)) {
      if (entry.references.includes(symbolName)) affected.add(filePath);
      if (definedIn && entry.imports.some((imp) => resolveImportPath(filePath, imp) === definedIn)) {
        affected.add(filePath);
      }
    }

    return { definedIn, affectedFiles: [...affected].sort() };
  }

  getRankedMap(options: { focus?: string; maxTokens?: number } = {}): string {
    const focus = options.focus?.toLowerCase() ?? "";
    const budgetChars = (options.maxTokens ?? 2000) * 4;

    const scored = Object.entries(this.snapshot.files).map(([filePath, entry]) => {
      let score = entry.rank;
      if (focus) {
        const haystack = [
          filePath,
          ...entry.symbols.map((s) => s.name),
          ...entry.symbols.map((s) => s.signature),
        ]
          .join(" ")
          .toLowerCase();
        if (haystack.includes(focus)) score *= 3;
      }
      return { filePath, entry, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const lines: string[] = [
      `# Code Graph Map (${Object.keys(this.snapshot.files).length} files)`,
      focus ? `Focus: "${options.focus}"` : "",
      "",
    ].filter(Boolean);

    let used = lines.join("\n").length;
    let included = 0;

    for (const { filePath, entry } of scored) {
      const block = [
        `## ${filePath} (rank ${entry.rank.toFixed(2)}, ${entry.lineCount} lines)`,
        ...entry.symbols.slice(0, 12).map((s) => `  L${s.line} ${s.kind} ${s.signature}`),
        entry.imports.length ? `  imports: ${entry.imports.slice(0, 6).join(", ")}` : "",
        "",
      ]
        .filter(Boolean)
        .join("\n");

      if (used + block.length > budgetChars && included > 0) break;
      lines.push(block);
      used += block.length;
      included++;
    }

    lines.push(`---\nIncluded ${included}/${scored.length} files within ~${options.maxTokens ?? 2000} token budget.`);
    lines.push("Use find_callers / impact_of for structural queries.");
    return lines.join("\n");
  }
}

export async function getCodeGraph(projectPath: string): Promise<CodeGraphIndex> {
  return CodeGraphIndex.load(projectPath);
}

export async function refreshCodeGraphFile(
  projectPath: string,
  relOrAbsPath: string,
): Promise<void> {
  const index = await getCodeGraph(projectPath);
  const rel = path.isAbsolute(relOrAbsPath)
    ? path.relative(projectPath, relOrAbsPath).replace(/\\/g, "/")
    : relOrAbsPath.replace(/\\/g, "/");

  if (!rel || rel.startsWith("..")) return;

  await index.updateFile(rel);
  index.recomputeRanks();
  await index.save();
}

export function resetCodeGraphCache(): void {
  storeCache.clear();
}
