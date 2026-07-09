import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ProjectConfig } from "../types/index.js";
import { runGuardianCycle, ingestGuardianTelemetry } from "../guardian/orchestrator.js";
import {
  formatIncidentGraphSummary,
  loadIncidentGraph,
  predictIncidentRisk,
} from "../guardian/incident-graph.js";
import { filterActionableTelemetry } from "../guardian/telemetry.js";
import fs from "node:fs/promises";
import path from "node:path";

const TELEMETRY_CACHE = "guardian-telemetry.json";

async function readTelemetry(projectPath: string) {
  try {
    const raw = await fs.readFile(path.join(projectPath, ".sajicode", TELEMETRY_CACHE), "utf-8");
    return (JSON.parse(raw) as { events: Array<{ id: string; message: string; source: string; severity: string }> }).events ?? [];
  } catch {
    return [];
  }
}

export function createGuardianTools(projectPath: string, config: ProjectConfig) {
  const scanTool = tool(
    async (input: { note?: string }) => {
      const events = await readTelemetry(projectPath);
      const incoming = input.note
        ? [{ source: "pm-agent", message: input.note, severity: "warning" as const }]
        : [];

      const result = await runGuardianCycle(projectPath, config, [
        ...events.map((e) => ({
          source: e.source,
          message: e.message,
          severity: (e.severity === "critical" || e.severity === "warning" || e.severity === "info"
            ? e.severity
            : "info") as "info" | "warning" | "critical",
        })),
        ...incoming,
      ]);
      return result.report;
    },
    {
      name: "run_guardian_scan",
      description:
        "Run Guardian swarm cycle: telemetry → incidents → tiered containment plan with consensus gates.",
      schema: z.object({
        note: z.string().optional().describe("Optional extra signal to include in this scan"),
      }),
    },
  );

  const ingestTool = tool(
    async (input: { source: string; message: string; severity?: "info" | "warning" | "critical" }) => {
      const merged = await ingestGuardianTelemetry(projectPath, [
        { source: input.source, message: input.message, severity: input.severity },
      ]);
      return `Ingested telemetry (${merged.length} total cached). Latest: [${input.severity ?? "info"}] ${input.message}`;
    },
    {
      name: "ingest_guardian_telemetry",
      description: "Ingest a telemetry event from MCP/logs/metrics into the Guardian cache.",
      schema: z.object({
        source: z.string(),
        message: z.string(),
        severity: z.enum(["info", "warning", "critical"]).optional(),
      }),
    },
  );

  const predictTool = tool(
    async () => {
      const graph = await loadIncidentGraph(projectPath);
      const events = await readTelemetry(projectPath);
      const actionable = filterActionableTelemetry(events as any);
      const prediction = predictIncidentRisk(graph, actionable as any);
      return [
        formatIncidentGraphSummary(graph),
        "",
        `Predicted risk: ${prediction.risk}`,
        prediction.reason,
        prediction.relatedIds.length
          ? `Related incidents: ${prediction.relatedIds.join(", ")}`
          : "No related incidents.",
      ].join("\n");
    },
    {
      name: "predict_guardian_risk",
      description: "Predict escalation risk from telemetry + incident knowledge graph.",
      schema: z.object({}),
    },
  );

  return [scanTool, ingestTool, predictTool];
}
