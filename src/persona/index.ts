import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface PersonaPack {
  id: string;
  name: string;
  description: string;
  content: string;
  source: "bundled" | "project" | "user";
}

const PERSONA_FILE = ".sajicode/persona.md";
const PERSONA_CONFIG = ".sajicode/persona.json";

export const BUNDLED_PERSONAS: Record<string, Omit<PersonaPack, "source">> = {
  engineer: {
    id: "engineer",
    name: "Engineer (default)",
    description: "Staff-level PM — ship fast with quality, delegate to leads.",
    content: [
      "# Persona: Engineer",
      "",
      "Tone: direct, technical, concise.",
      "Priorities: correctness, tests, small diffs, parallel dispatch.",
      "Constraints: never implement source files as PM; use leads and ADRs for irreversible choices.",
    ].join("\n"),
  },
  "startup-cto": {
    id: "startup-cto",
    name: "Startup CTO",
    description: "Pragmatic MVP first, harden later.",
    content: [
      "# Persona: Startup CTO",
      "",
      "Tone: fast, opinionated, outcome-focused.",
      "Priorities: time-to-market, vertical slices, defer perfect architecture.",
      "Constraints: flag tech debt explicitly; still require smoke checks before calling done.",
    ].join("\n"),
  },
  "enterprise-architect": {
    id: "enterprise-architect",
    name: "Enterprise Architect",
    description: "Compliance-first, ADRs mandatory, conservative changes.",
    content: [
      "# Persona: Enterprise Architect",
      "",
      "Tone: formal, risk-aware, audit-friendly.",
      "Priorities: ADRs for every irreversible choice, security review, backward compatibility.",
      "Constraints: require debate + write_adr before major framework or auth changes.",
    ].join("\n"),
  },
  "business-ops": {
    id: "business-ops",
    name: "Business Ops",
    description: "Non-technical reports, summaries, and operational workflows.",
    content: [
      "# Persona: Business Ops",
      "",
      "Tone: plain language, no jargon unless asked.",
      "Priorities: clear summaries, checklists, emails, dashboards described in human terms.",
      "Constraints: hide code and git details unless the user asks; translate technical plans to business impact.",
    ].join("\n"),
  },
  "store-manager": {
    id: "store-manager",
    name: "Store Manager",
    description: "Inventory, orders, customer replies for retail/small business.",
    content: [
      "# Persona: Store Manager",
      "",
      "Tone: friendly, practical, customer-facing.",
      "Priorities: orders, inventory, supplier comms, simple automations via MCP integrations.",
      "Constraints: prefer WhatsApp/channel-friendly short replies; escalate coding to leads only when needed.",
    ].join("\n"),
  },
};

export function getUserPersonasDir(): string {
  return path.join(os.homedir(), ".sajicode", "personas");
}

export function getProjectPersonaPath(projectPath: string): string {
  return path.join(projectPath, PERSONA_FILE);
}

async function readPersonaConfig(projectPath: string): Promise<{ activeId?: string }> {
  try {
    const raw = await fs.readFile(path.join(projectPath, PERSONA_CONFIG), "utf-8");
    return JSON.parse(raw) as { activeId?: string };
  } catch {
    return {};
  }
}

export async function savePersonaConfig(
  projectPath: string,
  activeId: string,
): Promise<void> {
  const filePath = path.join(projectPath, PERSONA_CONFIG);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ activeId }, null, 2), "utf-8");
}

export async function listPersonaPacks(projectPath: string): Promise<PersonaPack[]> {
  const packs: PersonaPack[] = [];

  for (const persona of Object.values(BUNDLED_PERSONAS)) {
    packs.push({ ...persona, source: "bundled" });
  }

  for (const root of [getUserPersonasDir(), path.join(projectPath, ".sajicode", "personas")]) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.name.endsWith(".md")) continue;
        const content = await fs.readFile(path.join(root, entry.name), "utf-8");
        const id = entry.name.replace(/\.md$/, "");
        packs.push({
          id,
          name: id,
          description: content.split("\n").find((l) => l.trim())?.replace(/^#\s*/, "") ?? id,
          content,
          source: root.includes(".sajicode") ? "project" : "user",
        });
      }
    } catch {
      // skip
    }
  }

  return packs;
}

export async function resolveActivePersona(projectPath: string): Promise<PersonaPack | null> {
  const projectPersona = getProjectPersonaPath(projectPath);
  try {
    const content = await fs.readFile(projectPersona, "utf-8");
    return {
      id: "custom",
      name: "Project persona",
      description: "From .sajicode/persona.md",
      content,
      source: "project",
    };
  } catch {
    // fall through
  }

  const config = await readPersonaConfig(projectPath);
  const activeId = config.activeId ?? "engineer";
  const bundled = BUNDLED_PERSONAS[activeId];
  if (bundled) return { ...bundled, source: "bundled" };

  const packs = await listPersonaPacks(projectPath);
  return packs.find((p) => p.id === activeId) ?? { ...BUNDLED_PERSONAS["engineer"]!, source: "bundled" };
}

export async function activatePersona(
  projectPath: string,
  personaId: string,
): Promise<string> {
  if (personaId === "custom") {
    throw new Error("Cannot activate 'custom' — edit .sajicode/persona.md directly");
  }

  const packs = await listPersonaPacks(projectPath);
  const pack = packs.find((p) => p.id === personaId);
  if (!pack) {
    throw new Error(`Unknown persona "${personaId}". Run: sajicode persona list`);
  }

  await savePersonaConfig(projectPath, personaId);
  const dest = getProjectPersonaPath(projectPath);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, pack.content, "utf-8");
  return dest;
}

export function formatPersonaForPrompt(persona: PersonaPack | null): string {
  if (!persona) return "";
  return ["## Active Persona", persona.content].join("\n\n");
}

export function formatNonDeveloperGuidance(experienceLevel: string): string {
  if (experienceLevel !== "beginner") return "";

  return [
    "## Non-Developer Mode",
    "",
    "The user is not a developer. Use plain language.",
    "- Translate their goal into a technical plan internally, but explain outcomes in human terms.",
    "- Avoid jargon (API, middleware, repo) unless they ask.",
    "- Do not dump code or file paths unless requested.",
    "- Confirm understanding before dispatching the team.",
  ].join("\n");
}
