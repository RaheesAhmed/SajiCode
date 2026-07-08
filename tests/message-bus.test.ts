import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  sendMessage,
  getMessagesForAgent,
  markMessagesRead,
  broadcastMessage,
} from "../src/agents/message-bus.js";

describe("message bus", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-msg-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("delivers direct messages to the target agent", async () => {
    await sendMessage(tmpDir, {
      from: "backend-lead",
      to: "frontend-lead",
      subject: "API contract",
      body: "Use POST /api/users",
    });

    const inbox = await getMessagesForAgent(tmpDir, "frontend-lead");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.subject).toBe("API contract");
    expect(inbox[0]?.read).toBe(false);
  });

  it("broadcasts to all agents via wildcard recipient", async () => {
    await broadcastMessage(tmpDir, {
      from: "pm-agent",
      subject: "Breaking change",
      body: "User type renamed",
    });

    const backendInbox = await getMessagesForAgent(tmpDir, "backend-lead");
    expect(backendInbox).toHaveLength(1);
    expect(backendInbox[0]?.to).toBe("*");
  });

  it("marks messages as read", async () => {
    const msg = await sendMessage(tmpDir, {
      from: "qa-lead",
      to: "backend-lead",
      subject: "Test failure",
      body: "401 on login",
    });

    const marked = await markMessagesRead(tmpDir, "backend-lead", [msg.id]);
    expect(marked).toBe(1);

    const unread = await getMessagesForAgent(tmpDir, "backend-lead", {
      unreadOnly: true,
    });
    expect(unread).toHaveLength(0);
  });
});
