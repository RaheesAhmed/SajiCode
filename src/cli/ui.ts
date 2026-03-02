/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */

import chalk from "chalk";
import ora, { type Ora } from "ora";

const BRAND = chalk.bold.hex("#7C3AED");
const ACCENT = chalk.hex("#A78BFA");
const DIM = chalk.dim;

const BANNER = `
  ${BRAND("OpenAgent")} ${DIM("v1.0.0")}
  ${ACCENT("Your AI Software Engineer")}
`;

export function showBanner(): void {
  console.log(BANNER);
}

export function separator(): void {
  console.log(DIM("─".repeat(50)));
}

export function success(msg: string): void {
  console.log(chalk.green("  ✓"), msg);
}

export function error(msg: string): void {
  console.log(chalk.red("  ✗"), msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow("  ⚠"), msg);
}

export function info(msg: string): void {
  console.log(ACCENT("  ●"), msg);
}

export function dim(msg: string): void {
  console.log(DIM(`  ${msg}`));
}

export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: "magenta",
    indent: 2,
  });
}

export function formatToolCall(toolName: string, args: Record<string, unknown>): string {
  const argsStr = Object.entries(args)
    .map(([k, v]) => {
      const val = typeof v === "string" && v.length > 60 ? v.slice(0, 60) + "…" : String(v);
      return `${DIM(k)}=${chalk.white(val)}`;
    })
    .join(DIM(", "));
  return `${chalk.hex("#F59E0B")("⚡")} ${chalk.bold.hex("#F59E0B")(toolName)} ${DIM("→")} ${argsStr}`;
}

export function formatToolResult(content: string): string {
  const truncated = content.length > 300 ? content.slice(0, 300) + "…" : content;
  return `${DIM("↳")} ${DIM(truncated)}`;
}

export const PROMPT_SYMBOL = chalk.hex("#7C3AED")("❯ ");

export function showPlan(milestones: any[]) {
  console.log(chalk.cyan.bold("\n📅 Current Plan:"));
  milestones.forEach((m) => {
    const icon =
      m.status === "completed"
        ? "✅"
        : m.status === "in_progress"
        ? "🔄"
        : m.status === "failed"
        ? "❌"
        : "⚪";
    console.log(`${icon} ${chalk.bold(m.title)} ${chalk.dim(`(${m.assignee})`)}`);
  });
  console.log("");
}
