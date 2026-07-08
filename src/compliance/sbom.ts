import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SbomOptions {
  projectPath: string;
  outputPath?: string;
}

export async function generateSbom(options: SbomOptions): Promise<string> {
  const { projectPath, outputPath } = options;
  const pkgPath = path.join(projectPath, "package.json");

  try {
    await fs.access(pkgPath);
  } catch {
    throw new Error("No package.json found — SBOM requires an npm project");
  }

  const outFile =
    outputPath ?? path.join(projectPath, ".sajicode", "sbom.json");
  await fs.mkdir(path.dirname(outFile), { recursive: true });

  try {
    await execFileAsync(
      "npx",
      ["-y", "@cyclonedx/cyclonedx-npm", "--output-file", outFile, "--omit", "dev"],
      { cwd: projectPath, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
    );
    return outFile;
  } catch {
    const lockRaw = await fs.readFile(
      path.join(projectPath, "package-lock.json"),
      "utf-8",
    ).catch(() => null);

    const fallback = {
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        component: { type: "application", name: path.basename(projectPath) },
      },
      components: lockRaw
        ? extractComponentsFromLock(lockRaw)
        : [],
      note: "Fallback SBOM — install @cyclonedx/cyclonedx-npm for full SBOM",
    };

    await fs.writeFile(outFile, JSON.stringify(fallback, null, 2), "utf-8");
    return outFile;
  }
}

function extractComponentsFromLock(lockRaw: string): Array<Record<string, string>> {
  try {
    const lock = JSON.parse(lockRaw) as {
      packages?: Record<string, { version?: string; name?: string }>;
    };
    const components: Array<Record<string, string>> = [];
    for (const [pkgPath, meta] of Object.entries(lock.packages ?? {})) {
      if (!meta.version) continue;
      const name =
        meta.name ??
        (pkgPath === "" ? "root" : pkgPath.replace(/^node_modules\//, ""));
      components.push({ type: "library", name, version: meta.version });
    }
    return components.slice(0, 500);
  } catch {
    return [];
  }
}

export interface ProvenanceReport {
  npmProvenanceReady: boolean;
  recommendations: string[];
}

export function buildProvenanceReport(_projectPath: string): ProvenanceReport {
  const recommendations = [
    "Publish from GitHub Actions with npm publish --provenance",
    "Pin dependencies in package-lock.json and commit lockfile changes",
    "Run `sajicode sbom` before each release and attach to GitHub release assets",
  ];

  return {
    npmProvenanceReady: process.env["CI"] === "true" || process.env["GITHUB_ACTIONS"] === "true",
    recommendations,
  };
}

export async function formatProvenanceReport(projectPath: string): Promise<string> {
  const report = buildProvenanceReport(projectPath);
  const lines = [
    "Release provenance checklist:",
    `  CI environment: ${report.npmProvenanceReady ? "yes" : "no (local)"}`,
    "",
    "Recommendations:",
    ...report.recommendations.map((r) => `  • ${r}`),
  ];
  return lines.join("\n");
}
