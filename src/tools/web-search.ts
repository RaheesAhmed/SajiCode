import { TavilySearch } from "@langchain/tavily";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const PARALLEL_URL = "https://search.parallel.ai/mcp";
const PARALLEL_TIMEOUT_MS = 25_000;

async function callParallelSearch(query: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PARALLEL_TIMEOUT_MS);

  try {
    const response = await fetch(PARALLEL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "User-Agent": "sajicode/1.2.3",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "web_search",
          arguments: {
            objective: query,
            search_queries: [query],
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Parallel.ai returned HTTP ${response.status}`);
    }

    const body = await response.text();
    const trimmed = body.trim();

    if (trimmed.startsWith("{")) {
      const text = parseMcpText(trimmed);
      if (text) return text;
    }

    for (const line of body.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.substring(6).trim();
      if (!payload.startsWith("{")) continue;
      const text = parseMcpText(payload);
      if (text) return text;
    }

    return "No search results found.";
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Parallel.ai search request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseMcpText(json: string): string | undefined {
  try {
    const parsed = JSON.parse(json);
    const content = parsed?.result?.content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item?.text) return item.text;
      }
    }
  } catch {
    // skip
  }
  return undefined;
}

export function createWebSearchTool(tavilyApiKey?: string, maxResults = 3) {
  const apiKey = tavilyApiKey ?? process.env["TAVILY_API_KEY"];

  if (apiKey) {
    return new TavilySearch({
      maxResults,
      tavilyApiKey: apiKey,
      name: "web_search",
    });
  }

  return tool(
    async ({ query }: { query: string }): Promise<string> => {
      return callParallelSearch(query);
    },
    {
      name: "web_search",
      description:
        "Search the web for information on current events, documentation, code examples, and more.",
      schema: z.object({
        query: z.string().describe("The search query"),
      }),
    },
  );
}
