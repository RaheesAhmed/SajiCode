import { LocalShellBackend } from "deepagents";
import type { LocalShellBackendOptions, ExecuteResponse } from "deepagents";
import chalk from "chalk";
import { ProcessStateManager } from "./process-state.js";

export class SafeShellBackend extends LocalShellBackend {
  private readonly stateManager: ProcessStateManager;
  private stateLoaded = false;

  constructor(options: LocalShellBackendOptions & { projectPath: string }) {
    super({
      ...options,
      timeout: options.timeout ?? 300,
      inheritEnv: true,
    });
    this.stateManager = new ProcessStateManager(options.projectPath);
  }

  private async ensureStateLoaded(): Promise<void> {
    if (!this.stateLoaded) {
      await this.stateManager.load();
      this.stateLoaded = true;
    }
  }

  override async execute(command: string): Promise<ExecuteResponse> {
    await this.ensureStateLoaded();

    const { skip, reason, output } = await this.stateManager.checkCommand(command);

    if (skip) {
      console.log(chalk.cyan(`  ⏭ [PROCESS STATE] Skipped: ${reason}`));
      const cachedMessage = [
        `[CACHED] ${reason}`,
        "",
        output ? `Previous output:\n${output}` : "No cached output available.",
      ].join("\n");

      return { output: cachedMessage, exitCode: 0, truncated: false };
    }

    console.log(chalk.gray(`  ▶ [PROCESS STATE] Executing: ${command}`));
    const result = await super.execute(command);

    const status = result.exitCode === 0 ? "completed" as const : "failed" as const;
    await this.stateManager.recordCommand(command, status, result.output);

    return result;
  }
}
