import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { isDomainAllowed } from "./allowlist.js";

const require = createRequire(import.meta.url);

export interface BrowserConfig {
  cdpUrl?: string;
  allowedDomains?: string[];
}

export interface CdpTab {
  id: string;
  title: string;
  url: string;
  type: string;
}

export interface BrowserActionResult {
  ok: boolean;
  summary: string;
  screenshotPath?: string;
  extractedText?: string;
}

const DEFAULT_CDP = "http://127.0.0.1:9222";

interface PlaywrightPage {
  goto(url: string, opts: { waitUntil: string; timeout: number }): Promise<void>;
  screenshot(opts: { path: string; fullPage: boolean }): Promise<void>;
  title(): Promise<string>;
  evaluate<T>(fn: string | (() => T)): Promise<T>;
  click(selector: string, opts: { timeout: number }): Promise<void>;
  fill(selector: string, value: string, opts: { timeout: number }): Promise<void>;
}

interface PlaywrightBrowser {
  contexts(): Array<{ pages(): PlaywrightPage[]; newPage(): Promise<PlaywrightPage> }>;
  newContext(): Promise<{ pages(): PlaywrightPage[]; newPage(): Promise<PlaywrightPage> }>;
  close(): Promise<void>;
}

function loadChromium(): { connectOverCDP(url: string): Promise<PlaywrightBrowser> } {
  try {
    return require("playwright").chromium;
  } catch {
    throw new Error(
      "Playwright not installed. Run: npm install -D playwright && npx playwright install chromium",
    );
  }
}

export async function checkCdpConnection(cdpUrl = DEFAULT_CDP): Promise<{ ok: boolean; browser?: string }> {
  try {
    const versionUrl = `${cdpUrl.replace(/\/$/, "")}/json/version`;
    const response = await fetch(versionUrl, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return { ok: false };
    const body = (await response.json()) as { Browser?: string };
    return { ok: true, browser: body.Browser };
  } catch {
    return { ok: false };
  }
}

export async function listCdpTabs(cdpUrl = DEFAULT_CDP): Promise<CdpTab[]> {
  const listUrl = `${cdpUrl.replace(/\/$/, "")}/json/list`;
  const response = await fetch(listUrl, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`CDP list failed: HTTP ${response.status}`);

  const tabs = (await response.json()) as Array<{
    id: string;
    title: string;
    url: string;
    type: string;
  }>;

  return tabs.map((t) => ({
    id: t.id,
    title: t.title,
    url: t.url,
    type: t.type,
  }));
}

async function withCdpPage<T>(
  config: BrowserConfig,
  url: string,
  fn: (page: PlaywrightPage) => Promise<T>,
): Promise<T> {
  const check = isDomainAllowed(url, config.allowedDomains);
  if (!check.allowed) {
    throw new Error(check.reason ?? "Domain blocked");
  }

  const chromium = loadChromium();
  const cdpUrl = config.cdpUrl ?? DEFAULT_CDP;
  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

export async function navigateAndScreenshot(
  projectPath: string,
  config: BrowserConfig,
  url: string,
): Promise<BrowserActionResult> {
  const screenshotDir = path.join(projectPath, ".sajicode", "screenshots");
  await fs.mkdir(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, `browser-${Date.now()}.png`);

  return withCdpPage(config, url, async (page) => {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const title = await page.title();
    return {
      ok: true,
      summary: `Navigated to ${url} — "${title}"`,
      screenshotPath,
    };
  });
}

export async function extractPageText(
  config: BrowserConfig,
  url: string,
): Promise<BrowserActionResult> {
  return withCdpPage(config, url, async (page) => {
    const text = String(await page.evaluate("document.body?.innerText ?? ''"));
    return {
      ok: true,
      summary: `Extracted ${text.length} chars from ${url}`,
      extractedText: text.slice(0, 8_000),
    };
  });
}

export async function browserAct(
  config: BrowserConfig,
  url: string,
  action: { type: "click" | "fill"; selector: string; value?: string },
): Promise<BrowserActionResult> {
  return withCdpPage(config, url, async (page) => {
    if (action.type === "click") {
      await page.click(action.selector, { timeout: 10_000 });
      return { ok: true, summary: `Clicked ${action.selector} on ${url}` };
    }

    await page.fill(action.selector, action.value ?? "", { timeout: 10_000 });
    return { ok: true, summary: `Filled ${action.selector} on ${url}` };
  });
}
