import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import { auditToolBlock } from "../audit/audit-log.js";
import {
  extractFilePathsFromToolArgs,
  FILE_WRITE_TOOLS,
} from "../hooks/matchers.js";
import { scanFileForSecurityIssues } from "../tools/validation-tools.js";
import { normalizeToolResultContent } from "../agents/context-guard.js";
import {
  countWrittenPaths,
  evaluateToolPolicy,
  type PolicyEvaluationContext,
} from "./engine.js";
import type { PolicyConfig } from "./schema.js";
import {
  getSessionFilesWritten,
  incrementSessionFilesWritten,
} from "./session-tracker.js";

export interface PolicyContext {
  projectPath: string;
  sessionId: string;
  policies: PolicyConfig;
}

let policyContext: PolicyContext | null = null;

export function setPolicyContext(context: PolicyContext | null): void {
  policyContext = context;
}

export function getPolicyContext(): PolicyContext | null {
  return policyContext;
}

function buildEvaluationContext(
  toolName: string,
  args: Record<string, unknown>,
): PolicyEvaluationContext | null {
  if (!policyContext) return null;
  const paths = extractFilePathsFromToolArgs(toolName, args);
  return {
    toolName,
    args,
    paths,
    sessionFilesWritten: getSessionFilesWritten(
      policyContext.projectPath,
      policyContext.sessionId,
    ),
    projectPath: policyContext.projectPath,
  };
}

async function blockWithPolicy(
  toolName: string,
  toolCallId: string,
  reason: string,
): Promise<ToolMessage> {
  if (policyContext) {
    void auditToolBlock(policyContext.projectPath, toolName, reason);
  }
  return new ToolMessage({
    name: toolName,
    content: reason,
    tool_call_id: toolCallId,
    status: "error",
  });
}

export const policyMiddleware = createMiddleware({
  name: "PolicyMiddleware",
  // @ts-expect-error - DeepAgents middleware typing
  wrapToolCall: async (
    request: { toolCall: { name: string; args: Record<string, unknown>; id?: string } },
    handler: (req: unknown) => Promise<unknown>,
  ) => {
    const { name: toolName, args } = request.toolCall;
    const toolCallId = (request.toolCall as { id?: string }).id ?? "unknown";

    const evalContext = buildEvaluationContext(toolName, args);
    if (evalContext && policyContext) {
      const decision = evaluateToolPolicy(policyContext.policies, evalContext);
      if (!decision.allowed) {
        return blockWithPolicy(toolName, toolCallId, decision.reason ?? "Policy denied");
      }
    }

    const result = normalizeToolResultContent(await handler(request));

    if (
      policyContext?.policies.secretsScan === "block" &&
      (toolName === "read_file" || toolName === "read_file_chunk")
    ) {
      const content =
        typeof result === "string"
          ? result
          : (result as { content?: string })?.content ?? "";
      const filePath = String(args["file_path"] ?? args["path"] ?? "unknown");
      const scan = await scanFileForSecurityIssues(filePath, content);
      if (scan.blocks.length > 0) {
        const reason = `⛔ POLICY — secrets scan blocked read of ${filePath}: ${scan.blocks.join("; ")}`;
        return blockWithPolicy(toolName, toolCallId, reason);
      }
    }

    if (
      evalContext &&
      policyContext &&
      FILE_WRITE_TOOLS.has(toolName) &&
      evalContext.paths.length > 0
    ) {
      incrementSessionFilesWritten(
        policyContext.projectPath,
        policyContext.sessionId,
        countWrittenPaths(evalContext.paths),
      );
    }

    return result;
  },
});
