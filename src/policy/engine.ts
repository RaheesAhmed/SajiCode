import { execFileSync } from "node:child_process";
import { pathMatchesAnyGlob } from "../hooks/matchers.js";
import { FILE_WRITE_TOOLS, SHELL_TOOLS } from "../hooks/matchers.js";
import type { PolicyConfig } from "./schema.js";

function matchesProtectedPath(pattern: string, filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const pat = pattern.replace(/\\/g, "/");
  if (pat.endsWith("/")) {
    return normalized.includes(pat) || normalized.startsWith(pat.slice(0, -1) + "/");
  }
  return pathMatchesAnyGlob(normalized, [pat]);
}

export interface PolicyEvaluationContext {
  toolName: string;
  args: Record<string, unknown>;
  paths: string[];
  sessionFilesWritten: number;
  projectPath: string;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  requireApproval?: boolean;
}

function parseRequireApprovalEntry(entry: string): {
  toolName: string;
  branch?: string;
} {
  const match = entry.match(/^(\S+)\s+on\s+(\S+)$/i);
  if (match) {
    return { toolName: match[1]!, branch: match[2]! };
  }
  return { toolName: entry.trim() };
}

function getCurrentGitBranch(projectPath: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function extractInstallPackages(command: string): string[] {
  const packages: string[] = [];
  const installMatch = command.match(
    /\bnpm\s+(?:install|i|add)\s+(?:--save-dev|--save|-D|-S|--global|-g|--omit=dev\s+)?((?:@[\w.-]+\/[\w.-]+|[\w.-]+)(?:\s+(?:@[\w.-]+\/[\w.-]+|[\w.-]+))*)/,
  );
  if (installMatch?.[1]) {
    for (const token of installMatch[1].split(/\s+/)) {
      if (token.startsWith("-")) continue;
      packages.push(token.replace(/^@/, "").split("@")[0] ?? token);
    }
  }
  return packages;
}

export function evaluateToolPolicy(
  policies: PolicyConfig,
  context: PolicyEvaluationContext,
): PolicyDecision {
  const { toolName, args, paths, sessionFilesWritten } = context;

  if (
    policies.protectedPaths &&
    policies.protectedPaths.length > 0 &&
    FILE_WRITE_TOOLS.has(toolName) &&
    paths.some((p) =>
      policies.protectedPaths!.some((pattern) => matchesProtectedPath(pattern, p)),
    )
  ) {
    const blocked = paths.filter((p) =>
      policies.protectedPaths!.some((pattern) => matchesProtectedPath(pattern, p)),
    );
    return {
      allowed: false,
      reason: `⛔ POLICY — protected path(s): ${blocked.join(", ")}`,
    };
  }

  if (
    policies.maxFilesPerSession != null &&
    FILE_WRITE_TOOLS.has(toolName) &&
    sessionFilesWritten >= policies.maxFilesPerSession
  ) {
    return {
      allowed: false,
      reason: `⛔ POLICY — session file limit reached (${policies.maxFilesPerSession})`,
    };
  }

  if (
    policies.forbiddenDependencies &&
    policies.forbiddenDependencies.length > 0 &&
    SHELL_TOOLS.has(toolName)
  ) {
    const command = String(args["command"] ?? "");
    const installed = extractInstallPackages(command);
    const forbidden = installed.filter((pkg) =>
      policies.forbiddenDependencies!.some(
        (f) => f.toLowerCase() === pkg.toLowerCase(),
      ),
    );
    if (forbidden.length > 0) {
      return {
        allowed: false,
        reason: `⛔ POLICY — forbidden dependency: ${forbidden.join(", ")}`,
      };
    }
  }

  if (policies.requireApproval && policies.requireApproval.length > 0) {
    for (const entry of policies.requireApproval) {
      const { toolName: requiredTool, branch } = parseRequireApprovalEntry(entry);
      if (requiredTool !== toolName) continue;

      if (branch) {
        const current = getCurrentGitBranch(context.projectPath);
        if (current === branch) {
          return {
            allowed: false,
            requireApproval: true,
            reason: `⛔ POLICY — '${toolName}' requires approval on branch '${branch}'`,
          };
        }
        continue;
      }

      return {
        allowed: false,
        requireApproval: true,
        reason: `⛔ POLICY — '${toolName}' requires human approval`,
      };
    }
  }

  return { allowed: true };
}

export function countWrittenPaths(paths: string[]): number {
  return new Set(paths.map((p) => p.replace(/\\/g, "/"))).size;
}
