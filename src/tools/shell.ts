/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const COMMAND_TIMEOUT_MS = 30_000;

export const runCommandTool = tool(
  async (input: { command: string; cwd?: string }) => {
    const { command, cwd } = input;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd ?? process.cwd(),
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 5,
        env: { ...process.env },
      });

      let result = "";
      if (stdout.trim()) result += stdout.trim();
      if (stderr.trim()) result += (result ? "\n\n" : "") + `STDERR:\n${stderr.trim()}`;
      return result || "Command completed with no output.";
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
        const parts: string[] = [`❌ Command failed: ${execError.message}`];
        if (execError.stdout) parts.push(`STDOUT:\n${execError.stdout}`);
        if (execError.stderr) parts.push(`STDERR:\n${execError.stderr}`);
        return parts.join("\n\n");
      }
      return `❌ Command failed: ${String(error)}`;
    }
  },
  {
    name: "run_command",
    description: "Execute a shell command and return stdout/stderr",
    schema: z.object({
      command: z.string().describe("The shell command to execute"),
      cwd: z.string().optional().describe("Working directory"),
    }),
  }
);

export const allShellTools = [runCommandTool];
