import fs from "node:fs/promises";
import path from "node:path";
import {
  loadExperienceJournal,
  saveExperienceJournal,
  type Experience,
} from "./experience-replay.js";
import { loadMailbox, saveMailbox } from "../agents/message-bus.js";

export interface ConsolidationReport {
  experiencesBefore: number;
  experiencesAfter: number;
  messagesBefore: number;
  messagesAfter: number;
  mergedLessons: number;
  summaryPath?: string;
}

function normalizeLesson(lesson: string): string {
  return lesson.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeExperiences(experiences: Experience[]): {
  merged: Experience[];
  mergedCount: number;
} {
  const byKey = new Map<string, Experience>();
  let mergedCount = 0;

  for (const exp of experiences) {
    const key = [
      exp.taskType,
      exp.outcome,
      exp.description.slice(0, 80).toLowerCase(),
    ].join("|");

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...exp, lessons: [...new Set(exp.lessons)] });
      continue;
    }

    mergedCount++;
    const lessons = new Set([...existing.lessons, ...exp.lessons]);
    existing.lessons = [...lessons];
    if (exp.resolution && !existing.resolution) {
      existing.resolution = exp.resolution;
    }
    if (exp.timestamp > existing.timestamp) {
      existing.timestamp = exp.timestamp;
    }
  }

  return { merged: [...byKey.values()], mergedCount };
}

export async function runSleepConsolidation(
  projectPath: string,
): Promise<string> {
  const report = await consolidateProjectMemory(projectPath);
  return [
    "Sleep consolidation complete:",
    `  experiences: ${report.experiencesBefore} → ${report.experiencesAfter} (merged ${report.mergedLessons})`,
    `  mailbox: ${report.messagesBefore} → ${report.messagesAfter}`,
    report.summaryPath ? `  summary: ${report.summaryPath}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function consolidateProjectMemory(
  projectPath: string,
): Promise<ConsolidationReport> {
  const journal = await loadExperienceJournal(projectPath);
  const mailbox = await loadMailbox(projectPath);

  const experiencesBefore = journal.experiences.length;
  const messagesBefore = mailbox.messages.length;

  const { merged, mergedCount } = mergeExperiences(journal.experiences);
  journal.experiences = merged.slice(-300);
  await saveExperienceJournal(projectPath, journal);

  const readCutoff = Date.now() - 7 * 86_400_000;
  mailbox.messages = mailbox.messages.filter((m) => {
    if (!m.read) return true;
    return Date.parse(m.timestamp) >= readCutoff;
  });
  await saveMailbox(projectPath, mailbox);

  const summaryPath = path.join(projectPath, ".sajicode", "consolidation-summary.md");
  const topLessons = collectTopLessons(journal.experiences);
  if (topLessons.length > 0) {
    const body = [
      "# Consolidated lessons",
      "",
      `_Updated ${new Date().toISOString()}_`,
      "",
      ...topLessons.map((l) => `- ${l}`),
    ].join("\n");
    await fs.mkdir(path.dirname(summaryPath), { recursive: true });
    await fs.writeFile(summaryPath, body, "utf-8");
  }

  return {
    experiencesBefore,
    experiencesAfter: journal.experiences.length,
    messagesBefore,
    messagesAfter: mailbox.messages.length,
    mergedLessons: mergedCount,
    ...(topLessons.length > 0 ? { summaryPath } : {}),
  };
}

function collectTopLessons(experiences: Experience[], limit = 20): string[] {
  const counts = new Map<string, number>();

  for (const exp of experiences) {
    for (const lesson of exp.lessons) {
      const key = normalizeLesson(lesson);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([lesson]) => lesson);
}
