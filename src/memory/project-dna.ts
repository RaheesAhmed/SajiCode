import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const DNA_FILE = "PROJECT.dna";

export async function loadProjectDna(projectPath: string): Promise<string> {
  const dnaPath = path.join(projectPath, DNA_FILE);
  try {
    return await fs.readFile(dnaPath, "utf-8");
  } catch {
    return "";
  }
}

export async function writeProjectDna(
  projectPath: string,
  content: string,
): Promise<void> {
  const dnaPath = path.join(projectPath, DNA_FILE);
  await fs.writeFile(dnaPath, content, "utf-8");
}

export async function updateDnaSection(
  projectPath: string,
  section: string,
  content: string,
): Promise<void> {
  const existing = await loadProjectDna(projectPath);
  const sectionHeading = `## ${section}`;

  if (!existing) {
    const newContent = `${sectionHeading}\n${content}\n`;
    await writeProjectDna(projectPath, newContent);
    return;
  }

  // Split the file into blocks by ## headings, preserving the preamble (# title)
  // We need to find the target section and replace its content
  const lines = existing.split("\n");
  const result: string[] = [];
  let inTargetSection = false;
  let sectionFound = false;
  let i = 0;

  while (i < lines.length) {
    const line: string = lines[i] ?? "";

    if (line.trim() === sectionHeading.trim()) {
      // Found the target section — write its heading then new content
      result.push(line);
      result.push(content);
      sectionFound = true;
      inTargetSection = true;
      i++;
      // Skip old content of this section until the next ## heading or end
      while (i < lines.length) {
        const next: string = lines[i] ?? "";
        if (next.startsWith("## ") || next.startsWith("---")) {
          inTargetSection = false;
          break;
        }
        i++;
      }
      continue;
    }

    if (inTargetSection) {
      // Should not reach here due to inner loop, but guard anyway
      i++;
      continue;
    }

    result.push(line);
    i++;
  }

  if (!sectionFound) {
    // Append the section before the trailing footer (--- line) if present
    let footerIdx = -1;
    for (let j = result.length - 1; j >= 0; j--) {
      if ((result[j] ?? "").startsWith("---")) {
        footerIdx = j;
        break;
      }
    }
    const newSection = `${sectionHeading}\n${content}\n`;
    if (footerIdx !== -1) {
      result.splice(footerIdx, 0, newSection);
    } else {
      result.push(newSection);
    }
  }

  // Update the last-updated timestamp in the footer
  const finalText = result
    .join("\n")
    .replace(/\*Last updated:.*?\*/g, `*Last updated: ${new Date().toISOString()}*`);

  await writeProjectDna(projectPath, finalText);
}

function buildFreshDna(params: {
  projectName: string;
  overview: string;
  techStack: string;
  architecture: string;
  conventions: string;
  keyDecisions: string;
}): string {
  const now = new Date().toISOString();
  return [
    `# ${params.projectName} — Project DNA`,
    "",
    `## Overview`,
    params.overview,
    "",
    `## Tech Stack`,
    params.techStack,
    "",
    `## Architecture`,
    params.architecture,
    "",
    `## Conventions`,
    params.conventions,
    "",
    `## Key Decisions`,
    params.keyDecisions,
    "",
    `## Patterns Learned`,
    "",
    `## Known Issues`,
    "",
    `## Unfinished Work`,
    "",
    `## User Preferences`,
    "",
    `## Session History`,
    "",
    `---`,
    `*Last updated: ${now}*`,
    "",
  ].join("\n");
}

export function createProjectDnaTools(projectPath: string) {
  const readProjectDna = tool(
    async () => {
      const content = await loadProjectDna(projectPath);
      if (!content.trim()) {
        return "No PROJECT.dna file found. Run /init-dna first to generate one for this project.";
      }
      return content;
    },
    {
      name: "read_project_dna",
      description:
        "Read the PROJECT.dna file for this project. Returns the full DNA content or instructions to run /init-dna if it does not exist yet.",
      schema: z.object({}),
    },
  );

  const updateProjectDna = tool(
    async ({
      section,
      content,
      reason,
    }: {
      section: string;
      content: string;
      reason?: string;
    }) => {
      const timestamp = new Date().toISOString();
      const contentWithTimestamp = reason
        ? `${content}\n\n*Updated ${timestamp} — ${reason}*`
        : `${content}\n\n*Updated ${timestamp}*`;

      await updateDnaSection(projectPath, section, contentWithTimestamp);
      return `Project DNA section "## ${section}" updated successfully at ${timestamp}.`;
    },
    {
      name: "update_project_dna",
      description:
        'Update or append a named section in PROJECT.dna. The section parameter should be a heading name like "Architecture", "Decisions", "Patterns", "UnfinishedWork", "UserPreferences", "TechStack", or "KnownIssues". A timestamp is automatically appended.',
      schema: z.object({
        section: z
          .string()
          .describe(
            'Section heading name, e.g. "Architecture", "Decisions", "Patterns", "UnfinishedWork", "UserPreferences", "TechStack", "KnownIssues"',
          ),
        content: z.string().describe("New content to write into the section."),
        reason: z
          .string()
          .optional()
          .describe("Optional short reason or note for this update."),
      }),
    },
  );

  const generateProjectDna = tool(
    async ({
      projectName,
      overview,
      techStack,
      architecture,
      conventions,
      keyDecisions,
      targetPath,
    }: {
      projectName: string;
      overview: string;
      techStack: string;
      architecture: string;
      conventions: string;
      keyDecisions: string;
      targetPath?: string;
    }) => {
      const writePath = targetPath ?? projectPath;
      const content = buildFreshDna({
        projectName,
        overview,
        techStack,
        architecture,
        conventions,
        keyDecisions,
      });
      await writeProjectDna(writePath, content);
      return `PROJECT.dna generated for "${projectName}" at ${path.join(writePath, DNA_FILE)}.`;
    },
    {
      name: "generate_project_dna",
      description:
        "Create a fresh PROJECT.dna file from scratch with all standard sections pre-populated. Use this when starting a new project or regenerating the DNA from scratch. " +
        "If building in a subdirectory (e.g. d:/projects/myapp), pass that path as targetPath so the DNA is saved alongside the project, not in the tool root.",
      schema: z.object({
        projectName: z.string().describe("The name of the project."),
        overview: z
          .string()
          .describe("High-level description of what this project does."),
        techStack: z
          .string()
          .describe(
            "Languages, frameworks, libraries, and tools used in this project.",
          ),
        architecture: z
          .string()
          .describe(
            "High-level architectural overview: layers, modules, data flow.",
          ),
        conventions: z
          .string()
          .describe(
            "Coding conventions, naming rules, file structure patterns, and style decisions.",
          ),
        keyDecisions: z
          .string()
          .describe(
            "Important architectural or product decisions made and the rationale behind them.",
          ),
        targetPath: z
          .string()
          .optional()
          .describe(
            "Absolute path to the project being built. Use when building in a subdirectory different from the sajicode working directory.",
          ),
      }),
    },
  );

  return [readProjectDna, updateProjectDna, generateProjectDna];
}
