import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const RESEARCH_DIR = ".sajicode/research";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_FETCH_CHARS = 12_000;

function slugifyTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchUrlText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "SajiCode-Research/1.0" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();
    const text = contentType.includes("html") ? stripHtml(raw) : raw;
    return text.slice(0, MAX_FETCH_CHARS);
  } finally {
    clearTimeout(timer);
  }
}

export async function writeResearchReport(
  projectPath: string,
  topic: string,
  body: string,
): Promise<string> {
  const dir = path.join(projectPath, RESEARCH_DIR);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${slugifyTopic(topic)}.md`);
  const content = [
    `# Research: ${topic}`,
    "",
    `_Updated ${new Date().toISOString()}_`,
    "",
    body,
  ].join("\n");
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

export function createResearchTools(
  projectPath: string,
  webSearchTool: { invoke: (input: { query: string }) => Promise<unknown> },
) {
  const fetchUrlTool = tool(
    async ({ url }: { url: string }) => {
      try {
        const text = await fetchUrlText(url);
        return `Fetched ${url} (${text.length} chars):\n\n${text}`;
      } catch (error) {
        return `Failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "fetch_url",
      description: "Fetch a URL and return readable text for citation and synthesis.",
      schema: z.object({
        url: z.string().url().describe("URL to fetch"),
      }),
    },
  );

  const writeReportTool = tool(
    async ({ topic, report }: { topic: string; report: string }) => {
      const filePath = await writeResearchReport(projectPath, topic, report);
      return `Research report written: ${filePath}`;
    },
    {
      name: "write_research_report",
      description:
        "Write a cited research report to .sajicode/research/<topic>.md. Include sources with URLs.",
      schema: z.object({
        topic: z.string().describe("Short topic slug/title"),
        report: z.string().describe("Full markdown report with citations"),
      }),
    },
  );

  const multiHopTool = tool(
    async ({ topic, queries }: { topic: string; queries: string[] }) => {
      const sections: string[] = [`# Multi-hop research: ${topic}`, ""];
      const seenUrls = new Set<string>();

      for (const query of queries.slice(0, 5)) {
        sections.push(`## Query: ${query}`, "");
        const searchResult = await webSearchTool.invoke({ query });
        sections.push(String(searchResult), "");

        const urlMatches = String(searchResult).match(/https?:\/\/[^\s)>\]"']+/g) ?? [];
        for (const url of urlMatches.slice(0, 2)) {
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);
          try {
            const fetched = await fetchUrlText(url);
            sections.push(`### Source: ${url}`, fetched.slice(0, 2000), "");
          } catch {
            sections.push(`### Source: ${url}`, "_fetch failed_", "");
          }
        }
      }

      sections.push("## Open questions", "- Verify primary sources before irreversible decisions.", "");
      const body = sections.join("\n");
      const filePath = await writeResearchReport(projectPath, topic, body);
      return `Multi-hop research saved to ${filePath}\n\nPreview:\n${body.slice(0, 1500)}…`;
    },
    {
      name: "multi_hop_research",
      description:
        "Run multi-hop research: search each query, follow top URLs, synthesize into .sajicode/research/.",
      schema: z.object({
        topic: z.string(),
        queries: z.array(z.string()).min(1).max(5).describe("Search queries in order"),
      }),
    },
  );

  return [fetchUrlTool, writeReportTool, multiHopTool];
}
