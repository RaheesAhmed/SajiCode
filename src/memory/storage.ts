/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */


import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";

const OPENAGENT_DIR = path.join(os.homedir(), ".openagent");
const MEMORY_FILE = path.join(OPENAGENT_DIR, "memory.json");
const SESSIONS_DIR = path.join(OPENAGENT_DIR, "sessions");

interface MemoryEntry {
  value: string;
  savedAt: string;
}

interface SessionData {
  projectPath: string;
  lastMessage: string;
  lastActive: string;
  summary: string;
}

function projectHash(projectPath: string): string {
  return crypto.createHash("md5").update(projectPath.toLowerCase()).digest("hex").slice(0, 12);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export class PersistentStorage {
  async initialize(): Promise<void> {
    await ensureDir(OPENAGENT_DIR);
    await ensureDir(SESSIONS_DIR);
  }

  async saveMemory(key: string, value: string): Promise<void> {
    const memories = await this.loadAllMemories();
    memories[key] = { value, savedAt: new Date().toISOString() };
    await writeJsonFile(MEMORY_FILE, memories);
  }

  async deleteMemory(key: string): Promise<boolean> {
    const memories = await this.loadAllMemories();
    if (!(key in memories)) return false;
    delete memories[key];
    await writeJsonFile(MEMORY_FILE, memories);
    return true;
  }

  async loadAllMemories(): Promise<Record<string, MemoryEntry>> {
    return readJsonFile(MEMORY_FILE, {});
  }

  async searchMemories(query: string): Promise<Array<{ key: string; value: string; savedAt: string }>> {
    const memories = await this.loadAllMemories();
    const lowerQuery = query.toLowerCase();

    return Object.entries(memories)
      .filter(([key, entry]) =>
        key.toLowerCase().includes(lowerQuery) ||
        entry.value.toLowerCase().includes(lowerQuery)
      )
      .map(([key, entry]) => ({ key, value: entry.value, savedAt: entry.savedAt }));
  }

  async saveSession(projectPath: string, data: Partial<SessionData>): Promise<void> {
    const hash = projectHash(projectPath);
    const filePath = path.join(SESSIONS_DIR, `${hash}.json`);
    const existing = await readJsonFile<SessionData>(filePath, {
      projectPath,
      lastMessage: "",
      lastActive: "",
      summary: "",
    });

    const merged: SessionData = {
      ...existing,
      ...data,
      projectPath,
      lastActive: new Date().toISOString(),
    };

    await writeJsonFile(filePath, merged);
  }

  async loadSession(projectPath: string): Promise<SessionData | null> {
    const hash = projectHash(projectPath);
    const filePath = path.join(SESSIONS_DIR, `${hash}.json`);
    const session = await readJsonFile<SessionData | null>(filePath, null);
    return session;
  }

  async getMemorySummary(): Promise<string> {
    const memories = await this.loadAllMemories();
    const entries = Object.entries(memories);
    if (entries.length === 0) return "";

    return entries
      .map(([key, entry]) => `- ${key}: ${entry.value}`)
      .join("\n");
  }
}

export const globalStorage = new PersistentStorage();
