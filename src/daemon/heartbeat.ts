import fs from "node:fs/promises";
import path from "node:path";

export const HEARTBEAT_FILE = ".sajicode/HEARTBEAT.md";

export const DEFAULT_HEARTBEAT_TEMPLATE = `# Heartbeat checklist (evaluated on daemon interval)

- [ ] Is CI red on any tracked branch? → dispatch fix-ci flow
- [ ] Any Dependabot/security advisory on our deps? → dispatch security-lead review
- [ ] Open PRs with review comments unaddressed > 24h? → address them
- [ ] Scheduled: nightly test run at 02:00 → run full suite, report summary
- [ ] Consolidate stale experiences and mailbox → run sleep consolidation if idle

Return HEARTBEAT_OK if nothing needs action.
`;

export interface HeartbeatItem {
  line: number;
  text: string;
  checked: boolean;
  actionHint?: string;
}

export interface HeartbeatEvaluation {
  ok: boolean;
  items: HeartbeatItem[];
  prompt: string;
}

export async function ensureHeartbeatFile(projectPath: string): Promise<string> {
  const filePath = path.join(projectPath, HEARTBEAT_FILE);
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, DEFAULT_HEARTBEAT_TEMPLATE, "utf-8");
  }
  return filePath;
}

export function parseHeartbeatMarkdown(content: string): HeartbeatItem[] {
  const items: HeartbeatItem[] = [];

  content.split("\n").forEach((line, index) => {
    const match = line.match(/^\s*-\s*\[( |x|X)\]\s*(.+)$/);
    if (!match) return;

    const text = match[2]!.trim();
    const actionMatch = text.match(/→\s*(.+)$/);
    items.push({
      line: index + 1,
      text,
      checked: match[1]!.toLowerCase() === "x",
      ...(actionMatch ? { actionHint: actionMatch[1]!.trim() } : {}),
    });
  });

  return items;
}

export async function evaluateHeartbeat(projectPath: string): Promise<HeartbeatEvaluation> {
  const filePath = path.join(projectPath, HEARTBEAT_FILE);
  let content: string;

  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    await ensureHeartbeatFile(projectPath);
    return {
      ok: true,
      items: [],
      prompt: "HEARTBEAT_OK — no checklist file yet.",
    };
  }

  const items = parseHeartbeatMarkdown(content);
  const pending = items.filter((i) => !i.checked);

  if (pending.length === 0) {
    return {
      ok: true,
      items,
      prompt: "HEARTBEAT_OK",
    };
  }

  const prompt = [
    "Heartbeat evaluation — review the checklist and act only where needed.",
    "",
    "Pending items:",
    ...pending.map((i) => `- ${i.text}`),
    "",
    "If an item requires work, dispatch the appropriate lead or run fix-ci.",
    "If nothing needs action right now, respond with exactly: HEARTBEAT_OK",
  ].join("\n");

  return { ok: false, items, prompt };
}

export function isHeartbeatOkResponse(text: string): boolean {
  return /\bHEARTBEAT_OK\b/i.test(text.trim());
}
