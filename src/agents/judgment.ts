import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import chalk from "chalk";
import { RiskLevel } from "../types/index.js";
import { normalizeToolResultContent } from "./context-guard.js";

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

    // Graceful error handling wrapper
    try {

    if (toolName === "write_file" || toolName === "edit_file") {
      const content = (args["content"] ?? args["new_str"] ?? "") as string;
      const filePath = (args["file_path"] ?? args["path"] ?? "") as string;
      const normalizedPath = filePath.replace(/\\/g, "/");
      const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();

      if (ext !== ".md") {
        const msg = `[JUDGMENT BLOCKED] PM Agent cannot write implementation files.

PM responsibilities:
1. Create planning/context Markdown files only
2. Build task graphs and dependency order
3. Delegate all coding work to specialist agents with task()

Blocked file: "${filePath}"
Delegate this implementation to the responsible lead agent instead.`;
        console.log(chalk.red(`  ✗ BLOCKED: PM attempted implementation write: ${filePath}`));
        return new ToolMessage({
          name: toolName,
          content: msg,
          tool_call_id: (request.toolCall as any).id || "unknown",
          status: "error"
        });
      }

      const SOURCE_EXTENSIONS = new Set([
        ".ts", ".tsx", ".js", ".jsx", ".py", ".css", ".vue", ".svelte",
        ".html", ".scss", ".less", ".go", ".rs", ".java", ".rb",
      ]);
      const isSajicodeMd = normalizedPath.includes(".sajicode/") && ext === ".md";

      if (SOURCE_EXTENSIONS.has(ext) && !isSajicodeMd) {
        const lineCount = typeof content === "string" ? content.split("\n").length : 0;
        const PM_DIRECT_WRITE_THRESHOLD = 300;

        if (lineCount >= PM_DIRECT_WRITE_THRESHOLD) {
          const msg = `[JUDGMENT BLOCKED] PM Agent: file "${filePath}" has ${lineCount} lines (>= ${PM_DIRECT_WRITE_THRESHOLD}). Large files must be delegated to a specialist agent via task(). You CAN write files under ${PM_DIRECT_WRITE_THRESHOLD} lines directly for small tasks.`;
          console.log(chalk.red(`  ✗ BLOCKED: PM file too large: ${filePath} (${lineCount} lines) — delegate to specialist`));
          return new ToolMessage({
            name: toolName,
            content: msg,
            tool_call_id: (request.toolCall as any).id || "unknown",
            status: "error"
          });
        }
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

    const isLooping = recordAndDetectLoop(toolName, args);
    if (isLooping) {
      const msg = `[JUDGMENT WARNING] You have called "${toolName}" with the same arguments ${MAX_REPEATS}+ times in a row. You are stuck in a loop.\n\nSTOP repeating. Do one of:\n1. Try a completely different approach\n2. If truly blocked, call update_project_log with status "blocked" and explain what you tried\n3. Return to PM with a clear description of what is preventing progress`;
      console.log(chalk.magenta(`  🔁 LOOP DETECTED: ${toolName} called ${MAX_REPEATS}+ times identically`));
      const result = normalizeToolResultContent(await handler(request)) as any;
      if (result && typeof result === "object") {
        if ("content" in result) {
          result.content = (result.content ?? "") + "\n\n" + msg;
        } else {
          result.output = (result.output ?? "") + "\n\n" + msg;
        }
      }
      return normalizeToolResultContent(result);
    }

    return normalizeToolResultContent(await handler(request));
    } catch (error: any) {
      // Gracefully handle tool execution errors
      console.log(chalk.red(`  ✗ Tool error in ${toolName}: ${error.message}`));
      
      // Extract helpful error details
      let errorMsg = `[TOOL ERROR] ${toolName} failed: ${error.message}`;
      
      // Special handling for schema validation errors
      if (error.message.includes("Invalid enum value") || error.message.includes("expected schema")) {
        const match = error.message.match(/Expected '([^']+)'/);
        if (match) {
          errorMsg += `\n\nValid values: ${match[1]}`;
        }
        errorMsg += `\n\nPlease retry with correct parameter values.`;
      }
      
      // Return error as ToolMessage so agent can recover
      return new ToolMessage({
        name: toolName,
        content: errorMsg,
        tool_call_id: (request.toolCall as any).id || "unknown",
        status: "error"
      });
    }
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

    // Leads can write source files directly up to LEAD_FILE_THRESHOLD lines.
    // HTML, CSS, SCSS, and data/template files are intentionally EXEMPT —
    // they are layout/style files and can legitimately be longer.
    // Leads ARE always allowed to write .json, .md, .yml, .yaml configs of any size.
    if (toolName === "write_file" || toolName === "edit_file") {
      const filePath = (args["file_path"] ?? args["path"] ?? "") as string;
      const content = (args["content"] ?? args["new_str"] ?? "") as string;

      // Only enforce the line cap on logic/code files — NOT on template/style/data files
      const SOURCE_EXTENSIONS = new Set([
        ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
        ".py", ".go", ".rs", ".java", ".rb", ".php",
        ".vue", ".svelte",
        // NOTE: .html, .css, .scss, .less are intentionally EXCLUDED so that
        // leads can write full-page HTML templates and complete stylesheets
        // without hitting an artificial ceiling.
      ]);
      const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();

      if (SOURCE_EXTENSIONS.has(ext)) {
        const lineCount = typeof content === "string" ? content.split("\n").length : 0;
        // Raised from 300 → 800. A well-designed feature module, a complete
        // Python service, or a full React component can exceed 300 lines
        // without violating good architecture.
        const LEAD_FILE_THRESHOLD = 800;

        if (lineCount >= LEAD_FILE_THRESHOLD) {
          const msg = `[LEAD BLOCKED] File "${filePath}" has ${lineCount} lines (>= ${LEAD_FILE_THRESHOLD}).

This file is too large. You should:
1. Split it into focused modules (each under ${LEAD_FILE_THRESHOLD} lines)
2. Extract reusable helpers, types, and constants into separate files
3. One responsibility per file

HTML, CSS, and SCSS files have no line limit and can be written at any length.`;
          console.log(chalk.red(`  ✗ LEAD BLOCKED: ${filePath} (${lineCount} lines) — split into focused modules`));
          return new ToolMessage({
            name: toolName,
            content: msg,
            tool_call_id: (request.toolCall as any).id || "unknown",
            status: "error",
          });
        }
      }
    }

    return normalizeToolResultContent(await handler(request));
  },
});
