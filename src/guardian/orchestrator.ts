import fs from "node:fs/promises";
import path from "node:path";
import type { ProjectConfig } from "../types/index.js";
import type { GuardianCycleResult, GuardianIncident, TelemetryEvent } from "./types.js";
import {
  filterActionableTelemetry,
  formatTelemetrySummary,
  ingestTelemetryBatch,
} from "./telemetry.js";
import { buildAction, formatTierPlan, sortActionsByTier } from "./tiers.js";
import {
  defaultConsensusPositions,
  evaluateContainmentConsensus,
} from "./consensus.js";
import {
  formatIncidentGraphSummary,
  loadIncidentGraph,
  openIncident,
  predictIncidentRisk,
} from "./incident-graph.js";

const TELEMETRY_CACHE = "guardian-telemetry.json";

async function loadCachedTelemetry(projectPath: string): Promise<TelemetryEvent[]> {
  try {
    const raw = await fs.readFile(path.join(projectPath, ".sajicode", TELEMETRY_CACHE), "utf-8");
    return (JSON.parse(raw) as { events: TelemetryEvent[] }).events ?? [];
  } catch {
    return [];
  }
}

async function saveCachedTelemetry(
  projectPath: string,
  events: TelemetryEvent[],
): Promise<void> {
  const filePath = path.join(projectPath, ".sajicode", TELEMETRY_CACHE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ events }, null, 2), "utf-8");
}

function proposeActionsFromTelemetry(events: TelemetryEvent[]): ReturnType<typeof buildAction>[] {
  const actions = [
    buildAction("investigate", "Review actionable telemetry cluster"),
    buildAction("collect_evidence", "Snapshot logs and metrics for incident record"),
  ];

  for (const event of events) {
    if (event.message.toLowerCase().includes("failed login")) {
      actions.push(buildAction("rate_limit_ip", "Rate-limit suspicious auth source", event.labels?.["ip"]));
    }
    if (event.message.toLowerCase().includes("leaked key") || event.message.toLowerCase().includes("secret")) {
      actions.push(buildAction("rotate_key", "Rotate potentially exposed credential"));
    }
    if (event.message.toLowerCase().includes("bad deploy") || event.message.toLowerCase().includes("rollback")) {
      actions.push(buildAction("rollback_deploy", "Roll back last deploy via git-native revert"));
    }
    if (event.severity === "critical" && event.message.toLowerCase().includes("compromise")) {
      actions.push(buildAction("isolate_host", "Propose host isolation — requires HITL", event.labels?.["host"]));
    }
  }

  return actions;
}

export async function runGuardianCycle(
  projectPath: string,
  config: ProjectConfig,
  incomingTelemetry: Array<Partial<TelemetryEvent> & { message: string; source: string }>,
): Promise<GuardianCycleResult> {
  if (config.guardian?.enabled === false) {
    return {
      ok: true,
      report: "Guardian is disabled in config.",
      incidents: [],
      proposedActions: [],
      telemetryProcessed: 0,
    };
  }

  const cached = await loadCachedTelemetry(projectPath);
  const merged = ingestTelemetryBatch(cached, incomingTelemetry);
  await saveCachedTelemetry(projectPath, merged);

  const actionable = filterActionableTelemetry(merged);
  const graph = await loadIncidentGraph(projectPath);
  const prediction = predictIncidentRisk(graph, actionable);

  const proposedActions = sortActionsByTier(proposeActionsFromTelemetry(actionable));
  const incidents: GuardianIncident[] = [];

  if (actionable.length > 0) {
    const incident = await openIncident(projectPath, {
      title: `Guardian alert — ${actionable.length} actionable signal(s)`,
      summary: [
        formatTelemetrySummary(actionable),
        "",
        `Predicted risk: ${prediction.risk} — ${prediction.reason}`,
      ].join("\n"),
      severity:
        prediction.risk === "high" ? "critical"
        : prediction.risk === "medium" ? "high"
        : "medium",
      telemetryIds: actionable.map((e) => e.id),
      actions: proposedActions,
      predictedRisk: prediction.risk,
      ...(prediction.relatedIds.length ? { relatedIncidentIds: prediction.relatedIds } : {}),
    });
    incidents.push(incident);
  }

  const tier2Plus = proposedActions.filter((a) => a.tier >= 2);
  const consensusLines: string[] = [];

  for (const action of tier2Plus) {
    const decision = evaluateContainmentConsensus(
      action,
      defaultConsensusPositions(action),
      {
        ...(config.modelConfig ? { modelConfig: config.modelConfig } : {}),
        ...(config.modelRouting ? { modelRouting: config.modelRouting } : {}),
      },
    );
    consensusLines.push(
      `${action.kind}: ${decision.allowed ? "✅ allowed" : "⛔ blocked"} — ${decision.reason}`,
    );
  }

  const report = [
    "🛡️ Guardian cycle complete",
    "",
    formatTelemetrySummary(merged),
    "",
    formatIncidentGraphSummary(await loadIncidentGraph(projectPath)),
    "",
    formatTierPlan(proposedActions),
    ...(consensusLines.length ? ["", "Consensus gates:", ...consensusLines.map((l) => `  ${l}`)] : []),
    "",
    "_Defensive only — no offensive tooling. Tier 3 requires HITL unless explicitly configured._",
  ].join("\n");

  return {
    ok: true,
    report,
    incidents,
    proposedActions,
    telemetryProcessed: incomingTelemetry.length,
  };
}

export async function ingestGuardianTelemetry(
  projectPath: string,
  events: Array<Partial<TelemetryEvent> & { message: string; source: string }>,
): Promise<TelemetryEvent[]> {
  const cached = await loadCachedTelemetry(projectPath);
  const merged = ingestTelemetryBatch(cached, events);
  await saveCachedTelemetry(projectPath, merged);
  return merged;
}
