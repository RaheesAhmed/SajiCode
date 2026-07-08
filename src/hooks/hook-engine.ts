import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import { appendAuditEntry } from "../audit/audit-log.js";
import { matchesHookMatcher } from "./matchers.js";
import type {
  HookContext,
  HookDefinition,
  HookEventConfig,
  HookEventName,
  HookPayload,
  HookRunResult,
  HooksConfigV2,
} from "./types.js";

const execFileAsync = promisify(execFile);

const CY = chalk.cyan;
const GY = chalk.gray;
const G = chalk.green;
const YL = chalk.yellow;
const RD = chalk.red;

const DEFAULT_TIMEOUT_MS = 60_000;
const BLOCKING_EVENTS = new Set<HookEventName>([
  "preToolUse",
  "preFileWrite",
  "preShell",
  "preCommit",
]);

let hookContext: HookContext | null = null;

export function setHookContext(context: HookContext | null): void {
  hookContext = context;
}

export function getHookContext(): HookContext | null {
  return hookContext;
}

export function normalizeHookDefinitions(
  value: HookEventConfig | undefined,
): HookDefinition[] {
  if (!value) return [];
  if (typeof value === "string") {
    return [{ command: value, blocking: false }];
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      typeof entry === "string"
        ? { command: entry, blocking: false }
        : { ...entry, blocking: entry.blocking ?? false },
    );
  }
  return [{ ...value, blocking: value.blocking ?? false }];
}

function substituteCommandTemplate(
  command: string,
  payload: HookPayload,
): string {
  const files = (payload.files ?? payload.paths ?? []).join(" ");
  const replacements: Record<string, string> = {
    toolName: payload.toolName ?? "",
    command: payload.command ?? "",
    agentName: payload.agentName ?? "",
    task: payload.task ?? "",
    files,
    message: payload.message ?? "",
    status: payload.status ?? "",
  };

  let result = command;
  for (const [key, val] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, val);
  }
  return result;
}

function isWindows(): boolean {
  return process.platform === "win32";
}

async function runSingleHook(
  event: HookEventName,
  definition: HookDefinition,
  payload: HookPayload,
  projectPath: string,
): Promise<HookRunResult> {
  const command = substituteCommandTemplate(definition.command, payload);
  const timeout = definition.timeout ?? DEFAULT_TIMEOUT_MS;
  const blocking = definition.blocking ?? BLOCKING_EVENTS.has(event);

  console.log(`\n  ${CY("⚡")} ${GY(`Hook ${event}:`)} ${command}`);

  const shell = isWindows() ? "cmd.exe" : "/bin/sh";
  const shellFlag = isWindows() ? "/c" : "-c";

  try {
    const result = await execFileAsync(shell, [shellFlag, command], {
      cwd: projectPath,
      timeout,
      env: {
        ...process.env,
        SAJICODE_HOOK_EVENT: event,
        SAJICODE_HOOK_PAYLOAD: JSON.stringify(payload),
        SAJICODE_PROJECT_PATH: projectPath,
      },
      maxBuffer: 1024 * 1024,
    });

    const output = ((result.stdout ?? "") + (result.stderr ?? "")).trim();
    if (output) {
      for (const line of output.split("\n")) {
        console.log(`    ${GY("│")} ${GY(line.trim())}`);
      }
    }
    console.log(`    ${G("✓")} ${GY("Hook completed")}\n`);

    await appendAuditEntry(projectPath, {
      event: "hook",
      toolName: event,
      outcome: "allow",
      detail: command.slice(0, 200),
    });

    return { allowed: true, warnings: [] };
  } catch (error: any) {
    const exitCode = typeof error.code === "number" ? error.code : 1;
    const stderr = String(error.stderr ?? error.message ?? "").trim();
    const stdout = String(error.stdout ?? "").trim();

    if (stdout) {
      for (const line of stdout.split("\n")) {
        console.log(`    ${GY("│")} ${GY(line.trim())}`);
      }
    }
    if (stderr) {
      for (const line of stderr.split("\n")) {
        console.log(`    ${GY("│")} ${RD(line.trim())}`);
      }
    }

    if (blocking && exitCode === 2) {
      console.log(`    ${RD("✗")} ${RD("Hook denied action")}\n`);
      await appendAuditEntry(projectPath, {
        event: "hook",
        toolName: event,
        outcome: "block",
        detail: stderr || "Hook returned exit code 2",
      });
      return {
        allowed: false,
        denyReason: stderr || "Hook denied this action (exit code 2)",
        warnings: [],
      };
    }

    const warnMsg = stderr || error.message || "Hook failed";
    console.log(`    ${YL("⚠")} ${YL(`Hook warning: ${warnMsg}`)}\n`);

    await appendAuditEntry(projectPath, {
      event: "hook",
      toolName: event,
      outcome: "warn",
      detail: warnMsg.slice(0, 200),
    });

    return { allowed: true, warnings: [warnMsg] };
  }
}

export async function emitHook(
  event: HookEventName,
  payload: HookPayload = {},
): Promise<HookRunResult> {
  if (!hookContext?.hooks) {
    return { allowed: true, warnings: [] };
  }

  const projectPath = payload.projectPath ?? hookContext.projectPath;
  const enriched: HookPayload = {
    ...payload,
    projectPath,
    agentName: payload.agentName ?? hookContext.defaultAgentName,
  };

  const hooksConfig = hookContext.hooks as HooksConfigV2;
  const legacyOnExit = event === "sessionEnd" ? hooksConfig.onExit : undefined;
  const eventConfig =
    hooksConfig[event as keyof HooksConfigV2] ?? legacyOnExit;

  const definitions = normalizeHookDefinitions(
    eventConfig as HookEventConfig | undefined,
  );

  const matched = definitions.filter((def) =>
    matchesHookMatcher(def.matcher, enriched),
  );

  if (matched.length === 0) {
    return { allowed: true, warnings: [] };
  }

  const warnings: string[] = [];
  for (const definition of matched) {
    const result = await runSingleHook(event, definition, enriched, projectPath);
    if (!result.allowed) {
      return result;
    }
    warnings.push(...result.warnings);
  }

  return { allowed: true, warnings };
}

/** Fire-and-forget for non-blocking lifecycle hooks. */
export function emitHookAsync(
  event: HookEventName,
  payload: HookPayload = {},
): void {
  void emitHook(event, payload).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.gray(`  hook ${event} skipped: ${message}`));
  });
}

/** Backward-compatible sync-style entry for legacy string hooks. */
export async function runLegacyHook(
  hookName: "preTask" | "postTask" | "onExit",
  hooks: HooksConfigV2 | undefined,
  projectPath: string,
  payload: HookPayload = {},
): Promise<void> {
  const previous = hookContext;
  setHookContext({ projectPath, hooks });
  try {
    const event: HookEventName =
      hookName === "onExit" ? "sessionEnd" : hookName;
    await emitHook(event, { ...payload, projectPath });
  } finally {
    setHookContext(previous);
  }
}
