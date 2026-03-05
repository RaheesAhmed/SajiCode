import fs from "fs/promises";
import path from "path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const STATE_FILE = ".sajicode/session-state.json";

export interface SessionState {
  version: 1;
  taskId: string;
  startedAt: string;
  updatedAt: string;
  currentPhase: "planning" | "delegating" | "building" | "verifying" | "fixing" | "complete";
  userRequest: string;
  plan: {
    totalTasks: number;
    completedTasks: string[];
    inProgressTasks: string[];
    remainingTasks: string[];
  };
  filesCreated: string[];
  filesModified: string[];
  dependenciesInstalled: string[];
  errors: Array<{ file: string; error: string; status: "open" | "fixed" }>;
  agentsDispatched: Array<{ agent: string; task: string; status: "dispatched" | "complete" | "failed" }>;
}

function createEmptyState(taskId: string, userRequest: string): SessionState {
  return {
    version: 1,
    taskId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentPhase: "planning",
    userRequest,
    plan: {
      totalTasks: 0,
      completedTasks: [],
      inProgressTasks: [],
      remainingTasks: [],
    },
    filesCreated: [],
    filesModified: [],
    dependenciesInstalled: [],
    errors: [],
    agentsDispatched: [],
  };
}

export async function loadSessionState(projectPath: string): Promise<SessionState | null> {
  const filePath = path.join(projectPath, STATE_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

export async function saveSessionState(projectPath: string, state: SessionState): Promise<void> {
  const filePath = path.join(projectPath, STATE_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export async function clearSessionState(projectPath: string): Promise<void> {
  const filePath = path.join(projectPath, STATE_FILE);
  try {
    await fs.unlink(filePath);
  } catch { /* doesn't exist */ }
}

export function formatStateForPrompt(state: SessionState): string {
  const lines = [
    "## SESSION RESUME — You have previous progress. Do NOT re-scan the project.",
    "",
    `**Original Request**: ${state.userRequest}`,
    `**Phase**: ${state.currentPhase}`,
    `**Started**: ${state.startedAt}`,
    "",
    "### Progress",
    `- Completed (${state.plan.completedTasks.length}/${state.plan.totalTasks}): ${state.plan.completedTasks.join(", ") || "none"}`,
    `- In Progress: ${state.plan.inProgressTasks.join(", ") || "none"}`,
    `- Remaining: ${state.plan.remainingTasks.join(", ") || "none"}`,
    "",
    "### Files Created",
    state.filesCreated.length > 0
      ? state.filesCreated.map((f) => `- ${f}`).join("\n")
      : "None yet",
    "",
    "### Agents Dispatched",
    state.agentsDispatched.length > 0
      ? state.agentsDispatched.map((a) => `- ${a.agent}: ${a.task} [${a.status}]`).join("\n")
      : "None yet",
  ];

  if (state.errors.some((e) => e.status === "open")) {
    lines.push("", "### ⚠️ Open Errors");
    for (const err of state.errors.filter((e) => e.status === "open")) {
      lines.push(`- ${err.file}: ${err.error}`);
    }
  }

  lines.push("", "→ Resume from where you left off. Do NOT repeat completed work.");
  return lines.join("\n");
}

export function createSessionStateTools(projectPath: string) {
  const updateTool = tool(
    async (input: {
      currentPhase: SessionState["currentPhase"];
      completedTasks?: string[];
      inProgressTasks?: string[];
      remainingTasks?: string[];
      filesCreated?: string[];
      filesModified?: string[];
      dependenciesInstalled?: string[];
      agentDispatched?: { agent: string; task: string; status: "dispatched" | "complete" | "failed" };
      errorReport?: { file: string; error: string; status: "open" | "fixed" };
      userRequest?: string;
    }) => {
      let state = await loadSessionState(projectPath);
      if (!state) {
        state = createEmptyState(
          `session-${Date.now()}`,
          input.userRequest ?? "unknown"
        );
      }

      state.currentPhase = input.currentPhase;

      if (input.completedTasks) {
        for (const t of input.completedTasks) {
          if (!state.plan.completedTasks.includes(t)) {
            state.plan.completedTasks.push(t);
          }
          state.plan.inProgressTasks = state.plan.inProgressTasks.filter((ip) => ip !== t);
          state.plan.remainingTasks = state.plan.remainingTasks.filter((r) => r !== t);
        }
      }

      if (input.inProgressTasks) {
        for (const t of input.inProgressTasks) {
          if (!state.plan.inProgressTasks.includes(t)) {
            state.plan.inProgressTasks.push(t);
          }
          state.plan.remainingTasks = state.plan.remainingTasks.filter((r) => r !== t);
        }
      }

      if (input.remainingTasks) {
        for (const t of input.remainingTasks) {
          if (!state.plan.remainingTasks.includes(t) && !state.plan.completedTasks.includes(t)) {
            state.plan.remainingTasks.push(t);
          }
        }
      }

      state.plan.totalTasks = state.plan.completedTasks.length +
        state.plan.inProgressTasks.length +
        state.plan.remainingTasks.length;

      if (input.filesCreated) {
        for (const f of input.filesCreated) {
          if (!state.filesCreated.includes(f)) state.filesCreated.push(f);
        }
      }

      if (input.filesModified) {
        for (const f of input.filesModified) {
          if (!state.filesModified.includes(f)) state.filesModified.push(f);
        }
      }

      if (input.dependenciesInstalled) {
        for (const d of input.dependenciesInstalled) {
          if (!state.dependenciesInstalled.includes(d)) state.dependenciesInstalled.push(d);
        }
      }

      if (input.agentDispatched) {
        const existing = state.agentsDispatched.find(
          (a) => a.agent === input.agentDispatched!.agent && a.task === input.agentDispatched!.task
        );
        if (existing) {
          existing.status = input.agentDispatched.status;
        } else {
          state.agentsDispatched.push(input.agentDispatched);
        }
      }

      if (input.errorReport) {
        const existing = state.errors.find((e) => e.file === input.errorReport!.file);
        if (existing) {
          existing.error = input.errorReport.error;
          existing.status = input.errorReport.status;
        } else {
          state.errors.push(input.errorReport);
        }
      }

      await saveSessionState(projectPath, state);
      return `Session state updated. Phase: ${state.currentPhase}, ` +
        `Progress: ${state.plan.completedTasks.length}/${state.plan.totalTasks}`;
    },
    {
      name: "update_session_state",
      description:
        "Update the session state after each significant action (delegation, completion, error). " +
        "This enables automatic resume if the context overflows. Call after EVERY delegation round.",
      schema: z.object({
        currentPhase: z.enum(["planning", "delegating", "building", "verifying", "fixing", "complete"]),
        completedTasks: z.array(z.string()).optional().describe("Tasks just completed"),
        inProgressTasks: z.array(z.string()).optional().describe("Tasks now in progress"),
        remainingTasks: z.array(z.string()).optional().describe("Tasks still remaining"),
        filesCreated: z.array(z.string()).optional().describe("File paths created"),
        filesModified: z.array(z.string()).optional().describe("File paths modified"),
        dependenciesInstalled: z.array(z.string()).optional().describe("npm packages installed"),
        agentDispatched: z.object({
          agent: z.string(),
          task: z.string(),
          status: z.enum(["dispatched", "complete", "failed"]),
        }).optional().describe("Agent dispatch/completion update"),
        errorReport: z.object({
          file: z.string(),
          error: z.string(),
          status: z.enum(["open", "fixed"]),
        }).optional().describe("Error encountered or fixed"),
        userRequest: z.string().optional().describe("The original user request (first call only)"),
      }),
    }
  );

  const readTool = tool(
    async () => {
      const state = await loadSessionState(projectPath);
      if (!state) return "No previous session state found. Starting fresh.";
      return formatStateForPrompt(state);
    },
    {
      name: "read_session_state",
      description:
        "Check for previous session state. Call this FIRST on startup. " +
        "If state exists, resume from where you left off instead of re-scanning the project.",
      schema: z.object({}),
    }
  );

  return [updateTool, readTool];
}
