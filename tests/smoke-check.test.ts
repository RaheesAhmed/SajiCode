import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectSmokeConfig, formatSmokeResult } from "../src/tools/smoke-check.js";
import { formatLadderResult } from "../src/tools/verification-ladder.js";

describe("smoke-check", () => {
  it("detects dev script and port from package.json", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "smoke-detect-"));
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ scripts: { dev: "next dev -p 4000" } }),
    );

    const detected = await detectSmokeConfig(tmpDir);
    expect(detected?.startCommand).toBe("next dev -p 4000");
    expect(detected?.healthUrl).toBe("http://localhost:4000/");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("formats smoke results", () => {
    const text = formatSmokeResult({
      ok: true,
      message: "passed",
      durationMs: 1200,
      startupLog: "listening",
    });
    expect(text).toContain("✅");
    expect(text).toContain("1200ms");
  });
});

describe("verification ladder", () => {
  it("formats ladder summary", () => {
    const text = formatLadderResult({
      passed: false,
      rungs: [
        { name: "build", ok: true, summary: "ok" },
        { name: "tests", ok: false, summary: "failed" },
      ],
    });
    expect(text).toContain("FAILED");
    expect(text).toContain("tests");
  });
});
