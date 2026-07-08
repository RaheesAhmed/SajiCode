import fs from "node:fs/promises";
import path from "node:path";
import { loadUsageStore, sumSessionCost, costByAgent } from "./usage-tracker.js";

export interface SessionReportInput {
  sessionId: string;
  threadId?: string;
  projectPath: string;
  summary?: string;
  filesTouched?: string[];
  verificationResults?: string[];
  decisions?: string[];
}

export async function writeSessionReport(input: SessionReportInput): Promise<string> {
  const reportsDir = path.join(input.projectPath, ".sajicode", "reports");
  await fs.mkdir(reportsDir, { recursive: true });

  const store = await loadUsageStore(input.projectPath);
  const sessionCost = sumSessionCost(store, input.sessionId);
  const agentCosts = costByAgent(store, input.sessionId);

  const lines = [
    `# Session Report: ${input.sessionId}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    ...(input.threadId ? [`Thread: ${input.threadId}`] : []),
    "",
    "## Summary",
    input.summary ?? "(no summary provided)",
    "",
    "## Cost",
    `Estimated session cost: $${sessionCost.toFixed(2)}`,
    "",
    "### By Agent",
    ...Object.entries(agentCosts).map(
      ([agent, cost]) => `- ${agent}: $${cost.toFixed(2)}`,
    ),
    "",
  ];

  if (input.filesTouched && input.filesTouched.length > 0) {
    lines.push("## Files Touched", ...input.filesTouched.map((f) => `- ${f}`), "");
  }

  if (input.verificationResults && input.verificationResults.length > 0) {
    lines.push(
      "## Verification",
      ...input.verificationResults.map((v) => `- ${v}`),
      "",
    );
  }

  if (input.decisions && input.decisions.length > 0) {
    lines.push("## Decisions", ...input.decisions.map((d) => `- ${d}`), "");
  }

  const filePath = path.join(reportsDir, `${input.sessionId}.md`);
  await fs.writeFile(filePath, lines.join("\n"), "utf-8");
  return filePath;
}
