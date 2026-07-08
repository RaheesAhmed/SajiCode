import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import { normalizeToolResultContent } from "../agents/context-guard.js";
import {
  compressText,
  type CompressionConfig,
  resolveCompressionOptions,
} from "./compression.js";

let compressionConfig: CompressionConfig | null = null;

export function setCompressionConfig(config: CompressionConfig | null): void {
  compressionConfig = config;
}

function extractContent(result: unknown): { text: string; isMessage: boolean; message?: ToolMessage } {
  if (typeof result === "string") {
    return { text: result, isMessage: false };
  }

  if (result instanceof ToolMessage) {
    const content = typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);
    return { text: content, isMessage: true, message: result };
  }

  if (result && typeof result === "object" && "content" in result) {
    const content = (result as { content: unknown }).content;
    return {
      text: typeof content === "string" ? content : JSON.stringify(content),
      isMessage: false,
    };
  }

  return { text: String(result ?? ""), isMessage: false };
}

export const compressionMiddleware = createMiddleware({
  name: "CompressionMiddleware",
  // @ts-expect-error - DeepAgents middleware typing
  wrapToolCall: async (
    request: { toolCall: { name: string; args: Record<string, unknown>; id?: string } },
    handler: (req: unknown) => Promise<unknown>,
  ) => {
    const { name: toolName, args } = request.toolCall;
    const result = normalizeToolResultContent(await handler(request));

    const queryHint = String(
      args["query"] ??
      args["symbol"] ??
      args["focus"] ??
      args["file_path"] ??
      args["path"] ??
      "",
    );

    const options = resolveCompressionOptions(compressionConfig ?? undefined, toolName, queryHint);
    if (!options) return result;

    const { text, isMessage, message } = extractContent(result);
    const compressed = compressText(text, options);
    if (compressed === text) return result;

    if (isMessage && message) {
      return new ToolMessage({
        name: message.name ?? toolName,
        content: compressed,
        tool_call_id: message.tool_call_id,
      });
    }

    if (typeof result === "string") return compressed;
    if (result && typeof result === "object" && "content" in result) {
      return { ...(result as object), content: compressed };
    }

    return compressed;
  },
});
