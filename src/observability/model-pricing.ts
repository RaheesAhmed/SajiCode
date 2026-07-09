/**
 * Per-million-token USD rates (input / output).
 * Aligns with LangSmith default pricing where possible.
 * Unknown models fall back to env overrides or zero for local Ollama.
 */
const PRICING_PER_1M_USD: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o1": { input: 15, output: 60 },
  "o1-mini": { input: 1.1, output: 4.4 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "minimax-m2.5:cloud": { input: 0.3, output: 1.2 },
  "minimax-m2:cloud": { input: 0.2, output: 0.8 },
};

function normalizeModelKey(model: string): string {
  const bare = model.includes("/") ? model.split("/").pop()! : model;
  return bare.toLowerCase();
}

function lookupModelRates(model: string): { input: number; output: number } | null {
  const key = normalizeModelKey(model);
  if (PRICING_PER_1M_USD[key]) {
    return PRICING_PER_1M_USD[key]!;
  }

  for (const [pattern, rates] of Object.entries(PRICING_PER_1M_USD)) {
    if (key.includes(pattern) || pattern.includes(key)) {
      return rates;
    }
  }

  return null;
}

export function isLocalOllamaProvider(provider: string, baseUrl?: string): boolean {
  if (provider.toLowerCase() !== "ollama") return false;
  const url = (baseUrl ?? process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434").toLowerCase();
  return url.includes("localhost") || url.includes("127.0.0.1");
}

export function estimateCostFromUsage(
  inputTokens: number,
  outputTokens: number,
  options: { model: string; provider: string; baseUrl?: string },
): number {
  const envInput = process.env["SAJICODE_INPUT_COST_PER_1K"];
  const envOutput = process.env["SAJICODE_OUTPUT_COST_PER_1K"];
  if (envInput != null || envOutput != null) {
    const inputRate = Number(envInput ?? 0);
    const outputRate = Number(envOutput ?? 0);
    return (inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate;
  }

  if (isLocalOllamaProvider(options.provider, options.baseUrl)) {
    return 0;
  }

  const rates = lookupModelRates(options.model);
  if (!rates) {
    return 0;
  }

  return (
    (inputTokens / 1_000_000) * rates.input
    + (outputTokens / 1_000_000) * rates.output
  );
}
