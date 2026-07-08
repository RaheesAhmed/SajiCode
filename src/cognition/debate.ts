import type { ModelConfig, ModelRoutingConfig } from "../types/index.js";
import { createModel } from "../llms/provider.js";
import { HumanMessage } from "@langchain/core/messages";

export interface DebatePosition {
  agent: string;
  position: string;
  rationale: string;
  confidence: number;
}

export interface DebateRound {
  question: string;
  positions: DebatePosition[];
  synthesis: string;
  createdAt: string;
}

export interface ConsensusVote {
  modelLabel: string;
  choice: string;
  confidence: number;
  rationale: string;
}

export interface ConsensusResult {
  question: string;
  votes: ConsensusVote[];
  winner: string;
  averageConfidence: number;
}

function buildDebateSynthesis(positions: DebatePosition[]): string {
  if (positions.length === 0) return "No positions recorded.";

  const lines = ["Debate synthesis:", ""];
  for (const p of positions) {
    lines.push(`- **${p.agent}** (${Math.round(p.confidence * 100)}%): ${p.position}`);
    lines.push(`  Rationale: ${p.rationale}`, "");
  }

  const top = [...positions].sort((a, b) => b.confidence - a.confidence)[0];
  if (top) {
    lines.push(`Leading view: ${top.agent} — ${top.position}`);
  }

  return lines.join("\n");
}

export function runStructuredDebate(
  question: string,
  positions: Array<{ agent: string; position: string; rationale: string; confidence?: number }>,
): DebateRound {
  const normalized: DebatePosition[] = positions.map((p) => ({
    agent: p.agent,
    position: p.position,
    rationale: p.rationale,
    confidence: Math.min(1, Math.max(0, p.confidence ?? 0.7)),
  }));

  return {
    question,
    positions: normalized,
    synthesis: buildDebateSynthesis(normalized),
    createdAt: new Date().toISOString(),
  };
}

function collectConsensusModels(
  baseConfig: ModelConfig,
  routing?: ModelRoutingConfig,
): Array<{ label: string; config: ModelConfig }> {
  const models: Array<{ label: string; config: ModelConfig }> = [
    { label: "primary", config: baseConfig },
  ];

  if (routing?.planner && routing.planner !== baseConfig.modelName) {
    models.push({ label: "planner", config: { ...baseConfig, modelName: routing.planner } });
  }
  if (routing?.leads && routing.leads !== baseConfig.modelName) {
    models.push({ label: "leads", config: { ...baseConfig, modelName: routing.leads } });
  }
  if (routing?.fallback && routing.fallback !== baseConfig.modelName) {
    models.push({
      label: "fallback",
      config: {
        ...baseConfig,
        modelName: routing.fallback,
        provider: routing.fallbackProvider ?? baseConfig.provider,
      },
    });
  }

  const unique = new Map<string, { label: string; config: ModelConfig }>();
  for (const entry of models) {
    const key = `${entry.config.provider}:${entry.config.modelName}`;
    if (!unique.has(key)) unique.set(key, entry);
  }

  return [...unique.values()].slice(0, 3);
}

export async function runMultiModelConsensus(
  question: string,
  options: string[],
  baseConfig: ModelConfig,
  routing?: ModelRoutingConfig,
): Promise<ConsensusResult> {
  const models = collectConsensusModels(baseConfig, routing);
  const votes: ConsensusVote[] = [];

  const prompt = [
    "You are voting on a high-risk engineering decision.",
    `Question: ${question}`,
    `Options:\n${options.map((o, i) => `${i + 1}. ${o}`).join("\n")}`,
    "",
    "Reply in JSON only:",
    '{"choice":"<exact option text>","confidence":0.0-1.0,"rationale":"one sentence"}',
  ].join("\n");

  for (const { label, config } of models) {
    try {
      const model = await createModel(config);
      const response = await model.invoke([new HumanMessage(prompt)]);
      const text = typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch
        ? JSON.parse(jsonMatch[0]) as { choice?: string; confidence?: number; rationale?: string }
        : { choice: options[0], confidence: 0.5, rationale: text.slice(0, 200) };

      votes.push({
        modelLabel: `${label} (${config.modelName})`,
        choice: parsed.choice ?? options[0]!,
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
        rationale: parsed.rationale ?? "",
      });
    } catch (error) {
      votes.push({
        modelLabel: label,
        choice: options[0]!,
        confidence: 0,
        rationale: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const scores = new Map<string, { total: number; count: number }>();
  for (const vote of votes) {
    const entry = scores.get(vote.choice) ?? { total: 0, count: 0 };
    entry.total += vote.confidence;
    entry.count += 1;
    scores.set(vote.choice, entry);
  }

  let winner = options[0]!;
  let best = -1;
  for (const [choice, { total, count }] of scores) {
    const avg = total / count;
    if (avg > best) {
      best = avg;
      winner = choice;
    }
  }

  const avgConfidence =
    votes.reduce((sum, v) => sum + v.confidence, 0) / Math.max(votes.length, 1);

  return { question, votes, winner, averageConfidence: avgConfidence };
}

export function formatConsensusResult(result: ConsensusResult): string {
  const lines = [
    `Consensus for: ${result.question}`,
    `Winner: ${result.winner} (avg confidence ${(result.averageConfidence * 100).toFixed(0)}%)`,
    "",
    ...result.votes.map(
      (v) => `- ${v.modelLabel}: ${v.choice} (${Math.round(v.confidence * 100)}%) — ${v.rationale}`,
    ),
  ];
  return lines.join("\n");
}

export function formatDebateRound(round: DebateRound): string {
  return [
    `Debate: ${round.question}`,
    "",
    round.synthesis,
    "",
    "Use write_adr to record the final decision with this transcript.",
  ].join("\n");
}
