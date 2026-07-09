import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { mergeUsageMetadata, type UsageMetadata } from "@langchain/core/messages";
import type { ChatGeneration, LLMResult } from "@langchain/core/outputs";
import type { ChatGenerationChunk } from "@langchain/core/outputs";

/**
 * Mirror LangChainTracer._getUsageMetadataFromGenerations — the recommended
 * way to read token counts from chat model outputs.
 */
export function extractUsageFromLlmResult(output: LLMResult): UsageMetadata | null {
  let merged: UsageMetadata | undefined;

  for (const generationBatch of output.generations) {
    for (const generation of generationBatch) {
      const chatGen = generation as ChatGeneration;
      if (AIMessage.isInstance(chatGen.message) && chatGen.message.usage_metadata) {
        merged = mergeUsageMetadata(merged, chatGen.message.usage_metadata);
      }
    }
  }

  if (merged && (merged.input_tokens > 0 || merged.output_tokens > 0)) {
    return merged;
  }

  const llmOutput = output.llmOutput as Record<string, unknown> | undefined;
  const tokenUsage = llmOutput?.["tokenUsage"] as Record<string, number> | undefined;
  if (tokenUsage) {
    const input =
      tokenUsage["promptTokens"]
      ?? tokenUsage["inputTokens"]
      ?? tokenUsage["input_tokens"]
      ?? 0;
    const outputTokens =
      tokenUsage["completionTokens"]
      ?? tokenUsage["outputTokens"]
      ?? tokenUsage["output_tokens"]
      ?? 0;
    if (input > 0 || outputTokens > 0) {
      return {
        input_tokens: input,
        output_tokens: outputTokens,
        total_tokens: tokenUsage["totalTokens"] ?? tokenUsage["total_tokens"] ?? input + outputTokens,
      };
    }
  }

  return null;
}

export function extractUsageFromStreamChunk(
  fields?: Record<string, unknown>,
): UsageMetadata | null {
  const chunk = fields?.["chunk"] as ChatGenerationChunk | undefined;
  const message = chunk?.message;
  if (!message || !AIMessageChunk.isInstance(message)) {
    return null;
  }
  const usage = message.usage_metadata;
  if (!usage || (usage.input_tokens === 0 && usage.output_tokens === 0)) {
    return null;
  }
  return usage;
}

/** Provider-reported cost when present (OpenRouter, LangSmith manual metadata). */
export function extractReportedCostUsd(
  usage: UsageMetadata,
  output?: LLMResult,
): number | undefined {
  const extended = usage as UsageMetadata & Record<string, unknown>;
  for (const key of ["total_cost", "cost", "totalCost"]) {
    const value = extended[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  const llmOutput = output?.llmOutput as Record<string, unknown> | undefined;
  const nested = llmOutput?.["usage"] as Record<string, unknown> | undefined;
  if (nested && typeof nested["cost"] === "number") {
    return nested["cost"] as number;
  }

  return undefined;
}
