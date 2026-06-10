import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import * as nodePath from "node:path";
import { promisify } from "util";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// validateFileSyntax
// ---------------------------------------------------------------------------

export async function validateFileSyntax(
  filePath: string,
): Promise<{ ok: boolean; errors: string[] }> {
  try {
    const ext = nodePath.extname(filePath).toLowerCase();

    if (ext === ".ts" || ext === ".tsx") {
      return await validateTypeScript(filePath);
    }

    if (ext === ".py") {
      return await validatePython(filePath);
    }

    if (ext === ".json") {
      return await validateJson(filePath);
    }

    return { ok: true, errors: [] };
  } catch {
    // Swallow unexpected errors — callers rely on structured return
    return { ok: true, errors: [] };
  }
}

async function validateTypeScript(
  filePath: string,
): Promise<{ ok: boolean; errors: string[] }> {
  const dir = nodePath.dirname(filePath);
  const base = nodePath.basename(filePath);

  try {
    await execFileAsync(
      "npx",
      ["tsc", "--noEmit", "--pretty", "false"],
      { cwd: dir, timeout: TIMEOUT_MS },
    );
    return { ok: true, errors: [] };
  } catch (err: any) {
    const output: string =
      (err.stdout ?? "") + "\n" + (err.stderr ?? "");

    // tsc --pretty false emits lines like:
    //   path/to/file.ts(10,5): error TS2322: ...
    const errors: string[] = [];
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Match lines that reference this specific file
      if (trimmed.includes(base) || trimmed.includes(filePath)) {
        errors.push(trimmed);
      }
    }

    // If we got no per-file matches but tsc clearly failed, surface all errors
    if (errors.length === 0 && output.trim()) {
      const allErrors = output
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      errors.push(...allErrors);
    }

    return { ok: errors.length === 0, errors };
  }
}

async function validatePython(
  filePath: string,
): Promise<{ ok: boolean; errors: string[] }> {
  try {
    await execFileAsync(
      "python",
      ["-m", "py_compile", filePath],
      { timeout: TIMEOUT_MS },
    );
    return { ok: true, errors: [] };
  } catch (err: any) {
    const output: string =
      (err.stderr ?? "") + "\n" + (err.stdout ?? "");
    const errors = output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return { ok: false, errors };
  }
}

async function validateJson(
  filePath: string,
): Promise<{ ok: boolean; errors: string[] }> {
  try {
    const raw = await readFile(filePath, "utf-8");
    JSON.parse(raw);
    return { ok: true, errors: [] };
  } catch (err: any) {
    return { ok: false, errors: [err.message ?? "Invalid JSON"] };
  }
}

// ---------------------------------------------------------------------------
// scanFileForSecurityIssues
// ---------------------------------------------------------------------------

interface SecurityScanResult {
  warnings: string[];
  blocks: string[];
}

// Patterns that should BLOCK a write
const BLOCK_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  {
    label: "Hardcoded Anthropic/OpenAI API key (sk-...)",
    regex: /sk-[a-zA-Z0-9]{48}/,
  },
  {
    label: "Hardcoded AWS access key (AKIA...)",
    regex: /AKIA[0-9A-Z]{16}/,
  },
  {
    label: "Hardcoded GitHub personal access token (ghp_...)",
    regex: /ghp_[a-zA-Z0-9]{36}/,
  },
  {
    label: "RSA private key header",
    regex: /-----BEGIN RSA PRIVATE KEY-----/,
  },
  {
    label: "Private key header",
    regex: /-----BEGIN PRIVATE KEY-----/,
  },
  {
    // password = "literal value of 8+ chars" that is NOT reading from env
    // Excludes: process.env, os.environ, getenv, ${...}
    label: 'Hardcoded password literal (password = "...")',
    regex: /password\s*=\s*"(?!\s*\$\{)[^"]{8,}"/i,
  },
];

// Patterns that produce WARNINGS (non-blocking)
function buildWarningPatterns(
  filePath: string,
): Array<{ label: string; regex: RegExp }> {
  const ext = nodePath.extname(filePath).toLowerCase();
  const patterns: Array<{ label: string; regex: RegExp }> = [];

  if (ext === ".js" || ext === ".ts" || ext === ".jsx" || ext === ".tsx") {
    patterns.push({
      label: "Use of eval() — potential code injection",
      regex: /\beval\s*\(/,
    });
  }

  if (ext === ".py") {
    // exec( in Python but not subprocess.exec or os.execv etc.
    patterns.push({
      label: "Use of exec() — potential code injection (non-subprocess)",
      regex: /(?<!subprocess\.)(?<!os\.)\bexec\s*\(/,
    });
  }

  // SQL injection: raw string concatenation into SELECT
  // e.g.  "SELECT" + userInput   or   f"SELECT {var}"
  patterns.push({
    label: 'Raw string concatenation into SQL query ("SELECT" + var or f"SELECT {var}")',
    regex: /["']SELECT\b[^"']*["']\s*\+|f["']SELECT\b[^"']*\{/i,
  });

  // fetch/requests calls to http:// URLs (missing HTTPS)
  patterns.push({
    label: "HTTP (non-HTTPS) URL in fetch/request call — potential MITM risk",
    regex: /fetch\s*\(\s*["']http:\/\/(?!localhost|127\.0\.0\.1)/,
  });

  return patterns;
}

export async function scanFileForSecurityIssues(
  filePath: string,
  content: string,
): Promise<SecurityScanResult> {
  const warnings: string[] = [];
  const blocks: string[] = [];

  for (const { label, regex } of BLOCK_PATTERNS) {
    if (regex.test(content)) {
      blocks.push(label);
    }
  }

  const warningPatterns = buildWarningPatterns(filePath);
  for (const { label, regex } of warningPatterns) {
    if (regex.test(content)) {
      warnings.push(label);
    }
  }

  return { warnings, blocks };
}

// ---------------------------------------------------------------------------
// createValidationTools
// ---------------------------------------------------------------------------

export function createValidationTools(projectPath: string) {
  const validateFileTool = tool(
    async ({
      filePath,
      content,
    }: {
      filePath: string;
      content?: string;
    }): Promise<string> => {
      const displayName = nodePath.basename(filePath);
      const syntaxResult = await validateFileSyntax(filePath);

      let output: string;
      if (syntaxResult.ok) {
        output = `OK ${displayName}: OK`;
      } else {
        const count = syntaxResult.errors.length;
        const lines = syntaxResult.errors.map((e) => `  - ${e}`).join("\n");
        output = `FAIL ${displayName}: ${count} error(s)\n${lines}`;
      }

      if (content !== undefined && content !== "") {
        const secResult = await scanFileForSecurityIssues(filePath, content);

        if (secResult.blocks.length > 0) {
          output +=
            "\n\nSECURITY BLOCKS (write prevented):\n" +
            secResult.blocks.map((b) => `  - ${b}`).join("\n");
        }

        if (secResult.warnings.length > 0) {
          output +=
            "\n\nSECURITY WARNINGS:\n" +
            secResult.warnings.map((w) => `  - ${w}`).join("\n");
        }
      }

      return output;
    },
    {
      name: "validate_file",
      description:
        "Validates file syntax (TypeScript, Python, JSON) and optionally scans content for " +
        "security issues such as hardcoded secrets, SQL injection, and unsafe eval usage. " +
        "Always returns a human-readable result without throwing.",
      schema: z.object({
        filePath: z.string().describe("Absolute path to the file to validate"),
        content: z
          .string()
          .optional()
          .describe(
            "File content to scan for security issues. If omitted, only syntax is checked.",
          ),
      }),
    },
  );

  const runBuildCheckTool = tool(
    async ({
      projectPath: overridePath,
    }: {
      projectPath?: string;
    }): Promise<string> => {
      const cwd = overridePath ?? projectPath;

      // Try "npm run build" first; fall back to "npx tsc --noEmit" on failure
      let output = "";
      let usedCommand = "";

      try {
        const result = await execFileAsync("npm", ["run", "build"], {
          cwd,
          timeout: TIMEOUT_MS,
        });
        output = (result.stdout ?? "") + (result.stderr ?? "");
        usedCommand = "npm run build";
      } catch (buildErr: any) {
        // npm run build failed — check whether the script exists at all
        const buildOutput: string =
          (buildErr.stdout ?? "") + (buildErr.stderr ?? "");

        const missingScript =
          buildOutput.includes("missing script") ||
          buildOutput.includes("npm ERR! Missing script");

        if (missingScript) {
          // Fall back to tsc
          try {
            const tscResult = await execFileAsync(
              "npx",
              ["tsc", "--noEmit"],
              { cwd, timeout: TIMEOUT_MS },
            );
            output = (tscResult.stdout ?? "") + (tscResult.stderr ?? "");
            usedCommand = "npx tsc --noEmit";
          } catch (tscErr: any) {
            output =
              (tscErr.stdout ?? "") + (tscErr.stderr ?? "");
            usedCommand = "npx tsc --noEmit";
          }
        } else {
          output = buildOutput;
          usedCommand = "npm run build";
        }
      }

      // Count error lines
      const lines = output.split("\n");
      const errorLines = lines.filter(
        (l) =>
          /\berror\b/i.test(l) ||
          /TS\d{4}/.test(l) ||
          /error TS/i.test(l),
      );

      if (errorLines.length === 0) {
        return `OK Build passed (${usedCommand})`;
      }

      const preview = errorLines.slice(0, 20).join("\n");
      return (
        `FAIL Build failed: ${errorLines.length} error(s) (${usedCommand})\n` +
        preview
      );
    },
    {
      name: "run_build_check",
      description:
        "Runs the project build check. Attempts 'npm run build' first; if no build script " +
        "exists falls back to 'npx tsc --noEmit'. Returns a summary with up to 20 error lines.",
      schema: z.object({
        projectPath: z
          .string()
          .optional()
          .describe(
            "Absolute path to the project root. Defaults to the agent project path.",
          ),
      }),
    },
  );

  return [validateFileTool, runBuildCheckTool];
}
