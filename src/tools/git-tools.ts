import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { execSync } from "node:child_process";

function runGit(projectPath: string, args: string): string {
  try {
    return execSync(`git ${args}`, {
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

function ensureGitRepo(projectPath: string): string | null {
  if (isGitRepo(projectPath)) return null;
  runGit(projectPath, "init");
  runGit(projectPath, 'config user.email "sajicode@local"');
  runGit(projectPath, 'config user.name "SajiCode"');
  return "Initialized new git repository";
}

export function createGitTools(projectPath: string) {
  const gitStatus = tool(
    async () => {
      ensureGitRepo(projectPath);
      const branch = runGit(projectPath, "branch --show-current");
      const status = runGit(projectPath, "status --short");
      const log = runGit(projectPath, "log --oneline -5 2>&1");
      return [
        `Branch: ${branch}`,
        "",
        "Changes:",
        status || "(clean)",
        "",
        "Recent commits:",
        log,
      ].join("\n");
    },
    {
      name: "git_status",
      description:
        "Shows current git branch, changed files, and recent commit history. " +
        "Use BEFORE starting work to understand project state.",
      schema: z.object({}),
    },
  );

  const gitCommit = tool(
    async ({ message }: { message: string }) => {
      ensureGitRepo(projectPath);
      runGit(projectPath, "add -A");

      const status = runGit(projectPath, "status --short");
      if (!status) return "Nothing to commit — working tree clean.";

      const result = runGit(projectPath, `commit -m "${message.replace(/"/g, '\\"')}"`);
      return result;
    },
    {
      name: "git_commit",
      description:
        "Stages all changes and creates a commit. " +
        "Use AFTER completing a build phase to checkpoint progress. " +
        "Provide a clear commit message describing what was built.",
      schema: z.object({
        message: z.string().describe("Commit message — be specific about what changed"),
      }),
    },
  );

  const gitBranch = tool(
    async ({ name }: { name: string }) => {
      ensureGitRepo(projectPath);

      const hasCommits = runGit(projectPath, "rev-list --count HEAD 2>&1");
      if (hasCommits.includes("ERROR") || hasCommits === "0") {
        runGit(projectPath, "add -A");
        runGit(projectPath, 'commit --allow-empty -m "initial commit"');
      }

      const sanitized = name.replace(/[^a-zA-Z0-9\-_/]/g, "-").toLowerCase();
      const result = runGit(projectPath, `checkout -b ${sanitized}`);
      return result || `Switched to new branch: ${sanitized}`;
    },
    {
      name: "git_branch",
      description:
        "Creates and switches to a new git branch. " +
        "Use BEFORE starting a new feature to isolate changes. " +
        "Branch name should be descriptive: feat/url-shortener, fix/auth-bug, etc.",
      schema: z.object({
        name: z.string().describe("Branch name — use feat/xxx, fix/xxx, or chore/xxx format"),
      }),
    },
  );

  const gitDiff = tool(
    async ({ staged }: { staged?: boolean }) => {
      ensureGitRepo(projectPath);
      const flag = staged ? "--cached" : "";
      const diff = runGit(projectPath, `diff ${flag} --stat`);
      return diff || "No changes detected.";
    },
    {
      name: "git_diff",
      description:
        "Shows a summary of file changes (insertions/deletions). " +
        "Use to verify what changed before committing.",
      schema: z.object({
        staged: z.boolean().optional().describe("If true, show only staged changes"),
      }),
    },
  );

  const gitCheckpoint = tool(
    async ({ phase }: { phase: string }) => {
      ensureGitRepo(projectPath);
      runGit(projectPath, "add -A");
      const status = runGit(projectPath, "status --short");
      if (!status) return `Phase "${phase}" — nothing new to checkpoint.`;

      const msg = `chore(sajicode): checkpoint — ${phase}`;
      const result = runGit(projectPath, `commit -m "${msg}"`);
      return `Checkpoint saved: ${phase}\n${result}`;
    },
    {
      name: "git_checkpoint",
      description:
        "Quick checkpoint commit after completing a build phase. " +
        "Use between major steps: after scaffolding, after API routes, after UI, after tests. " +
        "Automatically stages all changes with a standardized commit message.",
      schema: z.object({
        phase: z.string().describe("Phase name: scaffold, api-routes, ui-components, tests, etc."),
      }),
    },
  );

  return [gitStatus, gitCommit, gitBranch, gitDiff, gitCheckpoint];
}
