import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { GuardianIncident, TelemetryEvent } from "./types.js";

const INCIDENTS_FILE = "incidents.json";

export interface IncidentGraphSnapshot {
  version: number;
  incidents: GuardianIncident[];
  telemetryIndex: Record<string, string[]>;
  updatedAt: string;
}

function incidentsPath(projectPath: string): string {
  return path.join(projectPath, ".sajicode", INCIDENTS_FILE);
}

export async function loadIncidentGraph(projectPath: string): Promise<IncidentGraphSnapshot> {
  try {
    const raw = await fs.readFile(incidentsPath(projectPath), "utf-8");
    return JSON.parse(raw) as IncidentGraphSnapshot;
  } catch {
    return {
      version: 1,
      incidents: [],
      telemetryIndex: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function saveIncidentGraph(
  projectPath: string,
  snapshot: IncidentGraphSnapshot,
): Promise<void> {
  const filePath = incidentsPath(projectPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify({ ...snapshot, updatedAt: new Date().toISOString() }, null, 2),
    "utf-8",
  );
}

export function findRelatedIncidents(
  snapshot: IncidentGraphSnapshot,
  keywords: string[],
): GuardianIncident[] {
  const lower = keywords.map((k) => k.toLowerCase());
  return snapshot.incidents.filter((incident) => {
    const haystack = `${incident.title} ${incident.summary}`.toLowerCase();
    return lower.some((k) => haystack.includes(k));
  });
}

export function predictIncidentRisk(
  snapshot: IncidentGraphSnapshot,
  telemetry: TelemetryEvent[],
): { risk: "low" | "medium" | "high"; reason: string; relatedIds: string[] } {
  const criticalCount = telemetry.filter((t) => t.severity === "critical").length;
  const warningCount = telemetry.filter((t) => t.severity === "warning").length;

  const keywords = telemetry
    .flatMap((t) => t.message.toLowerCase().split(/\W+/))
    .filter((w) => w.length > 4)
    .slice(0, 10);

  const related = findRelatedIncidents(snapshot, keywords);
  const relatedIds = related.map((i) => i.id);

  if (criticalCount >= 2 || related.some((i) => i.severity === "critical" && i.status !== "resolved")) {
    return {
      risk: "high",
      reason: "Multiple critical signals or recurring critical incident pattern.",
      relatedIds,
    };
  }

  if (criticalCount >= 1 || warningCount >= 3 || related.length >= 2) {
    return {
      risk: "medium",
      reason: "Elevated telemetry or similar past incidents suggest escalation risk.",
      relatedIds,
    };
  }

  if (related.length >= 1 && warningCount >= 1) {
    return {
      risk: "medium",
      reason: "Similar past incident detected — monitor for recurrence.",
      relatedIds,
    };
  }

  return {
    risk: "low",
    reason: "No strong recurrence or critical cluster detected.",
    relatedIds,
  };
}

export async function openIncident(
  projectPath: string,
  input: {
    title: string;
    summary: string;
    severity: GuardianIncident["severity"];
    telemetryIds: string[];
    actions?: GuardianIncident["actions"];
    predictedRisk?: GuardianIncident["predictedRisk"];
    relatedIncidentIds?: string[];
  },
): Promise<GuardianIncident> {
  const snapshot = await loadIncidentGraph(projectPath);
  const incident: GuardianIncident = {
    id: `inc-${randomUUID()}`,
    title: input.title,
    severity: input.severity,
    status: "open",
    summary: input.summary,
    telemetryIds: input.telemetryIds,
    actions: input.actions ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(input.predictedRisk ? { predictedRisk: input.predictedRisk } : {}),
    ...(input.relatedIncidentIds?.length ? { relatedIncidentIds: input.relatedIncidentIds } : {}),
  };

  snapshot.incidents.unshift(incident);
  for (const telId of input.telemetryIds) {
    snapshot.telemetryIndex[telId] = [...(snapshot.telemetryIndex[telId] ?? []), incident.id];
  }

  await saveIncidentGraph(projectPath, snapshot);
  return incident;
}

export function formatIncidentGraphSummary(snapshot: IncidentGraphSnapshot): string {
  const open = snapshot.incidents.filter((i) => i.status === "open" || i.status === "investigating");
  const lines = [
    `Incident graph: ${snapshot.incidents.length} total, ${open.length} open/investigating`,
  ];
  for (const incident of open.slice(0, 5)) {
    lines.push(`  • [${incident.severity}] ${incident.id}: ${incident.title}`);
  }
  return lines.join("\n");
}
