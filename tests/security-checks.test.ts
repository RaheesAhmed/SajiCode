import { describe, it, expect } from "vitest";
import { scanFileForSecurityIssues } from "../src/tools/validation-tools.js";

describe("scanFileForSecurityIssues", () => {
  it("blocks hardcoded OpenAI-style API keys", async () => {
    const keyBody = "a".repeat(48);
    const content = `const key = "sk-${keyBody}";`;
    const result = await scanFileForSecurityIssues("src/config.ts", content);

    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.blocks.some((b) => b.includes("API key"))).toBe(true);
  });

  it("blocks RSA private key headers", async () => {
    const content = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...";
    const result = await scanFileForSecurityIssues("secrets.pem", content);

    expect(result.blocks.some((b) => b.toLowerCase().includes("private key"))).toBe(true);
  });

  it("warns on eval() in TypeScript files", async () => {
    const content = 'eval("console.log(1)");';
    const result = await scanFileForSecurityIssues("src/run.ts", content);

    expect(result.warnings.some((w) => w.includes("eval"))).toBe(true);
    expect(result.blocks).toHaveLength(0);
  });

  it("passes clean content with env-based secrets", async () => {
    const content = 'const apiKey = process.env.OPENAI_API_KEY ?? "";';
    const result = await scanFileForSecurityIssues("src/env.ts", content);

    expect(result.blocks).toHaveLength(0);
  });
});
