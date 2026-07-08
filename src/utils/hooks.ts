import { execSync } from "node:child_process";
import { runLegacyHook } from "../hooks/hook-engine.js";
import type { HooksConfig } from "../types/index.js";

/**
 * Legacy hook runner — delegates to the async hook engine.
 * Kept for backward compatibility with existing call sites.
 */
export function runHook(
  hookName: "preTask" | "postTask" | "onExit",
  config: HooksConfig | undefined,
  projectPath: string,
  payload: { task?: string; summary?: string } = {},
): void {
  void runLegacyHook(hookName, config, projectPath, payload).catch((error) => {
    console.error(`Hook ${hookName} failed:`, error instanceof Error ? error.message : error);
  });
}

/** @deprecated Use hook-engine emitHook instead. Sync exec kept for scripts that import directly. */
export function runHookSync(
  hookName: keyof HooksConfig,
  config: HooksConfig | undefined,
  projectPath: string,
): void {
  if (!config || !config[hookName]) return;

  const value = config[hookName];
  const command = typeof value === "string" ? value : undefined;
  if (!command) return;

  try {
    execSync(command, { cwd: projectPath, encoding: "utf-8", timeout: 60_000, stdio: "pipe" });
  } catch {
    // Silent — legacy behavior
  }
}
