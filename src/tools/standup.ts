import { execFile, execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "util";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runGitSync(projectPath: string, args: string[]): string {
  try {
    return execSync(["git", ...args].join(" "), {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString().trim() ?? "";
    const stdout = err.stdout?.toString().trim() ?? "";
    return stderr || stdout || "";
  }
}

async function getRecentCommits(
  projectPath: string,
): Promise<{ count: number; lines: string[] }> {
  try {
    const output = await execFileAsync(
      "git",
      ["log", "--oneline", '--since="7 days ago"'],
      { cwd: projectPath, encoding: "utf-8", timeout: 30_000 },
    );
    const lines = output.stdout
      .trim()
      .split("\n")
      .filter((l) => l.trim().length > 0);
    return { count: lines.length, lines };
  } catch {
    // Fallback to execSync
    const raw = runGitSync(projectPath, [
      "log",
      "--oneline",
      '--since="7 days ago"',
    ]);
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    return { count: lines.length, lines };
  }
}

async function getWorkingTreeStatus(
  projectPath: string,
): Promise<{ clean: boolean; count: number; summary: string }> {
  try {
    const output = await execFileAsync("git", ["status", "--short"], {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 15_000,
    });
    const lines = output.stdout
      .trim()
      .split("\n")
      .filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { clean: true, count: 0, summary: "clean" };
    }
    return {
      clean: false,
      count: lines.length,
      summary: `${lines.length} file${lines.length !== 1 ? "s" : ""} changed`,
    };
  } catch {
    const raw = runGitSync(projectPath, ["status", "--short"]);
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { clean: true, count: 0, summary: "clean" };
    }
    return {
      clean: false,
      count: lines.length,
      summary: `${lines.length} file${lines.length !== 1 ? "s" : ""} changed`,
    };
  }
}

async function getStashList(projectPath: string): Promise<number> {
  try {
    const output = await execFileAsync("git", ["stash", "list"], {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 15_000,
    });
    const lines = output.stdout
      .trim()
      .split("\n")
      .filter((l) => l.trim().length > 0);
    return lines.length;
  } catch {
    const raw = runGitSync(projectPath, ["stash", "list"]);
    return raw.split("\n").filter((l) => l.trim().length > 0).length;
  }
}

async function readSessionState(
  projectPath: string,
): Promise<{ phase: string; progress: string } | null> {
  const statePath = path.join(projectPath, ".sajicode", "session-state.json");
  try {
    const raw = await fs.readFile(statePath, "utf-8");
    const state = JSON.parse(raw);
    const phase: string =
      state.phase ?? state.currentPhase ?? state.current_phase ?? "";
    const progress: string =
      state.progress ?? state.currentTask ?? state.current_task ?? "";
    if (!phase && !progress) return null;
    return { phase: phase || "unknown", progress: progress || "" };
  } catch {
    return null;
  }
}

async function readUnfinishedWork(projectPath: string): Promise<string> {
  const dnaPath = path.join(projectPath, "PROJECT.dna");
  try {
    const content = await fs.readFile(dnaPath, "utf-8");
    // Find the UnfinishedWork section
    const match = content.match(
      /##\s*UnfinishedWork\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i,
    );
    if (!match) return "None recorded";
    const section = match[1]?.trim();
    if (!section) return "None recorded";
    // Return up to 5 lines from that section
    const lines = section
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 5);
    return lines.length > 0 ? lines.join("\n  ") : "None recorded";
  } catch {
    return "None recorded";
  }
}

async function readWhatsDone(projectPath: string): Promise<string[]> {
  const donePath = path.join(projectPath, ".sajicode", "whats_done.md");
  try {
    const content = await fs.readFile(donePath, "utf-8");
    // Split on --- separators and grab last 3 non-empty sections
    const sections = content
      .split(/^---+$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return sections.slice(-3);
  } catch {
    return [];
  }
}

async function checkOutdatedPackages(
  projectPath: string,
): Promise<string[]> {
  try {
    const result = await execFileAsync(
      "npm",
      ["outdated", "--json"],
      {
        cwd: projectPath,
        encoding: "utf-8",
        timeout: 60_000,
      },
    );
    // npm outdated exits with code 1 when packages are outdated, so we parse stdout
    return parseOutdatedJson(result.stdout);
  } catch (err: any) {
    // npm outdated exits 1 when there are outdated packages — stdout still has JSON
    const stdout: string = err.stdout ?? "";
    if (stdout.trim().startsWith("{")) {
      return parseOutdatedJson(stdout);
    }
    return [];
  }
}

function parseOutdatedJson(raw: string): string[] {
  try {
    const data: Record<
      string,
      { current: string; wanted: string; latest: string; type?: string }
    > = JSON.parse(raw);
    if (!data || typeof data !== "object") return [];
    const critical: string[] = [];
    for (const [pkg, info] of Object.entries(data)) {
      if (!info || typeof info !== "object") continue;
      const current = info.current ?? "?";
      const latest = info.latest ?? "?";
      const type = info.type === "devDependencies" ? "(dev)" : "";
      // Flag as critical when major version is behind
      const currentMajor = parseInt(current.split(".")[0] ?? "0", 10);
      const latestMajor = parseInt(latest.split(".")[0] ?? "0", 10);
      if (latestMajor > currentMajor) {
        critical.push(`${pkg} ${current} → ${latest} [MAJOR] ${type}`.trim());
      } else {
        critical.push(`${pkg} ${current} → ${latest} ${type}`.trim());
      }
    }
    return critical.slice(0, 10);
  } catch {
    return [];
  }
}

async function countTodosFixmes(projectPath: string): Promise<number> {
  const srcDir = path.join(projectPath, "src");
  try {
    await fs.access(srcDir);
  } catch {
    // No src directory — skip
    return 0;
  }

  try {
    const result = await execFileAsync(
      "grep",
      ["-r", "TODO|FIXME", srcDir, "--include=*.ts", "-c", "--include=*.tsx"],
      { cwd: projectPath, encoding: "utf-8", timeout: 30_000 },
    );
    return sumGrepCountOutput(result.stdout);
  } catch (err: any) {
    // grep exits 1 when no matches found — stdout may still have counts
    const stdout: string = err.stdout ?? "";
    if (stdout.trim().length > 0) {
      return sumGrepCountOutput(stdout);
    }
    // Try with execSync as fallback (Windows-compatible path)
    try {
      const raw = execSync(
        `grep -r "TODO\\|FIXME" "${srcDir}" --include="*.ts" --include="*.tsx" -c`,
        {
          cwd: projectPath,
          encoding: "utf-8",
          timeout: 30_000,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      return sumGrepCountOutput(raw);
    } catch (innerErr: any) {
      const innerStdout: string = innerErr.stdout?.toString() ?? "";
      return sumGrepCountOutput(innerStdout);
    }
  }
}

function sumGrepCountOutput(raw: string): number {
  // grep -c outputs "filename:count" per file
  return raw
    .trim()
    .split("\n")
    .reduce((total, line) => {
      const parts = line.trim().split(":");
      const num = parseInt(parts[parts.length - 1] ?? "0", 10);
      return total + (isNaN(num) ? 0 : num);
    }, 0);
}

// ---------------------------------------------------------------------------
// Suggestion engine
// ---------------------------------------------------------------------------

function buildSuggestions(opts: {
  workingTreeDirty: boolean;
  stashCount: number;
  todoCount: number;
  hasUnfinishedWork: boolean;
  outdatedCount: number;
  lastPhase: string | null;
  recentCommitCount: number;
}): string[] {
  const suggestions: string[] = [];

  if (opts.stashCount > 0) {
    suggestions.push(
      `Review stashed work (${opts.stashCount} stash${opts.stashCount !== 1 ? "es" : ""}) — run \`git stash list\` and pop or drop as needed.`,
    );
  }

  if (opts.workingTreeDirty) {
    suggestions.push(
      "Commit or discard uncommitted changes before starting new work to keep a clean baseline.",
    );
  }

  if (opts.hasUnfinishedWork) {
    const base = opts.lastPhase
      ? `Resume from last session phase "${opts.lastPhase}"`
      : "Address recorded unfinished work in PROJECT.dna";
    suggestions.push(`${base} — review the UnfinishedWork section above.`);
  }

  if (opts.outdatedCount > 0) {
    suggestions.push(
      `Update ${opts.outdatedCount} outdated package${opts.outdatedCount !== 1 ? "s" : ""} — run \`npm update\` or upgrade majors individually.`,
    );
  }

  if (opts.todoCount > 0) {
    suggestions.push(
      `Resolve ${opts.todoCount} TODO/FIXME comment${opts.todoCount !== 1 ? "s" : ""} in the codebase — search with grep or your editor.`,
    );
  }

  if (opts.recentCommitCount === 0 && !opts.workingTreeDirty) {
    suggestions.push(
      "No recent commits — start a new feature branch and build the next planned feature.",
    );
  }

  if (suggestions.length === 0) {
    suggestions.push("All clear — pick the next feature from the backlog and start a fresh branch.");
  }

  return suggestions.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateStandupBriefing(
  projectPath: string,
): Promise<string> {
  const [
    { count: commitCount, lines: commitLines },
    workingTree,
    stashCount,
    sessionState,
    unfinishedWork,
    whatsDone,
    outdatedPackages,
    todoCount,
  ] = await Promise.all([
    getRecentCommits(projectPath),
    getWorkingTreeStatus(projectPath),
    getStashList(projectPath),
    readSessionState(projectPath),
    readUnfinishedWork(projectPath),
    readWhatsDone(projectPath),
    checkOutdatedPackages(projectPath),
    countTodosFixmes(projectPath),
  ]);

  const border = "═══════════════════════════════════════";

  // Recent commits section
  const commitsDisplay =
    commitCount === 0
      ? "  (no commits in the last 7 days)"
      : commitLines
          .slice(0, 5)
          .map((l) => `  ${l}`)
          .join("\n") +
        (commitCount > 5 ? `\n  … and ${commitCount - 5} more` : "");

  // Working tree section
  const workingTreeDisplay = workingTree.clean
    ? "clean"
    : workingTree.summary +
      (stashCount > 0 ? ` · ${stashCount} stash${stashCount !== 1 ? "es" : ""}` : "");

  // Last session section
  const lastSessionDisplay = sessionState
    ? `${sessionState.phase}${sessionState.progress ? ` — ${sessionState.progress}` : ""}`
    : "No previous session";

  // Outdated packages section
  const outdatedDisplay =
    outdatedPackages.length === 0
      ? "All up to date"
      : outdatedPackages.map((p) => `  ${p}`).join("\n");

  // TODOs section
  const todoDisplay = todoCount > 0 ? String(todoCount) : "0";

  // Whats done — show last 3 entries as a brief summary
  const whatsDoneLines =
    whatsDone.length > 0
      ? whatsDone
          .map((section) => {
            const firstLine = section.split("\n")[0] ?? section;
            return `  • ${firstLine}`;
          })
          .join("\n")
      : null;

  // Suggestions
  const suggestions = buildSuggestions({
    workingTreeDirty: !workingTree.clean,
    stashCount,
    todoCount,
    hasUnfinishedWork: unfinishedWork !== "None recorded",
    outdatedCount: outdatedPackages.length,
    lastPhase: sessionState?.phase ?? null,
    recentCommitCount: commitCount,
  });

  const suggestionLines = suggestions
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join("\n");

  const lines: string[] = [
    border,
    " SAJICODE DAILY BRIEFING",
    border,
    "",
    `📅 Last 7 days: ${commitCount} commit${commitCount !== 1 ? "s" : ""}`,
    commitsDisplay,
    "",
    `📂 Working tree: ${workingTreeDisplay}`,
    "",
    `🔧 Last session: ${lastSessionDisplay}`,
    "",
    `📋 Unfinished work: ${unfinishedWork}`,
    "",
  ];

  if (whatsDoneLines) {
    lines.push("✅ Recently completed:");
    lines.push(whatsDoneLines);
    lines.push("");
  }

  lines.push(
    `⬆️  Outdated packages: ${outdatedPackages.length === 0 ? "All up to date" : ""}`,
  );
  if (outdatedPackages.length > 0) {
    lines.push(outdatedDisplay);
  }

  lines.push(
    "",
    `📝 TODOs in codebase: ${todoDisplay}`,
    "",
    "💡 Suggested next steps:",
    suggestionLines,
    border,
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// LangChain tool export
// ---------------------------------------------------------------------------

export function createStandupTools(projectPath: string) {
  const generateStandup = tool(
    async () => {
      return generateStandupBriefing(projectPath);
    },
    {
      name: "generate_standup",
      description:
        "Generate a daily standup briefing: recent commits, working tree status, unfinished work from PROJECT.dna, outdated packages, and suggested next steps. Call at the start of any session to orient quickly.",
      schema: z.object({}),
    },
  );

  return [generateStandup];
}
