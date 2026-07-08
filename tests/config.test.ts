import { describe, it, expect } from "vitest";
import {
  safeParseConfigFile,
  findUnknownConfigKeys,
  formatConfigValidationErrors,
} from "../src/config/schema.js";
import { z } from "zod";

describe("config schema", () => {
  it("accepts valid config with model block", () => {
    const result = safeParseConfigFile({
      model: { modelName: "gpt-4o", provider: "openai" },
      riskTolerance: "medium",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model?.modelName).toBe("gpt-4o");
    }
  });

  it("rejects invalid risk tolerance", () => {
    const result = safeParseConfigFile({
      riskTolerance: "extreme",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("riskTolerance");
    }
  });

  it("flags unknown top-level keys", () => {
    const unknown = findUnknownConfigKeys({
      model: { modelName: "test" },
      riskTolerence: "medium",
      fooBar: true,
    });

    expect(unknown).toContain("riskTolerence");
    expect(unknown).toContain("fooBar");
    expect(unknown).not.toContain("model");
  });

  it("formats validation errors readably", () => {
    const parsed = safeParseConfigFile({ riskTolerance: "invalid" });
    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      const formatted = formatConfigValidationErrors(
        z.object({ riskTolerance: z.enum(["low", "medium", "high"]) }).safeParse({ riskTolerance: "invalid" }).error!,
      );
      expect(formatted).toContain("Invalid .sajicode/config.json");
    }
  });
});
