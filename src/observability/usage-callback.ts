import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";
import { recordUsage } from "./usage-tracker.js";
import { addSessionCost } from "./budget-guard.js";

export interface UsageCallbackOptions {
  projectPath: string;
  sessionId: string;
  agentName: string;
  modelName: string;
}

function extractTokenCounts(output: LLMResult): {
  inputTokens: number;
  outputTokens: number;
} {
  const usage = output.llmOutput as Record<string, unknown> | undefined;
  const tokenUsage = usage?.["tokenUsage"] as Record<string, number> | undefined;

  if (tokenUsage) {
    return {
      inputTokens: tokenUsage["promptTokens"] ?? tokenUsage["inputTokens"] ?? 0,
      outputTokens: tokenUsage["completionTokens"] ?? tokenUsage["outputTokens"] ?? 0,
    };
  }

  const generationInfo = output.generations[0]?.[0]?.generationInfo as
    | Record<string, number>
    | undefined;

  return {
    inputTokens: generationInfo?.["promptTokens"] ?? generationInfo?.["inputTokens"] ?? 0,
    outputTokens:
      generationInfo?.["completionTokens"] ?? generationInfo?.["outputTokens"] ?? 0,
  };
}

class UsageCallbackHandler extends BaseCallbackHandler {
  name = "SajiCodeUsageTracker";

  constructor(private readonly options: UsageCallbackOptions) {
    super();
  }

  override async handleLLMEnd(output: LLMResult): Promise<void> {
    const { inputTokens, outputTokens } = extractTokenCounts(output);

    if (inputTokens === 0 && outputTokens === 0) {
      return;
    }

    const entry = await recordUsage(this.options.projectPath, {
      sessionId: this.options.sessionId,
      agentName: this.options.agentName,
      model: this.options.modelName,
      inputTokens,
      outputTokens,
    });

    const budgetResult = addSessionCost(entry.estimatedCostUsd);
    if (budgetResult.warning) {
      console.warn(`[budget] ${budgetResult.warning}`);
    }
  }
}

export function createUsageCallbackHandler(
  options: UsageCallbackOptions,
): BaseCallbackHandler {
  return new UsageCallbackHandler(options);
}
