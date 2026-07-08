import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ModelConfig, ModelRoutingConfig } from "../types/index.js";
import {
  runStructuredDebate,
  runMultiModelConsensus,
  formatDebateRound,
  formatConsensusResult,
} from "../cognition/debate.js";

export function createDebateTools(
  modelConfig: ModelConfig,
  modelRouting?: ModelRoutingConfig,
) {
  const debateTool = tool(
    async (input: {
      question: string;
      positions: Array<{
        agent: string;
        position: string;
        rationale: string;
        confidence?: number;
      }>;
    }) => {
      const round = runStructuredDebate(input.question, input.positions);
      return formatDebateRound(round);
    },
    {
      name: "run_debate_round",
      description:
        "Structured disagreement round — collect lead positions, synthesize, then write_adr for irreversible choices.",
      schema: z.object({
        question: z.string().describe("Decision being debated"),
        positions: z.array(
          z.object({
            agent: z.string(),
            position: z.string(),
            rationale: z.string(),
            confidence: z.number().min(0).max(1).optional(),
          }),
        ).min(2).max(5),
      }),
    },
  );

  const consensusTool = tool(
    async (input: { question: string; options: string[] }) => {
      const result = await runMultiModelConsensus(
        input.question,
        input.options,
        modelConfig,
        modelRouting,
      );
      return formatConsensusResult(result);
    },
    {
      name: "multi_model_consensus",
      description:
        "High-risk decisions: ask up to 3 routed models to vote with confidence. Use before irreversible architecture choices.",
      schema: z.object({
        question: z.string(),
        options: z.array(z.string()).min(2).max(5),
      }),
    },
  );

  return [debateTool, consensusTool];
}
