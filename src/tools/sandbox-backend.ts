import type { ExecuteResponse, LocalShellBackendOptions } from "deepagents";
import type { SandboxConfig } from "../types/index.js";
import { SafeShellBackend } from "./shell-wrapper.js";

export type { SandboxConfig };

const DEFAULT_IMAGE = "node:20";

export class DockerSandboxBackend extends SafeShellBackend {
  private readonly sandboxImage: string;
  private readonly networkMode: string;
  private readonly workspacePath: string;

  constructor(
    options: LocalShellBackendOptions & {
      projectPath: string;
      sandbox?: SandboxConfig;
    },
  ) {
    super(options);
    this.workspacePath = options.projectPath;
    this.sandboxImage = options.sandbox?.image ?? DEFAULT_IMAGE;
    this.networkMode = options.sandbox?.network ?? "bridge";
  }

  override async execute(command: string): Promise<ExecuteResponse> {
    const isWin = process.platform === "win32";
    const escaped = command.replace(/"/g, '\\"');
    const inner = isWin ? `cmd.exe /c "${escaped}"` : `sh -c "${escaped}"`;
    const dockerCommand = [
      "docker run --rm",
      `-v "${this.workspacePath}:/workspace"`,
      "-w /workspace",
      `--network ${this.networkMode}`,
      this.sandboxImage,
      inner,
    ].join(" ");

    return super.execute(dockerCommand);
  }
}

export function createShellBackend(
  options: LocalShellBackendOptions & {
    projectPath: string;
    sandbox?: SandboxConfig;
  },
): SafeShellBackend {
  if (options.sandbox?.mode === "docker") {
    return new DockerSandboxBackend(options);
  }
  return new SafeShellBackend(options);
}
