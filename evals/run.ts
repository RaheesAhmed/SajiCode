import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { detectSmokeConfig } from "../src/tools/smoke-check.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = path.join(__dirname, "scenarios");

interface CommandAssertion {
  type: "command";
  command: string;
  expectExitCode?: number;
  expectOutputContains?: string;
}

interface SmokeDetectAssertion {
  type: "smoke-detect";
  packageJson: { scripts: Record<string, string> };
  expect: { startCommand: string; healthUrl: string };
}

type Assertion = CommandAssertion | SmokeDetectAssertion;

interface ScenarioFile {
  name: string;
  description?: string;
  assertions: Assertion[];
}

async function loadScenarios(): Promise<ScenarioFile[]> {
  const files = await fs.readdir(SCENARIOS_DIR);
  const scenarios: ScenarioFile[] = [];

  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const raw = await fs.readFile(path.join(SCENARIOS_DIR, file), "utf-8");
    scenarios.push(JSON.parse(raw) as ScenarioFile);
  }

  return scenarios;
}

async function runCommand(
  command: string,
  cwd: string,
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const flag = isWin ? "/c" : "-c";
    const child = spawn(shell, [flag, command], { cwd, stdio: "pipe" });

    let output = "";
    child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { output += chunk.toString(); });

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, output });
    });
  });
}

async function runScenario(
  scenario: ScenarioFile,
  repoRoot: string,
): Promise<{ name: string; passed: boolean; details: string[] }> {
  const details: string[] = [];
  let passed = true;

  for (const assertion of scenario.assertions) {
    if (assertion.type === "command") {
      const result = await runCommand(assertion.command, repoRoot);
      const expectedCode = assertion.expectExitCode ?? 0;

      if (result.exitCode !== expectedCode) {
        passed = false;
        details.push(`command exit ${result.exitCode} != ${expectedCode}`);
      }

      if (
        assertion.expectOutputContains
        && !result.output.includes(assertion.expectOutputContains)
      ) {
        passed = false;
        details.push(`output missing: ${assertion.expectOutputContains}`);
      }
    }

    if (assertion.type === "smoke-detect") {
      const tmpDir = await fs.mkdtemp(path.join(repoRoot, ".eval-tmp-"));
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify(assertion.packageJson, null, 2),
      );

      const detected = await detectSmokeConfig(tmpDir);
      await fs.rm(tmpDir, { recursive: true, force: true });

      if (
        !detected
        || detected.startCommand !== assertion.expect.startCommand
        || detected.healthUrl !== assertion.expect.healthUrl
      ) {
        passed = false;
        details.push(`smoke-detect mismatch: ${JSON.stringify(detected)}`);
      }
    }
  }

  return { name: scenario.name, passed, details };
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..");
  const scenarios = await loadScenarios();

  if (scenarios.length === 0) {
    console.error("No eval scenarios found");
    process.exit(1);
  }

  let allPassed = true;
  console.log(`Running ${scenarios.length} eval scenario(s)...\n`);

  for (const scenario of scenarios) {
    const result = await runScenario(scenario, repoRoot);
    const icon = result.passed ? "✅" : "❌";
    console.log(`${icon} ${result.name}`);
    if (!result.passed) {
      allPassed = false;
      for (const detail of result.details) {
        console.log(`   • ${detail}`);
      }
    }
  }

  console.log("");
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
