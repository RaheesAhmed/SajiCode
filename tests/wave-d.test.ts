import { describe, it, expect } from "vitest";
import { isDomainAllowed } from "../src/browser/allowlist.js";
import { checkCdpConnection } from "../src/browser/cdp-client.js";
import {
  formatLadderResult,
  type VerificationLadderResult,
} from "../src/tools/verification-ladder.js";
import { autoShipWithReport } from "../src/tools/ship-tools.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("browser allowlist", () => {
  it("permits wildcard subdomains", () => {
    const gate = isDomainAllowed("https://staging.example.com/login", ["*.example.com"]);
    expect(gate.allowed).toBe(true);
    expect(gate.domain).toBe("staging.example.com");
  });

  it("blocks domains outside allowlist", () => {
    const gate = isDomainAllowed("https://attacker.net", ["*.example.com"]);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("not in allowlist");
  });

  it("blocks when allowlist is empty", () => {
    const gate = isDomainAllowed("https://localhost:3000", []);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("No browser allowedDomains");
  });
});

describe("CDP client", () => {
  it("reports disconnected when Chrome is not running", async () => {
    const status = await checkCdpConnection("http://127.0.0.1:59999");
    expect(status.ok).toBe(false);
  });
});

describe("verification ladder formatting", () => {
  it("includes visual review path on E2E failure", () => {
    const result: VerificationLadderResult = {
      passed: false,
      rungs: [{ name: "e2e", ok: false, summary: "Timeout waiting for selector" }],
      visualReviewPath: ".sajicode/screenshots/e2e-fail.png",
    };
    const formatted = formatLadderResult(result);
    expect(formatted).toContain("Visual review");
    expect(formatted).toContain("e2e-fail.png");
  });
});

describe("auto ship with report", () => {
  it("does not open PR when verification fails", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-ship-"));
    try {
      const result = await autoShipWithReport(tmpDir, { title: "feat: test" });
      expect(result.ok).toBe(false);
      expect(result.output).toContain("PR not created");
      expect(result.prUrl).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
