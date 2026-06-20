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

const PRIVATE_KEY_HEADER_PREFIX = "-----BEGIN";
const RSA_KEY_ALGORITHM_NAME = "RSA";
const PRIVATE_KEY_HEADER_SUFFIX = "PRIVATE KEY-----";
const RSA_PRIVATE_KEY_HEADER_REGEX = new RegExp(
  [
    PRIVATE_KEY_HEADER_PREFIX,
    RSA_KEY_ALGORITHM_NAME,
    PRIVATE_KEY_HEADER_SUFFIX,
  ].join(" "),
);
const GENERIC_PRIVATE_KEY_HEADER_REGEX = new RegExp(
  [PRIVATE_KEY_HEADER_PREFIX, PRIVATE_KEY_HEADER_SUFFIX].join(" "),
);

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
    regex: RSA_PRIVATE_KEY_HEADER_REGEX,
  },
  {
    label: "Private key header",
    regex: GENERIC_PRIVATE_KEY_HEADER_REGEX,
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
      const isWin = process.platform === "win32";
      const sh = isWin ? "cmd.exe" : "/bin/sh";
      const shFlag = isWin ? "/c" : "-c";

      // ── Detect project type from root marker files ────────────────────────
      const { access: fsAccess } = await import("node:fs/promises");
      const exists = async (f: string) => fsAccess(nodePath.join(cwd, f)).then(() => true, () => false);

      type LangCandidate = { marker: string; cmds: string[] };
      const candidates: LangCandidate[] = [
        // Node/TypeScript — try npm run build, then tsc --noEmit
        { marker: "package.json", cmds: ["npm run build", "npx tsc --noEmit --pretty false"] },
        // Rust
        { marker: "Cargo.toml", cmds: ["cargo check 2>&1"] },
        // Go
        { marker: "go.mod", cmds: ["go build ./..."] },
        // Python (pyproject / requirements)
        { marker: "pyproject.toml", cmds: ["python -m py_compile **/*.py || ruff check . || flake8 ."] },
        { marker: "requirements.txt", cmds: ["python -m compileall . -q"] },
        // Kotlin/Java — Gradle first, Maven fallback
        { marker: "build.gradle.kts", cmds: ["./gradlew build -x test 2>&1 || gradlew.bat build -x test 2>&1"] },
        { marker: "build.gradle",     cmds: ["./gradlew build -x test 2>&1 || gradlew.bat build -x test 2>&1"] },
        { marker: "pom.xml",          cmds: ["mvn compile -q 2>&1"] },
      ];

      let chosenCmds: string[] = ["npx tsc --noEmit --pretty false"]; // ultimate fallback
      for (const c of candidates) {
        if (await exists(c.marker)) {
          chosenCmds = c.cmds;
          break;
        }
      }

      let output = "";
      let usedCommand = "";

      for (const cmd of chosenCmds) {
        try {
          const result = await execFileAsync(sh, [shFlag, cmd], { cwd, timeout: 60_000 });
          output = ((result.stdout ?? "") + "\n" + (result.stderr ?? "")).trim();
          usedCommand = cmd;
          break; // first command that exits 0 = success
        } catch (err: any) {
          output = ((err.stdout ?? "") + "\n" + (err.stderr ?? "")).trim();
          usedCommand = cmd;
          // If it's the "missing script" npm error, fall through to next command
          const isMissingScript =
            output.includes("missing script") ||
            output.includes("npm ERR! Missing script");
          if (!isMissingScript) break;
        }
      }

      const lines = output.split("\n");
      const errorLines = lines.filter((l) =>
        /\berror\b/i.test(l) || /TS\d{4}/.test(l) || /^E\s/m.test(l),
      );

      if (errorLines.length === 0) {
        return `✅ Build passed (${usedCommand})`;
      }

      const preview = errorLines.slice(0, 25).join("\n");
      const moreCount = Math.max(0, errorLines.length - 25);
      return [
        `❌ Build failed: ${errorLines.length} error(s) (${usedCommand})`,
        preview,
        ...(moreCount > 0 ? [`... ${moreCount} more`] : []),
      ].join("\n");
    },
    {
      name: "run_build_check",
      description:
        "Auto-detects the project language (TypeScript/Node, Python, Rust, Go, Kotlin/Java) " +
        "and runs the appropriate build/type-check command. " +
        "Returns a ✅/❌ summary with up to 25 error lines. Call after writing code to verify correctness.",
      schema: z.object({
        projectPath: z
          .string()
          .optional()
          .describe("Absolute path to the project root. Defaults to the agent project path."),
      }),
    },
  );

  const runTestsTool = tool(
    async ({
      directory,
      pattern,
      command,
    }: {
      directory?: string;
      pattern?: string;
      command?: string;
    }): Promise<string> => {
      const cwd = directory ?? projectPath;
      const isWin = process.platform === "win32";
      const sh = isWin ? "cmd.exe" : "/bin/sh";
      const shFlag = isWin ? "/c" : "-c";

      // ── Auto-detect test runner ───────────────────────────────────────────
      const { access: fsAccess, readFile: readF } = await import("node:fs/promises");
      const exists = async (f: string) => fsAccess(nodePath.join(cwd, f)).then(() => true, () => false);

      let testCmd = command;
      if (!testCmd) {
        if (await exists("package.json")) {
          try {
            const pkg = JSON.parse(await readF(nodePath.join(cwd, "package.json"), "utf-8"));
            const hasTest = pkg.scripts?.test && !pkg.scripts.test.includes("no test specified");
            testCmd = hasTest
              ? (pattern ? `npm test -- ${pattern}` : "npm test")
              : (pattern ? `npx vitest run ${pattern}` : "npx vitest run");
          } catch {
            testCmd = "npm test";
          }
        } else if (await exists("Cargo.toml")) {
          testCmd = pattern ? `cargo test ${pattern}` : "cargo test";
        } else if (await exists("go.mod")) {
          testCmd = pattern ? `go test ./... -run ${pattern}` : "go test ./... -v";
        } else if (await exists("pyproject.toml") || await exists("pytest.ini") || await exists("setup.py")) {
          testCmd = pattern ? `pytest ${pattern} -v` : "pytest -v";
        } else if (await exists("requirements.txt")) {
          testCmd = pattern ? `pytest ${pattern} -v` : "pytest -v";
        } else if (await exists("build.gradle.kts") || await exists("build.gradle")) {
          testCmd = "./gradlew test 2>&1 || gradlew.bat test 2>&1";
        } else if (await exists("pom.xml")) {
          testCmd = "mvn test -q 2>&1";
        } else {
          testCmd = "npm test";
        }
      }

      try {
        const result = await execFileAsync(sh, [shFlag, testCmd], { cwd, timeout: 120_000 });
        const out = ((result.stdout ?? "") + "\n" + (result.stderr ?? "")).trim();
        const snippet = out.slice(0, 3_000);
        return `✅ Tests passed\n${snippet}`;
      } catch (err: any) {
        const out = ((err.stdout ?? "") + "\n" + (err.stderr ?? "")).trim();
        const lines = out.split("\n");
        // Capture failure summary from Jest/Vitest/pytest/cargo/Go/Gradle
        const failLines = lines.filter((l) =>
          /FAIL |● |FAILED|AssertionError|Error:|FAILED\s|panicked|FAIL\t/i.test(l) ||
          l.includes("failing") ||
          l.includes("test result: FAILED"),
        );
        const summary = failLines.slice(0, 30).join("\n");
        return `❌ Tests failed\n${summary || out.slice(0, 2_000)}`;
      }
    },
    {
      name: "run_tests",
      description:
        "Auto-detects the project test runner (Jest/Vitest, pytest, cargo test, go test, Gradle, Maven) " +
        "and runs the test suite. Returns ✅/❌ summary with failure details. " +
        "Use after writing code or test files to verify correctness.",
      schema: z.object({
        directory: z
          .string()
          .optional()
          .describe("Absolute path to run tests in (default: project root)"),
        pattern: z
          .string()
          .optional()
          .describe("Test name/file pattern to run a subset (e.g. 'auth', 'TestUserCreate')"),
        command: z
          .string()
          .optional()
          .describe("Custom test command — overrides auto-detection entirely"),
      }),
    },
  );

  return [validateFileTool, runBuildCheckTool, runTestsTool];
}
