import { execFile } from "node:child_process";
import { promisify } from "util";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  runSmokeCheck,
  detectSmokeConfig,
  formatSmokeResult,
} from "./smoke-check.js";

const execFileAsync = promisify(execFile);

export interface VerificationRung {
  name: string;
  ok: boolean;
  summary: string;
}

export interface VerificationLadderResult {
  passed: boolean;
  rungs: VerificationRung[];
}

export async function runVerificationLadder(
  projectPath: string,
  options: {
    startCommand?: string;
    healthUrl?: string;
    skipTests?: boolean;
    skipSmoke?: boolean;
  } = {},
): Promise<VerificationLadderResult> {
  const rungs: VerificationRung[] = [];
  const isWin = process.platform === "win32";
  const sh = isWin ? "cmd.exe" : "/bin/sh";
  const shFlag = isWin ? "/c" : "-c";

  // Rung 1: build
  try {
    const result = await execFileAsync(sh, [shFlag, "npm run build"], {
      cwd: projectPath,
      timeout: 120_000,
    });
    const out = ((result.stdout ?? "") + (result.stderr ?? "")).trim();
    rungs.push({
      name: "build",
      ok: true,
      summary: out.slice(0, 200) || "Build passed",
    });
  } catch (error: any) {
    const out = ((error.stdout ?? "") + (error.stderr ?? "")).trim();
    rungs.push({
      name: "build",
      ok: false,
      summary: out.slice(0, 500) || "Build failed",
    });
    return { passed: false, rungs };
  }

  // Rung 2: tests
  if (!options.skipTests) {
    try {
      const result = await execFileAsync(sh, [shFlag, "npm test"], {
        cwd: projectPath,
        timeout: 180_000,
      });
      rungs.push({
        name: "tests",
        ok: true,
        summary: ((result.stdout ?? "") + (result.stderr ?? "")).slice(0, 200) || "Tests passed",
      });
    } catch (error: any) {
      const out = ((error.stdout ?? "") + (error.stderr ?? "")).trim();
      rungs.push({
        name: "tests",
        ok: false,
        summary: out.slice(0, 500) || "Tests failed",
      });
      return { passed: false, rungs };
    }
  }

  // Rung 3: runtime smoke
  if (!options.skipSmoke) {
    const detected = await detectSmokeConfig(projectPath);
    const startCommand = options.startCommand ?? detected?.startCommand;
    const healthUrl = options.healthUrl ?? detected?.healthUrl;

    if (!startCommand || !healthUrl) {
      rungs.push({
        name: "smoke",
        ok: true,
        summary: "Skipped — no start script or health URL detected",
      });
    } else {
      const smoke = await runSmokeCheck({
        startCommand,
        healthUrl,
        cwd: projectPath,
        timeoutMs: 30_000,
      });
      rungs.push({
        name: "smoke",
        ok: smoke.ok,
        summary: formatSmokeResult(smoke),
      });
      if (!smoke.ok) {
        return { passed: false, rungs };
      }
    }
  }

  return { passed: true, rungs };
}

export function formatLadderResult(result: VerificationLadderResult): string {
  const lines = [
    result.passed ? "✅ Verification ladder PASSED" : "❌ Verification ladder FAILED",
    "",
    ...result.rungs.map(
      (rung) => `${rung.ok ? "✅" : "❌"} ${rung.name}: ${rung.summary.split("\n")[0]}`,
    ),
  ];
  return lines.join("\n");
}

export function createSmokeCheckTools(projectPath: string) {
  const smokeTool = tool(
    async (input: {
      startCommand: string;
      healthUrl: string;
      timeoutMs?: number;
    }) => {
      const result = await runSmokeCheck({
        ...input,
        cwd: projectPath,
      });
      return formatSmokeResult(result);
    },
    {
      name: "run_smoke_check",
      description:
        "Start the app, wait for it to boot, and probe a health URL. " +
        "Catches wrong ports, missing env vars, and startup crashes. Run after build + tests pass.",
      schema: z.object({
        startCommand: z.string().describe("Shell command to start the app (e.g. npm run dev)"),
        healthUrl: z.string().describe("URL to probe (e.g. http://localhost:3000/health)"),
        timeoutMs: z.number().int().min(5_000).max(120_000).optional(),
      }),
    },
  );

  const ladderTool = tool(
    async (input: {
      startCommand?: string;
      healthUrl?: string;
      skipTests?: boolean;
      skipSmoke?: boolean;
    }) => {
      const result = await runVerificationLadder(projectPath, input);
      return formatLadderResult(result);
    },
    {
      name: "run_verification_ladder",
      description:
        "Run the full verification ladder: build → tests → runtime smoke. " +
        "Each rung gates the next. Use before declaring a feature complete.",
      schema: z.object({
        startCommand: z.string().optional(),
        healthUrl: z.string().optional(),
        skipTests: z.boolean().optional(),
        skipSmoke: z.boolean().optional(),
      }),
    },
  );

  const detectTool = tool(
    async () => {
      const detected = await detectSmokeConfig(projectPath);
      if (!detected) {
        return "No smoke config detected. Set dev/start script in package.json or pass startCommand + healthUrl manually.";
      }
      return [
        "Detected smoke config:",
        `  startCommand: ${detected.startCommand}`,
        `  healthUrl: ${detected.healthUrl}`,
        `  source: ${detected.source}`,
      ].join("\n");
    },
    {
      name: "detect_smoke_config",
      description: "Auto-detect start command and health URL from package.json scripts.",
      schema: z.object({}),
    },
  );

  return [smokeTool, ladderTool, detectTool];
}
