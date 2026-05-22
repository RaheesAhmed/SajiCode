import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

const AGENT_NAME_RE = /^[a-z0-9_-]+$/i;

type AgentAssignment = {
  agentName: string;
  role?: string;
  task: string;
  files?: string[];
  constraints?: string[];
  verification?: string;
};

type ReadIndexEntry = {
  path: string;
  summary: string;
  readBy: string;
  timestamp: string;
};

async function readTextIfExists(filePath: string, maxChars = 8000): Promise<string> {
  try {
    return (await fs.readFile(filePath, "utf-8")).slice(0, maxChars);
  } catch {
    return "";
  }
}

async function appendSection(filePath: string, title: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const timestamp = new Date().toISOString();
  const entry = [
    "",
    "---",
    `## ${title}`,
    `Timestamp: ${timestamp}`,
    "",
    content.trim(),
    "",
  ].join("\n");
  let existing = "";
  try {
    existing = await fs.readFile(filePath, "utf-8");
  } catch {
    existing = `# ${path.basename(filePath, ".md").replace(/[-_]/g, " ")}\n`;
  }
  await fs.writeFile(filePath, existing.trimEnd() + entry, "utf-8");
}

async function loadReadIndex(contextDir: string): Promise<ReadIndexEntry[]> {
  const indexPath = path.join(contextDir, "read-index.json");
  try {
    return JSON.parse(await fs.readFile(indexPath, "utf-8")) as ReadIndexEntry[];
  } catch {
    return [];
  }
}

async function saveReadIndex(contextDir: string, entries: ReadIndexEntry[]): Promise<void> {
  const indexPath = path.join(contextDir, "read-index.json");
  const byPath = new Map<string, ReadIndexEntry>();
  for (const entry of entries) byPath.set(entry.path, entry);
  await fs.writeFile(indexPath, JSON.stringify([...byPath.values()], null, 2), "utf-8");
}

function bulletList(items: string[] | undefined, empty = "None"): string {
  if (!items || items.length === 0) return empty;
  return items.map((item) => `- ${item}`).join("\n");
}

function assignmentBlock(assignment: AgentAssignment): string {
  return [
    `## ${assignment.agentName}`,
    assignment.role ? `Role: ${assignment.role}` : "",
    "",
    "### Task",
    assignment.task,
    "",
    "### Files",
    bulletList(assignment.files),
    "",
    "### Constraints",
    bulletList(assignment.constraints),
    "",
    "### Verification",
    assignment.verification || "Report files changed and any command results.",
    "",
  ].filter((line) => line !== "").join("\n");
}

function sanitizeAgentName(agentName: string): string {
  if (!AGENT_NAME_RE.test(agentName)) {
    throw new Error(`Invalid agentName "${agentName}". Use letters, numbers, dash, or underscore only.`);
  }
  return agentName;
}

export function createTeamContextTools(projectPath: string) {
  const sajicodeDir = path.join(projectPath, ".sajicode");
  const contextDir = path.join(sajicodeDir, "context");
  const briefingDir = path.join(contextDir, "briefings");

  const prepareTeamContext = tool(
    async (input: {
      currentTask: string;
      currentPhase: string;
      assignments: AgentAssignment[];
      filesAlreadyRead?: Array<{ path: string; summary: string }>;
      docsAlreadyRead?: Array<{ path: string; summary: string }>;
      decisions?: string[];
      contracts?: string[];
      notes?: string[];
    }) => {
      await fs.mkdir(briefingDir, { recursive: true });

      const timestamp = new Date().toISOString();
      const plan = await readTextIfExists(path.join(sajicodeDir, "Plan.md"), 3000);
      const architecture = await readTextIfExists(path.join(sajicodeDir, "Architecture.md"), 4000);
      const projectLog = (await readTextIfExists(path.join(sajicodeDir, "whats_done.md"), 4000))
        || (await readTextIfExists(path.join(sajicodeDir, "Whats_done.md"), 4000));
      const rootWhatsDone = await readTextIfExists(path.join(projectPath, "WHATS_DONE.MD"), 3000);
      const prd = await readTextIfExists(path.join(projectPath, "PRD.MD"), 3000);

      const readIndex = await loadReadIndex(contextDir);
      const newReadEntries: ReadIndexEntry[] = [
        ...(input.filesAlreadyRead ?? []),
        ...(input.docsAlreadyRead ?? []),
      ].map((entry) => ({
        path: entry.path,
        summary: entry.summary,
        readBy: "pm-agent",
        timestamp,
      }));
      await saveReadIndex(contextDir, [...readIndex, ...newReadEntries]);

      if (input.decisions?.length) {
        await appendSection(path.join(contextDir, "decisions.md"), "PM Decisions", bulletList(input.decisions));
      }
      if (input.contracts?.length) {
        await appendSection(path.join(contextDir, "contracts.md"), "Shared Contracts", bulletList(input.contracts));
      }

      const activeContext = [
        "# Active Context",
        "",
        `Updated: ${timestamp}`,
        `Project: ${projectPath}`,
        `Phase: ${input.currentPhase}`,
        "",
        "## Current Task",
        input.currentTask,
        "",
        "## Agent Assignments",
        input.assignments.map(assignmentBlock).join("\n"),
        "",
        "## PM Notes",
        bulletList(input.notes),
        "",
        "## PM Already Read",
        bulletList(newReadEntries.map((entry) => `${entry.path}: ${entry.summary}`)),
        "",
        "## Existing Plan Snapshot",
        plan || "No Plan.md yet.",
        "",
        "## Existing Architecture Snapshot",
        architecture || "No Architecture.md yet.",
        "",
        "## Project Log Snapshot",
        projectLog || rootWhatsDone || "No project log yet.",
        "",
        "## PRD Snapshot",
        prd || "No PRD.MD found.",
        "",
      ].join("\n");

      await fs.writeFile(path.join(sajicodeDir, "active_context.md"), activeContext, "utf-8");

      const decisions = await readTextIfExists(path.join(contextDir, "decisions.md"), 3000);
      const contracts = await readTextIfExists(path.join(contextDir, "contracts.md"), 3000);
      const readIndexText = [...readIndex, ...newReadEntries]
        .slice(-30)
        .map((entry) => `- ${entry.path}: ${entry.summary}`)
        .join("\n") || "No read index yet.";

      const prompts: string[] = [];
      for (const assignment of input.assignments) {
        const agentName = sanitizeAgentName(assignment.agentName);
        const briefing = [
          `# Briefing: ${agentName}`,
          "",
          `Updated: ${timestamp}`,
          `Project: ${projectPath}`,
          "",
          assignmentBlock(assignment),
          "",
          "## Shared Decisions",
          decisions || "No decisions recorded yet.",
          "",
          "## Shared Contracts",
          contracts || "No contracts recorded yet.",
          "",
          "## Files And Docs PM Already Read",
          readIndexText,
          "",
          "## Instructions",
          "- Start by calling read_team_context with your agentName.",
          "- Do not reread PM-read docs unless this briefing says the details are missing.",
          "- Write complete production code only.",
          "- Update agent memory, project log, and handoff notes when done.",
          "",
        ].join("\n");
        await fs.writeFile(path.join(briefingDir, `${agentName}.md`), briefing, "utf-8");

        prompts.push([
          `TASK PROMPT FOR ${agentName}`,
          `Read team context first: call read_team_context(agentName="${agentName}").`,
          `Your briefing path is .sajicode/context/briefings/${agentName}.md.`,
          "Do not reread files listed in the read index unless required details are missing.",
          "",
          assignmentBlock(assignment),
        ].join("\n"));
      }

      return [
        "Team context prepared.",
        "- Wrote .sajicode/active_context.md",
        `- Wrote ${input.assignments.length} per-agent briefing(s)`,
        "- Updated .sajicode/context/read-index.json",
        "",
        prompts.join("\n\n---\n\n"),
      ].join("\n");
    },
    {
      name: "prepare_team_context",
      description:
        "REQUIRED before task() delegation. Creates active_context.md, per-agent briefings, shared decisions/contracts, and a read index so agents do not reread PM context.",
      schema: z.object({
        currentTask: z.string().describe("The user's current request or build goal."),
        currentPhase: z.string().describe("Current phase such as planning, building, testing, or review."),
        assignments: z.array(z.object({
          agentName: z.string().describe("Target agent name, e.g. backend-lead."),
          role: z.string().optional(),
          task: z.string(),
          files: z.array(z.string()).optional(),
          constraints: z.array(z.string()).optional(),
          verification: z.string().optional(),
        })).describe("Every agent being delegated to in this round."),
        filesAlreadyRead: z.array(z.object({ path: z.string(), summary: z.string() })).optional(),
        docsAlreadyRead: z.array(z.object({ path: z.string(), summary: z.string() })).optional(),
        decisions: z.array(z.string()).optional(),
        contracts: z.array(z.string()).optional(),
        notes: z.array(z.string()).optional(),
      }),
    }
  );

  const readTeamContext = tool(
    async (input: { agentName: string }) => {
      const agentName = sanitizeAgentName(input.agentName);
      const active = await readTextIfExists(path.join(sajicodeDir, "active_context.md"), 12000);
      const briefing = await readTextIfExists(path.join(briefingDir, `${agentName}.md`), 12000);
      const decisions = await readTextIfExists(path.join(contextDir, "decisions.md"), 4000);
      const contracts = await readTextIfExists(path.join(contextDir, "contracts.md"), 4000);
      const handoffs = await readTextIfExists(path.join(contextDir, "handoffs.md"), 4000);
      const readIndex = await loadReadIndex(contextDir);

      return [
        "<TEAM_CONTEXT>",
        "",
        "## Your Briefing",
        briefing || `No per-agent briefing found for ${agentName}. Ask PM to call prepare_team_context.`,
        "",
        "## Active Context",
        active || "No active_context.md found. Ask PM to call prepare_team_context.",
        "",
        "## Decisions",
        decisions || "No decisions recorded yet.",
        "",
        "## Contracts",
        contracts || "No contracts recorded yet.",
        "",
        "## Handoffs",
        handoffs || "No handoffs recorded yet.",
        "",
        "## Read Index",
        readIndex.length > 0
          ? readIndex.slice(-40).map((entry) => `- ${entry.path}: ${entry.summary}`).join("\n")
          : "No read index yet.",
        "",
        "</TEAM_CONTEXT>",
      ].join("\n");
    },
    {
      name: "read_team_context",
      description:
        "Read your prepared team context. Specialist agents should call this before reading files or writing code.",
      schema: z.object({
        agentName: z.string().describe("Your agent name, e.g. backend-lead."),
      }),
    }
  );

  const getContextForAgent = tool(
    async (input: { agentName: string }) => {
      return readTeamContext.invoke(input);
    },
    {
      name: "get_context_for_agent",
      description: "Alias for read_team_context. Returns the prepared briefing and shared team context for one agent.",
      schema: z.object({
        agentName: z.string().describe("Target agent name, e.g. backend-lead."),
      }),
    }
  );

  const appendTeamDecision = tool(
    async (input: { agentName: string; decision: string; rationale?: string }) => {
      await appendSection(
        path.join(contextDir, "decisions.md"),
        `${input.agentName} Decision`,
        [input.decision, input.rationale ? `Rationale: ${input.rationale}` : ""].filter(Boolean).join("\n\n"),
      );
      return `Decision recorded for ${input.agentName}.`;
    },
    {
      name: "append_team_decision",
      description: "Append an architecture or implementation decision to shared team context.",
      schema: z.object({
        agentName: z.string(),
        decision: z.string(),
        rationale: z.string().optional(),
      }),
    }
  );

  const appendTeamContract = tool(
    async (input: { agentName: string; contract: string; consumers?: string[] }) => {
      await appendSection(
        path.join(contextDir, "contracts.md"),
        `${input.agentName} Contract`,
        [input.contract, input.consumers?.length ? `Consumers: ${input.consumers.join(", ")}` : ""]
          .filter(Boolean)
          .join("\n\n"),
      );
      return `Contract recorded for ${input.agentName}.`;
    },
    {
      name: "append_team_contract",
      description: "Append a shared API/type/env/file contract that other agents must know.",
      schema: z.object({
        agentName: z.string(),
        contract: z.string(),
        consumers: z.array(z.string()).optional(),
      }),
    }
  );

  const appendAgentHandoff = tool(
    async (input: {
      fromAgent: string;
      toAgent?: string;
      summary: string;
      files?: string[];
      blockers?: string[];
    }) => {
      const target = input.toAgent ? `To: ${input.toAgent}` : "To: all agents";
      await appendSection(
        path.join(contextDir, "handoffs.md"),
        `${input.fromAgent} Handoff`,
        [
          target,
          "",
          input.summary,
          "",
          "Files:",
          bulletList(input.files),
          "",
          "Blockers:",
          bulletList(input.blockers),
        ].join("\n"),
      );
      return `Handoff recorded from ${input.fromAgent}.`;
    },
    {
      name: "append_agent_handoff",
      description: "Append handoff notes so the next agent can continue without rereading everything.",
      schema: z.object({
        fromAgent: z.string(),
        toAgent: z.string().optional(),
        summary: z.string(),
        files: z.array(z.string()).optional(),
        blockers: z.array(z.string()).optional(),
      }),
    }
  );

  return [
    prepareTeamContext,
    readTeamContext,
    getContextForAgent,
    appendTeamDecision,
    appendTeamContract,
    appendAgentHandoff,
  ];
}
