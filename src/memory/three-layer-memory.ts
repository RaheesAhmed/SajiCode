/**
 * Three-Layer Memory Architecture (Claude Code Pattern)
 * 
 * Layer 1: Pointer Index (MEMORY.md) - Always loaded, ~150 chars/line
 * Layer 2: Topic Files - Detailed knowledge, fetched on-demand
 * Layer 3: Transcripts - Raw history, grep-only, never fully loaded
 * 
 * Key principles:
 * - Strict write discipline: Verify file write succeeded before updating index
 * - Memory as hints: Agent treats memory as suggestions, not absolute truth
 * - Grep-only transcripts: Never load full transcript files into context
 */

import fs from "fs/promises";
import path from "path";

const MEMORY_DIR = ".sajicode/memories";
const INDEX_DIR = `${MEMORY_DIR}/index`;
const TOPICS_DIR = `${MEMORY_DIR}/topics`;
const TRANSCRIPTS_DIR = `${MEMORY_DIR}/transcripts`;

export interface PointerEntry {
  topic: string;
  summary: string; // Max 150 chars
  topicFile: string;
  lastUpdated: string;
}

export interface TopicFile {
  topic: string;
  content: string;
  transcriptRefs: string[]; // References to transcript files
  lastUpdated: string;
}

export interface TranscriptEntry {
  timestamp: string;
  agent: string;
  action: string;
  context: string;
}

/**
 * Initialize three-layer memory structure
 */
export async function initThreeLayerMemory(projectPath: string): Promise<void> {
  await fs.mkdir(path.join(projectPath, INDEX_DIR), { recursive: true });
  await fs.mkdir(path.join(projectPath, TOPICS_DIR), { recursive: true });
  await fs.mkdir(path.join(projectPath, TRANSCRIPTS_DIR), { recursive: true });

  // Create pointer index if it doesn't exist
  const indexPath = path.join(projectPath, INDEX_DIR, "pointer-index.md");
  try {
    await fs.access(indexPath);
  } catch {
    await fs.writeFile(
      indexPath,
      `# Memory Pointer Index\n\n` +
      `This file contains pointers to detailed topic files. Each line is max 150 chars.\n` +
      `Format: [topic] summary → topics/filename.md\n\n` +
      `---\n\n`,
      "utf-8"
    );
  }
}

/**
 * Load pointer index (Layer 1) - Always loaded into context
 */
export async function loadPointerIndex(projectPath: string): Promise<string> {
  const indexPath = path.join(projectPath, INDEX_DIR, "pointer-index.md");
  try {
    return await fs.readFile(indexPath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Add or update a pointer in the index
 * STRICT WRITE DISCIPLINE: Only update index after verifying topic file write succeeded
 */
export async function updatePointer(
  projectPath: string,
  topic: string,
  summary: string,
  topicFileName: string
): Promise<{ success: boolean; error?: string }> {
  // Enforce 150 char limit on summary
  if (summary.length > 150) {
    summary = summary.substring(0, 147) + "...";
  }

  const indexPath = path.join(projectPath, INDEX_DIR, "pointer-index.md");
  const topicFilePath = path.join(projectPath, TOPICS_DIR, topicFileName);

  // CRITICAL: Verify topic file exists before updating index
  try {
    await fs.access(topicFilePath);
  } catch {
    return {
      success: false,
      error: `Topic file ${topicFileName} does not exist. Cannot update pointer index.`
    };
  }

  try {
    let content = await fs.readFile(indexPath, "utf-8");
    const timestamp = new Date().toISOString().split('T')[0];
    const pointerLine = `[${topic}] ${summary} → topics/${topicFileName} (${timestamp})\n`;

    // Remove old pointer for this topic if it exists
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => !line.includes(`[${topic}]`));
    
    // Add new pointer at the end (before any trailing newlines)
    let lastContentIndex = filteredLines.length - 1;
    for (let i = filteredLines.length - 1; i >= 0; i--) {
      const line = filteredLines[i];
      if (line && line.trim() !== '') {
        lastContentIndex = i;
        break;
      }
    }
    filteredLines.splice(lastContentIndex + 1, 0, pointerLine);
    
    content = filteredLines.join('\n');
    await fs.writeFile(indexPath, content, "utf-8");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Load a topic file (Layer 2) - Fetched on-demand
 */
export async function loadTopicFile(
  projectPath: string,
  topicFileName: string
): Promise<TopicFile | null> {
  const topicPath = path.join(projectPath, TOPICS_DIR, topicFileName);
  try {
    const content = await fs.readFile(topicPath, "utf-8");
    
    // Parse topic file format
    const lines = content.split('\n');
    const topic = lines[0]?.replace('# ', '') || topicFileName.replace('.md', '');
    
    // Extract transcript references
    const transcriptRefs: string[] = [];
    const transcriptSection = content.match(/## Transcript References\n([\s\S]*?)(?=\n##|\n---|\n$)/);
    if (transcriptSection && transcriptSection[1]) {
      const refs = transcriptSection[1].match(/- transcripts\/[^\s]+/g);
      if (refs) {
        transcriptRefs.push(...refs.map(r => r.replace('- ', '')));
      }
    }

    return {
      topic,
      content,
      transcriptRefs,
      lastUpdated: new Date().toISOString()
    };
  } catch {
    return null;
  }
}

/**
 * Write a topic file (Layer 2) with strict verification
 */
export async function writeTopicFile(
  projectPath: string,
  topicFileName: string,
  topic: string,
  content: string,
  transcriptRefs: string[] = []
): Promise<{ success: boolean; error?: string }> {
  const topicPath = path.join(projectPath, TOPICS_DIR, topicFileName);
  
  const fullContent = 
    `# ${topic}\n\n` +
    `${content}\n\n` +
    `## Transcript References\n\n` +
    (transcriptRefs.length > 0 
      ? transcriptRefs.map(ref => `- ${ref}`).join('\n') + '\n'
      : '(No transcript references yet)\n') +
    `\n---\n` +
    `Last updated: ${new Date().toISOString()}\n`;

  try {
    await fs.writeFile(topicPath, fullContent, "utf-8");
    
    // VERIFY: Read back to confirm write succeeded
    const verification = await fs.readFile(topicPath, "utf-8");
    if (verification !== fullContent) {
      return {
        success: false,
        error: "Write verification failed: content mismatch"
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Append to transcript (Layer 3) - Never fully loaded, grep-only
 */
export async function appendTranscript(
  projectPath: string,
  transcriptFileName: string,
  entry: TranscriptEntry
): Promise<void> {
  await initThreeLayerMemory(projectPath);
  const transcriptPath = path.join(projectPath, TRANSCRIPTS_DIR, transcriptFileName);
  
  const line = `[${entry.timestamp}] [${entry.agent}] ${entry.action}: ${entry.context}\n`;
  
  try {
    await fs.appendFile(transcriptPath, line, "utf-8");
  } catch {
    // Create file if it doesn't exist
    await fs.writeFile(transcriptPath, line, "utf-8");
  }
}

/**
 * Grep transcript files (Layer 3) - Search without loading full files
 */
export async function grepTranscripts(
  projectPath: string,
  pattern: string,
  transcriptFiles?: string[]
): Promise<string[]> {
  const transcriptsPath = path.join(projectPath, TRANSCRIPTS_DIR);

  try {
    const matcher = createTranscriptMatcher(pattern);
    const files = transcriptFiles && transcriptFiles.length > 0
      ? transcriptFiles.map((file) => normalizeTranscriptFileName(file))
      : await listTranscriptFiles(transcriptsPath);

    const results: string[] = [];
    for (const file of files) {
      const transcriptPath = path.join(transcriptsPath, file);
      const content = await fs.readFile(transcriptPath, "utf-8").catch(() => "");
      if (!content) continue;

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (matcher(line)) {
          results.push(`${file}:${i + 1}:${line}`);
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

function createTranscriptMatcher(pattern: string): (line: string) => boolean {
  try {
    const regex = new RegExp(pattern, "i");
    return (line: string) => regex.test(line);
  } catch {
    const normalizedPattern = pattern.toLowerCase();
    return (line: string) => line.toLowerCase().includes(normalizedPattern);
  }
}

async function listTranscriptFiles(transcriptsPath: string): Promise<string[]> {
  const entries = await fs.readdir(transcriptsPath, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

function normalizeTranscriptFileName(file: string): string {
  return file
    .replace(/\\/g, "/")
    .replace(/^transcripts\//, "")
    .replace(/^\/+/, "");
}

/**
 * Get transcript file stats without loading content
 */
export async function getTranscriptStats(
  projectPath: string,
  transcriptFileName: string
): Promise<{ lines: number; size: number; lastModified: string } | null> {
  const transcriptPath = path.join(projectPath, TRANSCRIPTS_DIR, transcriptFileName);
  
  try {
    const stats = await fs.stat(transcriptPath);
    const content = await fs.readFile(transcriptPath, "utf-8");
    const lines = content.split('\n').length;
    
    return {
      lines,
      size: stats.size,
      lastModified: stats.mtime.toISOString()
    };
  } catch {
    return null;
  }
}

/**
 * Format pointer index for agent prompt
 */
export function formatPointerIndexForPrompt(pointerIndex: string): string {
  if (!pointerIndex.trim()) return "";
  
  return `## MEMORY POINTER INDEX (Layer 1 - Always Loaded)

${pointerIndex}

**How to use memory:**
1. This index shows available topics with brief summaries (max 150 chars each)
2. To get detailed info on a topic, use read_topic with the topic filename from the index
3. To search transcript history, use search_transcripts (never load full transcripts)
4. Treat memory as hints, not absolute truth - verify important details

**Memory discipline:**
- When writing new topic files, ALWAYS verify the write succeeded before updating this index
- Keep summaries under 150 chars
- Reference transcripts in topic files, but never load full transcripts into context

---
`;
}

/**
 * Create a new memory topic with proper workflow
 */
export async function createMemoryTopic(
  projectPath: string,
  topic: string,
  content: string,
  summary: string,
  transcriptRefs: string[] = []
): Promise<{ success: boolean; error?: string; topicFile?: string }> {
  // Generate topic filename
  const topicFileName = `${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
  
  // Step 1: Write topic file
  const writeResult = await writeTopicFile(
    projectPath,
    topicFileName,
    topic,
    content,
    transcriptRefs
  );
  
  if (!writeResult.success) {
    return writeResult;
  }

  // Step 2: Update pointer index (only after verifying topic file exists)
  const pointerResult = await updatePointer(
    projectPath,
    topic,
    summary,
    topicFileName
  );

  if (!pointerResult.success) {
    return {
      success: false,
      error: `Topic file created but pointer update failed: ${pointerResult.error}`
    };
  }

  return {
    success: true,
    topicFile: topicFileName
  };
}

// Made with Bob
