import { execSync } from "node:child_process";
import chalk from "chalk";
import { type HooksConfig } from "../types/index.js";

const CY = chalk.cyan;
const GY = chalk.gray;
const G = chalk.green;
const RD = chalk.red;

export function runHook(
  hookName: keyof HooksConfig,
  config: HooksConfig | undefined,
  projectPath: string
): void {
  if (!config || !config[hookName]) return;

  const command = config[hookName] as string;
  console.log(`\n  ${CY("⚡")} ${GY(`Running ${hookName} hook: `)}${command}`);

  try {
    const output = execSync(command, {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 60_000,
      stdio: "pipe", // Capture output so we can format it nicely
    });

    if (output.trim()) {
      for (const line of output.trim().split("\n")) {
        console.log(`    ${GY("│")} ${GY(line.trim())}`);
      }
    }
    console.log(`    ${G("✓")} ${GY("Hook completed successfully")}\n`);
  } catch (error: any) {
    console.log(`    ${RD("✗")} ${RD(`Hook failed: ${error.message}`)}`);
    if (error.stdout) {
      for (const line of error.stdout.toString().trim().split("\n")) {
        console.log(`    ${GY("│")} ${GY(line.trim())}`);
      }
    }
    if (error.stderr) {
      for (const line of error.stderr.toString().trim().split("\n")) {
        console.log(`    ${GY("│")} ${RD(line.trim())}`);
      }
    }
    console.log("");
  }
}
