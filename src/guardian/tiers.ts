import type { GuardianAction, GuardianActionKind, GuardianResponseTier } from "./types.js";

const ACTION_TIERS: Record<GuardianActionKind, GuardianResponseTier> = {
  investigate: 1,
  alert: 1,
  collect_evidence: 1,
  open_incident: 1,
  rate_limit_ip: 2,
  rotate_key: 2,
  rollback_deploy: 2,
  isolate_host: 3,
  isolate_network: 3,
  wipe_restore: 3,
};

const TIER_DESCRIPTIONS: Record<GuardianResponseTier, string> = {
  1: "Tier 1 — auto: read-only investigation, alerting, evidence, open incident",
  2: "Tier 2 — consensus-gated: rate-limit, key rotation, deploy rollback",
  3: "Tier 3 — HITL: host/network isolation, wipe/restore",
};

export function getActionTier(kind: GuardianActionKind): GuardianResponseTier {
  return ACTION_TIERS[kind];
}

export function describeTier(tier: GuardianResponseTier): string {
  return TIER_DESCRIPTIONS[tier];
}

export function canAutoExecute(
  action: GuardianAction,
  options: { tier3Auto?: boolean } = {},
): boolean {
  if (action.tier === 1) return true;
  if (action.tier === 2) return false;
  return options.tier3Auto === true;
}

export function buildAction(
  kind: GuardianActionKind,
  summary: string,
  target?: string,
  evidence?: string[],
): GuardianAction {
  return {
    kind,
    tier: getActionTier(kind),
    summary,
    ...(target ? { target } : {}),
    ...(evidence?.length ? { evidence } : {}),
  };
}

export function sortActionsByTier(actions: GuardianAction[]): GuardianAction[] {
  return [...actions].sort((a, b) => a.tier - b.tier);
}

export function formatTierPlan(actions: GuardianAction[]): string {
  if (actions.length === 0) return "No containment actions proposed.";

  const lines = ["Guardian response plan:", ""];
  for (const tier of [1, 2, 3] as GuardianResponseTier[]) {
    const tierActions = actions.filter((a) => a.tier === tier);
    if (tierActions.length === 0) continue;
    lines.push(describeTier(tier));
    for (const action of tierActions) {
      lines.push(`  • ${action.kind}: ${action.summary}${action.target ? ` (${action.target})` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
