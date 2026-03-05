import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface CriticCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  details?: string;
}

export interface CriticResult {
  phase: string;
  checks: CriticCheck[];
  passed: boolean;
  autoFixesApplied: string[];
  summary: string;
}

async function checkTypescriptCompile(projectPath: string): Promise<CriticCheck> {
  try {
    const tsconfigPath = path.join(projectPath, "tsconfig.json");
    await fs.access(tsconfigPath);
  } catch {
    return { name: "typescript-compile", status: "warn", details: "No tsconfig.json found — skipping TS check." };
  }

  try {
    await execAsync("npx tsc --noEmit --pretty false 2>&1", {
      cwd: projectPath,
      timeout: 30000,
    });
    return { name: "typescript-compile", status: "pass" };
  } catch (error: any) {
    const stderr = error.stderr || error.stdout || String(error);

    const errorLines = stderr.split("\n")
      .filter((l: string) => l.includes("error TS"))
      .slice(0, 10);

    return {
      name: "typescript-compile",
      status: "fail",
      details: `${errorLines.length} TypeScript errors:\n${errorLines.join("\n")}`,
    };
  }
}

async function checkFilesExist(projectPath: string, expectedFiles: string[]): Promise<CriticCheck> {
  const missing: string[] = [];

  for (const file of expectedFiles) {
    const fullPath = path.isAbsolute(file) ? file : path.join(projectPath, file);
    try {
      await fs.access(fullPath);
    } catch {
      missing.push(file);
    }
  }

  if (missing.length === 0) {
    return { name: "files-exist", status: "pass" };
  }

  return {
    name: "files-exist",
    status: "fail",
    details: `Missing files: ${missing.join(", ")}`,
  };
}

async function checkPlaceholders(projectPath: string, files: string[]): Promise<CriticCheck> {
  const PLACEHOLDER_PATTERNS = [
    /\/\/\s*TODO\b/i,
    /\/\/\s*FIXME\b/i,
    /\/\/\s*implement\b/i,
    /\/\/\s*your code here/i,
    /throw new Error\(['"]not implemented/i,
    /\{\s*\.\.\.\s*\}/,
  ];

  const SOURCE_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs",
  ]);

  const foundIn: string[] = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) continue;

    const fullPath = path.isAbsolute(file) ? file : path.join(projectPath, file);
    try {
      const content = await fs.readFile(fullPath, "utf-8");
      for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.test(content)) {
          foundIn.push(file);
          break;
        }
      }
    } catch { /* file doesn't exist */ }
  }

  if (foundIn.length === 0) {
    return { name: "no-placeholders", status: "pass" };
  }

  return {
    name: "no-placeholders",
    status: "fail",
    details: `Placeholder code found in: ${foundIn.join(", ")}`,
  };
}

async function checkDependencies(projectPath: string, files: string[]): Promise<CriticCheck> {
  let pkg: any;
  try {
    pkg = JSON.parse(await fs.readFile(path.join(projectPath, "package.json"), "utf-8"));
  } catch {
    return { name: "dependencies", status: "warn", details: "No package.json found." };
  }

  const allDeps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);

  const IMPORT_REGEX = /(?:import|require)\s*\(?['"]([^./][^'"]*)['"]\)?/g;
  const missingDeps = new Set<string>();
  const builtins = new Set(["fs", "path", "url", "http", "https", "crypto", "util", "os", "child_process", "stream", "events", "buffer", "net"]);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) continue;

    const fullPath = path.isAbsolute(file) ? file : path.join(projectPath, file);
    try {
      const content = await fs.readFile(fullPath, "utf-8");
      let match;
      while ((match = IMPORT_REGEX.exec(content)) !== null) {
        const matchedImport = match[1] as string | undefined;
        if (!matchedImport) continue;
        const depName = matchedImport.startsWith("@")
          ? matchedImport.split("/").slice(0, 2).join("/")
          : matchedImport.split("/")[0];

        if (depName && !builtins.has(depName) && !allDeps.has(depName) && !depName.startsWith("node:")) {
          missingDeps.add(depName);
        }
      }
    } catch { /* skip */ }
  }

  if (missingDeps.size === 0) {
    return { name: "dependencies", status: "pass" };
  }

  return {
    name: "dependencies",
    status: "fail",
    details: `Missing from package.json: ${[...missingDeps].join(", ")}`,
  };
}

async function autoFixMissingDeps(projectPath: string, missingDeps: string[]): Promise<string[]> {
  const fixed: string[] = [];
  for (const dep of missingDeps) {
    try {
      await execAsync(`npm install ${dep}`, { cwd: projectPath, timeout: 60000 });
      fixed.push(`Installed ${dep}`);
    } catch {
      // Skip failed installs — will be reported as critic failure
    }
  }
  return fixed;
}

export async function runCriticChecks(
  projectPath: string,
  phase: string,
  expectedFiles: string[] = [],
  options: { autoFix?: boolean } = {}
): Promise<CriticResult> {
  const filesToCheck = expectedFiles.length > 0
    ? expectedFiles
    : await getRecentFiles(projectPath);

  const checks: CriticCheck[] = await Promise.all([
    checkFilesExist(projectPath, expectedFiles),
    checkPlaceholders(projectPath, filesToCheck),
    checkDependencies(projectPath, filesToCheck),
    checkTypescriptCompile(projectPath),
  ]);

  const autoFixesApplied: string[] = [];

  if (options.autoFix) {
    const depCheck = checks.find((c) => c.name === "dependencies" && c.status === "fail");
    if (depCheck && depCheck.details) {
      const missingStr = depCheck.details.replace("Missing from package.json: ", "");
      const missingList = missingStr.split(", ");
      const fixes = await autoFixMissingDeps(projectPath, missingList);
      autoFixesApplied.push(...fixes);
      if (fixes.length === missingList.length) {
        depCheck.status = "pass";
        depCheck.details = `Auto-fixed: ${fixes.join(", ")}`;
      }
    }
  }

  const passed = checks.every((c) => c.status !== "fail");

  const failedChecks = checks.filter((c) => c.status === "fail");
  const summary = passed
    ? `All checks passed for phase: ${phase}`
    : `${failedChecks.length} checks failed:\n${failedChecks.map((c) => `- ${c.name}: ${c.details}`).join("\n")}`;

  return { phase, checks, passed, autoFixesApplied, summary };
}

async function getRecentFiles(projectPath: string, depth = 3): Promise<string[]> {
  const files: string[] = [];
  const ignored = new Set([
    "node_modules", "dist", "build", ".git", ".next", ".cache", ".turbo",
  ]);

  async function walk(dir: string, d: number): Promise<void> {
    if (d <= 0) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || ignored.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, d - 1);
        } else {
          files.push(path.relative(projectPath, fullPath));
        }
      }
    } catch { /* skip */ }
  }

  await walk(projectPath, depth);
  return files;
}

export function formatCriticResultForPrompt(result: CriticResult): string {
  const lines = [
    `## Critic Report — ${result.phase}`,
    "",
    result.passed ? "✅ ALL CHECKS PASSED" : "❌ CHECKS FAILED — fixes needed",
    "",
  ];

  for (const check of result.checks) {
    const icon = check.status === "pass" ? "✅" : check.status === "fail" ? "❌" : "⚠️";
    lines.push(`${icon} **${check.name}**: ${check.status}${check.details ? ` — ${check.details}` : ""}`);
  }

  if (result.autoFixesApplied.length > 0) {
    lines.push("", "### Auto-fixes Applied");
    for (const fix of result.autoFixesApplied) {
      lines.push(`- ${fix}`);
    }
  }

  return lines.join("\n");
}
