import fs from "fs/promises";
import path from "path";

const AGENTS_DIR = ".sajicode/agents";

export interface MemoryEntry {
  timestamp: string;
  category:
    | "decision"
    | "contract"
    | "blocker"
    | "architecture"
    | "progress"
    | "user_preference"
    | "error_pattern"
    | "success_pattern"
    | "platform_quirk"
    | "dependency_note";
  content: string;
  tags: string[];
}

export interface AgentMemoryFile {
  identity: string;
  territory: string[];
  entries: MemoryEntry[];
}

export async function ensureAgentMemoryDir(projectPath: string): Promise<void> {
  await fs.mkdir(path.join(projectPath, AGENTS_DIR), { recursive: true });
}

export async function loadAgentMemory(
  projectPath: string,
  agentName: string,
): Promise<string> {
  const jsonPath = path.join(projectPath, AGENTS_DIR, `${agentName}.json`);
  const mdPath = path.join(projectPath, AGENTS_DIR, `${agentName}.md`);

  try {
    const content = await fs.readFile(jsonPath, "utf-8");
    const memory: AgentMemoryFile = JSON.parse(content);
    return formatMemoryForPrompt(memory, agentName);
  } catch {
    // Fallback: try legacy .md format
    try {
      const mdContent = await fs.readFile(mdPath, "utf-8");
      if (!mdContent.trim()) return "";
      return `## MY PERSISTENT MEMORY (from previous sessions)\n${mdContent}\n---\n`;
    } catch {
      return "";
    }
  }
}

function formatMemoryForPrompt(memory: AgentMemoryFile, agentName: string): string {
  if (memory.entries.length === 0) return "";

  const recentEntries = memory.entries.slice(-20);

  const byCategory = new Map<string, MemoryEntry[]>();
  for (const entry of recentEntries) {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
    byCategory.get(entry.category)!.push(entry);
  }

  const lines = [
    `## MY PERSISTENT MEMORY — ${agentName}`,
    `Identity: ${memory.identity}`,
    `Territory: ${memory.territory.join(", ")}`,
    "",
  ];

  const categoryOrder: MemoryEntry["category"][] = [
    "architecture", "decision", "contract", "error_pattern",
    "success_pattern", "platform_quirk", "dependency_note",
    "progress", "blocker", "user_preference",
  ];

  for (const cat of categoryOrder) {
    const entries = byCategory.get(cat);
    if (!entries) continue;
    lines.push(`### ${cat.toUpperCase()}`);
    for (const entry of entries) {
      lines.push(`- ${entry.content}`);
    }
    lines.push("");
  }

  lines.push("---");
  return lines.join("\n");
}

export async function initAgentMemoryFile(
  projectPath: string,
  agentName: string,
  identity: string,
  owns: string[],
): Promise<void> {
  const jsonPath = path.join(projectPath, AGENTS_DIR, `${agentName}.json`);

  try {
    await fs.access(jsonPath);
  } catch {
    const initial: AgentMemoryFile = {
      identity,
      territory: owns,
      entries: [],
    };
    await fs.writeFile(jsonPath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

export async function appendAgentMemory(
  projectPath: string,
  agentName: string,
  category: MemoryEntry["category"],
  content: string,
  tags: string[] = [],
): Promise<void> {
  const jsonPath = path.join(projectPath, AGENTS_DIR, `${agentName}.json`);

  let memory: AgentMemoryFile;
  try {
    const raw = await fs.readFile(jsonPath, "utf-8");
    memory = JSON.parse(raw);
  } catch {
    memory = { identity: agentName, territory: [], entries: [] };
  }

  memory.entries.push({
    timestamp: new Date().toISOString(),
    category,
    content,
    tags,
  });

  // Keep last 100 entries max to prevent memory bloat
  if (memory.entries.length > 100) {
    memory.entries = memory.entries.slice(-100);
  }

  await fs.writeFile(jsonPath, JSON.stringify(memory, null, 2), "utf-8");
}

export async function searchAgentMemory(
  projectPath: string,
  agentName: string,
  query: string,
): Promise<MemoryEntry[]> {
  const jsonPath = path.join(projectPath, AGENTS_DIR, `${agentName}.json`);

  try {
    const raw = await fs.readFile(jsonPath, "utf-8");
    const memory: AgentMemoryFile = JSON.parse(raw);
    const queryLower = query.toLowerCase();

    return memory.entries.filter((entry) => {
      const contentMatch = entry.content.toLowerCase().includes(queryLower);
      const tagMatch = entry.tags.some((t) => t.toLowerCase().includes(queryLower));
      return contentMatch || tagMatch;
    });
  } catch {
    return [];
  }
}
