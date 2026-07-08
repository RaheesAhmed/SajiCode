import { describe, it, expect } from "vitest";
import { resolveSkills } from "../src/utils/skills.js";

describe("skills layered resolution", () => {
  it("includes bundled skills by default", () => {
    const skills = resolveSkills();
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some((s) => s.layer === "bundled")).toBe(true);
  });

  it("sorts skills alphabetically by name", () => {
    const skills = resolveSkills();
    const names = skills.map((s) => s.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
