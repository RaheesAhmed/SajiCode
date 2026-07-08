import { execFile } from "node:child_process";
import { promisify } from "util";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export type DeployProvider = "vercel" | "railway" | "fly" | "netlify";

const PROVIDER_COMMANDS: Record<DeployProvider, string> = {
  vercel: "npx vercel deploy --yes",
  railway: "railway up --detach",
  fly: "fly deploy",
  netlify: "npx netlify deploy --build",
};

async function runShellCommand(
  cwd: string,
  command: string,
  timeoutMs = 600_000,
): Promise<{ ok: boolean; output: string }> {
  const isWin = process.platform === "win32";
  const sh = isWin ? "cmd.exe" : "/bin/sh";
  const shFlag = isWin ? "/c" : "-c";

  try {
    const result = await execFileAsync(sh, [shFlag, command], {
      cwd,
      timeout: timeoutMs,
    });
    return {
      ok: true,
      output: ((result.stdout ?? "") + (result.stderr ?? "")).trim(),
    };
  } catch (error: any) {
    return {
      ok: false,
      output: ((error.stdout ?? "") + (error.stderr ?? "")).trim(),
    };
  }
}

function extractPreviewUrl(output: string): string | null {
  const patterns = [
    /https:\/\/[^\s]+\.vercel\.app[^\s]*/i,
    /https:\/\/[^\s]+\.railway\.app[^\s]*/i,
    /https:\/\/[^\s]+\.fly\.dev[^\s]*/i,
    /https:\/\/[^\s]+\.netlify\.app[^\s]*/i,
    /(https:\/\/[^\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match?.[1] ?? match?.[0]) {
      return (match[1] ?? match[0]!).replace(/[)\],]+$/, "");
    }
  }

  return null;
}

export async function deployPreview(
  projectPath: string,
  provider: DeployProvider,
): Promise<{ ok: boolean; previewUrl?: string; output: string }> {
  const command = PROVIDER_COMMANDS[provider];
  const result = await runShellCommand(projectPath, command);

  const previewUrl = extractPreviewUrl(result.output) ?? undefined;

  return {
    ok: result.ok,
    ...(previewUrl ? { previewUrl } : {}),
    output: result.output.slice(0, 4_000),
  };
}

export async function createPullRequest(
  projectPath: string,
  input: { title: string; body: string; base?: string },
): Promise<{ ok: boolean; output: string; prUrl?: string }> {
  const baseFlag = input.base ? ` --base ${input.base}` : "";
  const command =
    `gh pr create --title "${input.title.replace(/"/g, '\\"')}" --body "${input.body.replace(/"/g, '\\"')}"${baseFlag}`;

  const result = await runShellCommand(projectPath, command, 120_000);
  const prUrl = result.output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];

  return {
    ok: result.ok,
    output: result.output,
    ...(prUrl ? { prUrl } : {}),
  };
}

export async function fetchLatestCiFailureLog(
  projectPath: string,
): Promise<{ ok: boolean; log: string; runUrl?: string }> {
  const result = await runShellCommand(
    projectPath,
    "gh run list --limit 5 --json databaseId,conclusion,url,displayTitle",
    60_000,
  );

  if (!result.ok) {
    return { ok: false, log: result.output || "gh CLI not available or not authenticated" };
  }

  let runs: Array<{ databaseId: number; conclusion: string; url: string; displayTitle: string }>;
  try {
    runs = JSON.parse(result.output) as typeof runs;
  } catch {
    return { ok: false, log: "Failed to parse gh run list output" };
  }

  const failed = runs.find((run) => run.conclusion === "failure");
  if (!failed) {
    return { ok: false, log: "No recent failed GitHub Actions run found" };
  }

  const logResult = await runShellCommand(
    projectPath,
    `gh run view ${failed.databaseId} --log-failed`,
    120_000,
  );

  return {
    ok: logResult.ok,
    log: logResult.output.slice(0, 12_000),
    runUrl: failed.url,
  };
}

export function createDeployTools(projectPath: string) {
  const deployPreviewTool = tool(
    async (input: { provider: DeployProvider }) => {
      const result = await deployPreview(projectPath, input.provider);
      const lines = [
        result.ok ? `✅ Deploy preview succeeded (${input.provider})` : `❌ Deploy failed (${input.provider})`,
        ...(result.previewUrl ? [`Preview URL: ${result.previewUrl}`] : []),
        "",
        result.output,
      ];
      return lines.join("\n");
    },
    {
      name: "deploy_preview",
      description:
        "Deploy a preview environment via Vercel, Railway, Fly.io, or Netlify CLI. Returns preview URL for E2E testing.",
      schema: z.object({
        provider: z.enum(["vercel", "railway", "fly", "netlify"]),
      }),
    },
  );

  const createPrTool = tool(
    async (input: { title: string; body: string; base?: string }) => {
      const result = await createPullRequest(projectPath, input);
      if (!result.ok) {
        return `❌ PR creation failed:\n${result.output}`;
      }
      return [
        "✅ Pull request created",
        ...(result.prUrl ? [`URL: ${result.prUrl}`] : []),
        result.output,
      ].join("\n");
    },
    {
      name: "create_pull_request",
      description:
        "Create a GitHub pull request via gh CLI with verification report in the body. Requires gh auth.",
      schema: z.object({
        title: z.string(),
        body: z.string().describe("PR description — include verification ladder results"),
        base: z.string().optional().describe("Target branch (default: repo default branch)"),
      }),
    },
  );

  return [deployPreviewTool, createPrTool];
}

export function createCiTools(projectPath: string) {
  const fetchCiLogTool = tool(
    async () => {
      const result = await fetchLatestCiFailureLog(projectPath);
      if (!result.ok) {
        return `❌ ${result.log}`;
      }
      return [
        `CI failure log${result.runUrl ? ` (${result.runUrl})` : ""}:`,
        "",
        result.log,
      ].join("\n");
    },
    {
      name: "fetch_ci_failure_log",
      description: "Fetch the latest failed GitHub Actions job log via gh CLI for local reproduction.",
      schema: z.object({}),
    },
  );

  return [fetchCiLogTool];
}
