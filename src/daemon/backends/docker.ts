import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { BackendDeployResult, BackendStartResult } from "./types.js";

export async function deployDockerBackend(projectPath: string, port = 3920): Promise<BackendDeployResult> {
  const resolved = path.resolve(projectPath);
  const compose = `services:
  sajicode-daemon:
    image: node:20-bookworm
    working_dir: /workspace
    volumes:
      - ${resolved}:/workspace
    ports:
      - "${port}:3920"
    command: >
      sh -c "npm install && node dist/index.js daemon start -p /workspace --host 0.0.0.0 --port 3920"
    restart: unless-stopped
`;

  const artifactPath = path.join(resolved, ".sajicode", "backends", "docker-compose.yml");
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, compose, "utf-8");

  return {
    backend: "docker",
    artifactPaths: [artifactPath],
    instructions: [
      "Docker daemon backend:",
      `  cd ${resolved}`,
      `  docker compose -f ${artifactPath} up -d`,
      "  docker compose -f .sajicode/backends/docker-compose.yml logs -f",
    ].join("\n"),
  };
}

export async function startDockerBackend(
  projectPath: string,
  port = 3920,
): Promise<BackendStartResult> {
  const deploy = await deployDockerBackend(projectPath, port);
  const composeFile = deploy.artifactPaths[0]!;

  return new Promise((resolve) => {
    const child = spawn("docker", ["compose", "-f", composeFile, "up", "-d"], {
      cwd: projectPath,
      stdio: "pipe",
      shell: process.platform === "win32",
    });

    let output = "";
    child.stdout?.on("data", (c) => { output += c.toString(); });
    child.stderr?.on("data", (c) => { output += c.toString(); });

    child.on("close", (code) => {
      resolve({
        backend: "docker",
        started: code === 0,
        message: code === 0
          ? `Docker daemon started.\n${output.trim()}`
          : `Docker start failed (exit ${code}).\n${output.trim()}\n\n${deploy.instructions}`,
      });
    });
  });
}
