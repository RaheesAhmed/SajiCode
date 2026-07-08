import fs from "node:fs/promises";
import path from "node:path";

export interface MailboxMessage {
  id: string;
  from: string;
  to: string | "*";
  subject: string;
  body: string;
  timestamp: string;
  read: boolean;
  blocking?: boolean;
  threadId?: string;
}

export interface MailboxStore {
  version: 1;
  messages: MailboxMessage[];
}

const MAILBOX_FILE = ".sajicode/mailbox.json";

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadMailbox(projectPath: string): Promise<MailboxStore> {
  const filePath = path.join(projectPath, MAILBOX_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as MailboxStore;
  } catch {
    return { version: 1, messages: [] };
  }
}

export async function saveMailbox(
  projectPath: string,
  store: MailboxStore,
): Promise<void> {
  const filePath = path.join(projectPath, MAILBOX_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  if (store.messages.length > 1000) {
    store.messages = store.messages.slice(-1000);
  }

  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export async function sendMessage(
  projectPath: string,
  input: {
    from: string;
    to: string;
    subject: string;
    body: string;
    blocking?: boolean;
  },
): Promise<MailboxMessage> {
  const store = await loadMailbox(projectPath);
  const message: MailboxMessage = {
    id: generateId(),
    from: input.from,
    to: input.to,
    subject: input.subject,
    body: input.body,
    timestamp: new Date().toISOString(),
    read: false,
    ...(input.blocking ? { blocking: true } : {}),
  };
  store.messages.push(message);
  await saveMailbox(projectPath, store);
  return message;
}

export async function broadcastMessage(
  projectPath: string,
  input: { from: string; subject: string; body: string },
): Promise<MailboxMessage> {
  return sendMessage(projectPath, {
    from: input.from,
    to: "*",
    subject: input.subject,
    body: input.body,
  });
}

export async function getMessagesForAgent(
  projectPath: string,
  agentName: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<MailboxMessage[]> {
  const store = await loadMailbox(projectPath);
  let messages = store.messages.filter(
    (m) => m.to === agentName || m.to === "*",
  );

  if (options.unreadOnly) {
    messages = messages.filter((m) => !m.read);
  }

  messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const limit = options.limit ?? 50;
  return messages.slice(-limit);
}

export async function markMessagesRead(
  projectPath: string,
  agentName: string,
  messageIds?: string[],
): Promise<number> {
  const store = await loadMailbox(projectPath);
  let count = 0;

  for (const message of store.messages) {
    if (message.to !== agentName && message.to !== "*") continue;
    if (messageIds && !messageIds.includes(message.id)) continue;
    if (!message.read) {
      message.read = true;
      count++;
    }
  }

  if (count > 0) {
    await saveMailbox(projectPath, store);
  }

  return count;
}

export function formatMessagesForAgent(
  agentName: string,
  messages: MailboxMessage[],
): string {
  if (messages.length === 0) {
    return `No messages for ${agentName}.`;
  }

  const lines = [`Messages for ${agentName} (${messages.length}):`, ""];

  for (const m of messages) {
    const status = m.read ? "read" : "UNREAD";
    const blocking = m.blocking ? " [blocking]" : "";
    lines.push(
      `[${status}] ${m.id} | From: ${m.from} | ${m.timestamp}${blocking}`,
      `Subject: ${m.subject}`,
      m.body,
      "",
    );
  }

  return lines.join("\n");
}
