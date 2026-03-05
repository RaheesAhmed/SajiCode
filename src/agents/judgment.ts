import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import chalk from "chalk";
import { RiskLevel } from "../types/index.js";

const HIGH_RISK_PATTERNS = [
  "rm -rf", "rm -r", "drop table", "truncate table",
  "drop database", "alter table",
];

const SENSITIVE_PATHS = [
  ".env", "credentials", "secrets", ".ssh", "private_key",
];

const SKIP_EXTENSIONS = new Set([
  ".json", ".md", ".env", ".yml", ".yaml", ".toml", ".txt", ".csv", ".xml",
  ".html", ".css", ".svg", ".lock",
]);

// Only match in comment lines — case-sensitive uppercase
const PLACEHOLDER_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /^[\s]*(?:\/\/|\/\*|#)\s*TODO\b/, label: "TODO comment" },
  { regex: /^[\s]*(?:\/\/|\/\*|#)\s*FIXME\b/, label: "FIXME comment" },
  { regex: /^[\s]*(?:\/\/|\/\*|#)\s*HACK\b/, label: "HACK comment" },
  { regex: /\/\/\s*implement\b/i, label: "// implement" },
  { regex: /\/\/\s*your code here/i, label: "// your code here" },
  { regex: /\/\/\s*add your/i, label: "// add your" },
  { regex: /throw new Error\(["']not implemented/i, label: "throw not implemented" },
  { regex: /\{\s*\.\.\.\s*\}/, label: "ellipsis body { ... }" },
];

function hasPlaceholder(content: string, filePath?: string): { found: boolean; match: string } {
  if (filePath) {
    const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
    if (SKIP_EXTENSIONS.has(ext)) {
      return { found: false, match: "" };
    }
  }

  const lines = content.split("\n");
  for (const line of lines) {
    for (const { regex, label } of PLACEHOLDER_PATTERNS) {
      if (regex.test(line)) {
        return { found: true, match: label };
      }
    }
  }
  return { found: false, match: "" };
}

function assessRisk(
  toolName: string,
  args: Record<string, unknown>
): { level: RiskLevel; reason: string } {
  const argsStr = JSON.stringify(args).toLowerCase();
  const combined = `${toolName} ${argsStr}`;

  for (const pattern of HIGH_RISK_PATTERNS) {
    if (combined.includes(pattern)) {
      return { level: RiskLevel.HighRisk, reason: `Destructive pattern: "${pattern}"` };
    }
  }

  for (const p of SENSITIVE_PATHS) {
    if (argsStr.includes(p)) {
      return { level: RiskLevel.Caution, reason: `Sensitive path: "${p}"` };
    }
  }

  if (toolName === "execute" || toolName === "bash") {
    return { level: RiskLevel.Caution, reason: "Shell execution" };
  }

  return { level: RiskLevel.Safe, reason: "" };
}

const IDEMPOTENT_COMMAND_PATTERNS: RegExp[] = [
  /npm install/,
  /npm ci/,
  /npm run build/,
];

const MAX_HISTORY = 30;
const MAX_REPEATS = 3;
const toolCallHistory: Array<{ name: string; hash: string }> = [];

function recordAndDetectLoop(toolName: string, args: Record<string, unknown>): boolean {
  const hash = `${toolName}::${JSON.stringify(args)}`;
  toolCallHistory.push({ name: toolName, hash });
  if (toolCallHistory.length > MAX_HISTORY) toolCallHistory.shift();

  const recent = toolCallHistory.slice(-10);
  const repeats = recent.filter((h) => h.hash === hash).length;
  return repeats >= MAX_REPEATS;
}

export const judgmentMiddleware = createMiddleware({
  name: "JudgmentLayerMiddleware",
  // @ts-expect-error - DeepAgents middleware typing
  wrapToolCall: async (
    request: { toolCall: { name: string; args: Record<string, unknown> } },
    handler: (req: unknown) => Promise<unknown>
  ) => {
    const { name: toolName, args } = request.toolCall;

    const { level, reason } = assessRisk(toolName, args);
    if (level === RiskLevel.HighRisk) {
      console.log(chalk.hex("#FF6600")(`  ⚠  HIGH RISK: ${reason}`));
    } else if (level === RiskLevel.Caution) {
      console.log(chalk.yellow(`  ⚡ Caution: ${reason}`));
    }

    if (toolName === "write_file" || toolName === "edit_file") {
      const content = (args["content"] ?? args["new_str"] ?? "") as string;
      const filePath = (args["file_path"] ?? args["path"] ?? "") as string;

      const SOURCE_EXTENSIONS = new Set([
        ".ts", ".tsx", ".js", ".jsx", ".py", ".css", ".vue", ".svelte",
        ".html", ".scss", ".less", ".go", ".rs", ".java", ".rb",
      ]);
      const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
      const isSajicodeMd = filePath.includes(".sajicode") && ext === ".md";

      if (SOURCE_EXTENSIONS.has(ext) && !isSajicodeMd) {
        const msg = `[JUDGMENT BLOCKED] PM Agent cannot write source code files directly. You MUST delegate this to a specialist agent via task().

File attempted: "${filePath}"

Use task(subagent_type="backend-lead", ...) or task(subagent_type="frontend-lead", ...) to delegate this work. Check your AGENTS AVAILABLE list and assign to the right specialist. Include "CHECK YOUR SKILLS" in every delegation.`;
        console.log(chalk.red(`  ✗ BLOCKED: PM tried to write source code: ${filePath} — must delegate`));
        return new ToolMessage({
          name: toolName,
          content: msg,
          tool_call_id: (request.toolCall as any).id || "unknown",
          status: "error"
        });
      }

      if (typeof content === "string" && content.length > 0) {
        const { found, match } = hasPlaceholder(content, filePath);
        if (found) {
          const msg = `[JUDGMENT BLOCKED] write_file was blocked because the content contains placeholder code: "${match}"\n\nYou MUST write complete, working implementation. Do NOT write stubs, TODOs, or placeholder code. Review your skill files and implement the actual logic now.`;
          console.log(chalk.red(`  ✗ BLOCKED: Placeholder detected in ${toolName} — "${match}"`));
          return new ToolMessage({
            name: toolName,
            content: msg,
            tool_call_id: (request.toolCall as any).id || "unknown",
            status: "error"
          });
        }
      }
    }

    if (toolName === "execute" || toolName === "bash") {
      const command = (args["command"] ?? args["bash"] ?? "") as string;
      for (const pattern of IDEMPOTENT_COMMAND_PATTERNS) {
        if (pattern.test(command)) {
          const cmdHash = `cmd::${command}`;
          const recentSame = toolCallHistory.slice(-5).filter((h) => h.hash === cmdHash).length;
          if (recentSame >= 2) {
            console.log(
              chalk.yellow(
                `  ⚠ WARNING: "${command}" called ${recentSame} times recently. ` +
                `Check .sajicode/process-state.json — it may have already completed.`
              )
            );
          }
          break;
        }
      }
    }

    const isLooping = recordAndDetectLoop(toolName, args);
    if (isLooping) {
      const msg = `[JUDGMENT WARNING] You have called "${toolName}" with the same arguments ${MAX_REPEATS}+ times in a row. You are stuck in a loop.\n\nSTOP repeating. Do one of:\n1. Try a completely different approach\n2. If truly blocked, call update_project_log with status "blocked" and explain what you tried\n3. Return to PM with a clear description of what is preventing progress`;
      console.log(chalk.magenta(`  🔁 LOOP DETECTED: ${toolName} called ${MAX_REPEATS}+ times identically`));
      const result = await handler(request) as any;
      if (result && typeof result === "object") {
        if ("content" in result) {
          result.content = (result.content ?? "") + "\n\n" + msg;
        } else {
          result.output = (result.output ?? "") + "\n\n" + msg;
        }
      }
      return result;
    }

    return await handler(request);
  },
});
export const leadJudgmentMiddleware = createMiddleware({
  name: "LeadJudgmentMiddleware",
  // @ts-expect-error - DeepAgents middleware typing
  wrapToolCall: async (
    request: { toolCall: { name: string; args: Record<string, unknown> } },
    handler: (req: unknown) => Promise<unknown>
  ) => {
    const { name: toolName, args } = request.toolCall;

    // Leads can write SMALL source files directly (< 50 lines).
    // Large files (>= 50 lines) must be delegated to sub-agents via task().
    // Leads ARE always allowed to: write .json, .md, .yml, .yaml configs.
    if (toolName === "write_file" || toolName === "edit_file") {
      const filePath = (args["file_path"] ?? args["path"] ?? "") as string;
      const content = (args["content"] ?? args["new_str"] ?? "") as string;
      const SOURCE_EXTENSIONS = new Set([
        ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
        ".py", ".go", ".rs", ".java", ".rb", ".php",
        ".css", ".scss", ".less", ".vue", ".svelte",
      ]);
      const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();

      if (SOURCE_EXTENSIONS.has(ext)) {
        const lineCount = typeof content === "string" ? content.split("\n").length : 0;
        const SMALL_FILE_THRESHOLD = 50;

        if (lineCount >= SMALL_FILE_THRESHOLD) {
          const msg = `[LEAD BLOCKED] File "${filePath}" has ${lineCount} lines (>= ${SMALL_FILE_THRESHOLD}).

Large source files must be delegated to sub-agents via task().
You CAN write files under ${SMALL_FILE_THRESHOLD} lines directly (index files, configs, utilities).

Dispatch NOW using task(subagent_type="<sub-agent-name>", ...).`;
          console.log(chalk.red(`  ✗ LEAD BLOCKED: ${filePath} (${lineCount} lines) — must dispatch to sub-agent`));
          return new ToolMessage({
            name: toolName,
            content: msg,
            tool_call_id: (request.toolCall as any).id || "unknown",
            status: "error",
          });
        }
      }
    }

    return await handler(request);
  },
});
