import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateDnaSection } from "../memory/project-dna.js";

const DECISIONS_DIR = ".sajicode/decisions";

export interface ADRRecord {
  id: string;
  title: string;
  status: "proposed" | "accepted" | "deprecated";
  context: string;
  decision: string;
  consequences: string;
  options?: string;
  debateTranscript?: string;
  createdAt: string;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function listAdrFiles(projectPath: string): Promise<string[]> {
  const dir = path.join(projectPath, DECISIONS_DIR);
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
}

function formatAdrMarkdown(adr: ADRRecord): string {
  const lines = [
    `# ADR ${adr.id}: ${adr.title}`,
    "",
    `Status: ${adr.status}`,
    `Created: ${adr.createdAt}`,
    "",
    "## Context",
    adr.context,
    "",
  ];

  if (adr.options) {
    lines.push("## Options Considered", adr.options, "");
  }

  if (adr.debateTranscript) {
    lines.push("## Debate Transcript", adr.debateTranscript, "");
  }

  lines.push(
    "## Decision",
    adr.decision,
    "",
    "## Consequences",
    adr.consequences,
    "",
  );

  return lines.join("\n");
}

export function createAdrTools(projectPath: string) {
  const writeAdrTool = tool(
    async (input: {
      title: string;
      context: string;
      decision: string;
      consequences: string;
      options?: string;
      debateTranscript?: string;
      status?: "proposed" | "accepted" | "deprecated";
    }) => {
      const existing = await listAdrFiles(projectPath);
      const nextNum = String(existing.length + 1).padStart(4, "0");
      const id = nextNum;
      const slug = slugify(input.title);

      const adr: ADRRecord = {
        id,
        title: input.title,
        status: input.status ?? "accepted",
        context: input.context,
        decision: input.decision,
        consequences: input.consequences,
        createdAt: new Date().toISOString(),
        ...(input.options ? { options: input.options } : {}),
        ...(input.debateTranscript ? { debateTranscript: input.debateTranscript } : {}),
      };

      const dir = path.join(projectPath, DECISIONS_DIR);
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${id}-${slug}.md`);
      await fs.writeFile(filePath, formatAdrMarkdown(adr), "utf-8");

      await updateDnaSection(
        projectPath,
        "Key Decisions",
        `- ADR-${id}: ${input.title} — ${input.decision.slice(0, 120)}`,
      );

      return `ADR written: ${filePath}`;
    },
    {
      name: "write_adr",
      description:
        "Write an Architecture Decision Record to .sajicode/decisions/ and index it in PROJECT.dna.",
      schema: z.object({
        title: z.string(),
        context: z.string().describe("Why a decision was needed"),
        decision: z.string().describe("What was decided"),
        consequences: z.string().describe("Trade-offs and follow-up effects"),
        options: z.string().optional().describe("Options considered"),
        debateTranscript: z.string().optional().describe("Agent debate summary"),
        status: z.enum(["proposed", "accepted", "deprecated"]).optional(),
      }),
    },
  );

  const listAdrsTool = tool(
    async () => {
      const files = await listAdrFiles(projectPath);
      if (files.length === 0) {
        return "No ADRs found in .sajicode/decisions/";
      }

      const summaries: string[] = [`ADRs (${files.length}):`, ""];
      for (const file of files) {
        const content = await fs.readFile(
          path.join(projectPath, DECISIONS_DIR, file),
          "utf-8",
        );
        const titleLine = content.split("\n").find((l) => l.startsWith("# ADR"));
        summaries.push(`- ${file}${titleLine ? ` — ${titleLine.replace("# ", "")}` : ""}`);
      }
      return summaries.join("\n");
    },
    {
      name: "list_adrs",
      description: "List all Architecture Decision Records for this project.",
      schema: z.object({}),
    },
  );

  return [writeAdrTool, listAdrsTool];
}
