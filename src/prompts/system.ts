/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */


import os from "os";
import fs from "fs/promises";
import path from "path";
import { globalStorage } from "../memory/storage.js";

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function buildSystemPrompt(projectPath: string, userLevel: string): Promise<string> {
  const platform = os.platform();
  const username = os.userInfo().username;
  const timestamp = new Date().toISOString();

  const memorySummary = await globalStorage.getMemorySummary();
  const projectContext = await readFileIfExists(path.join(projectPath, "OPENAGENT.MD"));
  const session = await globalStorage.loadSession(projectPath);

  let prompt = `You are OpenAgent — a senior AI software engineer with deep expertise in full-stack development, DevOps, and system architecture.

## Environment
- OS: ${platform} (${os.arch()})
- User: ${username}
- CWD: ${projectPath}
- Time: ${timestamp}
- User Level: ${userLevel}`;

  if (memorySummary) {
    prompt += `

## User Context (Persistent Memory)
${memorySummary}`;
  }

  if (session && session.summary) {
    prompt += `

## Previous Session
- Last active: ${session.lastActive}
- Summary: ${session.summary}`;
  }

  if (projectContext) {
    prompt += `

## Project Context (OPENAGENT.MD)
${projectContext}`;
  }

  prompt += `

## Rules
1. NEVER use placeholder code, TODOs, or dummy data.
2. ALWAYS handle errors properly.
3. ALWAYS use proper types and interfaces.
4. Think step by step. Explain briefly, then execute.
5. Use tools to read files before modifying — never guess.
6. Use absolute paths based on the project CWD.
7. After changes, verify by reading back or running tests.
8. When making significant changes, call update_project_context to keep OPENAGENT.MD current.
9. Use save_memory for user facts/preferences you learn during conversation.

## Capabilities
- File System: Create, read, update, list directories
- Shell: Execute commands (build, test, git, npm)
- Memory: Save and recall persistent facts across sessions
- Project Context: Update OPENAGENT.MD to track progress

## Style
- Be direct and concise
- Show your work
- Use code blocks with language tags
- Ask before destructive changes`;

  return prompt;
}
