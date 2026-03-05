import fs from "fs/promises";
import path from "path";

const EXPERIENCES_FILE = ".sajicode/experiences.json";

export interface Experience {
  id: string;
  timestamp: string;
  taskType: string;
  techStack: string[];
  agent: string;
  outcome: "success" | "failure" | "partial";
  description: string;
  errorPattern?: string;
  resolution?: string;
  lessons: string[];
  tags: string[];
}

export interface ExperienceJournal {
  version: 1;
  experiences: Experience[];
}

function generateId(): string {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadExperienceJournal(projectPath: string): Promise<ExperienceJournal> {
  const filePath = path.join(projectPath, EXPERIENCES_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ExperienceJournal;
  } catch {
    return { version: 1, experiences: [] };
  }
}

export async function saveExperienceJournal(projectPath: string, journal: ExperienceJournal): Promise<void> {
  const filePath = path.join(projectPath, EXPERIENCES_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  if (journal.experiences.length > 500) {
    journal.experiences = journal.experiences.slice(-500);
  }

  await fs.writeFile(filePath, JSON.stringify(journal, null, 2), "utf-8");
}

export async function recordExperience(
  projectPath: string,
  experience: Omit<Experience, "id" | "timestamp">
): Promise<string> {
  const journal = await loadExperienceJournal(projectPath);
  const id = generateId();
  journal.experiences.push({
    ...experience,
    id,
    timestamp: new Date().toISOString(),
  });
  await saveExperienceJournal(projectPath, journal);
  return id;
}

export async function queryExperiences(
  projectPath: string,
  filters: {
    techStack?: string[];
    taskType?: string;
    agent?: string;
    outcome?: "success" | "failure" | "partial";
    tags?: string[];
  }
): Promise<Experience[]> {
  const journal = await loadExperienceJournal(projectPath);
  let results = journal.experiences;

  if (filters.techStack?.length) {
    const stackLower = filters.techStack.map((s) => s.toLowerCase());
    results = results.filter((exp) =>
      exp.techStack.some((t) => stackLower.includes(t.toLowerCase()))
    );
  }

  if (filters.taskType) {
    const typeLower = filters.taskType.toLowerCase();
    results = results.filter((exp) =>
      exp.taskType.toLowerCase().includes(typeLower)
    );
  }

  if (filters.agent) {
    results = results.filter((exp) =>
      exp.agent.toLowerCase() === filters.agent!.toLowerCase()
    );
  }

  if (filters.outcome) {
    results = results.filter((exp) => exp.outcome === filters.outcome);
  }

  if (filters.tags?.length) {
    const tagsLower = filters.tags.map((t) => t.toLowerCase());
    results = results.filter((exp) =>
      exp.tags.some((t) => tagsLower.includes(t.toLowerCase()))
    );
  }

  return results.slice(-20);
}

export function formatExperiencesForPrompt(experiences: Experience[]): string {
  if (experiences.length === 0) return "";

  const lines = [
    "<PAST_EXPERIENCES>",
    "The following are lessons from previous tasks. Use them to avoid repeating mistakes.",
    "",
  ];

  for (const exp of experiences) {
    lines.push(`### ${exp.outcome === "failure" ? "⚠️ FAILURE" : exp.outcome === "success" ? "✅ SUCCESS" : "⚡ PARTIAL"}: ${exp.description}`);
    if (exp.errorPattern) lines.push(`  Error: ${exp.errorPattern}`);
    if (exp.resolution) lines.push(`  Fix: ${exp.resolution}`);
    if (exp.lessons.length > 0) {
      lines.push("  Lessons:");
      for (const lesson of exp.lessons) {
        lines.push(`    - ${lesson}`);
      }
    }
    lines.push("");
  }

  lines.push("</PAST_EXPERIENCES>");
  return lines.join("\n");
}
