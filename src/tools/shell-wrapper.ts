import { LocalShellBackend } from "deepagents";
import type { LocalShellBackendOptions, ExecuteResponse, BackendProtocol } from "deepagents";
import { spawn } from "child_process";
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

  private spawnExecute(command: string): Promise<ExecuteResponse> {
    return new Promise((resolve) => {
      const isWin = process.platform === "win32";
      const shell = isWin ? "cmd.exe" : "/bin/sh";
      const shellFlag = isWin ? "/c" : "-c";

      const child = spawn(shell, [shellFlag, command], {
        cwd: this.projectPath,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const outputLines: string[] = [];
      const MAX_OUTPUT_LINES = 500;
      let lineCount = 0;

      const handleLine = (line: string, isStderr: boolean): void => {
        if (lineCount >= MAX_OUTPUT_LINES) {
          if (lineCount === MAX_OUTPUT_LINES) {
            console.log(chalk.gray("  ... output truncated"));
            outputLines.push("... [output truncated]");
          }
          lineCount++;
          return;
        }
        const prefix = isStderr ? chalk.gray("  err│ ") : chalk.gray("  out│ ");
        console.log(prefix + line);
        outputLines.push(line);
        lineCount++;
      };

      let stdoutBuf = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) handleLine(line, false);
        }
      });

      let stderrBuf = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split("\n");
        stderrBuf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) handleLine(line, true);
        }
      });

      const TIMEOUT_MS = 300_000; // 5 min hard cap
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        outputLines.push("[TIMEOUT] Command exceeded 5 minutes and was terminated.");
        resolve({ output: outputLines.join("\n"), exitCode: -1, truncated: true });
      }, TIMEOUT_MS);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (stdoutBuf.trim()) handleLine(stdoutBuf, false);
        if (stderrBuf.trim()) handleLine(stderrBuf, true);
        resolve({
          output: outputLines.join("\n"),
          exitCode: code ?? 0,
          truncated: lineCount > MAX_OUTPUT_LINES,
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ output: `[SPAWN ERROR] ${err.message}`, exitCode: 1, truncated: false });
      });
    });
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

    // Execute command with real-time streaming output
    console.log(chalk.gray(`  ▶ [PROCESS STATE] Executing: ${command}`));
    const result = await this.spawnExecute(command);

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
 * Creates an explicit `execute` LangChain tool backed by SafeShellBackend.
 * Use this when deepagents does NOT auto-register the execute tool (e.g. PM
 * agent uses CompositeBackend which breaks automatic tool registration).
 */
export function createExecuteTool(backend: SafeShellBackend) {
  return tool(
    async ({ command }: { command: string }): Promise<string> => {
      const result = await backend.execute(command);
      const exitLine =
        result.exitCode !== 0
          ? `\n[exit code ${result.exitCode}]`
          : "";
      return (result.output || "<no output>") + exitLine;
    },
    {
      name: "execute",
      description:
        "Run a shell command in the project directory and return its output. " +
        "Output streams line-by-line in real time. " +
        "Use for: npm install, npm run build, npm test, node scripts, git commands, " +
        "directory setup (mkdir), checking versions (node --version), and any other shell operations.",
      schema: z.object({
        command: z.string().describe("Shell command to execute, e.g. 'node --version' or 'npm install'"),
      }),
    },
  );
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
