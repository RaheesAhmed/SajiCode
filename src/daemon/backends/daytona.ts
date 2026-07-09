import fs from "node:fs/promises";
import path from "node:path";
import type { BackendDeployResult } from "./types.js";

export async function deployDaytonaBackend(projectPath: string): Promise<BackendDeployResult> {
  const resolved = path.resolve(projectPath);
  const daytonaJson = {
    name: "sajicode-daemon",
    image: "node:20-bookworm",
    workspaceMount: resolved,
    autoStopInterval: 30,
    startCommand: "npm install && node dist/index.js daemon start -p /workspace --host 0.0.0.0",
    ports: [{ container: 3920, public: 3920 }],
  };

  const artifactPath = path.join(resolved, ".sajicode", "backends", "daytona.json");
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, JSON.stringify(daytonaJson, null, 2), "utf-8");

  return {
    backend: "daytona",
    artifactPaths: [artifactPath],
    instructions: [
      "Daytona serverless workspace (auto-stop when idle):",
      "  Install Daytona CLI: https://www.daytona.io/docs",
      `  daytona workspace create --config ${artifactPath}`,
      "  daytona workspace start sajicode-daemon",
      "  Workspace hibernates after autoStopInterval minutes of inactivity.",
    ].join("\n"),
  };
}
