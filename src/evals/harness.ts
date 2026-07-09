import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { detectSmokeConfig } from "../tools/smoke-check.js";
import { isDomainAllowed } from "../browser/allowlist.js";

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

interface DomainAllowlistAssertion {
  type: "domain-allowlist";
  url: string;
  allowedDomains: string[];
  expectAllowed: boolean;
}

type Assertion = CommandAssertion | SmokeDetectAssertion | DomainAllowlistAssertion;

interface ScenarioFile {
  name: string;
  description?: string;
  assertions: Assertion[];
}

export interface EvalResult {
  name: string;
  passed: boolean;
  details: string[];
}

export interface RunEvalsOptions {
  repoRoot?: string;
  scenario?: string;
}

function scenariosDir(repoRoot: string): string {
  return path.join(repoRoot, "evals", "scenarios");
}

async function loadScenarios(repoRoot: string): Promise<ScenarioFile[]> {
  const dir = scenariosDir(repoRoot);
  const files = await fs.readdir(dir);
  const scenarios: ScenarioFile[] = [];

  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const raw = await fs.readFile(path.join(dir, file), "utf-8");
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
): Promise<EvalResult> {
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

    if (assertion.type === "domain-allowlist") {
      const gate = isDomainAllowed(assertion.url, assertion.allowedDomains);
      if (gate.allowed !== assertion.expectAllowed) {
        passed = false;
        details.push(
          `allowlist ${assertion.url}: expected allowed=${assertion.expectAllowed}, got ${gate.allowed}`,
        );
      }
    }
  }

  return { name: scenario.name, passed, details };
}

export async function runEvals(options: RunEvalsOptions = {}): Promise<{
  allPassed: boolean;
  results: EvalResult[];
}> {
  const repoRoot = options.repoRoot ?? process.cwd();
  let scenarios = await loadScenarios(repoRoot);

  if (options.scenario) {
    scenarios = scenarios.filter((s) => s.name === options.scenario);
    if (scenarios.length === 0) {
      throw new Error(`No eval scenario named "${options.scenario}"`);
    }
  }

  if (scenarios.length === 0) {
    throw new Error("No eval scenarios found");
  }

  const results: EvalResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, repoRoot));
  }

  return {
    allPassed: results.every((r) => r.passed),
    results,
  };
}
