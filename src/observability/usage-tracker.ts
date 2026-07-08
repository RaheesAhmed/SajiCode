import fs from "node:fs/promises";
import path from "node:path";
import type { BudgetConfig } from "../types/index.js";

export type { BudgetConfig };

export interface UsageEntry {
  timestamp: string;
  sessionId: string;
  agentName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface UsageStore {
  version: 1;
  entries: UsageEntry[];
}

const USAGE_FILE = ".sajicode/usage.json";

// Rough defaults — users can override via SAJICODE_COST_PER_1K
const DEFAULT_INPUT_COST_PER_1K = 0.003;
const DEFAULT_OUTPUT_COST_PER_1K = 0.015;

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
): number {
  const inputRate = Number(process.env["SAJICODE_INPUT_COST_PER_1K"] ?? DEFAULT_INPUT_COST_PER_1K);
  const outputRate = Number(process.env["SAJICODE_OUTPUT_COST_PER_1K"] ?? DEFAULT_OUTPUT_COST_PER_1K);
  return (inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate;
}

export async function loadUsageStore(projectPath: string): Promise<UsageStore> {
  const filePath = path.join(projectPath, USAGE_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as UsageStore;
  } catch {
    return { version: 1, entries: [] };
  }
}

export async function saveUsageStore(
  projectPath: string,
  store: UsageStore,
): Promise<void> {
  const filePath = path.join(projectPath, USAGE_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  if (store.entries.length > 5000) {
    store.entries = store.entries.slice(-5000);
  }

  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export async function recordUsage(
  projectPath: string,
  entry: Omit<UsageEntry, "timestamp" | "estimatedCostUsd"> & {
    estimatedCostUsd?: number;
  },
): Promise<UsageEntry> {
  const store = await loadUsageStore(projectPath);
  const full: UsageEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    estimatedCostUsd:
      entry.estimatedCostUsd
      ?? estimateCostUsd(entry.inputTokens, entry.outputTokens),
  };
  store.entries.push(full);
  await saveUsageStore(projectPath, store);
  return full;
}

export function sumSessionCost(
  store: UsageStore,
  sessionId: string,
): number {
  return store.entries
    .filter((e) => e.sessionId === sessionId)
    .reduce((sum, e) => sum + e.estimatedCostUsd, 0);
}

export function costByAgent(
  store: UsageStore,
  sessionId?: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of store.entries) {
    if (sessionId && entry.sessionId !== sessionId) continue;
    result[entry.agentName] = (result[entry.agentName] ?? 0) + entry.estimatedCostUsd;
  }
  return result;
}

export function checkBudget(
  sessionCost: number,
  budget?: BudgetConfig,
): { allowed: boolean; warning?: string } {
  if (!budget?.perSession) return { allowed: true };

  const limit = budget.perSession;
  const ratio = sessionCost / limit;

  if (ratio >= 1) {
    return {
      allowed: budget.action !== "pause",
      warning: `Session budget exceeded: $${sessionCost.toFixed(2)} / $${limit.toFixed(2)}`,
    };
  }

  if (ratio >= 0.8) {
    return {
      allowed: true,
      warning: `Session budget at ${Math.round(ratio * 100)}%: $${sessionCost.toFixed(2)} / $${limit.toFixed(2)}`,
    };
  }

  return { allowed: true };
}

export async function formatCostsReport(
  projectPath: string,
  days = 7,
): Promise<string> {
  const store = await loadUsageStore(projectPath);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const recent = store.entries.filter(
    (e) => new Date(e.timestamp).getTime() >= cutoff,
  );

  if (recent.length === 0) {
    return `No usage recorded in the last ${days} day(s).`;
  }

  const total = recent.reduce((s, e) => s + e.estimatedCostUsd, 0);
  const byAgent = costByAgent({ version: 1, entries: recent });

  const lines = [
    `Usage report (last ${days} days):`,
    `  Total estimated cost: $${total.toFixed(2)}`,
    `  API calls: ${recent.length}`,
    "",
    "  By agent:",
    ...Object.entries(byAgent)
      .sort((a, b) => b[1] - a[1])
      .map(([agent, cost]) => `    ${agent}: $${cost.toFixed(2)}`),
  ];

  return lines.join("\n");
}
