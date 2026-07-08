import { describe, it, expect } from "vitest";
import { safeParsePluginManifest } from "../src/plugins/manifest.js";

describe("plugin manifest", () => {
  it("accepts a valid plugin.json shape", () => {
    const result = safeParsePluginManifest({
      name: "sajicode-plugin-demo",
      version: "1.0.0",
      description: "Demo plugin",
      capabilities: ["skills", "agents"],
      permissions: { shell: false, filesystem: "project-only" },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("sajicode-plugin-demo");
      expect(result.data.capabilities).toContain("skills");
    }
  });

  it("rejects manifest without name", () => {
    const result = safeParsePluginManifest({ version: "1.0.0" });
    expect(result.success).toBe(false);
  });
});
