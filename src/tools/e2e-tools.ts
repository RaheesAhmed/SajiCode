import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "util";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export interface E2EResult {
  ok: boolean;
  summary: string;
  screenshotPath?: string;
  output: string;
}

async function ensureScreenshotDir(projectPath: string): Promise<string> {
  const dir = path.join(projectPath, ".sajicode", "screenshots");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function runPlaywrightSmoke(
  projectPath: string,
  input: {
    baseUrl: string;
    testFile?: string;
    headed?: boolean;
  },
): Promise<E2EResult> {
  const isWin = process.platform === "win32";
  const sh = isWin ? "cmd.exe" : "/bin/sh";
  const shFlag = isWin ? "/c" : "-c";
  const screenshotDir = await ensureScreenshotDir(projectPath);

  const args = [
    "playwright",
    "test",
    ...(input.testFile ? [input.testFile] : []),
    "--reporter=line",
  ];

  const env = {
    ...process.env,
    BASE_URL: input.baseUrl,
    PLAYWRIGHT_SCREENSHOT_DIR: screenshotDir,
  };

  const cmd = `npx ${args.join(" ")}`;

  try {
    const result = await execFileAsync(sh, [shFlag, cmd], {
      cwd: projectPath,
      timeout: 300_000,
      env,
    });
    const output = ((result.stdout ?? "") + (result.stderr ?? "")).trim();
    return {
      ok: true,
      summary: "Playwright E2E passed",
      output: output.slice(0, 4_000),
    };
  } catch (error: any) {
    const output = ((error.stdout ?? "") + (error.stderr ?? "")).trim();
    const screenshotPath = path.join(screenshotDir, "failure.png");

    let screenshotNote = "";
    try {
      await fs.access(screenshotPath);
      screenshotNote = `\nScreenshot: ${screenshotPath}`;
    } catch {
      // no screenshot captured
    }

    return {
      ok: false,
      summary: `Playwright E2E failed${screenshotNote}`,
      ...(screenshotNote ? { screenshotPath } : {}),
      output: output.slice(0, 4_000),
    };
  }
}

export async function scaffoldPlaywrightConfig(projectPath: string): Promise<string> {
  const configPath = path.join(projectPath, "playwright.config.ts");
  try {
    await fs.access(configPath);
    return configPath;
  } catch {
    // fall through
  }

  const testsDir = path.join(projectPath, "tests", "e2e");
  await fs.mkdir(testsDir, { recursive: true });

  const config = `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
`;

  const sampleTest = `import { test, expect } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
});
`;

  await fs.writeFile(configPath, config, "utf-8");
  await fs.writeFile(path.join(testsDir, "smoke.spec.ts"), sampleTest, "utf-8");

  return configPath;
}

export function createE2ETools(projectPath: string) {
  const runE2ETool = tool(
    async (input: { baseUrl: string; testFile?: string }) => {
      const result = await runPlaywrightSmoke(projectPath, input);
      const lines = [result.summary, "", result.output];
      if (result.screenshotPath) {
        lines.push("", `Failure screenshot saved: ${result.screenshotPath}`);
        lines.push("Share this path with frontend-lead for visual debugging.");
      }
      return lines.join("\n");
    },
    {
      name: "run_e2e_tests",
      description:
        "Run Playwright browser E2E tests against a live URL (local dev server or deploy preview). " +
        "Captures screenshots on failure for frontend-lead feedback.",
      schema: z.object({
        baseUrl: z.string().describe("Base URL of running app (e.g. http://localhost:3000 or preview URL)"),
        testFile: z.string().optional().describe("Specific test file to run"),
      }),
    },
  );

  const initPlaywrightTool = tool(
    async () => {
      const configPath = await scaffoldPlaywrightConfig(projectPath);
      return [
        `Playwright scaffold written: ${configPath}`,
        "Install with: npm install -D @playwright/test && npx playwright install chromium",
        "Sample smoke test: tests/e2e/smoke.spec.ts",
      ].join("\n");
    },
    {
      name: "init_playwright",
      description: "Scaffold playwright.config.ts and a sample smoke E2E test if missing.",
      schema: z.object({}),
    },
  );

  return [runE2ETool, initPlaywrightTool];
}
