import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

const ARTIFACTS_DIR = ".sajicode/artifacts";

interface AgentArtifact {
  agent: string;
  status: "complete" | "in_progress" | "blocked" | "failed";
  filesCreated: string[];
  filesModified: string[];
  exports: string[];
  errors: string[];
  summary: string;
  timestamp: string;
}

async function ensureArtifactsDir(projectPath: string): Promise<string> {
  const dir = path.join(projectPath, ARTIFACTS_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function createWriteArtifactTool(projectPath: string) {
  return tool(
    async (input: {
      agent: string;
      status: "complete" | "in_progress" | "blocked" | "failed";
      filesCreated: string[];
      filesModified: string[];
      exports: string[];
      errors: string[];
      summary: string;
    }) => {
      const dir = await ensureArtifactsDir(projectPath);
      const artifact: AgentArtifact = {
        ...input,
        timestamp: new Date().toISOString(),
      };
      const filePath = path.join(dir, `${input.agent}.json`);
      await fs.writeFile(filePath, JSON.stringify(artifact, null, 2), "utf-8");
      return `Artifact saved: ${ARTIFACTS_DIR}/${input.agent}.json (${input.status}, ${input.filesCreated.length} created, ${input.filesModified.length} modified)`;
    },
    {
      name: "write_artifact",
      description:
        "REQUIRED after completing work: write a structured artifact so PM and sibling agents know what you built. " +
        "Include all files created/modified and any API exports other agents depend on.",
      schema: z.object({
        agent: z.string().describe("Your agent name (e.g. 'backend-lead')"),
        status: z.enum(["complete", "in_progress", "blocked", "failed"]),
        filesCreated: z.array(z.string()).describe("Absolute paths of files you created"),
        filesModified: z.array(z.string()).describe("Absolute paths of files you modified"),
        exports: z.array(z.string()).describe("API contracts, types, or interfaces other agents depend on (e.g. 'POST /api/users → { id, name, email }')"),
        errors: z.array(z.string()).describe("Errors encountered and how they were resolved"),
        summary: z.string().describe("One-sentence summary of what was built"),
      }),
    }
  );
}

export function createReadArtifactTool(projectPath: string) {
  return tool(
    async (input: { agent: string }) => {
      const filePath = path.join(projectPath, ARTIFACTS_DIR, `${input.agent}.json`);
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        return raw;
      } catch {
        return `No artifact found for agent "${input.agent}". They may not have completed yet.`;
      }
    },
    {
      name: "read_artifact",
      description:
        "Read another agent's artifact to see what they built, what files they created, and what API contracts they export. " +
        "Use this to coordinate with sibling agents.",
      schema: z.object({
        agent: z.string().describe("Agent name to read artifact from (e.g. 'backend-lead')"),
      }),
    }
  );
}

export function createListArtifactsTool(projectPath: string) {
  return tool(
    async () => {
      const dir = path.join(projectPath, ARTIFACTS_DIR);
      try {
        const files = await fs.readdir(dir);
        const artifacts = files.filter((f) => f.endsWith(".json"));
        if (artifacts.length === 0) return "No artifacts yet. No agents have completed work.";

        const summaries: string[] = [];
        for (const file of artifacts) {
          try {
            const raw = await fs.readFile(path.join(dir, file), "utf-8");
            const artifact: AgentArtifact = JSON.parse(raw);
            const icon = { complete: "✅", in_progress: "🔄", blocked: "🚧", failed: "❌" }[artifact.status];
            summaries.push(
              `${icon} ${artifact.agent}: ${artifact.summary} (${artifact.filesCreated.length} files)`
            );
          } catch { /* skip malformed */ }
        }
        return summaries.join("\n");
      } catch {
        return "No artifacts directory yet.";
      }
    },
    {
      name: "list_artifacts",
      description:
        "List all agent artifacts from the current session. Shows which agents have completed, " +
        "what they built, and their status. Call this before dispatching the next round of agents.",
      schema: z.object({}),
    }
  );
}

export async function getArtifactSummaries(projectPath: string): Promise<string> {
  const dir = path.join(projectPath, ARTIFACTS_DIR);
  try {
    const files = await fs.readdir(dir);
    const artifacts = files.filter((f) => f.endsWith(".json"));
    if (artifacts.length === 0) return "";

    const lines: string[] = ["## Agent Artifacts (what has been built)"];
    for (const file of artifacts) {
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf-8");
        const a: AgentArtifact = JSON.parse(raw);
        lines.push(`- **${a.agent}** [${a.status}]: ${a.summary}`);
        if (a.exports.length > 0) {
          lines.push(`  Exports: ${a.exports.join(", ")}`);
        }
        if (a.filesCreated.length > 0) {
          lines.push(`  Files: ${a.filesCreated.slice(0, 5).join(", ")}${a.filesCreated.length > 5 ? ` (+${a.filesCreated.length - 5} more)` : ""}`);
        }
      } catch { /* skip */ }
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

export function createArtifactTools(projectPath: string) {
  return [
    createWriteArtifactTool(projectPath),
    createReadArtifactTool(projectPath),
    createListArtifactsTool(projectPath),
  ];
}
