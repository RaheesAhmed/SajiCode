import fs from "node:fs/promises";
import path from "node:path";
import {
  formatSkillLayerLabel,
  getProjectSkillsDir,
  getUserSkillsDir,
  resolveSkills,
  type SkillLayer,
} from "../utils/skills.js";

export interface SkillLintResult {
  name: string;
  layer: SkillLayer;
  ok: boolean;
  issues: string[];
}

const SKILL_TEMPLATE = `---
name: {{name}}
description: Describe when agents should read this skill.
---

# {{title}}

## Overview

Describe the conventions, pitfalls, and patterns agents must follow.

## Checklist

- [ ] Item one
- [ ] Item two
`;

export async function listSkillsForDisplay(projectPath: string): Promise<string> {
  const skills = resolveSkills(projectPath);
  if (skills.length === 0) {
    return "No skills found.";
  }

  const lines = [
    "SKILLS (project > plugin > user > bundled):",
    "",
    "| Skill | Layer | Path |",
    "|-------|-------|------|",
    ...skills.map(
      (s) =>
        `| ${s.name} | ${formatSkillLayerLabel(s.layer)} | ${s.path} |`,
    ),
    "",
    `Total: ${skills.length}`,
  ];

  return lines.join("\n");
}

export async function scaffoldSkill(
  skillName: string,
  targetLayer: "project" | "user",
  projectPath: string,
): Promise<string> {
  const safeName = skillName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const root =
    targetLayer === "project"
      ? getProjectSkillsDir(projectPath)
      : getUserSkillsDir();

  const skillDir = path.join(root, safeName);
  const skillFile = path.join(skillDir, "SKILL.md");

  await fs.mkdir(skillDir, { recursive: true });

  try {
    await fs.access(skillFile);
    return `Skill already exists: ${skillFile}`;
  } catch {
    // continue
  }

  const title = safeName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const content = SKILL_TEMPLATE.replace(/\{\{name\}\}/g, safeName).replace(
    /\{\{title\}\}/g,
    title,
  );

  await fs.writeFile(skillFile, content, "utf-8");
  return `Created skill scaffold at ${skillFile}`;
}

export async function addSkillFromPath(
  sourcePath: string,
  targetLayer: "project" | "user",
  projectPath: string,
): Promise<string> {
  const resolvedSource = path.resolve(sourcePath);
  const stat = await fs.stat(resolvedSource);

  let sourceDir = resolvedSource;
  if (stat.isFile()) {
    sourceDir = path.dirname(resolvedSource);
  }

  const skillName = path.basename(sourceDir);
  const skillMd = path.join(sourceDir, "SKILL.md");
  const skillMdAlt = path.join(sourceDir, "SKILL.MD");

  try {
    await fs.access(skillMd);
  } catch {
    try {
      await fs.access(skillMdAlt);
    } catch {
      return `No SKILL.md found in ${sourceDir}`;
    }
  }

  const root =
    targetLayer === "project"
      ? getProjectSkillsDir(projectPath)
      : getUserSkillsDir();

  const destDir = path.join(root, skillName);
  await fs.mkdir(path.dirname(destDir), { recursive: true });
  await fs.cp(sourceDir, destDir, { recursive: true, force: true });

  return `Installed skill "${skillName}" to ${destDir}`;
}

export async function lintSkills(projectPath: string): Promise<SkillLintResult[]> {
  const skills = resolveSkills(projectPath);
  const results: SkillLintResult[] = [];

  for (const skill of skills) {
    const issues: string[] = [];
    const skillDir = skill.path.replace(/\/$/, "");
    const skillFile = path.join(skillDir, "SKILL.md");
    const skillFileAlt = path.join(skillDir, "SKILL.MD");

    let content = "";
    try {
      content = await fs.readFile(skillFile, "utf-8");
    } catch {
      try {
        content = await fs.readFile(skillFileAlt, "utf-8");
      } catch {
        issues.push("Missing SKILL.md");
      }
    }

    if (content) {
      if (!content.startsWith("---")) {
        issues.push("Missing YAML frontmatter (must start with ---)");
      } else {
        const frontmatterEnd = content.indexOf("---", 3);
        if (frontmatterEnd === -1) {
          issues.push("Unclosed frontmatter block");
        } else {
          const frontmatter = content.slice(3, frontmatterEnd);
          if (!/^name:\s*.+/m.test(frontmatter)) {
            issues.push("Frontmatter missing 'name:' field");
          }
          if (!/^description:\s*.+/m.test(frontmatter)) {
            issues.push("Frontmatter missing 'description:' field");
          }
        }
      }
    }

    results.push({
      name: skill.name,
      layer: skill.layer,
      ok: issues.length === 0,
      issues,
    });
  }

  return results;
}

export function formatLintResults(results: SkillLintResult[]): string {
  if (results.length === 0) return "No skills to lint.";

  const lines = results.map((r) => {
    if (r.ok) {
      return `  ✓ ${r.name} (${r.layer})`;
    }
    return `  ✗ ${r.name} (${r.layer})\n${r.issues.map((i) => `      • ${i}`).join("\n")}`;
  });

  const failed = results.filter((r) => !r.ok).length;
  return [`Skill lint: ${results.length - failed}/${results.length} passed`, "", ...lines].join("\n");
}
