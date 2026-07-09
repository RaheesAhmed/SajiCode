import type { ProjectConfig } from "../../types/index.js";
import type { DaemonBackendKind, BackendDeployResult, BackendStartResult } from "./types.js";
import { deployDockerBackend, startDockerBackend } from "./docker.js";
import { deployModalBackend } from "./modal.js";
import { deployDaytonaBackend } from "./daytona.js";
import type { DaemonOptions, DaemonHandle } from "../index.js";

export function resolveDaemonBackend(config: ProjectConfig): DaemonBackendKind {
  const backend = config.daemon?.backend ?? "local";
  if (backend === "docker" || backend === "modal" || backend === "daytona") return backend;
  return "local";
}

export async function deployDaemonBackend(
  projectPath: string,
  backend: DaemonBackendKind,
  port = 3920,
): Promise<BackendDeployResult> {
  switch (backend) {
    case "docker":
      return deployDockerBackend(projectPath, port);
    case "modal":
      return deployModalBackend(projectPath);
    case "daytona":
      return deployDaytonaBackend(projectPath);
    default:
      return {
        backend: "local",
        artifactPaths: [],
        instructions: "Local backend runs in-process — no deploy artifact needed. Use: sajicode daemon start",
      };
  }
}

export async function startDaemonWithBackend(
  options: DaemonOptions,
): Promise<{ handle?: DaemonHandle; result: BackendStartResult }> {
  const backend = resolveDaemonBackend(options.config);

  if (backend === "local") {
    const { startDaemon } = await import("../index.js");
    const handle = await startDaemon(options);
    return {
      handle,
      result: {
        backend: "local",
        started: true,
        message: "Daemon running in local process.",
        pid: process.pid,
      },
    };
  }

  if (backend === "docker") {
    const result = await startDockerBackend(
      options.projectPath,
      options.port ?? options.config.daemon?.port ?? 3920,
    );
    return { result };
  }

  const deploy = await deployDaemonBackend(
    options.projectPath,
    backend,
    options.port ?? options.config.daemon?.port ?? 3920,
  );

  return {
    result: {
      backend,
      started: false,
      message: `${backend} backend is deploy-only from CLI. Generated artifacts:\n${deploy.instructions}`,
    },
  };
}
