import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ModelConfig, ModelRoutingConfig } from "../types/index.js";
import { createModel } from "./provider.js";
import {
  resolveModelConfigForAgent,
  resolveFallbackModelConfig,
} from "./router.js";
import { createUsageCallbackHandler } from "../observability/usage-callback.js";
import { setActiveBudgetConfig } from "../observability/budget-guard.js";

export interface ModelFactoryContext {
  projectPath: string;
  sessionId: string;
  budget?: import("../types/index.js").BudgetConfig;
}

export async function createModelForAgent(
  agentName: string,
  baseConfig: ModelConfig,
  routing?: ModelRoutingConfig,
  context?: ModelFactoryContext,
): Promise<BaseChatModel> {
  if (context?.budget) {
    setActiveBudgetConfig(context.budget);
  }

  const agentConfig = resolveModelConfigForAgent(agentName, baseConfig, routing);
  let model = await createModel(agentConfig);

  const fallbackConfig = resolveFallbackModelConfig(baseConfig, routing);
  if (
    fallbackConfig
    && fallbackConfig.modelName !== agentConfig.modelName
  ) {
    const fallbackModel = await createModel(fallbackConfig);
    model = model.withFallbacks({ fallbacks: [fallbackModel] }) as unknown as BaseChatModel;
  }

  if (context) {
    const usageHandler = createUsageCallbackHandler({
      projectPath: context.projectPath,
      sessionId: context.sessionId,
      agentName,
      modelName: agentConfig.modelName,
    });
    model = model.withConfig({ callbacks: [usageHandler] }) as BaseChatModel;
  }

  return model;
}
