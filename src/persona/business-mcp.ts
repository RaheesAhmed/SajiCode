import fs from "node:fs/promises";
import path from "node:path";
import { saveMcpServerConfig } from "../mcp/config.js";

export interface BusinessMcpTemplate {
  id: string;
  name: string;
  description: string;
  personaIds: string[];
  servers: Record<string, {
    transport?: "stdio" | "streamable_http";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  }>;
}

export const BUSINESS_MCP_TEMPLATES: BusinessMcpTemplate[] = [
  {
    id: "store-retail",
    name: "Store / Retail",
    description: "Shopify orders + Stripe payments + Gmail supplier comms",
    personaIds: ["store-manager"],
    servers: {
      shopify: {
        transport: "streamable_http",
        url: "https://shopify-mcp.example.com/mcp",
        env: { SHOPIFY_ACCESS_TOKEN: "${SHOPIFY_ACCESS_TOKEN}" },
      },
      stripe: {
        command: "npx",
        args: ["-y", "@stripe/mcp-server"],
        env: { STRIPE_SECRET_KEY: "${STRIPE_SECRET_KEY}" },
      },
      gmail: {
        transport: "streamable_http",
        url: "https://gmail-mcp.example.com/mcp",
        env: { GMAIL_OAUTH_TOKEN: "${GMAIL_OAUTH_TOKEN}" },
      },
    },
  },
  {
    id: "business-ops",
    name: "Business Ops",
    description: "Google Sheets reports + Slack notifications + web research",
    personaIds: ["business-ops"],
    servers: {
      sheets: {
        command: "npx",
        args: ["-y", "mcp-server-google-sheets"],
        env: { GOOGLE_APPLICATION_CREDENTIALS: "${GOOGLE_APPLICATION_CREDENTIALS}" },
      },
      slack: {
        transport: "streamable_http",
        url: "https://slack-mcp.example.com/mcp",
        env: { SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}" },
      },
    },
  },
];

export function listBusinessMcpTemplates(): BusinessMcpTemplate[] {
  return BUSINESS_MCP_TEMPLATES;
}

export function getBusinessMcpTemplate(id: string): BusinessMcpTemplate | undefined {
  return BUSINESS_MCP_TEMPLATES.find((t) => t.id === id);
}

export async function applyBusinessMcpTemplate(
  projectPath: string,
  templateId: string,
): Promise<{ template: BusinessMcpTemplate; saved: string[] }> {
  const template = getBusinessMcpTemplate(templateId);
  if (!template) {
    throw new Error(`Unknown business MCP template "${templateId}". Available: ${BUSINESS_MCP_TEMPLATES.map((t) => t.id).join(", ")}`);
  }

  const saved: string[] = [];
  for (const [name, entry] of Object.entries(template.servers)) {
    const pathWritten = await saveMcpServerConfig(projectPath, name, entry);
    saved.push(pathWritten);
  }

  const readme = [
    `# Business MCP — ${template.name}`,
    "",
    template.description,
    "",
    "Suggested persona:",
    ...template.personaIds.map((id) => `  sajicode persona set ${id}`),
    "",
    "Configured servers:",
    ...Object.keys(template.servers).map((s) => `  • ${s}`),
    "",
    "Set env vars in your shell or .env before running the daemon.",
  ].join("\n");

  const docPath = path.join(projectPath, ".sajicode", "business-mcp.md");
  await fs.mkdir(path.dirname(docPath), { recursive: true });
  await fs.writeFile(docPath, readme, "utf-8");

  return { template, saved: [...saved, docPath] };
}

export function formatBusinessMcpList(): string {
  const lines = ["Business MCP templates:", ""];
  for (const t of BUSINESS_MCP_TEMPLATES) {
    lines.push(`  ${t.id} — ${t.name}`);
    lines.push(`    ${t.description}`);
    lines.push(`    personas: ${t.personaIds.join(", ")}`);
    lines.push("");
  }
  lines.push("Apply: sajicode persona business-mcp <id>");
  return lines.join("\n");
}
