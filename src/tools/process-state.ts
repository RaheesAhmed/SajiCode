import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

interface ProcessRecord {
  command: string;
  hash: string;
  status: "running" | "completed" | "failed";
  pid: number | undefined;
  stdout: string | undefined;
  stderr: string | undefined;
  timestamp: number;
  isLongRunning: boolean;
}

const LONG_RUNNING_PATTERNS: RegExp[] = [
  /npm run dev\b/,
  /npm run dev:/,
  /npm run watch\b/,
  /npm run serve\b/,
  /npm run start\b/,
  /nodemon\b/,
  /next dev\b/,
  /vite\b/,
  /tsx watch\b/,
  /node\s+.*(?:server|api)\b/,
];

/**
 * Commands whose output depends on live file content or current system state.
 * These must NEVER be served from cache — always execute fresh.
 *
 * Patterns are matched against the trimmed command string (case-insensitive).
 */
const NEVER_CACHE_PATTERNS: RegExp[] = [
  // File content readers (Windows + Unix)
  /^type\s+/i,
  /^cat\s+/i,
  /^cat$/i,
  /^head\s+/i,
  /^tail\s+/i,
  /^less\s+/i,
  /^more\s+/i,

  // Directory listings
  /^dir\b/i,
  /^ls\b/i,
  /^ls\s+/i,

  // File search / grep — results change when files are edited
  /^grep\b/i,
  /^grep\s+/i,
  /^rg\b/i,
  /^rg\s+/i,
  /^find\b/i,
  /^find\s+/i,

  // Python / Node one-liners that read file content
  /python[3]?\s+-c\s+.*open\s*\(/i,
  /node\s+-e\s+.*readFile/i,
  /node\s+-e\s+.*readlines/i,

  // Git status / diff / log
  /^git\s+(status|diff|log|show)\b/i,

  // Build status checks (these reflect current state)
  /^npm\s+(test|audit)\b/i,
  /^pnpm\s+(test|audit)\b/i,
  /^yarn\s+(test|audit)\b/i,
];

const COMPLETED_TTL_MS = 5 * 60 * 1000;
const MAX_OUTPUT_LENGTH = 500;

function isLongRunning(command: string): boolean {
  return LONG_RUNNING_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * Returns true when the command reads live file/system state and should
 * always be re-executed even if it completed recently.
 */
function isNeverCache(command: string): boolean {
  const trimmed = command.trim();
  return NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function hashCommand(command: string): string {
  return crypto.createHash("md5").update(command.trim()).digest("hex");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function truncateOutput(output: string | undefined): string | undefined {
  if (!output) return output;
  return output.length > MAX_OUTPUT_LENGTH
    ? output.slice(0, MAX_OUTPUT_LENGTH) + "\n...[truncated]"
    : output;
}

export class ProcessStateManager {
  private readonly stateFile: string;
  private records: Map<string, ProcessRecord> = new Map();

  constructor(projectPath: string) {
    this.stateFile = path.join(projectPath, ".sajicode", "process-state.json");
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.stateFile, "utf-8");
      const parsed = JSON.parse(raw) as ProcessRecord[];
      this.records = new Map(parsed.map((r) => [r.hash, r]));
      this.cleanStaleRecords();
    } catch {
      this.records = new Map();
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    const entries = Array.from(this.records.values());
    await fs.writeFile(this.stateFile, JSON.stringify(entries, null, 2));
  }

  private cleanStaleRecords(): void {
    for (const [hash, record] of this.records) {
      if (record.isLongRunning && record.status === "running" && record.pid != null) {
        if (!isProcessAlive(record.pid)) {
          record.status = "failed";
          this.records.set(hash, record);
        }
      }
    }
  }

  async checkCommand(
    command: string
  ): Promise<{ skip: boolean; reason: string; output: string | undefined }> {
    // File-content / live-state commands are NEVER served from cache
    if (isNeverCache(command)) {
      return { skip: false, reason: "Live-state command — always execute fresh", output: undefined };
    }

    const hash = hashCommand(command);
    const record = this.records.get(hash);
    const longRunning = isLongRunning(command);

    if (!record) {
      return { skip: false, reason: "First execution", output: undefined };
    }

    if (longRunning && record.status === "running" && record.pid != null) {
      if (isProcessAlive(record.pid)) {
        return {
          skip: true,
          reason: `"${command}" is already running (PID: ${record.pid})`,
          output: record.stdout,
        };
      }
      record.status = "failed";
      this.records.set(hash, record);
      return { skip: false, reason: "Previous process died, restarting", output: undefined };
    }

    if (!longRunning && record.status === "completed") {
      const ageMs = Date.now() - record.timestamp;
      if (ageMs < COMPLETED_TTL_MS) {
        const ageSec = Math.round(ageMs / 1000);
        return {
          skip: true,
          reason: `"${command}" completed ${ageSec}s ago`,
          output: record.stdout,
        };
      }
    }

    return { skip: false, reason: "TTL expired, re-executing", output: undefined };
  }

  async recordCommand(
    command: string,
    status: "running" | "completed" | "failed",
    stdout?: string,
    stderr?: string,
    pid?: number
  ): Promise<void> {
    // Do not persist live-state commands — they should never be cached at rest either
    if (isNeverCache(command)) return;

    const hash = hashCommand(command);
    this.records.set(hash, {
      command,
      hash,
      status,
      pid,
      stdout: truncateOutput(stdout),
      stderr: truncateOutput(stderr),
      timestamp: Date.now(),
      isLongRunning: isLongRunning(command),
    });
    await this.save();
  }
}
