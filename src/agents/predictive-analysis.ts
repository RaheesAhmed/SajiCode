import fs from "fs/promises";
import path from "path";

export type PredictedIssueSeverity = "low" | "medium" | "high";

export interface PredictedIssue {
  severity: PredictedIssueSeverity;
  category: string;
  line?: number;
  message: string;
  suggestion: string;
}

export interface PredictiveAnalysisInput {
  code: string;
  filePath?: string;
  projectPath?: string;
  language?: string;
}

async function readPackageType(filePath?: string, projectPath?: string): Promise<string | null> {
  if (!projectPath) return null;

  // Walk from the file's own directory up toward projectPath, finding the NEAREST
  // package.json. This prevents reading the tool-host's own package.json when the
  // agent is building a subfolder project (e.g. fullstack_todo/) that may have its
  // own package.json with different module settings.
  const rootDir = path.resolve(projectPath);
  let searchDir = filePath
    ? path.dirname(path.isAbsolute(filePath) ? filePath : path.join(projectPath, filePath))
    : rootDir;

  for (let depth = 0; depth < 10; depth++) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(searchDir, "package.json"), "utf-8"));
      return typeof pkg.type === "string" ? pkg.type : null;
    } catch {
      const parent = path.dirname(searchDir);
      // Stop at project root or filesystem root
      if (parent === searchDir || !path.resolve(searchDir).startsWith(rootDir)) break;
      searchDir = parent;
    }
  }
  return null;
}

function getLine(code: string, index: number): number {
  return code.slice(0, index).split("\n").length;
}

function findAll(code: string, regex: RegExp): Array<{ index: number; match: RegExpExecArray }> {
  const results: Array<{ index: number; match: RegExpExecArray }> = [];
  let match: RegExpExecArray | null;
  regex.lastIndex = 0;
  while ((match = regex.exec(code)) !== null) {
    results.push({ index: match.index, match });
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return results;
}

function pushIssue(
  issues: PredictedIssue[],
  issue: PredictedIssue,
): void {
  const duplicate = issues.some((existing) =>
    existing.category === issue.category &&
    existing.line === issue.line &&
    existing.message === issue.message
  );
  if (!duplicate) issues.push(issue);
}

export class PredictiveAnalyzer {
  async analyzeBeforeExecution(input: PredictiveAnalysisInput): Promise<PredictedIssue[]> {
    const { code, filePath, projectPath } = input;
    const ext = filePath ? path.extname(filePath).toLowerCase() : "";
    const packageType = await readPackageType(filePath, projectPath);
    const issues: PredictedIssue[] = [];

    if (packageType === "module" && ext === ".js" && /\brequire\s*\(/.test(code)) {
      pushIssue(issues, {
        severity: "high",
        category: "node-esm-compatibility",
        line: getLine(code, code.search(/\brequire\s*\(/)),
        message: "CommonJS require() in a .js file inside a type=module package will fail at runtime.",
        suggestion: "Use ESM import/export syntax, or rename the file to .cjs if CommonJS is intentional.",
      });
    }

    if (packageType === "module" && ext === ".js" && /\bmodule\.exports\b|\bexports\./.test(code)) {
      pushIssue(issues, {
        severity: "high",
        category: "node-esm-compatibility",
        line: getLine(code, code.search(/\bmodule\.exports\b|\bexports\./)),
        message: "CommonJS exports in a .js file inside a type=module package will fail.",
        suggestion: "Use ESM export syntax, or rename the file to .cjs.",
      });
    }

    for (const { index, match } of findAll(code, /\b(eval|Function)\s*\(/g)) {
      pushIssue(issues, {
        severity: "high",
        category: "code-injection",
        line: getLine(code, index),
        message: `Dynamic code execution via ${match[1]}() is dangerous.`,
        suggestion: "Replace dynamic execution with explicit parsing, mapping, or a safe interpreter.",
      });
    }

    for (const { index } of findAll(code, /innerHTML\s*=\s*(?!["'`]\s*<)/g)) {
      pushIssue(issues, {
        severity: "high",
        category: "xss-risk",
        line: getLine(code, index),
        message: "Assigning non-literal content to innerHTML can create XSS vulnerabilities.",
        suggestion: "Use textContent, DOM APIs, or sanitize trusted HTML before assignment.",
      });
    }

    for (const { index, match } of findAll(code, /(api[_-]?key|secret|token|password)\s*[:=]\s*["'`][^"'`]{8,}["'`]/gi)) {
      pushIssue(issues, {
        severity: "high",
        category: "hardcoded-secret",
        line: getLine(code, index),
        message: `Possible hardcoded ${match[1]} detected.`,
        suggestion: "Move secrets to environment variables or a secure secret manager.",
      });
    }

    if (/password/i.test(code) && /(JSON\.stringify|writeFile|setItem|push)\s*\([^)]*password/is.test(code)) {
      pushIssue(issues, {
        severity: "high",
        category: "plaintext-password-storage",
        message: "The code appears to store passwords directly.",
        suggestion: "Hash passwords with a vetted password hashing library before storage. If packages are forbidden, clearly mark the app as demo-only and avoid real credentials.",
      });
    }

    for (const { index } of findAll(code, /\bJSON\.parse\s*\(/g)) {
      const before = code.slice(Math.max(0, index - 120), index);
      if (!/\btry\s*\{[\s\S]*$/.test(before)) {
        pushIssue(issues, {
          severity: "medium",
          category: "parse-error-handling",
          line: getLine(code, index),
          message: "JSON.parse appears outside a nearby try/catch.",
          suggestion: "Wrap parsing in try/catch and return a controlled error path.",
        });
      }
    }

    for (const { index } of findAll(code, /\bfetch\s*\(/g)) {
      const after = code.slice(index, index + 220);
      if (!/\.catch\s*\(|try\s*\{/.test(after)) {
        pushIssue(issues, {
          severity: "medium",
          category: "network-error-handling",
          line: getLine(code, index),
          message: "fetch call may not handle network failures.",
          suggestion: "Use try/catch around await fetch or attach a .catch handler.",
        });
      }
    }

    if (/\bcatch\s*\([^)]*\)\s*\{\s*\}/.test(code)) {
      pushIssue(issues, {
        severity: "medium",
        category: "swallowed-error",
        line: getLine(code, code.search(/\bcatch\s*\([^)]*\)\s*\{\s*\}/)),
        message: "Empty catch block hides failures.",
        suggestion: "Log, return a controlled error, or rethrow with context.",
      });
    }

    if (/\bany\b/.test(code) && [".ts", ".tsx"].includes(ext)) {
      pushIssue(issues, {
        severity: "low",
        category: "typescript-any",
        line: getLine(code, code.search(/\bany\b/)),
        message: "The code uses any, which weakens type safety.",
        suggestion: "Use a specific interface, unknown plus narrowing, or a generic type.",
      });
    }

    if (/(TODO|FIXME|not implemented|placeholder)/i.test(code)) {
      pushIssue(issues, {
        severity: "medium",
        category: "placeholder-code",
        line: getLine(code, code.search(/(TODO|FIXME|not implemented|placeholder)/i)),
        message: "Placeholder or incomplete implementation text detected.",
        suggestion: "Replace placeholders with complete working behavior before writing the file.",
      });
    }

    return issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  }
}

function severityRank(severity: PredictedIssueSeverity): number {
  switch (severity) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}
