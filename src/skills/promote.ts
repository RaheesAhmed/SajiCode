import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { queryExperiences } from "../memory/experience-replay.js";
import { getRelevantPatterns } from "../memory/pattern-library.js";

const SKILL_TEMPLATE = `---
name: {{name}}
description: {{description}}
---

# {{title}}

## Context

This skill was promoted from project experiences and patterns.

## Lessons Learned

{{lessons}}

## Pitfalls to Avoid

{{pitfalls}}

## Checklist

{{checklist}}
`;

export async function promoteTopicToSkill(
  projectPath: string,
  topic: string,
  techStack: string[] = [],
): Promise<string> {
  const safeName = topic.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const skillDir = path.join(projectPath, ".sajicode", "skills", safeName);
  const skillFile = path.join(skillDir, "SKILL.md");

  const experiences = await queryExperiences(projectPath, {
    tags: [topic.toLowerCase(), ...techStack.map((t) => t.toLowerCase())],
  });

  const patterns = techStack.length > 0
    ? await getRelevantPatterns(projectPath, techStack)
    : [];

  const lessons = experiences
    .flatMap((e) => e.lessons)
    .filter(Boolean)
    .slice(0, 15);

  const pitfalls = patterns
    .filter((p) => p.category === "pitfall" || p.category === "security")
    .map((p) => `- ${p.title}: ${p.description}`)
    .slice(0, 10);

  if (lessons.length === 0 && pitfalls.length === 0) {
    return `No experiences or patterns found for topic "${topic}". Record experiences first.`;
  }

  const title = safeName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const content = SKILL_TEMPLATE.replace(/\{\{name\}\}/g, safeName)
    .replace(/\{\{title\}\}/g, title)
    .replace(
      /\{\{description\}\}/g,
      `Project-specific lessons for ${topic} (promoted from experiences).`,
    )
    .replace(
      /\{\{lessons\}\}/g,
      lessons.length > 0
        ? lessons.map((l) => `- ${l}`).join("\n")
        : "- (none yet)",
    )
    .replace(
      /\{\{pitfalls\}\}/g,
      pitfalls.length > 0 ? pitfalls.join("\n") : "- (none identified)",
    )
    .replace(
      /\{\{checklist\}\}/g,
      [
        "- [ ] Review promoted lessons before starting work on this topic",
        "- [ ] Update this skill when new failures are recorded",
      ].join("\n"),
    );

  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(skillFile, content, "utf-8");

  return `Promoted skill written to ${skillFile} (${lessons.length} lessons, ${pitfalls.length} pitfalls)`;
}

export function createPromoteSkillTool(projectPath: string) {
  return tool(
    async (input: { topic: string; techStack?: string[] }) => {
      return promoteTopicToSkill(
        projectPath,
        input.topic,
        input.techStack ?? [],
      );
    },
    {
      name: "promote_to_skill",
      description:
        "Distill matching experiences and patterns into a git-versioned project skill at .sajicode/skills/<topic>/SKILL.md.",
      schema: z.object({
        topic: z.string().describe("Topic slug (e.g. prisma-migrations, jwt-auth)"),
        techStack: z.array(z.string()).optional().describe("Related technologies for pattern matching"),
      }),
    },
  );
}
