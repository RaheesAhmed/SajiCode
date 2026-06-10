import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function runGit(projectPath: string, args: string[]): string {
  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (error: any) {
    const stderr = error.stderr?.toString().trim() || "";
    const stdout = error.stdout?.toString().trim() || "";
    return `[GIT ERROR] ${stderr || stdout || error.message}`;
  }
}

function isGitRepo(projectPath: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

function hasCommits(projectPath: string): boolean {
  try {
    execSync("git rev-parse HEAD", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

function buildTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const YYYY = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const DD = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${YYYY}${MM}${DD}-${HH}${mm}${ss}`;
}

const SESSION_FILE_RELATIVE = join(".sajicode", "current-session.txt");

// ---------------------------------------------------------------------------
// Public API — session lifecycle
// ---------------------------------------------------------------------------

/**
 * Ensures a git repository exists at `projectPath`, creates a session branch
 * and a "before" tag, then persists the session ID for later retrieval.
 * Returns the session ID string.
 */
export async function startGitSession(projectPath: string): Promise<string> {
  // 1. Ensure git repo
  const freshRepo = !isGitRepo(projectPath);
  if (freshRepo) {
    runGit(projectPath, ["init"]);
    runGit(projectPath, ["config", "user.email", "sajicode@local"]);
    runGit(projectPath, ["config", "user.name", "SajiCode"]);
  }

  // 2. Create initial commit if repo has no commits
  if (!hasCommits(projectPath)) {
    runGit(projectPath, ["add", "-A"]);
    // --allow-empty in case the working tree is entirely empty
    runGit(projectPath, [
      "commit",
      "--allow-empty",
      "-m",
      "chore: initial commit",
    ]);
  }

  // 3. Build session ID and branch name
  const sessionId = buildTimestamp(); // e.g. "20260611-143022"
  const branchName = `sajicode/session-${sessionId}`;
  const tagName = `sajicode-before-${sessionId}`;

  // 4. Create branch
  runGit(projectPath, ["checkout", "-b", branchName]);

  // 5. Create "before" tag
  runGit(projectPath, ["tag", tagName]);

  // 6. Persist session ID
  const sajiDir = join(projectPath, ".sajicode");
  await mkdir(sajiDir, { recursive: true });
  await writeFile(join(projectPath, SESSION_FILE_RELATIVE), sessionId, "utf-8");

  return sessionId;
}

/**
 * Reads the current session ID from `.sajicode/current-session.txt`.
 * Returns `null` if the file does not exist.
 */
export async function getSessionId(
  projectPath: string,
): Promise<string | null> {
  try {
    const content = await readFile(
      join(projectPath, SESSION_FILE_RELATIVE),
      "utf-8",
    );
    return content.trim() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API — LangChain tools
// ---------------------------------------------------------------------------

/**
 * Returns the three session-scoped git tools:
 *   1. `session_commit`    — stage all & commit on behalf of a named agent
 *   2. `revert_session`    — hard-reset to the "before" tag for a session
 *   3. `revert_agent_work` — revert commits authored by a specific agent
 */
export function createGitSessionTools(projectPath: string) {
  // ------------------------------------------------------------------
  // Tool 1: session_commit
  // ------------------------------------------------------------------
  const sessionCommit = tool(
    async ({
      agentName,
      summary,
    }: {
      agentName: string;
      summary: string;
    }): Promise<string> => {
      runGit(projectPath, ["add", "-A"]);

      const status = runGit(projectPath, ["status", "--short"]);
      if (!status || status.startsWith("[GIT ERROR]")) {
        return "Nothing to commit — working tree is clean.";
      }

      const safeAgent = agentName.replace(/[^a-zA-Z0-9_-]/g, "-");
      const safeSummary = summary.replace(/"/g, "'");
      const message = `feat(${safeAgent}): ${safeSummary}`;

      const result = runGit(projectPath, ["commit", "-m", message]);

      if (result.startsWith("[GIT ERROR]")) {
        return `Commit failed: ${result}`;
      }

      // Extract the short commit hash from the output line such as:
      // "[sajicode/session-... abc1234] feat(agent): summary"
      const hashMatch = result.match(/\[.*?\s+([0-9a-f]{7,})\]/);
      const commitHash = hashMatch ? hashMatch[1] : "(hash unavailable)";

      return `Committed as ${commitHash}: ${message}`;
    },
    {
      name: "session_commit",
      description:
        "Stages all current changes and creates a commit attributed to a named agent. " +
        "Use after an agent completes a meaningful unit of work. " +
        "Returns the commit hash.",
      schema: z.object({
        agentName: z
          .string()
          .describe("Name of the agent making the commit, e.g. 'architect'"),
        summary: z
          .string()
          .describe(
            "Short description of what was done, used as the commit message body",
          ),
      }),
    },
  );

  // ------------------------------------------------------------------
  // Tool 2: revert_session
  // ------------------------------------------------------------------
  const revertSession = tool(
    async ({ sessionId }: { sessionId?: string }): Promise<string> => {
      let sid = sessionId?.trim();

      if (!sid) {
        const stored = await getSessionId(projectPath);
        if (!stored) {
          return "No session ID provided and no stored session found in .sajicode/current-session.txt.";
        }
        sid = stored;
      }

      const tagName = `sajicode-before-${sid}`;

      // Verify the tag exists
      const tagCheck = runGit(projectPath, [
        "rev-parse",
        "--verify",
        tagName,
      ]);
      if (tagCheck.startsWith("[GIT ERROR]")) {
        return `Tag "${tagName}" not found. Cannot revert session ${sid}.`;
      }

      // Hard-reset to the tag
      const resetResult = runGit(projectPath, [
        "reset",
        "--hard",
        tagName,
      ]);
      if (resetResult.startsWith("[GIT ERROR]")) {
        return `Hard reset to "${tagName}" failed: ${resetResult}`;
      }

      // Clean untracked files/directories
      runGit(projectPath, ["clean", "-fd"]);

      return (
        `Successfully reverted session ${sid}. ` +
        `Repository hard-reset to tag "${tagName}". ` +
        `Untracked files removed.\n${resetResult}`
      );
    },
    {
      name: "revert_session",
      description:
        "Reverts the entire repository to the state it was in before the session started. " +
        "Performs a hard reset to the sajicode-before-SESSION_ID tag. " +
        "If no sessionId is given, reads the stored session from .sajicode/current-session.txt.",
      schema: z.object({
        sessionId: z
          .string()
          .optional()
          .describe(
            "Session ID to revert (e.g. '20260611-143022'). Omit to use stored session.",
          ),
      }),
    },
  );

  // ------------------------------------------------------------------
  // Tool 3: revert_agent_work
  // ------------------------------------------------------------------
  const revertAgentWork = tool(
    async ({ agentName }: { agentName: string }): Promise<string> => {
      const safeAgent = agentName.replace(/[^a-zA-Z0-9_-]/g, "-");

      // Find commits whose message matches the agent's pattern
      // git log outputs "<hash> <subject>" one per line
      const logOutput = runGit(projectPath, [
        "log",
        "--oneline",
        `--grep=feat(${safeAgent}):`,
        "--format=%H %s",
      ]);

      if (logOutput.startsWith("[GIT ERROR]")) {
        return `Failed to read git log: ${logOutput}`;
      }

      if (!logOutput) {
        return `No commits found for agent "${agentName}" (pattern: feat(${safeAgent}):).`;
      }

      const lines = logOutput
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return `No commits found for agent "${agentName}".`;
      }

      const reverted: string[] = [];
      const failed: string[] = [];

      for (const line of lines) {
        const parts = line.split(" ");
        const hash = parts[0] ?? "";
        const subject = parts.slice(1).join(" ");

        // git revert --no-edit reverts the commit non-interactively
        const result = runGit(projectPath, [
          "revert",
          "--no-edit",
          hash,
        ]);

        if (result.startsWith("[GIT ERROR]")) {
          failed.push(`  ${hash} (${subject}) — FAILED: ${result}`);
        } else {
          reverted.push(`  ${hash} (${subject})`);
        }
      }

      const parts: string[] = [];
      if (reverted.length > 0) {
        parts.push(`Reverted ${reverted.length} commit(s) by "${agentName}":\n${reverted.join("\n")}`);
      }
      if (failed.length > 0) {
        parts.push(`Failed to revert ${failed.length} commit(s):\n${failed.join("\n")}`);
      }

      return parts.join("\n\n");
    },
    {
      name: "revert_agent_work",
      description:
        "Finds all commits made by a specific agent (matching 'feat(AGENTNAME):' pattern) " +
        "and reverts them one by one using git revert. " +
        "Returns a list of reverted commit hashes and subjects.",
      schema: z.object({
        agentName: z
          .string()
          .describe(
            "Name of the agent whose commits should be reverted, e.g. 'architect'",
          ),
      }),
    },
  );

  return [sessionCommit, revertSession, revertAgentWork];
}
