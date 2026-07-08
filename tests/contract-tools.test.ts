import { describe, it, expect } from "vitest";
import { detectContractFileConflicts } from "../src/tools/contract-tools.js";

describe("detectContractFileConflicts", () => {
  it("returns empty array when no drafts overlap", () => {
    const conflicts = detectContractFileConflicts([
      {
        agentName: "backend-lead",
        apisExposed: [],
        typesExposed: [],
        filesWillWrite: ["src/api/users.ts"],
        envVarsNeeded: [],
        needsFrom: [],
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        agentName: "frontend-lead",
        apisExposed: [],
        typesExposed: [],
        filesWillWrite: ["src/components/Users.tsx"],
        envVarsNeeded: [],
        needsFrom: [],
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(conflicts).toEqual([]);
  });

  it("detects when two agents claim the same file", () => {
    const conflicts = detectContractFileConflicts([
      {
        agentName: "backend-lead",
        apisExposed: [],
        typesExposed: [],
        filesWillWrite: ["src/shared/types.ts"],
        envVarsNeeded: [],
        needsFrom: [],
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        agentName: "frontend-lead",
        apisExposed: [],
        typesExposed: [],
        filesWillWrite: ["src/shared/types.ts", "src/App.tsx"],
        envVarsNeeded: [],
        needsFrom: [],
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({
      file: "src/shared/types.ts",
      owners: ["backend-lead", "frontend-lead"],
    });
  });

  it("detects multiple conflicting files", () => {
    const conflicts = detectContractFileConflicts([
      {
        agentName: "a",
        apisExposed: [],
        typesExposed: [],
        filesWillWrite: ["x.ts", "y.ts"],
        envVarsNeeded: [],
        needsFrom: [],
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        agentName: "b",
        apisExposed: [],
        typesExposed: [],
        filesWillWrite: ["x.ts", "y.ts"],
        envVarsNeeded: [],
        needsFrom: [],
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => c.file).sort()).toEqual(["x.ts", "y.ts"]);
  });
});
