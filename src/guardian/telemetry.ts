import { randomUUID } from "node:crypto";
import type { TelemetryEvent } from "./types.js";

export function normalizeTelemetryEvent(
  input: Partial<TelemetryEvent> & { message: string; source: string },
): TelemetryEvent {
  return {
    id: input.id ?? `tel-${randomUUID()}`,
    source: input.source,
    severity: input.severity ?? inferSeverity(input.message),
    message: input.message,
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(input.labels ? { labels: input.labels } : {}),
  };
}

function inferSeverity(message: string): TelemetryEvent["severity"] {
  const lower = message.toLowerCase();
  if (
    lower.includes("critical")
    || lower.includes("breach")
    || lower.includes("exploit")
    || lower.includes("unauthorized root")
  ) {
    return "critical";
  }
  if (
    lower.includes("error")
    || lower.includes("failed login")
    || lower.includes("anomaly")
    || lower.includes("spike")
  ) {
    return "warning";
  }
  return "info";
}

export function ingestTelemetryBatch(
  existing: TelemetryEvent[],
  incoming: Array<Partial<TelemetryEvent> & { message: string; source: string }>,
): TelemetryEvent[] {
  const normalized = incoming.map(normalizeTelemetryEvent);
  const seen = new Set(existing.map((e) => e.id));
  const merged = [...existing];
  for (const event of normalized) {
    if (!seen.has(event.id)) {
      merged.push(event);
      seen.add(event.id);
    }
  }
  return merged.slice(-500);
}

export function filterActionableTelemetry(events: TelemetryEvent[]): TelemetryEvent[] {
  return events.filter((e) => e.severity === "warning" || e.severity === "critical");
}

export function formatTelemetrySummary(events: TelemetryEvent[]): string {
  if (events.length === 0) return "No telemetry events.";

  const counts = { info: 0, warning: 0, critical: 0 };
  for (const e of events) counts[e.severity]++;

  return [
    `Telemetry: ${events.length} event(s)`,
    `  critical: ${counts.critical}, warning: ${counts.warning}, info: ${counts.info}`,
    "",
    ...events.slice(-5).map((e) => `[${e.severity}] ${e.source}: ${e.message}`),
  ].join("\n");
}

export function parseMcpTelemetryHint(
  mcpServerName: string,
  payload: string,
): TelemetryEvent {
  return normalizeTelemetryEvent({
    source: `mcp:${mcpServerName}`,
    message: payload,
  });
}
