import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface SmokeCheckInput {
  startCommand: string;
  healthUrl: string;
  timeoutMs?: number;
  cwd?: string;
  warmupMs?: number;
}

export interface SmokeCheckResult {
  ok: boolean;
  message: string;
  statusCode?: number;
  responseBody?: string;
  startupLog: string;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_WARMUP_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeHealthUrl(
  healthUrl: string,
  timeoutMs: number,
): Promise<{ ok: boolean; statusCode?: number; body?: string; error?: string }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(3_000),
      });
      const body = await response.text();
      if (response.ok) {
        return { ok: true, statusCode: response.status, body: body.slice(0, 500) };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (Date.now() >= deadline) {
        return { ok: false, error: message };
      }
    }
    await sleep(500);
  }

  return { ok: false, error: "Health check timed out" };
}

export async function runSmokeCheck(input: SmokeCheckInput): Promise<SmokeCheckResult> {
  const cwd = input.cwd ?? process.cwd();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const warmupMs = input.warmupMs ?? DEFAULT_WARMUP_MS;
  const startedAt = Date.now();
  const logLines: string[] = [];

  const isWin = process.platform === "win32";
  const shell = isWin ? "cmd.exe" : "/bin/sh";
  const shellFlag = isWin ? "/c" : "-c";

  let child: ChildProcess | null = null;

  try {
    child = spawn(shell, [shellFlag, input.startCommand], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const appendLog = (chunk: Buffer, prefix: string) => {
      for (const line of chunk.toString().split("\n")) {
        const trimmed = line.trim();
        if (trimmed) {
          logLines.push(`${prefix}${trimmed}`);
          if (logLines.length > 100) logLines.shift();
        }
      }
    };

    child.stdout?.on("data", (chunk) => appendLog(chunk, ""));
    child.stderr?.on("data", (chunk) => appendLog(chunk, "err: "));

    await sleep(warmupMs);

    const probe = await probeHealthUrl(
      input.healthUrl,
      Math.max(1_000, timeoutMs - warmupMs),
    );

    const durationMs = Date.now() - startedAt;

    if (probe.ok) {
      return {
        ok: true,
        message: `Smoke check passed: ${input.healthUrl} → HTTP ${probe.statusCode}`,
        statusCode: probe.statusCode,
        responseBody: probe.body,
        startupLog: logLines.slice(-20).join("\n"),
        durationMs,
      };
    }

    return {
      ok: false,
      message: `Smoke check failed: ${probe.error ?? "non-OK response"} (${input.healthUrl})`,
      startupLog: logLines.slice(-30).join("\n"),
      durationMs,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      startupLog: logLines.join("\n"),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (child && !child.killed) {
      child.kill("SIGTERM");
      await sleep(300);
      if (!child.killed) child.kill("SIGKILL");
    }
  }
}

export interface DetectedSmokeConfig {
  startCommand: string;
  healthUrl: string;
  source: string;
}

export async function detectSmokeConfig(
  projectPath: string,
): Promise<DetectedSmokeConfig | null> {
  const pkgPath = path.join(projectPath, "package.json");

  try {
    const raw = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as {
      scripts?: Record<string, string>;
    };

    const scripts = pkg.scripts ?? {};
    const startCommand =
      scripts["dev"]
      ?? scripts["start"]
      ?? scripts["serve"]
      ?? null;

    if (!startCommand) return null;

    const portMatch =
      startCommand.match(/(?:PORT|port)[=:\s]+(\d{2,5})/)
      ?? startCommand.match(/:(\d{2,5})/)
      ?? startCommand.match(/\b(\d{4,5})\b/);

    const port = portMatch?.[1] ?? "3000";
    const healthUrl = `http://localhost:${port}/`;

    return {
      startCommand,
      healthUrl,
      source: "package.json scripts",
    };
  } catch {
    return null;
  }
}

export function formatSmokeResult(result: SmokeCheckResult): string {
  const lines = [
    result.ok ? `✅ ${result.message}` : `❌ ${result.message}`,
    `Duration: ${result.durationMs}ms`,
  ];

  if (result.statusCode) {
    lines.push(`Status: ${result.statusCode}`);
  }

  if (result.startupLog) {
    lines.push("", "Startup log (last lines):", result.startupLog);
  }

  return lines.join("\n");
}
