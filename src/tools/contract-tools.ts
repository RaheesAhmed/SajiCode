/**
 * Contract tools for multi-agent API surface negotiation.
 * Agents declare what they expose, what they write, and what they need from peers.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const CONTRACTS_FILE = ".sajicode/contracts.json";

export interface ContractDraft {
  agentName: string;
  apisExposed: string[];
  typesExposed: string[];
  filesWillWrite: string[];
  envVarsNeeded: string[];
  needsFrom: string[];
  timestamp: string;
}

export interface ContractStore {
  status: "draft" | "finalized";
  drafts: ContractDraft[];
  finalizedAt?: string;
}

export async function loadContracts(projectPath: string): Promise<ContractStore> {
  const filePath = join(projectPath, CONTRACTS_FILE);
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as ContractStore;
  } catch {
    return { status: "draft", drafts: [] };
  }
}

export async function saveContracts(projectPath: string, store: ContractStore): Promise<void> {
  const filePath = join(projectPath, CONTRACTS_FILE);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export function createContractTools(projectPath: string) {
  return [
    tool(
      async (input: {
        agentName: string;
        apisExposed: string[];
        typesExposed: string[];
        filesWillWrite: string[];
        envVarsNeeded: string[];
        needsFrom: string[];
      }) => {
        const store = await loadContracts(projectPath);

        if (store.status === "finalized") {
          return "Contracts are finalized — no changes allowed";
        }

        const draft: ContractDraft = {
          agentName: input.agentName,
          apisExposed: input.apisExposed,
          typesExposed: input.typesExposed,
          filesWillWrite: input.filesWillWrite,
          envVarsNeeded: input.envVarsNeeded,
          needsFrom: input.needsFrom,
          timestamp: new Date().toISOString(),
        };

        const existingIndex = store.drafts.findIndex((d) => d.agentName === input.agentName);
        if (existingIndex >= 0) {
          store.drafts[existingIndex] = draft;
        } else {
          store.drafts.push(draft);
        }

        await saveContracts(projectPath, store);

        const lines: string[] = [
          `Contract draft recorded for agent: ${draft.agentName}`,
          `  APIs exposed: ${draft.apisExposed.length > 0 ? draft.apisExposed.join(", ") : "(none)"}`,
          `  Types exposed: ${draft.typesExposed.length > 0 ? draft.typesExposed.join(", ") : "(none)"}`,
          `  Files will write: ${draft.filesWillWrite.length > 0 ? draft.filesWillWrite.join(", ") : "(none)"}`,
          `  Env vars needed: ${draft.envVarsNeeded.length > 0 ? draft.envVarsNeeded.join(", ") : "(none)"}`,
          `  Needs from peers: ${draft.needsFrom.length > 0 ? draft.needsFrom.join(", ") : "(none)"}`,
          `  Total agents with drafts: ${store.drafts.length}`,
        ];

        return lines.join("\n");
      },
      {
        name: "draft_contract",
        description:
          "Record or update an agent's contract declaring the APIs it exposes, types it exports, files it will write, env vars it needs, and what it depends on from other agents. Must be called before finalizing contracts.",
        schema: z.object({
          agentName: z.string().describe("Unique name identifying this agent"),
          apisExposed: z.array(z.string()).describe("API endpoints or function signatures this agent exposes"),
          typesExposed: z.array(z.string()).describe("TypeScript types or interfaces this agent exports"),
          filesWillWrite: z.array(z.string()).describe("File paths this agent will create or modify"),
          envVarsNeeded: z.array(z.string()).describe("Environment variable names this agent requires"),
          needsFrom: z
            .array(z.string())
            .describe("APIs, types, or capabilities this agent needs from other agents"),
        }),
      },
    ),

    tool(
      async (input: { summary?: string }) => {
        const store = await loadContracts(projectPath);

        if (store.status === "finalized") {
          return "Contracts are already finalized.";
        }

        if (store.drafts.length === 0) {
          return "No contract drafts found. Agents must submit drafts before finalizing.";
        }

        // Detect file write conflicts
        const fileOwners = new Map<string, string[]>();
        for (const draft of store.drafts) {
          for (const file of draft.filesWillWrite) {
            const owners = fileOwners.get(file) ?? [];
            owners.push(draft.agentName);
            fileOwners.set(file, owners);
          }
        }

        const conflicts: string[] = [];
        for (const [file, owners] of fileOwners.entries()) {
          if (owners.length > 1) {
            conflicts.push(`  "${file}" claimed by: ${owners.join(", ")}`);
          }
        }

        if (conflicts.length > 0) {
          const lines: string[] = [
            "Cannot finalize contracts — file write conflicts detected:",
            ...conflicts,
            "",
            "Agents must resolve these conflicts by updating their drafts before finalization.",
          ];
          return lines.join("\n");
        }

        store.status = "finalized";
        store.finalizedAt = new Date().toISOString();
        await saveContracts(projectPath, store);

        const tableHeader = [
          "| Agent | APIs Exposed | Types Exposed | Files Will Write | Env Vars | Needs From |",
          "|-------|-------------|---------------|-----------------|----------|------------|",
        ];

        const tableRows = store.drafts.map((d) => {
          const apis = d.apisExposed.length > 0 ? d.apisExposed.join("<br>") : "-";
          const types = d.typesExposed.length > 0 ? d.typesExposed.join("<br>") : "-";
          const files = d.filesWillWrite.length > 0 ? d.filesWillWrite.join("<br>") : "-";
          const env = d.envVarsNeeded.length > 0 ? d.envVarsNeeded.join("<br>") : "-";
          const needs = d.needsFrom.length > 0 ? d.needsFrom.join("<br>") : "-";
          return `| ${d.agentName} | ${apis} | ${types} | ${files} | ${env} | ${needs} |`;
        });

        const summarySection = input.summary ? `\n**Summary:** ${input.summary}\n` : "";

        const lines: string[] = [
          `## Contracts Finalized`,
          `Finalized at: ${store.finalizedAt}`,
          `Total agents: ${store.drafts.length}`,
          summarySection,
          "",
          "### Contract Table",
          ...tableHeader,
          ...tableRows,
        ];

        return lines.join("\n");
      },
      {
        name: "finalize_contracts",
        description:
          "Finalize all agent contracts after checking for file write conflicts. If conflicts exist, returns them and does not finalize. Once finalized, no further changes are allowed.",
        schema: z.object({
          summary: z.string().optional().describe("Optional human-readable summary to include in the finalization record"),
        }),
      },
    ),

    tool(
      async (input: { agentName?: string }) => {
        const store = await loadContracts(projectPath);

        const statusLine = `**Status:** ${store.status === "finalized" ? `Finalized at ${store.finalizedAt}` : "Draft (not yet finalized)"}`;

        if (store.drafts.length === 0) {
          return `${statusLine}\n\nNo contract drafts found.`;
        }

        const sections: string[] = [`## Contract Registry`, statusLine, ""];

        for (const draft of store.drafts) {
          const isTarget = input.agentName && draft.agentName === input.agentName;
          const heading = isTarget ? `### ** ${draft.agentName} ** (you)` : `### ${draft.agentName}`;

          sections.push(heading);
          sections.push(`_Last updated: ${draft.timestamp}_`);
          sections.push("");

          if (draft.apisExposed.length > 0) {
            sections.push("**APIs Exposed:**");
            for (const api of draft.apisExposed) {
              sections.push(`- ${api}`);
            }
          } else {
            sections.push("**APIs Exposed:** (none)");
          }

          if (draft.typesExposed.length > 0) {
            sections.push("**Types Exported:**");
            for (const t of draft.typesExposed) {
              sections.push(`- ${t}`);
            }
          } else {
            sections.push("**Types Exported:** (none)");
          }

          if (draft.filesWillWrite.length > 0) {
            sections.push("**Files Will Write:**");
            for (const f of draft.filesWillWrite) {
              sections.push(`- ${f}`);
            }
          } else {
            sections.push("**Files Will Write:** (none)");
          }

          if (draft.envVarsNeeded.length > 0) {
            sections.push("**Env Vars Needed:**");
            for (const e of draft.envVarsNeeded) {
              sections.push(`- ${e}`);
            }
          } else {
            sections.push("**Env Vars Needed:** (none)");
          }

          if (draft.needsFrom.length > 0) {
            sections.push("**Needs From Peers:**");
            for (const n of draft.needsFrom) {
              sections.push(`- ${n}`);
            }
          } else {
            sections.push("**Needs From Peers:** (none)");
          }

          sections.push("");
        }

        // If a specific agent is requested, highlight what peer agents provide that it needs
        if (input.agentName) {
          const targetDraft = store.drafts.find((d) => d.agentName === input.agentName);
          if (targetDraft && targetDraft.needsFrom.length > 0) {
            sections.push(`---`);
            sections.push(`### Dependency Resolution for ${input.agentName}`);
            sections.push("");
            sections.push("What this agent needs and which peers provide it:");
            sections.push("");

            for (const need of targetDraft.needsFrom) {
              const providers: string[] = [];
              for (const draft of store.drafts) {
                if (draft.agentName === input.agentName) continue;
                const allExposed = [...draft.apisExposed, ...draft.typesExposed];
                const matches = allExposed.filter(
                  (exposed) =>
                    exposed.toLowerCase().includes(need.toLowerCase()) ||
                    need.toLowerCase().includes(exposed.toLowerCase()),
                );
                if (matches.length > 0) {
                  providers.push(`${draft.agentName} (${matches.join(", ")})`);
                }
              }

              if (providers.length > 0) {
                sections.push(`- **${need}** — provided by: ${providers.join("; ")}`);
              } else {
                sections.push(`- **${need}** — _no known provider found_`);
              }
            }

            sections.push("");
          }
        }

        return sections.join("\n");
      },
      {
        name: "read_contracts",
        description:
          "Read all agent contracts. If agentName is provided, also shows a dependency resolution section highlighting what other agents expose that this agent needs.",
        schema: z.object({
          agentName: z
            .string()
            .optional()
            .describe("If provided, highlights peer-provided dependencies for this agent"),
        }),
      },
    ),
  ];
}
