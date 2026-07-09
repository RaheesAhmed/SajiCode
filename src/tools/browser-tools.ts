import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { BrowserConfig } from "../browser/cdp-client.js";
import {
  checkCdpConnection,
  listCdpTabs,
  navigateAndScreenshot,
  extractPageText,
  browserAct,
} from "../browser/cdp-client.js";
import { isDomainAllowed } from "../browser/allowlist.js";

export function createBrowserTools(
  projectPath: string,
  browserConfig: BrowserConfig = {},
) {
  const config: BrowserConfig = {
    cdpUrl: browserConfig.cdpUrl ?? process.env["SAJICODE_CDP_URL"] ?? "http://127.0.0.1:9222",
    allowedDomains: browserConfig.allowedDomains,
  };

  const connectTool = tool(
    async () => {
      const status = await checkCdpConnection(config.cdpUrl);
      if (!status.ok) {
        return [
          "❌ Cannot connect to Chrome CDP.",
          `Expected ${config.cdpUrl} — start Chrome with remote debugging:`,
          "  chrome.exe --remote-debugging-port=9222",
          "Or set browser.cdpUrl / SAJICODE_CDP_URL",
        ].join("\n");
      }

      const tabs = await listCdpTabs(config.cdpUrl);
      const lines = [
        `✅ Connected to CDP (${status.browser ?? "Chrome"})`,
        `Allowlist: ${config.allowedDomains?.join(", ") ?? "(none — configure browser.allowedDomains)"}`,
        "",
        "Open tabs:",
        ...tabs.slice(0, 10).map((t) => `  • [${t.type}] ${t.title} — ${t.url}`),
      ];
      return lines.join("\n");
    },
    {
      name: "browser_connect",
      description:
        "Attach to the user's logged-in Chrome via CDP (port 9222). Lists open tabs. Requires browser.allowedDomains in config.",
      schema: z.object({}),
    },
  );

  const navigateTool = tool(
    async ({ url }: { url: string }) => {
      const gate = isDomainAllowed(url, config.allowedDomains);
      if (!gate.allowed) return `⛔ Blocked: ${gate.reason}`;

      try {
        const result = await navigateAndScreenshot(projectPath, config, url);
        return [
          result.summary,
          result.screenshotPath ? `Screenshot: ${result.screenshotPath}` : "",
          "Use screenshot for visual review or share with frontend-lead.",
        ]
          .filter(Boolean)
          .join("\n");
      } catch (error) {
        return `Browser navigate failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "browser_navigate",
      description: "Navigate to a URL in the user's Chrome session and capture a full-page screenshot.",
      schema: z.object({
        url: z.string().url(),
      }),
    },
  );

  const extractTool = tool(
    async ({ url }: { url: string }) => {
      const gate = isDomainAllowed(url, config.allowedDomains);
      if (!gate.allowed) return `⛔ Blocked: ${gate.reason}`;

      try {
        const result = await extractPageText(config, url);
        return [result.summary, "", result.extractedText ?? ""].join("\n");
      } catch (error) {
        return `Browser extract failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "browser_extract",
      description: "Extract visible page text from a URL in the attached Chrome session.",
      schema: z.object({
        url: z.string().url(),
      }),
    },
  );

  const actTool = tool(
    async (input: {
      url: string;
      action: "click" | "fill";
      selector: string;
      value?: string;
    }) => {
      const gate = isDomainAllowed(input.url, config.allowedDomains);
      if (!gate.allowed) return `⛔ Blocked: ${gate.reason}`;

      try {
        const result = await browserAct(config, input.url, {
          type: input.action,
          selector: input.selector,
          ...(input.value ? { value: input.value } : {}),
        });
        return result.summary;
      } catch (error) {
        return `Browser act failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "browser_act",
      description:
        "Click or fill a form field in the attached browser. HITL recommended for submit/payment actions.",
      schema: z.object({
        url: z.string().url(),
        action: z.enum(["click", "fill"]),
        selector: z.string().describe("CSS selector"),
        value: z.string().optional().describe("Value for fill action"),
      }),
    },
  );

  return [connectTool, navigateTool, extractTool, actTool];
}
