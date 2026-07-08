import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CodeGraphIndex,
  resetCodeGraphCache,
} from "../src/context/codegraph.js";
import { compressText, resolveCompressionOptions } from "../src/context/compression.js";

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
