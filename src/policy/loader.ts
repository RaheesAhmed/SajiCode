import fs from "node:fs/promises";
import path from "node:path";
import type { PolicyConfig } from "./schema.js";
import { safeParsePoliciesFile } from "./schema.js";

const POLICIES_FILE = "policies.json";

export function mergePolicyConfigs(
  base: PolicyConfig,
  overlay: PolicyConfig,
): PolicyConfig {
  return {
    protectedPaths: [
      ...new Set([...(base.protectedPaths ?? []), ...(overlay.protectedPaths ?? [])]),
    ],
    requireApproval: [
      ...new Set([...(base.requireApproval ?? []), ...(overlay.requireApproval ?? [])]),
    ],
    forbiddenDependencies: [
      ...new Set([
        ...(base.forbiddenDependencies ?? []),
        ...(overlay.forbiddenDependencies ?? []),
      ]),
    ],
    maxFilesPerSession: overlay.maxFilesPerSession ?? base.maxFilesPerSession,
    secretsScan: overlay.secretsScan ?? base.secretsScan,
  };
}

export async function loadPoliciesFromFile(
  projectPath: string,
): Promise<PolicyConfig> {
  const filePath = path.join(projectPath, ".sajicode", POLICIES_FILE);
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown;
    const parsed = safeParsePoliciesFile(raw);
    if (!parsed.success) {
      console.warn(`Invalid ${POLICIES_FILE}: ${parsed.error}`);
      return {};
    }
    return parsed.data;
  } catch {
    return {};
  }
}

export async function resolvePolicies(
  projectPath: string,
  configPolicies?: PolicyConfig,
): Promise<PolicyConfig> {
  const filePolicies = await loadPoliciesFromFile(projectPath);
  return mergePolicyConfigs(filePolicies, configPolicies ?? {});
}
