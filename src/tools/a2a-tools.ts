import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { fetchAgentCard, delegateToExternalAgent } from "../a2a/client.js";

export function createA2aTools() {
  const discoverTool = tool(
    async ({ url }: { url: string }) => {
      try {
        const card = await fetchAgentCard(url);
        const lines = [
          `Agent: ${card.name} (${card.version})`,
          card.description,
          `URL: ${card.url}`,
          "",
          "Skills:",
          ...card.skills.map((s) => `  • ${s.id} — ${s.description}`),
        ];
        return lines.join("\n");
      } catch (error) {
        return `Failed to fetch agent card: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "discover_a2a_agent",
      description: "Fetch an external agent's A2A card from /.well-known/agent.json.",
      schema: z.object({
        url: z.string().url().describe("Base URL of the remote A2A agent"),
      }),
    },
  );

  const delegateTool = tool(
    async (input: { url: string; message: string; skill?: string }) => {
      try {
        const { task, responseText } = await delegateToExternalAgent(
          input.url,
          input.message,
          input.skill ?? "sajicode_build",
        );
        return [
          `A2A task ${task.id} — ${task.state}`,
          "",
          responseText || "(no text response)",
        ].join("\n");
      } catch (error) {
        return `A2A delegation failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "delegate_a2a_task",
      description:
        "Delegate a sub-task to an external A2A agent and wait for the result. Fold artifacts into shared state.",
      schema: z.object({
        url: z.string().url(),
        message: z.string().describe("Task prompt for the remote agent"),
        skill: z.string().optional().describe("Remote skill id (default sajicode_build)"),
      }),
    },
  );

  return [discoverTool, delegateTool];
}
