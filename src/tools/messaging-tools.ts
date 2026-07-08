import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  sendMessage,
  broadcastMessage,
  getMessagesForAgent,
  markMessagesRead,
  formatMessagesForAgent,
} from "../agents/message-bus.js";
import {
  requestHandoff,
  listHandoffs,
  acceptHandoff,
  completeHandoff,
  formatHandoffs,
} from "../agents/handoff.js";
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

  const handoffTool = tool(
    async (input: {
      from: string;
      to: string;
      reason: string;
      context: string;
      blocking?: boolean;
    }) => {
      const record = await requestHandoff(projectPath, input);
      return `Handoff ${record.id} queued for ${input.to} (task ${record.taskId ?? "none"}): ${input.reason}`;
    },
    {
      name: "handoff_to_agent",
      description:
        "LangGraph-style swarm handoff — transfer work to another lead with full context. " +
        "Queues a background task and sends a blocking inbox message.",
      schema: z.object({
        from: z.string().describe("Your agent name"),
        to: z.string().describe("Target lead (e.g. backend-lead, qa-lead)"),
        reason: z.string().describe("Why you are handing off"),
        context: z.string().describe("Everything the next agent needs to continue"),
        blocking: z.boolean().optional().describe("Default true — recipient should pick up soon"),
      }),
    },
  );

  const listHandoffsTool = tool(
    async (input: { agentName?: string; pendingOnly?: boolean }) => {
      const agentName = input.agentName ?? defaultAgentName;
      const records = await listHandoffs(
        projectPath,
        agentName,
        input.pendingOnly ? "pending" : undefined,
      );
      return formatHandoffs(records);
    },
    {
      name: "list_handoffs",
      description: "List pending or historical agent handoffs for swarm coordination.",
      schema: z.object({
        agentName: z.string().optional(),
        pendingOnly: z.boolean().optional().describe("Only show pending handoffs"),
      }),
    },
  );

  const acceptHandoffTool = tool(
    async (input: { handoffId: string; agentName?: string }) => {
      const agentName = input.agentName ?? defaultAgentName;
      const record = await acceptHandoff(projectPath, input.handoffId, agentName);
      if (!record) return `Handoff ${input.handoffId} not found or not assigned to ${agentName}.`;
      return `Accepted handoff ${record.id} from ${record.from}:\n${record.context}`;
    },
    {
      name: "accept_handoff",
      description: "Accept a pending handoff and load its context.",
      schema: z.object({
        handoffId: z.string(),
        agentName: z.string().optional(),
      }),
    },
  );

  const completeHandoffTool = tool(
    async (input: { handoffId: string }) => {
      const record = await completeHandoff(projectPath, input.handoffId);
      if (!record) return `Handoff ${input.handoffId} not found.`;
      return `Completed handoff ${record.id} (${record.from} → ${record.to}).`;
    },
    {
      name: "complete_handoff",
      description: "Mark a handoff complete after finishing the transferred work.",
      schema: z.object({
        handoffId: z.string(),
      }),
    },
  );

  return [
    sendMessageTool,
    checkMessagesTool,
    markReadTool,
    broadcastTool,
    handoffTool,
    listHandoffsTool,
    acceptHandoffTool,
    completeHandoffTool,
  ];
}
