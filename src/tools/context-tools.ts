/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */


import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

export const updateProjectContextTool = tool(
  async (input: { section: string; content: string; projectPath: string }) => {
    const filePath = path.join(input.projectPath, "OPENAGENT.MD");

    try {
      let existing = "";
      try {
        existing = await fs.readFile(filePath, "utf-8");
      } catch {
        existing = "# Project Context\n\n";
      }

      const sectionHeader = `## ${input.section}`;
      const sectionRegex = new RegExp(`## ${input.section}[\\s\\S]*?(?=\\n## |$)`, "g");

      const newSection = `${sectionHeader}\n${input.content}\n\n`;

      if (existing.includes(sectionHeader)) {
        existing = existing.replace(sectionRegex, newSection);
      } else {
        existing += newSection;
      }

      const updatedAt = `\n---\n*Last updated by OpenAgent: ${new Date().toISOString()}*\n`;
      const withoutTimestamp = existing.replace(/\n---\n\*Last updated by OpenAgent:.*\*\n?/g, "");
      existing = withoutTimestamp.trimEnd() + updatedAt;

      await fs.writeFile(filePath, existing, "utf-8");
      return `✅ Updated OPENAGENT.MD section: "${input.section}"`;
    } catch (error) {
      return `❌ Failed to update OPENAGENT.MD: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "update_project_context",
    description: "Update a section in OPENAGENT.MD to reflect project changes. Call when making significant changes (new files, architecture changes, completed features).",
    schema: z.object({
      section: z.string().describe("Section title (e.g. 'Recent Changes', 'Architecture', 'Progress')"),
      content: z.string().describe("Updated markdown content for this section"),
      projectPath: z.string().describe("Absolute path to the project root"),
    }),
  }
);

export const allContextTools = [updateProjectContextTool];
