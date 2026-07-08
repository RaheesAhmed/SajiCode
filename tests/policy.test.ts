import { describe, it, expect } from "vitest";
import {
  evaluateToolPolicy,
  countWrittenPaths,
} from "../src/policy/engine.js";
import { mergePolicyConfigs } from "../src/policy/loader.js";
import { isAsyncSubagentsEnabled } from "../src/agents/async-subagents.js";

describe("policy engine", () => {
  it("blocks writes to protected paths", () => {
    const decision = evaluateToolPolicy(
      { protectedPaths: ["migrations/", ".github/workflows/"] },
      {
        toolName: "write_file",
        args: { file_path: "migrations/001_init.sql", content: "x" },
        paths: ["migrations/001_init.sql"],
        sessionFilesWritten: 0,
        projectPath: "/proj",
      },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("protected path");
  });

  it("blocks forbidden npm dependencies", () => {
    const decision = evaluateToolPolicy(
      { forbiddenDependencies: ["left-pad"] },
      {
        toolName: "execute",
        args: { command: "npm install left-pad" },
        paths: [],
        sessionFilesWritten: 0,
        projectPath: "/proj",
      },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("left-pad");
  });

  it("enforces maxFilesPerSession", () => {
    const decision = evaluateToolPolicy(
      { maxFilesPerSession: 5 },
      {
        toolName: "apply_file_batch",
        args: {},
        paths: ["src/a.ts"],
        sessionFilesWritten: 5,
        projectPath: "/proj",
      },
    );
    expect(decision.allowed).toBe(false);
  });

  it("mergePolicyConfigs unions path and dependency rules", () => {
    const merged = mergePolicyConfigs(
      { protectedPaths: ["a/"] },
      { protectedPaths: ["b/"], forbiddenDependencies: ["evil-pkg"] },
    );
    expect(merged.protectedPaths).toEqual(["a/", "b/"]);
    expect(merged.forbiddenDependencies).toEqual(["evil-pkg"]);
  });

  it("countWrittenPaths deduplicates paths", () => {
    expect(countWrittenPaths(["src/a.ts", "src/a.ts", "src/b.ts"])).toBe(2);
  });
});

describe("async subagents config", () => {
  it("defaults enabled", () => {
    expect(isAsyncSubagentsEnabled(undefined)).toBe(true);
    expect(isAsyncSubagentsEnabled({ enabled: false })).toBe(false);
  });
});
