import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCodeGraph } from "../context/codegraph.js";

export function createCodeGraphTools(projectPath: string) {
  const ensureIndex = async () => {
    const graph = await getCodeGraph(projectPath);
    if (graph.isEmpty) {
      await graph.buildFullIndex();
    }
    return graph;
  };

  const codeMapTool = tool(
    async ({ focus, maxTokens }: { focus?: string; maxTokens?: number }) => {
      const graph = await ensureIndex();
      return graph.getRankedMap({ focus, maxTokens: maxTokens ?? 2000 });
    },
    {
      name: "code_map",
      description:
        "Return a PageRank-ranked codebase map within a token budget. " +
        "Prefer this over collect_repo_map on large repos — it queries the persistent code graph " +
        "and returns the most important symbols that fit.",
      schema: z.object({
        focus: z.string().optional().describe("Optional focus term (file, symbol, or topic)"),
        maxTokens: z.number().optional().describe("Token budget (default 2000)"),
      }),
    },
  );

  const findCallersTool = tool(
    async ({ symbol }: { symbol: string }) => {
      const graph = await ensureIndex();
      const hits = graph.findCallers(symbol);
      if (hits.length === 0) {
        return `No callers found for "${symbol}" in the code graph. Try code_search.`;
      }
      return [
        `Callers / references of "${symbol}":`,
        "",
        ...hits.map((h) => `• ${h.file} — ${h.snippet}`),
      ].join("\n");
    },
    {
      name: "find_callers",
      description: "Find files that reference or call a symbol using the persistent code graph.",
      schema: z.object({
        symbol: z.string().describe("Function, class, or variable name"),
      }),
    },
  );

  const impactTool = tool(
    async ({ symbol }: { symbol: string }) => {
      const graph = await ensureIndex();
      const impact = graph.impactOf(symbol);
      if (!impact.definedIn && impact.affectedFiles.length === 0) {
        return `Symbol "${symbol}" not found in the code graph.`;
      }
      return [
        `Impact analysis for "${symbol}":`,
        impact.definedIn ? `Defined in: ${impact.definedIn}` : "Definition not indexed",
        "",
        impact.affectedFiles.length
          ? `Affected files (${impact.affectedFiles.length}):\n${impact.affectedFiles.map((f) => `  • ${f}`).join("\n")}`
          : "No downstream references detected.",
      ].join("\n");
    },
    {
      name: "impact_of",
      description:
        "Estimate blast radius if you change a symbol — importers and referencing files from the code graph.",
      schema: z.object({
        symbol: z.string().describe("Symbol to analyze"),
      }),
    },
  );

  const rebuildTool = tool(
    async () => {
      const graph = await getCodeGraph(projectPath);
      const count = await graph.buildFullIndex();
      return `Rebuilt code graph — ${count} files indexed. Stored at .sajicode/codegraph.json`;
    },
    {
      name: "rebuild_code_graph",
      description: "Force a full rebuild of the persistent code graph (usually automatic on file writes).",
      schema: z.object({}),
    },
  );

  return [codeMapTool, findCallersTool, impactTool, rebuildTool];
}
