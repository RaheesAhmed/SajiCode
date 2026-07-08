import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  activatePersona,
  resolveActivePersona,
  listPersonaPacks,
  formatNonDeveloperGuidance,
} from "../src/persona/index.js";
import {
  runStructuredDebate,
  formatDebateRound,
} from "../src/cognition/debate.js";
import { writeResearchReport } from "../src/tools/research-tools.js";

describe("persona system", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-persona-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("lists bundled personas", async () => {
    const packs = await listPersonaPacks(tmpDir);
    expect(packs.some((p) => p.id === "engineer")).toBe(true);
    expect(packs.some((p) => p.id === "startup-cto")).toBe(true);
  });

  it("activates persona to project file", async () => {
    const dest = await activatePersona(tmpDir, "business-ops");
    expect(dest).toContain("persona.md");
    const active = await resolveActivePersona(tmpDir);
    expect(active.content).toContain("Business Ops");
  });

  it("formats non-developer guidance for beginners", () => {
    const text = formatNonDeveloperGuidance("beginner");
    expect(text).toContain("Non-Developer Mode");
    expect(formatNonDeveloperGuidance("expert")).toBe("");
  });
});

describe("debate protocol", () => {
  it("synthesizes structured debate", () => {
    const round = runStructuredDebate("Pick database", [
      { agent: "backend-lead", position: "Postgres", rationale: "Relational fits billing", confidence: 0.9 },
      { agent: "data-ai-lead", position: "MongoDB", rationale: "Flexible schema", confidence: 0.6 },
    ]);
    const formatted = formatDebateRound(round);
    expect(formatted).toContain("Postgres");
    expect(formatted).toContain("write_adr");
  });
});

describe("research reports", () => {
  it("writes to .sajicode/research", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-research-"));
    const out = await writeResearchReport(tmpDir, "Stripe vs Paddle", "## Summary\nUse Stripe.");
    expect(out.replace(/\\/g, "/")).toContain(".sajicode/research");
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
