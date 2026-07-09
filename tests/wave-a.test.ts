import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CodeGraphIndex,
  resetCodeGraphCache,
} from "../src/context/codegraph.js";
import { initTreeSitter, parseWithTreeSitter, getTreeSitterInitError } from "../src/context/tree-sitter-parser.js";
import { compressText, resolveCompressionOptions } from "../src/context/compression.js";

describe("tree-sitter parser", () => {
  it("initializes and parses TypeScript call expressions", async () => {
    const ok = await initTreeSitter();
    expect(ok, getTreeSitterInitError() ?? "init failed").toBe(true);

    const parsed = await parseWithTreeSitter(
      "export function other() { return helper(); }",
      "typescript",
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.symbols.some((s) => s.name === "other")).toBe(true);
    expect(parsed!.references).toContain("helper");
    expect(parsed!.callSites.some((c) => c.symbol === "helper")).toBe(true);
  });
});

describe("code graph", () => {
  let tmpDir: string;

  beforeEach(async () => {
    resetCodeGraphCache();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-graph-"));
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "src", "utils.ts"),
      [
        "export function helper() { return 1; }",
        "export class HelperService { run() { return helper(); } }",
        "import { other } from './other';",
      ].join("\n"),
      "utf-8",
    );
    await fs.writeFile(
      path.join(tmpDir, "src", "other.ts"),
      "export function other() { return helper(); }\n",
      "utf-8",
    );
  });

  afterEach(async () => {
    resetCodeGraphCache();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("indexes symbols and finds impact", async () => {
    const graph = await CodeGraphIndex.load(tmpDir);
    await graph.buildFullIndex();

    const impact = graph.impactOf("helper");
    expect(impact.definedIn).toBe("src/utils.ts");
    expect(impact.affectedFiles.length).toBeGreaterThan(0);
  });

  it("uses tree-sitter AST for call sites with line numbers", async () => {
    const graph = await CodeGraphIndex.load(tmpDir);
    await graph.buildFullIndex();

    const callers = graph.findCallers("helper");
    const otherCall = callers.find((c) => c.file === "src/other.ts");
    expect(otherCall).toBeDefined();
    expect(otherCall!.snippet).toContain("L");
    expect(otherCall!.line).toBeGreaterThan(0);
  });

  it("detects arrow function exports via AST", async () => {
    await fs.writeFile(
      path.join(tmpDir, "src", "api.ts"),
      "export const fetchData = async () => helper();\n",
      "utf-8",
    );
    const graph = await CodeGraphIndex.load(tmpDir);
    await graph.buildFullIndex();
    const impact = graph.impactOf("fetchData");
    expect(impact.definedIn).toBe("src/api.ts");
  });

  it("returns ranked map within budget", async () => {
    const graph = await CodeGraphIndex.load(tmpDir);
    await graph.buildFullIndex();
    const map = graph.getRankedMap({ focus: "helper", maxTokens: 500 });
    expect(map).toContain("src/utils.ts");
    expect(map).toContain("token budget");
  });
});

describe("compression", () => {
  it("compresses large content", () => {
    const body = Array.from({ length: 400 }, (_, i) =>
      i % 20 === 0 ? `export function fn${i}() {}` : `// filler line ${i}`,
    ).join("\n");

    const out = compressText(body, {
      query: "fn120",
      minChars: 1000,
      maxChars: 2000,
    });

    expect(out.length).toBeLessThan(body.length);
    expect(out).toContain("fn120");
    expect(out).toContain("[compressed");
  });

  it("skips small content", () => {
    const short = "hello world";
    expect(compressText(short, { minChars: 100 })).toBe(short);
  });

  it("resolves compression options from config", () => {
    const opts = resolveCompressionOptions(
      { enabled: true, minChars: 100 },
      "read_file",
      "UserService",
    );
    expect(opts?.query).toBe("UserService");
    expect(resolveCompressionOptions({ enabled: false }, "read_file")).toBeNull();
  });
});
