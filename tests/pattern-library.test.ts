import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  getRelevantPatterns,
  formatPatternsForPrompt,
  STATIC_PATTERNS,
} from "../src/memory/pattern-library.js";

describe("pattern-library", () => {
  it("matches static patterns by tech stack", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-test-"));
    const patterns = await getRelevantPatterns(tmpDir, ["prisma", "typescript"]);

    expect(patterns.some((p) => p.id === "prisma-nullish-coalescing")).toBe(true);
    expect(patterns.some((p) => p.id === "nextjs-server-components-hooks")).toBe(false);
  });

  it("formats patterns for prompt with stack labels", () => {
    const sample = STATIC_PATTERNS.filter((p) => p.tech.includes("stripe")).slice(0, 1);
    const formatted = formatPatternsForPrompt(sample);

    expect(formatted).toContain("Known Patterns & Pitfalls");
    expect(formatted).toContain("STRIPE");
  });

  it("returns empty-state prompt when no patterns match", () => {
    const formatted = formatPatternsForPrompt([]);
    expect(formatted).toContain("No specific patterns found");
  });
});
