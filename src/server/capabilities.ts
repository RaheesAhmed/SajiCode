import type { ProjectConfig, OnboardingResult } from "../types/index.js";
import type { A2aSkillId } from "../a2a/types.js";
import { generateStandupBriefing } from "../tools/standup.js";
import { runGuardianCycle } from "../guardian/orchestrator.js";

export function skillToPrompt(skill: A2aSkillId, message: string): {
  prompt: string;
  onboarding: OnboardingResult;
} {
  const trimmed = message.trim();

  switch (skill) {
    case "sajicode_build":
      return {
        prompt: trimmed || "Continue building the project based on current state.",
        onboarding: {
          experienceLevel: "expert",
          projectDescription: trimmed || "A2A build task",
          projectType: "build",
          features: [],
          stackPreferences: {},
        },
      };
    case "sajicode_audit":
      return {
        prompt:
          trimmed
          || "Run a comprehensive security audit on this project. Check for vulnerabilities, exposed secrets, dependency issues, and OWASP Top 10 compliance.",
        onboarding: {
          experienceLevel: "expert",
          projectDescription: "Security audit via A2A",
          projectType: "audit",
          features: [],
          stackPreferences: {},
        },
      };
    case "sajicode_guardian":
      return {
        prompt:
          trimmed
          || "Run a Guardian swarm scan: ingest telemetry, open incidents for anomalies, and recommend tier-appropriate containment actions.",
        onboarding: {
          experienceLevel: "expert",
          projectDescription: "Guardian scan via A2A",
          projectType: "guardian",
          features: [],
          stackPreferences: {},
        },
      };
    case "sajicode_standup":
      return {
        prompt: trimmed || "Generate standup briefing.",
        onboarding: {
          experienceLevel: "expert",
          projectDescription: "Standup via A2A",
          projectType: "standup",
          features: [],
          stackPreferences: {},
        },
      };
    case "sajicode_status":
      return {
        prompt: trimmed || "Return project status.",
        onboarding: {
          experienceLevel: "expert",
          projectDescription: "Status via A2A",
          projectType: "status",
          features: [],
          stackPreferences: {},
        },
      };
  }
}

export async function runCapabilitySync(
  skill: A2aSkillId,
  projectPath: string,
  config: ProjectConfig,
  message: string,
): Promise<string> {
  if (skill === "sajicode_standup") {
    return generateStandupBriefing(projectPath);
  }

  if (skill === "sajicode_status") {
    return formatProjectStatus(projectPath, config, message);
  }

  if (skill === "sajicode_guardian") {
    const cycle = await runGuardianCycle(projectPath, config, []);
    return cycle.report;
  }

  return "";
}

async function formatProjectStatus(
  projectPath: string,
  config: ProjectConfig,
  note: string,
): Promise<string> {
  const lines = [
    "SajiCode project status",
    `  path: ${projectPath}`,
    `  model: ${config.modelConfig.provider}/${config.modelConfig.modelName}`,
    `  risk: ${config.riskTolerance}`,
    `  guardian: ${config.guardian?.enabled !== false ? "enabled" : "disabled"}`,
    `  daemon backend: ${config.daemon?.backend ?? "local"}`,
  ];
  if (note.trim()) lines.push("", `Note: ${note.trim()}`);
  return lines.join("\n");
}

export function isAsyncCapability(skill: A2aSkillId): boolean {
  return skill === "sajicode_build" || skill === "sajicode_audit";
}
