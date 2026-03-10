import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { getArtifactSummaries } from "./artifact-tools.js";
import { queryExperiences, formatExperiencesForPrompt } from "../memory/experience-replay.js";

const IGNORED_DIRS = new Set([
  "node_modules", "dist", "build", "coverage", ".git",
  ".next", ".nuxt", "__pycache__", ".cache", ".turbo",
]);

async function buildCompactTree(root: string, maxLines = 30): Promise<string> {
  const lines: string[] = [];

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth <= 0 || lines.length >= maxLines) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const filtered = entries.filter(
        (e) => !e.name.startsWith(".") && !IGNORED_DIRS.has(e.name)
      );
      let idx = 0;
      for (const entry of filtered) {
        if (lines.length >= maxLines) break;
        const isLast = idx === filtered.length - 1;
        const connector = isLast ? "└── " : "├── ";
        const childPrefix = isLast ? "    " : "│   ";

        if (entry.isDirectory()) {
          lines.push(`${prefix}${connector}${entry.name}/`);
          await walk(path.join(dir, entry.name), prefix + childPrefix, depth - 1);
        } else {
          lines.push(`${prefix}${connector}${entry.name}`);
        }
        idx++;
      }
    } catch { /* skip unreadable */ }
  }

  const rootName = path.basename(root);
  lines.push(`${rootName}/`);
  await walk(root, "", 3);
  return lines.join("\n");
}

async function extractKeyTypes(projectPath: string): Promise<string> {
  const typesDir = path.join(projectPath, "src", "types");
  const signatures: string[] = [];

  try {
    const files = await fs.readdir(typesDir);
    for (const file of files.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))) {
      const content = await fs.readFile(path.join(typesDir, file), "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed.startsWith("export interface ") ||
          trimmed.startsWith("export type ") ||
          trimmed.startsWith("export enum ")
        ) {
          signatures.push(trimmed);
        }
      }
    }
  } catch { /* no types dir */ }

  return signatures.length > 0
    ? signatures.slice(0, 20).join("\n")
    : "No types directory found.";
}

async function getInstalledDeps(projectPath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(path.join(projectPath, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

async function getFilesCreatedThisSession(projectPath: string): Promise<string[]> {
  const statePath = path.join(projectPath, ".sajicode", "session-state.json");
  try {
    const raw = await fs.readFile(statePath, "utf-8");
    const state = JSON.parse(raw);
    return state.filesCreated ?? [];
  } catch {
    return [];
  }
}

async function getDecisions(projectPath: string): Promise<string[]> {
  const decisions: string[] = [];

  try {
    const archPath = path.join(projectPath, ".sajicode", "architecture.md");
    const content = await fs.readFile(archPath, "utf-8");
    const decisionLines = content.split("\n").filter(
      (l) => l.trim().startsWith("- ") || l.trim().startsWith("→ ")
    );
    decisions.push(...decisionLines.slice(0, 10).map((l) => l.trim()));
  } catch { /* no architecture.md */ }

  try {
    const agentsDir = path.join(projectPath, ".sajicode", "agents");
    const files = await fs.readdir(agentsDir);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const raw = await fs.readFile(path.join(agentsDir, file), "utf-8");
      const memory = JSON.parse(raw);
      const decisionEntries = (memory.entries ?? [])
        .filter((e: any) => e.category === "decision")
        .slice(-3);
      for (const entry of decisionEntries) {
        decisions.push(entry.content);
      }
    }
  } catch { /* no agent memories */ }

  return decisions;
}

export function createContextBriefingTool(projectPath: string) {
  return tool(
    async (input: { currentPhase: string; currentTask: string }) => {
      const [tree, types, deps, filesCreated, decisions, artifactSummary] = await Promise.all([
        buildCompactTree(projectPath),
        extractKeyTypes(projectPath),
        getInstalledDeps(projectPath),
        getFilesCreatedThisSession(projectPath),
        getDecisions(projectPath),
        getArtifactSummaries(projectPath),
      ]);

      let pastExperiences = "";
      try {
        const exps = await queryExperiences(projectPath, {});
        if (exps.length > 0) pastExperiences = formatExperiencesForPrompt(exps);
      } catch { /* no experiences yet */ }

      const briefing = [
        "<CONTEXT_BRIEFING>",
        "",
        "## Project Tree",
        "```",
        tree,
        "```",
        "",
        "## Installed Dependencies",
        deps.length > 0 ? deps.join(", ") : "None yet",
        "",
        "## Files Created This Session",
        filesCreated.length > 0 ? filesCreated.map((f) => `- ${f}`).join("\n") : "None yet",
        "",
        "## Key Type Signatures",
        "```typescript",
        types,
        "```",
        "",
        "## Decisions Made",
        decisions.length > 0 ? decisions.map((d) => `- ${d}`).join("\n") : "No decisions recorded yet",
        "",
        ...(artifactSummary ? [artifactSummary, ""] : []),
        ...(pastExperiences ? ["## Past Lessons (auto-injected)", pastExperiences, ""] : []),
        `## Current Phase: ${input.currentPhase}`,
        `## Current Task: ${input.currentTask}`,
        "",
        "</CONTEXT_BRIEFING>",
      ].join("\n");

      return briefing;
    },
    {
      name: "generate_context_briefing",
      description:
        "Generate a compact context briefing to pass to sub-agents via task(). " +
        "Call this BEFORE delegating. Include the output in your task() description " +
        "so sub-agents do NOT need to re-scan the project.",
      schema: z.object({
        currentPhase: z.string().describe("Current build phase (e.g. 'setting up types', 'building components')"),
        currentTask: z.string().describe("What the sub-agent is being asked to do"),
      }),
    }
  );
}
