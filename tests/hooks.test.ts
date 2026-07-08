import { describe, it, expect } from "vitest";
import {
  pathMatchesGlob,
  matchesHookMatcher,
  extractFilePathsFromToolArgs,
} from "../src/hooks/matchers.js";

describe("hook matchers", () => {
  it("matches path globs", () => {
    expect(pathMatchesGlob("src/components/Button.tsx", "src/**/*.tsx")).toBe(true);
    expect(pathMatchesGlob("lib/utils.ts", "src/**/*.tsx")).toBe(false);
  });

  it("matches toolName in hook matcher", () => {
    expect(
      matchesHookMatcher({ toolName: "execute" }, { toolName: "execute" }),
    ).toBe(true);
    expect(
      matchesHookMatcher({ toolName: "execute" }, { toolName: "write_file" }),
    ).toBe(false);
  });

  it("matches argsPattern against serialized args", () => {
    expect(
      matchesHookMatcher(
        { argsPattern: "npm publish" },
        { args: { command: "npm publish --access public" } },
      ),
    ).toBe(true);
  });

  it("extracts file paths from write tool args", () => {
    const paths = extractFilePathsFromToolArgs("write_file", {
      file_path: "src/index.ts",
    });
    expect(paths).toEqual(["src/index.ts"]);
  });
});
