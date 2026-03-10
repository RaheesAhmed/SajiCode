import { tool } from "@langchain/core/tools";
import { z } from "zod";

interface FileNode {
  filePath: string;
  imports: string[];
}

interface BuildOrder {
  phase: number;
  files: string[];
  reason: string;
}

function topologicalSort(nodes: FileNode[]): BuildOrder[] {
  const fileSet = new Set(nodes.map((n) => normalizePath(n.filePath)));
  const adjList = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    const normalized = normalizePath(node.filePath);
    if (!adjList.has(normalized)) adjList.set(normalized, new Set());
    if (!inDegree.has(normalized)) inDegree.set(normalized, 0);

    for (const imp of node.imports) {
      const normalizedImp = resolveImport(imp, node.filePath, fileSet);
      if (normalizedImp && fileSet.has(normalizedImp)) {
        if (!adjList.has(normalizedImp)) adjList.set(normalizedImp, new Set());
        adjList.get(normalizedImp)!.add(normalized);
        inDegree.set(normalized, (inDegree.get(normalized) ?? 0) + 1);
      }
    }
  }

  const phases: BuildOrder[] = [];
  const visited = new Set<string>();
  let phase = 1;

  while (visited.size < fileSet.size) {
    const ready: string[] = [];
    for (const file of fileSet) {
      if (!visited.has(file) && (inDegree.get(file) ?? 0) === 0) {
        ready.push(file);
      }
    }

    if (ready.length === 0) {
      const remaining = [...fileSet].filter((f) => !visited.has(f));
      phases.push({
        phase,
        files: remaining,
        reason: "Circular dependency detected — build these in any order",
      });
      break;
    }

    const reason = phase === 1
      ? "No dependencies — build these FIRST (types, interfaces, configs)"
      : `Depends on phase ${phase - 1} files`;

    phases.push({ phase, files: ready, reason });

    for (const file of ready) {
      visited.add(file);
      for (const dependent of adjList.get(file) ?? new Set<string>()) {
        inDegree.set(dependent, (inDegree.get(dependent) ?? 0) - 1);
      }
    }
    phase++;
  }

  return phases;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function resolveImport(importPath: string, fromFile: string, knownFiles: Set<string>): string | null {
  if (importPath.startsWith(".")) {
    const dir = normalizePath(fromFile).split("/").slice(0, -1).join("/");
    let resolved = normalizePath(`${dir}/${importPath}`);

    const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (knownFiles.has(candidate)) return candidate;
    }
  }

  for (const known of knownFiles) {
    if (known.endsWith(importPath) || known.endsWith(`${importPath}.ts`) || known.endsWith(`${importPath}/index.ts`)) {
      return known;
    }
  }
  return null;
}

export function createDependencyOrderTool() {
  return tool(
    async (input: { files: Array<{ filePath: string; imports: string[] }> }) => {
      if (input.files.length === 0) return "No files provided.";
      if (input.files.length === 1) return `Single file — no ordering needed: ${input.files[0]!.filePath}`;

      const phases = topologicalSort(input.files);

      const lines: string[] = ["BUILD ORDER (create files in this sequence):", ""];
      for (const phase of phases) {
        lines.push(`Phase ${phase.phase}: ${phase.reason}`);
        for (const file of phase.files) {
          lines.push(`  → ${file}`);
        }
        lines.push("");
      }

      lines.push("DISPATCH STRATEGY:");
      if (phases.length <= 2) {
        lines.push("  All phases can be dispatched in a single round.");
      } else {
        lines.push(`  Dispatch phases 1-2 first, then phases 3+ after completion.`);
      }

      return lines.join("\n");
    },
    {
      name: "build_dependency_order",
      description:
        "Given a list of files and their imports, returns the optimal build order. " +
        "Files with no dependencies are built FIRST (types, interfaces, configs). " +
        "Files that depend on them are built AFTER. Prevents broken imports.",
      schema: z.object({
        files: z.array(
          z.object({
            filePath: z.string().describe("Path of the file to create"),
            imports: z.array(z.string()).describe("What this file imports (relative paths like './db' or './types')"),
          })
        ).describe("List of files to build with their import dependencies"),
      }),
    }
  );
}
