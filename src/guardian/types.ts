export type GuardianResponseTier = 1 | 2 | 3;

export type GuardianActionKind =
  | "investigate"
  | "alert"
  | "collect_evidence"
  | "open_incident"
  | "rate_limit_ip"
  | "rotate_key"
  | "rollback_deploy"
  | "isolate_host"
  | "isolate_network"
  | "wipe_restore";

export interface GuardianAction {
  kind: GuardianActionKind;
  tier: GuardianResponseTier;
  summary: string;
  target?: string;
  evidence?: string[];
}

export interface TelemetryEvent {
  id: string;
  source: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: string;
  labels?: Record<string, string>;
}

export interface GuardianIncident {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "contained" | "resolved";
  summary: string;
  telemetryIds: string[];
  actions: GuardianAction[];
  createdAt: string;
  updatedAt: string;
  relatedIncidentIds?: string[];
  predictedRisk?: "low" | "medium" | "high";
}

export interface GuardianCycleResult {
  ok: boolean;
  report: string;
  incidents: GuardianIncident[];
  proposedActions: GuardianAction[];
  telemetryProcessed: number;
}

export interface ContainmentDecision {
  allowed: boolean;
  tier: GuardianResponseTier;
  reason: string;
  consensusRequired: boolean;
  votes?: Array<{ modelLabel: string; approve: boolean; rationale: string }>;
}
