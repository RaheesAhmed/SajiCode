import type { ModelConfig, ModelRoutingConfig } from "../types/index.js";
import { runStructuredDebate } from "../cognition/debate.js";
import type { ContainmentDecision, GuardianAction } from "./types.js";
import { getActionTier } from "./tiers.js";

export interface ConsensusGateOptions {
  modelConfig?: ModelConfig;
  modelRouting?: ModelRoutingConfig;
  minApproveRatio?: number;
}

export function evaluateContainmentConsensus(
  action: GuardianAction,
  positions: Array<{ agent: string; position: string; rationale: string; confidence?: number }>,
  options: ConsensusGateOptions = {},
): ContainmentDecision {
  const tier = getActionTier(action.kind);
  const minRatio = options.minApproveRatio ?? 0.67;

  if (tier === 1) {
    return {
      allowed: true,
      tier,
      reason: "Tier 1 actions are always allowed (read-only / alerting).",
      consensusRequired: false,
    };
  }

  const debate = runStructuredDebate(
    `Approve containment action: ${action.kind} — ${action.summary}`,
    positions,
  );

  const approveVotes = positions.filter((p) =>
    p.position.toLowerCase().includes("approve")
    || p.position.toLowerCase().includes("yes")
    || p.position.toLowerCase().includes("allow"),
  );

  const ratio = positions.length > 0 ? approveVotes.length / positions.length : 0;
  const allowed = ratio >= minRatio;

  return {
    allowed,
    tier,
    reason: allowed
      ? `Consensus passed (${approveVotes.length}/${positions.length} approve). ${debate.synthesis.split("\n")[0]}`
      : `Consensus failed (${approveVotes.length}/${positions.length} approve). Requires human review.`,
    consensusRequired: tier >= 2,
    votes: positions.map((p) => ({
      modelLabel: p.agent,
      approve:
        p.position.toLowerCase().includes("approve")
        || p.position.toLowerCase().includes("yes"),
      rationale: p.rationale,
    })),
  };
}

export function defaultConsensusPositions(action: GuardianAction): Array<{
  agent: string;
  position: string;
  rationale: string;
  confidence: number;
}> {
  const destructive = action.tier >= 3;
  return [
    {
      agent: "security-lead",
      position: destructive ? "reject pending HITL" : "approve with logging",
      rationale: destructive
        ? "Tier 3 isolation requires explicit human confirmation."
        : "Action is proportional and auditable.",
      confidence: 0.85,
    },
    {
      agent: "deploy-lead",
      position: action.kind === "rollback_deploy" ? "approve" : "approve with monitoring",
      rationale: "Rollback and rate limits are reversible via git-native safety.",
      confidence: 0.8,
    },
    {
      agent: "pm-agent",
      position: action.tier === 2 ? "approve" : "reject pending HITL",
      rationale: "Balance machine-speed response with blast-radius control.",
      confidence: 0.75,
    },
  ];
}
