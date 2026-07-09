import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import type { GraphSymbol } from "./codegraph.js";

const require = createRequire(import.meta.url);

export type SupportedLang = "typescript" | "tsx" | "javascript" | "python" | "go";

export interface ParsedCallSite {
  symbol: string;
  line: number;
}

export interface ParsedFileStructure {
  symbols: GraphSymbol[];
  imports: string[];
  references: string[];
  callSites: ParsedCallSite[];
  parser: "tree-sitter";
}

type TreeNode = {
  type: string;
  startPosition: { row: number; column: number };
  startIndex: number;
  endIndex: number;
  childCount: number;
  child(index: number): TreeNode | null;
  childForFieldName(name: string): TreeNode | null;
  namedChild(index: number): TreeNode | null;
  namedChildCount: number;
};

type TreeParser = {
  setLanguage(language: unknown): void;
  parse(input: string): { rootNode: TreeNode };
};

let initPromise: Promise<boolean> | null = null;
let initError: string | null = null;
let ParserCtor: typeof import("web-tree-sitter").Parser | null = null;
let LanguageCtor: typeof import("web-tree-sitter").Language | null = null;
const languageCache = new Map<SupportedLang, unknown>();
const parserPool = new Map<SupportedLang, TreeParser>();

const SYMBOL_NODE_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "class_declaration",
  "interface_declaration",
  "type_alias_declaration",
  "method_definition",
  "function_definition",
  "class_definition",
  "method_declaration",
]);

const CALL_NODE_TYPES = new Set([
  "call_expression",
  "new_expression",
]);

const RESERVED_CALLS = new Set([
  "if", "for", "while", "switch", "catch", "function", "return", "new", "typeof", "await",
]);

function packageRoot(packageName: string): string {
  let dir = path.dirname(require.resolve(packageName));
  if (dir.endsWith(`${path.sep}bindings${path.sep}node`) || dir.endsWith("/bindings/node")) {
    dir = path.dirname(path.dirname(dir));
  }
  return dir;
}

function resolvePackageWasm(packageName: string, wasmFile: string): string {
  return path.join(packageRoot(packageName), wasmFile);
}

export function resolveLang(ext: string): SupportedLang | null {
  switch (ext.toLowerCase()) {
    case ".ts":
    case ".mts":
    case ".cts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".py":
      return "python";
    case ".go":
      return "go";
    default:
      return null;
  }
}

function wasmPathForLang(lang: SupportedLang): string {
  switch (lang) {
    case "typescript":
      return resolvePackageWasm("tree-sitter-typescript", "tree-sitter-typescript.wasm");
    case "tsx":
      return resolvePackageWasm("tree-sitter-typescript", "tree-sitter-tsx.wasm");
    case "javascript":
      return resolvePackageWasm("tree-sitter-javascript", "tree-sitter-javascript.wasm");
    case "python":
      return resolvePackageWasm("tree-sitter-python", "tree-sitter-python.wasm");
    case "go":
      return resolvePackageWasm("tree-sitter-go", "tree-sitter-go.wasm");
  }
}

export function getTreeSitterInitError(): string | null {
  return initError;
}

export async function initTreeSitter(): Promise<boolean> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const mod = await import("web-tree-sitter");
      ParserCtor = mod.Parser;
      LanguageCtor = mod.Language;

      const runtimeWasmPath = resolvePackageWasm("web-tree-sitter", "web-tree-sitter.wasm");
      const runtimeWasm = await fs.readFile(runtimeWasmPath);

      await ParserCtor.init({
        locateFile(scriptName: string) {
          if (scriptName.endsWith(".wasm")) return runtimeWasmPath;
          return scriptName;
        },
        wasmBinary: runtimeWasm,
      } as Record<string, unknown>);

      initError = null;
      return true;
    } catch (error) {
      initError = error instanceof Error ? error.message : String(error);
      initPromise = null;
      return false;
    }
  })();

  return initPromise;
}

async function getLanguage(lang: SupportedLang): Promise<unknown | null> {
  if (!LanguageCtor) return null;
  const cached = languageCache.get(lang);
  if (cached) return cached;

  try {
    const wasmBytes = await fs.readFile(wasmPathForLang(lang));
    const loaded = await LanguageCtor.load(new Uint8Array(wasmBytes));
    languageCache.set(lang, loaded);
    return loaded;
  } catch {
    return null;
  }
}

async function getParser(lang: SupportedLang): Promise<TreeParser | null> {
  const existing = parserPool.get(lang);
  if (existing) return existing;
  if (!ParserCtor) return null;

  const language = await getLanguage(lang);
  if (!language) return null;

  const parser = new ParserCtor() as TreeParser;
  parser.setLanguage(language);
  parserPool.set(lang, parser);
  return parser;
}

function lineNumber(node: TreeNode): number {
  return node.startPosition.row + 1;
}

function walk(node: TreeNode, visit: (node: TreeNode) => void): void {
  visit(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walk(child, visit);
  }
}

function symbolKind(nodeType: string, text: string): GraphSymbol["kind"] {
  if (nodeType.includes("class")) return "class";
  if (nodeType.includes("interface") || nodeType.includes("type_alias")) return "type";
  if (nodeType.includes("function") || nodeType.includes("method")) return "function";
  if (/^(const|let|var)\s/.test(text)) return "variable";
  return "other";
}

function extractName(node: TreeNode, content: string): string | null {
  const nameNode =
    node.childForFieldName("name")
    ?? node.childForFieldName("declarator")?.childForFieldName("name")
    ?? null;

  if (nameNode) {
    const text = content.slice(nameNode.startIndex, nameNode.endIndex).trim();
    const match = text.match(/^[\w$]+/);
    if (match) return match[0];
  }

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === "identifier" || child?.type === "type_identifier" || child?.type === "property_identifier") {
      const text = content.slice(child.startIndex, child.endIndex).trim();
      const match = text.match(/^[\w$]+/);
      if (match) return match[0];
    }
  }

  return null;
}

function extractCallTarget(node: TreeNode, content: string): string | null {
  const fnNode = node.childForFieldName("function") ?? node.namedChild(0);
  if (!fnNode) return null;

  if (fnNode.type === "identifier" || fnNode.type === "property_identifier") {
    const text = content.slice(fnNode.startIndex, fnNode.endIndex).trim();
    const match = text.match(/^[\w$]+/);
    return match?.[0] ?? null;
  }

  if (fnNode.type === "member_expression") {
    const prop = fnNode.childForFieldName("property") ?? fnNode.namedChild(fnNode.namedChildCount - 1);
    if (prop) {
      const text = content.slice(prop.startIndex, prop.endIndex).trim();
      const match = text.match(/^[\w$]+/);
      return match?.[0] ?? null;
    }
  }

  return null;
}

function extractImportPath(node: TreeNode, content: string): string | null {
  const sourceNode = node.childForFieldName("source");
  if (sourceNode) {
    const text = content.slice(sourceNode.startIndex, sourceNode.endIndex);
    const match = text.match(/["']([^"']+)["']/);
    return match?.[1] ?? null;
  }

  const slice = content.slice(node.startIndex, node.endIndex);
  const fromMatch = slice.match(/from\s+["']([^"']+)["']/);
  if (fromMatch?.[1]) return fromMatch[1];

  const importMatch = slice.match(/import\s+["']([^"']+)["']/);
  if (importMatch?.[1]) return importMatch[1];

  const pyMatch = slice.match(/^from\s+(\S+)\s+import/);
  if (pyMatch?.[1]) return pyMatch[1];

  const goMatch = slice.match(/import\s+(?:\w+\s+)?["']([^"']+)["']/);
  if (goMatch?.[1]) return goMatch[1];

  return null;
}

function extractVariableFunctions(node: TreeNode, content: string, symbols: GraphSymbol[]): void {
  if (node.type !== "variable_declarator" && node.type !== "lexical_declaration") return;

  walk(node, (child) => {
    if (child.type !== "variable_declarator") return;
    const name = extractName(child, content);
    const value = child.childForFieldName("value");
    if (!name || !value) return;
    if (value.type !== "arrow_function" && value.type !== "function_expression") return;

    const lineText = content.slice(child.startIndex, child.endIndex).split("\n")[0]?.trim() ?? name;
    symbols.push({
      name,
      kind: "function",
      line: lineNumber(child),
      signature: lineText,
    });
  });
}

export async function parseWithTreeSitter(
  content: string,
  lang: SupportedLang,
): Promise<ParsedFileStructure | null> {
  const ready = await initTreeSitter();
  if (!ready) return null;

  const parser = await getParser(lang);
  if (!parser) return null;

  const tree = parser.parse(content);
  const symbols: GraphSymbol[] = [];
  const imports = new Set<string>();
  const callSites: ParsedCallSite[] = [];

  walk(tree.rootNode, (node) => {
    if (node.type === "import_statement" || node.type === "import_declaration" || node.type === "import_from_statement") {
      const imp = extractImportPath(node, content);
      if (imp) imports.add(imp);
      return;
    }

    if (SYMBOL_NODE_TYPES.has(node.type)) {
      const name = extractName(node, content);
      if (name) {
        const lineText = content.slice(node.startIndex, node.endIndex).split("\n")[0]?.trim() ?? name;
        symbols.push({
          name,
          kind: symbolKind(node.type, lineText),
          line: lineNumber(node),
          signature: lineText.replace(/\{.*$/, "").trim(),
        });
      }
    }

    if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
      extractVariableFunctions(node, content, symbols);
    }

    if (CALL_NODE_TYPES.has(node.type)) {
      const target = extractCallTarget(node, content);
      if (target) {
        callSites.push({ symbol: target, line: lineNumber(node) });
      }
    }
  });

  const references = [...new Set(callSites.map((c) => c.symbol))];

  return {
    symbols,
    imports: [...imports],
    references,
    callSites,
    parser: "tree-sitter",
  };
}

export function extractCallSitesRegex(content: string): ParsedCallSite[] {
  const sites: ParsedCallSite[] = [];
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    const re = /\b([A-Za-z_$][\w$]*)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      const symbol = match[1]!;
      if (RESERVED_CALLS.has(symbol)) continue;
      sites.push({ symbol, line: index + 1 });
    }
  });

  return sites;
}

export async function resetTreeSitterForTests(): Promise<void> {
  initPromise = null;
  initError = null;
  ParserCtor = null;
  LanguageCtor = null;
  languageCache.clear();
  parserPool.clear();
}
