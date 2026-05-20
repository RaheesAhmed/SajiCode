import { LocalShellBackend } from "deepagents";
import type { LocalShellBackendOptions, ExecuteResponse, BackendProtocol } from "deepagents";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolRuntime } from "@langchain/core/tools";
import chalk from "chalk";
import { ProcessStateManager } from "./process-state.js";
import { checkCommandSecurity, formatSecurityResult, type CommandContext } from "./security-checks.js";

export class SafeShellBackend extends LocalShellBackend {
  private readonly stateManager: ProcessStateManager;
  private readonly projectPath: string;
  private stateLoaded = false;
  private recentCommands: string[] = [];

  constructor(options: LocalShellBackendOptions & { projectPath: string }) {
    super({
      ...options,
      timeout: options.timeout ?? 300,
      inheritEnv: true,
    });
    this.projectPath = options.projectPath;
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

    // SECURITY CHECK: Run 23-check security analysis
    const securityContext: CommandContext = {
      command,
      workingDirectory: this.projectPath,
      agent: "system",
      recentCommands: this.recentCommands.slice(-10), // Last 10 commands
      projectFiles: [] // TODO: Could be populated from file tracker
    };

    const securityResult = checkCommandSecurity(command, securityContext);

    // Handle security check results
    if (securityResult.recommendation === "block") {
      console.log(chalk.red(`  🛑 [SECURITY] Command blocked`));
      console.log(chalk.red(formatSecurityResult(securityResult)));
      return {
        output: `[SECURITY BLOCK] ${securityResult.reason}\n\n${formatSecurityResult(securityResult)}`,
        exitCode: 1,
        truncated: false
      };
    }

    if (securityResult.recommendation === "require_approval") {
      console.log(chalk.yellow(`  🚨 [SECURITY] High-risk command detected`));
      console.log(chalk.yellow(formatSecurityResult(securityResult)));
      // Note: HITL approval will be handled by the agent's interrupt_on configuration
      // This just logs the security concern
    }

    if (securityResult.recommendation === "warn") {
      console.log(chalk.yellow(`  ⚠️  [SECURITY] ${securityResult.reason}`));
    }

    // PROCESS STATE CHECK: Check if command should be skipped
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

    // Execute command
    console.log(chalk.gray(`  ▶ [PROCESS STATE] Executing: ${command}`));
    const result = await super.execute(command);

    // Record command execution
    const status = result.exitCode === 0 ? "completed" as const : "failed" as const;
    await this.stateManager.recordCommand(command, status, result.output);

    // Track recent commands for security context
    this.recentCommands.push(command);
    if (this.recentCommands.length > 20) {
      this.recentCommands = this.recentCommands.slice(-20);
    }

    return result;
  }
}

/**
 * Streaming execute tool that routes through the backend.
 * Emits progress events via config.writer while preserving
 * SafeShellBackend's security checks and process state caching.
 */
export function createStreamingExecuteTool(backend: BackendProtocol) {
  return tool(
    async (
      { command }: { command: string; timeout?: number },
      runtime: ToolRuntime,
    ) => {
      const writer = runtime.writer;

      writer?.({
        type: "execute_start",
        command,
        message: `Executing: ${command}`,
      });

      try {
        if (!("execute" in backend)) {
          throw new Error("Backend does not support command execution");
        }

        const result: ExecuteResponse = await (backend as any).execute(
          command,
        );

        if (result.exitCode === 0) {
          writer?.({
            type: "execute_complete",
            command,
            exitCode: result.exitCode,
            message: `Command completed (exit code 0)`,
          });
        } else {
          writer?.({
            type: "execute_error",
            command,
            exitCode: result.exitCode,
            message: `Command failed (exit code ${result.exitCode})`,
          });
        }

        return result.output;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        writer?.({
          type: "execute_error",
          command,
          exitCode: -1,
          message: `Error executing command: ${msg}`,
        });
        throw error;
      }
    },
    {
      name: "shell_execute",
      description:
        "Execute a shell command in the project directory with progress streaming. " +
        "Routes through SafeShellBackend for security checks and process state caching.",
      schema: z.object({
        command: z.string().describe("The shell command to execute"),
        timeout: z
          .number()
          .optional()
          .describe("Timeout in seconds (default: 120)"),
      }),
    },
  );
}
