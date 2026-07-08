import type { BudgetConfig } from "../types/index.js";
import { checkBudget } from "./usage-tracker.js";

let activeBudget: BudgetConfig | undefined;
let sessionCostUsd = 0;
let budgetExceeded = false;

export function setActiveBudgetConfig(budget?: BudgetConfig): void {
  activeBudget = budget;
  sessionCostUsd = 0;
  budgetExceeded = false;
}

export function addSessionCost(amount: number): { warning?: string; blocked: boolean } {
  sessionCostUsd += amount;

  if (!activeBudget?.perSession) {
    return { blocked: false };
  }

  const result = checkBudget(sessionCostUsd, activeBudget);
  if (!result.allowed) {
    budgetExceeded = true;
  }

  return {
    blocked: budgetExceeded && activeBudget.action === "pause",
    ...(result.warning ? { warning: result.warning } : {}),
  };
}

export function isBudgetExceeded(): boolean {
  return budgetExceeded;
}

export function getSessionCostUsd(): number {
  return sessionCostUsd;
}
