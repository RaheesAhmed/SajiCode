import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export type SkillLayer = "project" | "plugin" | "user" | "bundled";

export interface ResolvedSkill {
  name: string;
  layer: SkillLayer;
  path: string;
}

function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

export function getBundledSkillsDir(): string {
  return path.join(PROJECT_ROOT, "skills");
}

export function getUserSkillsDir(): string {
  return path.join(os.homedir(), ".sajicode", "skills");
}

export function getProjectSkillsDir(projectPath: string): string {
  return path.join(projectPath, ".sajicode", "skills");
}

function listSkillDirsInRoot(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];

  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) =>
      fs.existsSync(path.join(rootDir, entry.name, "SKILL.md"))
      || fs.existsSync(path.join(rootDir, entry.name, "SKILL.MD")),
    )
    .map((entry) => entry.name);
}

function applyLayer(
  byName: Map<string, ResolvedSkill>,
  rootDir: string,
  layer: SkillLayer,
): void {
  for (const name of listSkillDirsInRoot(rootDir)) {
    byName.set(name, {
      name,
      layer,
      path: `${toForwardSlash(path.join(rootDir, name))}/`,
    });
  }
}

/**
 * Resolve skills with precedence: project > plugin > user > bundled.
 */
export function resolveSkills(
  projectPath?: string,
  pluginSkillRoots: string[] = [],
): ResolvedSkill[] {
  const byName = new Map<string, ResolvedSkill>();

  applyLayer(byName, getBundledSkillsDir(), "bundled");
  applyLayer(byName, getUserSkillsDir(), "user");

  for (const pluginRoot of pluginSkillRoots) {
    applyLayer(byName, pluginRoot, "plugin");
  }

  if (projectPath) {
    applyLayer(byName, getProjectSkillsDir(projectPath), "project");
  }

  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function getSkillsDir(): string {
  return toForwardSlash(getBundledSkillsDir());
}

export function getSkillPaths(
  skillNames: string[],
  projectPath?: string,
  pluginSkillRoots: string[] = [],
): string[] {
  const resolved = resolveSkills(projectPath, pluginSkillRoots);
  const byName = new Map(resolved.map((s) => [s.name, s.path]));

  return skillNames
    .map((name) => byName.get(name))
    .filter((p): p is string => Boolean(p));
}

export function getAllSkillPaths(
  projectPath?: string,
  pluginSkillRoots: string[] = [],
): string[] {
  return resolveSkills(projectPath, pluginSkillRoots).map((s) => s.path);
}

export function formatSkillLayerLabel(layer: SkillLayer): string {
  switch (layer) {
    case "project":
      return "project";
    case "plugin":
      return "plugin";
    case "user":
      return "user (~/.sajicode/skills)";
    case "bundled":
      return "bundled";
  }
}
