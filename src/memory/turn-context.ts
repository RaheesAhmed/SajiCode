import {
  grepTranscripts,
  loadPointerIndex,
  loadTopicFile,
} from "./three-layer-memory.js";

const MAX_TOPICS = 3;
const MAX_TOPIC_CHARS = 2400;
const MAX_TRANSCRIPT_MATCHES = 8;
const MAX_TRANSCRIPT_KEYWORDS = 4;
const MAX_CONTEXT_CHARS = 9000;

interface MemoryPointer {
  topic: string;
  summary: string;
  topicFile: string;
}

export async function augmentInputWithMemoryContext(
  projectPath: string,
  input: any,
): Promise<any> {
  const userText = getLastUserText(input);
  if (!userText) return input;

  const memoryContext = await buildMemoryTurnContext(projectPath, userText);
  if (!memoryContext) return input;

  const messages = Array.isArray(input?.messages) ? [...input.messages] : [];
  const lastUserIndex = findLastUserMessageIndex(messages);
  if (lastUserIndex === -1) return input;

  const originalMessage = messages[lastUserIndex];
  const originalContent = typeof originalMessage?.content === "string"
    ? originalMessage.content
    : JSON.stringify(originalMessage?.content ?? "");

  messages[lastUserIndex] = {
    ...originalMessage,
    content: `${memoryContext}\n\n## USER REQUEST\n\n${originalContent}`,
  };

  return {
    ...input,
    messages,
  };
}

export async function buildMemoryTurnContext(
  projectPath: string,
  userText: string,
): Promise<string> {
  const pointerIndex = await loadPointerIndex(projectPath);
  if (!pointerIndex.trim()) return "";

  const pointers = parseMemoryPointers(pointerIndex);
  const relevantPointers = rankPointersByRelevance(pointers, userText).slice(0, MAX_TOPICS);
  const topicSections: string[] = [];

  for (const pointer of relevantPointers) {
    const topic = await loadTopicFile(projectPath, pointer.topicFile);
    if (!topic) continue;

    topicSections.push(
      `### ${topic.topic} (${pointer.topicFile})\n${truncate(topic.content, MAX_TOPIC_CHARS)}`,
    );
  }

  const transcriptMatches = await findRelevantTranscriptMatches(projectPath, userText);
  const sections = [
    "## MEMORY CONTEXT",
    "",
    "Treat this memory as hints and verify important details against current files.",
    "",
    "### Pointer Index",
    truncate(pointerIndex.trim(), 2200),
  ];

  if (topicSections.length > 0) {
    sections.push("", "### Relevant Topic Details", topicSections.join("\n\n"));
  }

  if (transcriptMatches.length > 0) {
    sections.push("", "### Transcript Matches", transcriptMatches.join("\n"));
  }

  return truncate(sections.join("\n"), MAX_CONTEXT_CHARS);
}

export function parseMemoryPointers(pointerIndex: string): MemoryPointer[] {
  const pointers: MemoryPointer[] = [];
  const pointerPattern = /^\[([^\]]+)\]\s+(.+?)\s+[→-]\s+topics\/([^\s)]+)/;

  for (const line of pointerIndex.split(/\r?\n/)) {
    const match = line.match(pointerPattern);
    if (!match?.[1] || !match[2] || !match[3]) continue;
    pointers.push({
      topic: match[1].trim(),
      summary: match[2].trim(),
      topicFile: match[3].trim(),
    });
  }

  return pointers;
}

function rankPointersByRelevance(
  pointers: MemoryPointer[],
  userText: string,
): MemoryPointer[] {
  const queryTokens = new Set(tokenize(userText));
  return pointers
    .map((pointer, index) => ({
      pointer,
      index,
      score: scorePointer(pointer, queryTokens),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ pointer }) => pointer);
}

function scorePointer(pointer: MemoryPointer, queryTokens: Set<string>): number {
  const pointerTokens = tokenize(`${pointer.topic} ${pointer.summary}`);
  let score = 0;

  for (const token of pointerTokens) {
    if (queryTokens.has(token)) score += 1;
  }

  const normalizedQuery = Array.from(queryTokens).join(" ");
  if (normalizedQuery.includes(pointer.topic.toLowerCase())) score += 3;

  return score;
}

async function findRelevantTranscriptMatches(
  projectPath: string,
  userText: string,
): Promise<string[]> {
  const keywords = tokenize(userText)
    .filter((token) => token.length >= 4)
    .slice(0, MAX_TRANSCRIPT_KEYWORDS);
  const uniqueMatches = new Set<string>();

  for (const keyword of keywords) {
    const matches = await grepTranscripts(projectPath, keyword);
    for (const match of matches.slice(0, MAX_TRANSCRIPT_MATCHES)) {
      uniqueMatches.add(match);
      if (uniqueMatches.size >= MAX_TRANSCRIPT_MATCHES) {
        return Array.from(uniqueMatches);
      }
    }
  }

  return Array.from(uniqueMatches);
}

function getLastUserText(input: any): string {
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  const index = findLastUserMessageIndex(messages);
  if (index === -1) return "";

  const content = messages[index]?.content;
  if (typeof content === "string") return content;
  return "";
}

function findLastUserMessageIndex(messages: any[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 15)}\n... [truncated]`;
}
