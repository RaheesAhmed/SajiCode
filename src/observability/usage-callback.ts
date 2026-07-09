import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";
import { recordUsage } from "./usage-tracker.js";
import { addSessionCost } from "./budget-guard.js";
import {
  extractReportedCostUsd,
  extractUsageFromLlmResult,
  extractUsageFromStreamChunk,
} from "./usage-metadata.js";

export interface UsageCallbackOptions {
  projectPath: string;
  sessionId: string;
  agentName: string;
  modelName: string;
  provider: string;
  baseUrl?: string;
}

class UsageCallbackHandler extends BaseCallbackHandler {
  name = "SajiCodeUsageTracker";

  /** Avoid double-counting when both stream usage chunk and handleLLMEnd fire. */
  private readonly recordedRunIds = new Set<string>();

  constructor(private readonly options: UsageCallbackOptions) {
    super();
  }

  private async persistUsage(
    runId: string,
    inputTokens: number,
    outputTokens: number,
    reportedCostUsd?: number,
  ): Promise<void> {
    if (this.recordedRunIds.has(runId)) return;
    if (inputTokens === 0 && outputTokens === 0) return;

    this.recordedRunIds.add(runId);

    const entry = await recordUsage(this.options.projectPath, {
      sessionId: this.options.sessionId,
      agentName: this.options.agentName,
      model: this.options.modelName,
      provider: this.options.provider,
      inputTokens,
      outputTokens,
      ...(reportedCostUsd != null ? { estimatedCostUsd: reportedCostUsd } : {}),
    }, {
      baseUrl: this.options.baseUrl,
    });

    const budgetResult = addSessionCost(entry.estimatedCostUsd);
    if (budgetResult.warning) {
      console.warn(`[budget] ${budgetResult.warning}`);
    }
  }

  override async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    const usage = extractUsageFromLlmResult(output);
    if (!usage) return;

    const reported = extractReportedCostUsd(usage, output);
    await this.persistUsage(
      runId,
      usage.input_tokens,
      usage.output_tokens,
      reported,
    );
  }

  override async handleLLMNewToken(
    _token: string,
    _idx: unknown,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    fields?: Record<string, unknown>,
  ): Promise<void> {
    const usage = extractUsageFromStreamChunk(fields);
    if (!usage) return;

    const reported = extractReportedCostUsd(usage);
    await this.persistUsage(
      runId,
      usage.input_tokens,
      usage.output_tokens,
      reported,
    );
  }
}

export function createUsageCallbackHandler(
  options: UsageCallbackOptions,
): BaseCallbackHandler {
  return new UsageCallbackHandler(options);
}
