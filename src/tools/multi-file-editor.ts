import { tool, type ToolRuntime } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { PredictiveAnalyzer } from "../agents/predictive-analysis.js";
import { getSnapshotIndex, saveSnapshotIndex } from "./file-tracker.js";

const execFileAsync = promisify(execFile);

type FileOperationType = "write" | "replace" | "append" | "prepend";

interface FileOperation {
  type: FileOperationType;
  filePath: string;
  content?: string;
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
  overwrite?: boolean;
}

interface PreparedOperation extends FileOperation {
  absolutePath: string;
  relativePath: string;
}

interface FileBackup {
  absolutePath: string;
  relativePath: string;
  existed: boolean;
  content: string;
}

interface BatchPlan {
  operations: PreparedOperation[];
  warnings: string[];
  predictedIssues: Array<{
    filePath: string;
    severity: string;
    category: string;
    line?: number;
    message: string;
    suggestion: string;
  }>;
}

const PROTECTED_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
]);

const PROTECTED_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
]);

/**
 * Extensions where we enforce a line-count cap.
 * HTML, CSS, SCSS, and other template/style files are intentionally excluded
 * because they are data/layout files, not source-logic modules, and can
 * legitimately exceed 800 lines without creating maintenance problems.
 */
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".rb", ".php",
  ".vue", ".svelte",
]);

/**
 * Hard ceiling: files above this line count are rejected outright.
 * Raised from 300 → 800 so that a feature module, a large React component,
 * or a complete Python service can be written as a single cohesive file when
 * splitting would harm readability.
 */
const MAX_LINES_HARD = 800;

/**
 * Soft ceiling: files above this threshold get a non-blocking warning in the
 * batch result so the agent is nudged toward splitting without being blocked.
 */

function normalizeRelativePath(projectPath: string, filePath: string): { absolutePath: string; relativePath: string } {
  const absoluteProject = path.resolve(projectPath);
  const absolutePath = path.resolve(path.isAbsolute(filePath) ? filePath : path.join(projectPath, filePath));
  const relativePath = path.relative(absoluteProject, absolutePath).replace(/\\/g, "/");

  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Path escapes project root: ${filePath}`);
  }

  const segments = relativePath.split("/");
  for (const segment of segments) {
    if (PROTECTED_SEGMENTS.has(segment)) {
      throw new Error(`Protected path segment "${segment}" is not editable by batch tools: ${filePath}`);
    }
  }

  if (PROTECTED_FILE_NAMES.has(path.basename(relativePath))) {
    throw new Error(`Protected secret file cannot be edited by batch tools: ${filePath}`);
  }

  return { absolutePath, relativePath };
}

function operationLineCount(operation: FileOperation): number {
  const content = operation.type === "replace" ? operation.newString ?? "" : operation.content ?? "";
  return content.split("\n").length;
}

function validateOperationShape(operation: FileOperation): void {
  if (operation.type === "write") {
    if (operation.content === undefined) throw new Error(`write operation for ${operation.filePath} requires content`);
    return;
  }
  if (operation.type === "replace") {
    if (!operation.oldString) throw new Error(`replace operation for ${operation.filePath} requires oldString`);
    if (operation.newString === undefined) throw new Error(`replace operation for ${operation.filePath} requires newString`);
    return;
  }
  if (operation.type === "append" || operation.type === "prepend") {
    if (operation.content === undefined) throw new Error(`${operation.type} operation for ${operation.filePath} requires content`);
  }
}

async function readIfExists(absolutePath: string): Promise<{ existed: boolean; content: string }> {
  try {
    return { existed: true, content: await fs.readFile(absolutePath, "utf-8") };
  } catch (error: any) {
    if (error?.code === "ENOENT") return { existed: false, content: "" };
    throw error;
  }
}

async function computeNextContent(operation: PreparedOperation): Promise<string> {
  const current = await readIfExists(operation.absolutePath);

  switch (operation.type) {
    case "write":
      if (current.existed && operation.overwrite === false) {
        throw new Error(`Refusing to overwrite existing file: ${operation.relativePath}`);
      }
      return operation.content ?? "";
    case "replace": {
      if (!current.existed) throw new Error(`Cannot replace text in missing file: ${operation.relativePath}`);
      const oldString = operation.oldString ?? "";
      const newString = operation.newString ?? "";
      if (!current.content.includes(oldString)) {
        throw new Error(`oldString not found in ${operation.relativePath}`);
      }
      return operation.replaceAll
        ? current.content.split(oldString).join(newString)
        : current.content.replace(oldString, newString);
    }
    case "append":
      return current.content + (operation.content ?? "");
    case "prepend":
      return (operation.content ?? "") + current.content;
  }
}

async function saveBatchSnapshot(projectPath: string, backups: FileBackup[], agentName: string): Promise<string> {
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const snapshotRoot = path.join(projectPath, ".sajicode", "snapshots");
  await fs.mkdir(snapshotRoot, { recursive: true });

  const index = await getSnapshotIndex(projectPath);
  for (const backup of backups.filter((item) => item.existed)) {
    const safeName = backup.relativePath.replace(/[/\\:]/g, "_").replace(/^_/, "");
    const snapshotFileName = `${Date.now()}_${batchId}_${safeName}`;
    await fs.writeFile(path.join(snapshotRoot, snapshotFileName), backup.content, "utf-8");
    index.push({
      filePath: backup.relativePath,
      content: snapshotFileName,
      timestamp: new Date().toISOString(),
      agentName,
    });
  }

  await saveSnapshotIndex(projectPath, index);
  return batchId;
}

async function restoreBackups(backups: FileBackup[]): Promise<void> {
  for (const backup of [...backups].reverse()) {
    if (backup.existed) {
      await fs.mkdir(path.dirname(backup.absolutePath), { recursive: true });
      await fs.writeFile(backup.absolutePath, backup.content, "utf-8");
    } else {
      try {
        await fs.unlink(backup.absolutePath);
      } catch (error: any) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
}

async function prepareBatch(
  projectPath: string,
  operations: FileOperation[],
  options: { runPredictiveAnalysis: boolean; allowHighRisk: boolean },
): Promise<BatchPlan> {
  if (operations.length === 0) throw new Error("At least one file operation is required");
  if (operations.length > 30) throw new Error("Batch limit is 30 file operations");

  const analyzer = new PredictiveAnalyzer();
  const warnings: string[] = [];
  const predictedIssues: BatchPlan["predictedIssues"] = [];
  const prepared = operations.map((operation) => {
    validateOperationShape(operation);
    const normalized = normalizeRelativePath(projectPath, operation.filePath);
    const lines = operationLineCount(operation);
    const ext = path.extname(normalized.relativePath).toLowerCase();

    if (SOURCE_EXTENSIONS.has(ext) && lines >= MAX_LINES_HARD) {
      throw new Error(
        `File ${normalized.relativePath} has ${lines} lines which exceeds the ${MAX_LINES_HARD}-line ceiling. ` +
        `Split it into focused modules. ` +
        `HTML, CSS, and SCSS files are exempt from this limit.`
      );
    }

    return {
      ...operation,
      absolutePath: normalized.absolutePath,
      relativePath: normalized.relativePath,
    };
  });

  const seen = new Set<string>();
  for (const operation of prepared) {
    if (operation.type === "write" && seen.has(operation.relativePath)) {
      warnings.push(`Multiple operations target ${operation.relativePath}; order will be preserved.`);
    }
    seen.add(operation.relativePath);
  }

  if (options.runPredictiveAnalysis) {
    for (const operation of prepared) {
      if (operation.type !== "write") continue;
      const content = operation.content ?? "";
      const ext = path.extname(operation.relativePath).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(ext)) continue;

      const issues = await analyzer.analyzeBeforeExecution({
        code: content,
        filePath: operation.relativePath,
        projectPath,
      });

      for (const issue of issues) {
        predictedIssues.push({
          filePath: operation.relativePath,
          severity: issue.severity,
          category: issue.category,
          line: issue.line,
          message: issue.message,
          suggestion: issue.suggestion,
        });
      }
    }

    const highIssues = predictedIssues.filter((issue) => issue.severity === "high");
    if (highIssues.length > 0 && !options.allowHighRisk) {
      const first = highIssues[0]!;
      throw new Error(
        `Predictive analysis blocked batch: ${first.filePath} has high-risk ${first.category}. ` +
        `${first.message} Fix it or set allowHighRisk with a clear rationale.`
      );
    }
  }

  return { operations: prepared, warnings, predictedIssues };
}

function formatPlan(plan: BatchPlan): string {
  const lines = [
    `Batch plan: ${plan.operations.length} operation${plan.operations.length === 1 ? "" : "s"}`,
    "",
  ];

  for (const operation of plan.operations) {
    lines.push(`- ${operation.type}: ${operation.relativePath}`);
  }

  if (plan.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of plan.warnings) lines.push(`- ${warning}`);
  }

  if (plan.predictedIssues.length > 0) {
    lines.push("", "Predictive issues:");
    for (const issue of plan.predictedIssues.slice(0, 12)) {
      const location = issue.line ? `:${issue.line}` : "";
      lines.push(`- [${issue.severity}] ${issue.filePath}${location} ${issue.category}: ${issue.message}`);
    }
    if (plan.predictedIssues.length > 12) {
      lines.push(`- ... ${plan.predictedIssues.length - 12} more issue(s)`);
    }
  }

  return lines.join("\n");
}

// ── Language detection for inline post-write validation ───────────────────────

const LANG_EXTENSIONS: Record<string, string[]> = {
  typescript: [".ts", ".tsx"],
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  python:     [".py"],
  rust:       [".rs"],
  go:         [".go"],
  kotlin:     [".kt", ".kts"],
  java:       [".java"],
};

function detectLanguages(relPaths: string[]): Set<string> {
  const langs = new Set<string>();
  for (const rp of relPaths) {
    const ext = path.extname(rp).toLowerCase();
    for (const [lang, exts] of Object.entries(LANG_EXTENSIONS)) {
      if (exts.includes(ext)) langs.add(lang);
    }
  }
  return langs;
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

/**
 * Runs a lightweight post-write validation appropriate for the detected languages.
 * Returns a short summary string to append to the batch result.
 * Never throws — always returns a string.
 */
async function runInlineValidation(
  projectPath: string,
  changedFiles: string[],
): Promise<string> {
  const langs = detectLanguages(changedFiles);
  if (langs.size === 0) return "";

  const isWin = process.platform === "win32";
  const sh = isWin ? "cmd.exe" : "/bin/sh";
  const shFlag = isWin ? "/c" : "-c";

  const run = async (cmd: string): Promise<{ ok: boolean; output: string }> => {
    try {
      const r = await execFileAsync(sh, [shFlag, cmd], { cwd: projectPath, timeout: 30_000 });
      return { ok: true, output: ((r.stdout ?? "") + (r.stderr ?? "")).trim() };
    } catch (e: any) {
      return { ok: false, output: ((e.stdout ?? "") + (e.stderr ?? "")).trim() };
    }
  };

  const results: string[] = [];

  // TypeScript
  if ((langs.has("typescript") || langs.has("javascript")) &&
      await fileExists(path.join(projectPath, "tsconfig.json"))) {
    const { ok, output } = await run("npx tsc --noEmit --pretty false 2>&1");
    if (ok) {
      results.push("✅ TypeScript: clean");
    } else {
      const errLines = output.split("\n")
        .map(l => l.trim())
        .filter(l => l && (l.includes("error TS") || l.includes(": error")));
      // Only show errors in files we just wrote
      const relevant = errLines.filter(l =>
        changedFiles.some(f => l.includes(path.basename(f)) || l.includes(f.replace(/\\/g, "/")))
      );
      const display = (relevant.length > 0 ? relevant : errLines).slice(0, 20);
      const more = Math.max(0, display.length < errLines.length ? errLines.length - 20 : 0);
      results.push(
        `⚠️  TypeScript: ${errLines.length} error(s) in written files — fix before declaring done:`,
        ...display.map(l => `   ${l}`),
        ...(more > 0 ? [`   ... ${more} more`] : []),
      );
    }
  }

  // Python
  if (langs.has("python")) {
    const pyFiles = changedFiles.filter(f => f.endsWith(".py")).map(f =>
      path.isAbsolute(f) ? f : path.join(projectPath, f)
    ).join(" ");
    if (pyFiles) {
      const { ok, output } = await run(`python -m py_compile ${pyFiles} 2>&1`);
      results.push(ok ? "✅ Python: syntax clean" : `⚠️  Python syntax errors:\n   ${output.slice(0, 500)}`);
    }
  }

  // Rust
  if (langs.has("rust") && await fileExists(path.join(projectPath, "Cargo.toml"))) {
    const { ok, output } = await run("cargo check 2>&1");
    if (ok) {
      results.push("✅ Rust: cargo check clean");
    } else {
      const errLines = output.split("\n").filter(l => /^error/i.test(l.trim())).slice(0, 10);
      results.push(`⚠️  Rust errors:\n${errLines.map(l => `   ${l}`).join("\n")}`);
    }
  }

  // Go
  if (langs.has("go") && await fileExists(path.join(projectPath, "go.mod"))) {
    const { ok, output } = await run("go build ./... 2>&1");
    results.push(ok ? "✅ Go: build clean" : `⚠️  Go build errors:\n   ${output.slice(0, 500)}`);
  }

  // Kotlin/Java (Gradle)
  if ((langs.has("kotlin") || langs.has("java")) &&
      (await fileExists(path.join(projectPath, "build.gradle.kts")) ||
       await fileExists(path.join(projectPath, "build.gradle")))) {
    const gradleCmd = isWin ? "gradlew.bat compileKotlin 2>&1" : "./gradlew compileKotlin 2>&1";
    const { ok, output } = await run(gradleCmd);
    results.push(ok ? "✅ Kotlin: compile clean" : `⚠️  Kotlin errors:\n   ${output.slice(0, 500)}`);
  }

  if (results.length === 0) return "";
  return "\n" + results.join("\n");
}

export function createMultiFileEditorTools(projectPath: string) {
  const operationSchema = z.object({
    type: z.enum(["write", "replace", "append", "prepend"]),
    filePath: z.string().describe("Project-relative or absolute file path inside the project"),
    content: z.string().optional().describe("Content for write/append/prepend"),
    oldString: z.string().optional().describe("Exact text to replace for replace operations"),
    newString: z.string().optional().describe("Replacement text for replace operations"),
    replaceAll: z.boolean().optional().describe("Replace all occurrences for replace operations"),
    overwrite: z.boolean().optional().describe("For write operations, false refuses to overwrite existing files"),
  });

  return [
    tool(
      async (input: {
        operations: FileOperation[];
        runPredictiveAnalysis?: boolean;
        allowHighRisk?: boolean;
      }) => {
        const plan = await prepareBatch(projectPath, input.operations, {
          runPredictiveAnalysis: input.runPredictiveAnalysis ?? true,
          allowHighRisk: input.allowHighRisk ?? false,
        });
        return formatPlan(plan);
      },
      {
        name: "preview_file_batch",
        description:
          "Validate and preview a multi-file write/edit batch without changing files. Use before large or risky batches.",
        schema: z.object({
          operations: z.array(operationSchema).describe("File operations to preview"),
          runPredictiveAnalysis: z.boolean().optional().describe("Run predictive code checks on write operations (default true)"),
          allowHighRisk: z.boolean().optional().describe("Allow high-risk predictive findings in preview (default false)"),
        }),
      },
    ),
    tool(
      async (
        input: {
          operations: FileOperation[];
          agentName: string;
          runPredictiveAnalysis?: boolean;
          allowHighRisk?: boolean;
          highRiskRationale?: string;
        },
        runtime: ToolRuntime,
      ) => {
        if ((input.allowHighRisk ?? false) && !input.highRiskRationale?.trim()) {
          throw new Error("highRiskRationale is required when allowHighRisk is true");
        }

        const plan = await prepareBatch(projectPath, input.operations, {
          runPredictiveAnalysis: input.runPredictiveAnalysis ?? true,
          allowHighRisk: input.allowHighRisk ?? false,
        });

        const writer = runtime.writer;
        writer?.({
          type: "multi_file_batch_start",
          count: plan.operations.length,
          message: `Applying ${plan.operations.length} file operation(s)`,
        });

        const backups: FileBackup[] = [];
        const changed: string[] = [];
        const failed: string[] = [];

        try {
          for (let index = 0; index < plan.operations.length; index++) {
            const operation = plan.operations[index]!;
            writer?.({
              type: "multi_file_batch_progress",
              file_path: operation.relativePath,
              operation: operation.type,
              current: index + 1,
              total: plan.operations.length,
              message: `${operation.type} ${operation.relativePath}`,
            });

            const backup = await readIfExists(operation.absolutePath);
            backups.push({
              absolutePath: operation.absolutePath,
              relativePath: operation.relativePath,
              existed: backup.existed,
              content: backup.content,
            });

            const nextContent = await computeNextContent(operation);
            await fs.mkdir(path.dirname(operation.absolutePath), { recursive: true });
            await fs.writeFile(operation.absolutePath, nextContent, "utf-8");
            changed.push(operation.relativePath);
          }

          const batchId = await saveBatchSnapshot(projectPath, backups, input.agentName);

          writer?.({
            type: "multi_file_batch_complete",
            count: changed.length,
            batchId,
            message: `Applied ${changed.length} file operation(s)`,
          });

          const lines = [
            `Applied ${changed.length} file operation(s).`,
            `Snapshot batch: ${batchId}`,
            "",
            ...changed.map((filePath) => `- ${filePath}`),
          ];

          if (plan.predictedIssues.length > 0) {
            lines.push("", "Predictive warnings:");
            for (const issue of plan.predictedIssues.slice(0, 10)) {
              lines.push(`- [${issue.severity}] ${issue.filePath}: ${issue.category} - ${issue.message}`);
            }
          }

          // ── Inline post-write validation (TypeScript, Python, Rust, Go, Kotlin) ──
          const validationSummary = await runInlineValidation(projectPath, changed);
          if (validationSummary) lines.push(validationSummary);

          return lines.join("\n");
        } catch (error) {
          failed.push(error instanceof Error ? error.message : String(error));
          await restoreBackups(backups);

          writer?.({
            type: "multi_file_batch_error",
            count: changed.length,
            error: failed[0],
            message: `Batch failed and was rolled back`,
          });

          throw new Error(`Batch failed and rolled back: ${failed[0]}`);
        }
      },
      {
        name: "apply_file_batch",
        description:
          "Apply multiple file writes/edits in one validated batch with snapshots and rollback on failure. Specialist leads should prefer this for 2+ file changes.",
        schema: z.object({
          operations: z.array(operationSchema).describe("File operations to apply in order"),
          agentName: z.string().describe("Name of the specialist agent applying the batch"),
          runPredictiveAnalysis: z.boolean().optional().describe("Run predictive code checks on write operations (default true)"),
          allowHighRisk: z.boolean().optional().describe("Allow high-risk predictive findings (default false)"),
          highRiskRationale: z.string().optional().describe("Required explanation when allowHighRisk is true"),
        }),
      },
    ),
  ];
}
