import { describe, it, expect } from "vitest";
import {
  redactSecretFileContent,
  isSecretFilePath,
} from "../src/secrets/redact.js";
import { wrapCommandWithVault } from "../src/secrets/vault.js";
import { applyOfflineMode } from "../src/config/offline.js";
import {
  searchRegistry,
  BUNDLED_PLUGIN_REGISTRY,
} from "../src/plugins/registry-index.js";
import { createJob, getJob, updateJob } from "../src/server/jobs.js";

describe("secrets redaction", () => {
  it("redacts .env values", () => {
    const raw = "API_KEY=super-secret\nDEBUG=true\n";
    const redacted = redactSecretFileContent(raw, ".env");
    expect(redacted).toContain("API_KEY=[REDACTED]");
    expect(redacted).not.toContain("super-secret");
  });

  it("detects secret file paths", () => {
    expect(isSecretFilePath(".env")).toBe(true);
    expect(isSecretFilePath("config/credentials.json")).toBe(true);
    expect(isSecretFilePath("src/index.ts")).toBe(false);
  });
});

describe("vault wrappers", () => {
  it("wraps with op run", () => {
    expect(
      wrapCommandWithVault("npm test", { enabled: true, wrapper: "op" }),
    ).toBe("op run -- npm test");
  });

  it("wraps with custom prefix", () => {
    expect(
      wrapCommandWithVault("npm test", {
        enabled: true,
        wrapper: "custom",
        commandPrefix: "doppler run --",
      }),
    ).toBe("doppler run -- npm test");
  });
});

describe("offline mode", () => {
  it("forces ollama provider", () => {
    const config = applyOfflineMode({
      projectPath: "/p",
      modelConfig: {
        provider: "openai",
        modelName: "gpt-4",
      },
      riskTolerance: "medium",
      offline: { enabled: true, modelName: "llama3" },
    });
    expect(config.modelConfig.provider).toBe("ollama");
    expect(config.modelConfig.modelName).toBe("llama3");
  });
});

describe("plugin registry", () => {
  it("searches bundled registry", () => {
    const hits = searchRegistry(BUNDLED_PLUGIN_REGISTRY, "stripe");
    expect(hits.some((h) => h.name.includes("stripe"))).toBe(true);
  });
});

describe("dispatch jobs", () => {
  it("tracks job lifecycle", () => {
    createJob("job-1", "build api");
    updateJob("job-1", { status: "running" });
    expect(getJob("job-1")?.status).toBe("running");
  });
});
