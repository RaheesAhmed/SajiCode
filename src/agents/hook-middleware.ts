import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import { emitHook } from "../hooks/hook-engine.js";
import {
  extractFilePathsFromToolArgs,
  FILE_WRITE_TOOLS,
  SHELL_TOOLS,
} from "../hooks/matchers.js";
import { normalizeToolResultContent } from "./context-guard.js";

export const hookMiddleware = createMiddleware({
  name: "HookMiddleware",
  // @ts-expect-error - DeepAgents middleware typing
  wrapToolCall: async (
    request: { toolCall: { name: string; args: Record<string, unknown>; id?: string } },
    handler: (req: unknown) => Promise<unknown>,
  ) => {
    const { name: toolName, args } = request.toolCall;
    const toolCallId = (request.toolCall as { id?: string }).id ?? "unknown";
    const paths = extractFilePathsFromToolArgs(toolName, args);

    const preToolResult = await emitHook("preToolUse", { toolName, args, paths });
    if (!preToolResult.allowed) {
      return new ToolMessage({
        name: toolName,
        content: `⛔ HOOK BLOCK — ${preToolResult.denyReason ?? "Action denied by preToolUse hook"}`,
        tool_call_id: toolCallId,
        status: "error",
      });
    }

    if (FILE_WRITE_TOOLS.has(toolName)) {
      const preWriteResult = await emitHook("preFileWrite", {
        toolName,
        args,
        paths,
        files: paths,
      });
      if (!preWriteResult.allowed) {
        return new ToolMessage({
          name: toolName,
          content: `⛔ HOOK BLOCK — ${preWriteResult.denyReason ?? "Action denied by preFileWrite hook"}`,
          tool_call_id: toolCallId,
          status: "error",
        });
      }
    }

    if (SHELL_TOOLS.has(toolName)) {
      const command = String(args["command"] ?? "");
      const preShellResult = await emitHook("preShell", {
        toolName,
        args,
        command,
        riskScore: 0,
      });
      if (!preShellResult.allowed) {
        return new ToolMessage({
          name: toolName,
          content: `⛔ HOOK BLOCK — ${preShellResult.denyReason ?? "Action denied by preShell hook"}`,
          tool_call_id: toolCallId,
          status: "error",
        });
      }
    }

    if (toolName === "session_commit") {
      const preCommitResult = await emitHook("preCommit", {
        toolName,
        args,
        message: String(args["summary"] ?? ""),
        agentName: String(args["agentName"] ?? ""),
      });
      if (!preCommitResult.allowed) {
        return new ToolMessage({
          name: toolName,
          content: `⛔ HOOK BLOCK — ${preCommitResult.denyReason ?? "Action denied by preCommit hook"}`,
          tool_call_id: toolCallId,
          status: "error",
        });
      }
    }

    const result = normalizeToolResultContent(await handler(request)) as {
      content?: string;
    };

    const resultContent =
      typeof result === "string"
        ? result
        : (result?.content ?? JSON.stringify(result ?? ""));

    await emitHook("postToolUse", {
      toolName,
      args,
      paths,
      result: resultContent,
    });

    if (FILE_WRITE_TOOLS.has(toolName) && paths.length > 0) {
      await emitHook("postFileWrite", {
        toolName,
        paths,
        files: paths,
      });
    }

    if (toolName === "run_build_check") {
      const passed = resultContent.includes("✅");
      await emitHook("buildResult", {
        toolName,
        status: passed ? "pass" : "fail",
        errors: passed ? [] : [resultContent],
      });
    }

    return result;
  },
});
