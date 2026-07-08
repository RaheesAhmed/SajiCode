import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  sendMessage,
  broadcastMessage,
  getMessagesForAgent,
  markMessagesRead,
  formatMessagesForAgent,
} from "../agents/message-bus.js";
import { appendAuditEntry } from "../audit/audit-log.js";

export function createMessagingTools(projectPath: string, defaultAgentName: string) {
  const sendMessageTool = tool(
    async (input: {
      from: string;
      to: string;
      subject: string;
      body: string;
      blocking?: boolean;
    }) => {
      const message = await sendMessage(projectPath, input);
      await appendAuditEntry(projectPath, {
        event: "session",
        agentName: input.from,
        toolName: "send_message",
        detail: `${input.from} → ${input.to}: ${input.subject}`,
      });
      return `Message sent (${message.id}) to ${input.to}: ${input.subject}`;
    },
    {
      name: "send_message",
      description:
        "Send a direct message to another agent for clarifications (API contracts, naming, dependencies). " +
        "Use instead of waiting for PM round-trip when blocked on a peer decision.",
      schema: z.object({
        from: z.string().describe("Your agent name"),
        to: z.string().describe("Target agent name (e.g. backend-lead)"),
        subject: z.string().describe("Short subject line"),
        body: z.string().describe("Question or clarification details"),
        blocking: z.boolean().optional().describe("Mark as blocking — recipient should check_messages soon"),
      }),
    },
  );

  const checkMessagesTool = tool(
    async (input: { agentName?: string; unreadOnly?: boolean }) => {
      const agentName = input.agentName ?? defaultAgentName;
      const messages = await getMessagesForAgent(projectPath, agentName, {
        unreadOnly: input.unreadOnly ?? true,
      });
      return formatMessagesForAgent(agentName, messages);
    },
    {
      name: "check_messages",
      description:
        "Check your inbox for messages from other agents. Call after read_team_context and after batch writes.",
      schema: z.object({
        agentName: z.string().optional().describe("Agent inbox to check (defaults to you)"),
        unreadOnly: z.boolean().optional().describe("Only show unread messages (default true)"),
      }),
    },
  );

  const markReadTool = tool(
    async (input: { agentName?: string; messageIds?: string[] }) => {
      const agentName = input.agentName ?? defaultAgentName;
      const count = await markMessagesRead(projectPath, agentName, input.messageIds);
      return `Marked ${count} message(s) as read for ${agentName}.`;
    },
    {
      name: "mark_messages_read",
      description: "Mark inbox messages as read after acting on them.",
      schema: z.object({
        agentName: z.string().optional(),
        messageIds: z.array(z.string()).optional().describe("Specific IDs; omit to mark all as read"),
      }),
    },
  );

  const broadcastTool = tool(
    async (input: { from: string; subject: string; body: string }) => {
      const message = await broadcastMessage(projectPath, input);
      return `Broadcast sent (${message.id}): ${input.subject}`;
    },
    {
      name: "broadcast",
      description:
        "Broadcast a message to all agents (e.g. renamed shared type, breaking API change).",
      schema: z.object({
        from: z.string().describe("Your agent name"),
        subject: z.string(),
        body: z.string(),
      }),
    },
  );

  return [sendMessageTool, checkMessagesTool, markReadTool, broadcastTool];
}
