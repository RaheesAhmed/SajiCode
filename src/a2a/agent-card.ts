import type { A2aAgentCard, A2aSkill } from "./types.js";

export const SAJICODE_A2A_SKILLS: A2aSkill[] = [
  {
    id: "sajicode_build",
    name: "Build",
    description: "Dispatch the SajiCode engineering team to build or modify a project.",
    tags: ["build", "engineering", "code"],
  },
  {
    id: "sajicode_audit",
    name: "Security Audit",
    description: "Run a comprehensive security audit (OWASP, secrets, dependencies).",
    tags: ["security", "audit"],
  },
  {
    id: "sajicode_guardian",
    name: "Guardian Scan",
    description: "Run the Guardian swarm for server defense and incident response.",
    tags: ["security", "guardian", "soc"],
  },
  {
    id: "sajicode_standup",
    name: "Standup",
    description: "Generate a standup briefing from project state.",
    tags: ["standup", "status"],
  },
  {
    id: "sajicode_status",
    name: "Status",
    description: "Return project and server status snapshot.",
    tags: ["status"],
  },
];

export function buildAgentCard(baseUrl: string, version = "1.2.4"): A2aAgentCard {
  const url = baseUrl.replace(/\/$/, "");
  return {
    name: "SajiCode",
    description:
      "Contract-first parallel engineering team — build, audit, and defend via A2A.",
    url,
    version,
    protocolVersion: "0.2.1",
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills: SAJICODE_A2A_SKILLS,
    authentication: { schemes: [] },
  };
}
