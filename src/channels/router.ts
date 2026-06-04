import chalk from "chalk";
import type { ChannelAdapter, ChannelMessage } from "./channel.js";
import type { SajiCodeOptions } from "../agents/index.js";
import { createSajiCode } from "../agents/index.js";
import type { ProjectConfig, OnboardingResult } from "../types/index.js";
import { augmentInputWithMemoryContext } from "../memory/turn-context.js";

interface ActiveSession {
  agent: any;
  threadId: string;
  lastActivity: number;
}

export class ChannelRouter {
  private adapters: ChannelAdapter[] = [];
  private sessions = new Map<string, ActiveSession>();
  private config: ProjectConfig;
  private onboardingResult: OnboardingResult;

  constructor(config: ProjectConfig, onboardingResult: OnboardingResult) {
    this.config = config;
    this.onboardingResult = onboardingResult;
  }

  addAdapter(adapter: ChannelAdapter): void {
    this.adapters.push(adapter);
  }

  async start(): Promise<void> {
    for (const adapter of this.adapters) {
      adapter.onMessage((msg) => this.handleMessage(msg));

      try {
        await adapter.start();
        console.log(chalk.green(`  ✓ Channel started: ${adapter.name}`));
      } catch (err) {
        console.error(chalk.red(`  ✗ Failed to start channel: ${adapter.name}`), err);
      }
    }
  }

  async stop(): Promise<void> {
    for (const adapter of this.adapters) {
      await adapter.stop();
    }
  }

  private async handleMessage(msg: ChannelMessage): Promise<void> {
    const sessionKey = msg.threadId;

    console.log("");
    console.log(chalk.hex("#FF8C00")(`  📱 [${msg.channel}] ${msg.senderName}: ${msg.text.slice(0, 80)}${msg.text.length > 80 ? "..." : ""}`));

    try {
      let session = this.sessions.get(sessionKey);

      if (!session) {
        const threadId = `sajicode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const options: SajiCodeOptions = {
          config: this.config,
          onboardingResult: this.onboardingResult,
          threadId,
        };

        const { agent } = await createSajiCode(options);
        session = { agent, threadId, lastActivity: Date.now() };
        this.sessions.set(sessionKey, session);
      }

      session.lastActivity = Date.now();

      // Run agent with user's message
      const sessionConfig = { configurable: { thread_id: session.threadId } };
      const isPersonalMode = this.config.whatsapp?.mode === "personal";
      const messages: Array<{ role: string; content: string }> = [];

      if (isPersonalMode) {
        const customPrompt = this.config.whatsapp?.personalBotPrompt ?? "";
        const personalSystemMsg = [
          "You are a personal WhatsApp assistant replying on behalf of the user.",
          "Reply naturally and conversationally — match the user's tone and style.",
          "Keep responses concise and chat-friendly. No code blocks, no markdown.",
          "Do NOT try to execute coding tasks or use tools.",
          customPrompt,
        ].filter(Boolean).join(" ");
        messages.push({ role: "system", content: personalSystemMsg });
      }

      messages.push({ role: "user", content: msg.text });
      const input = await augmentInputWithMemoryContext(this.config.projectPath, { messages });

      const stream = await session.agent.stream(input, {
        ...sessionConfig,
        streamMode: ["messages", "updates"],
        subgraphs: true,
      });

      // Collect all AI text from the stream
      let responseText = "";
      for await (const chunk of stream) {
        // Format: [namespace[], mode, data]
        const [, mode, data] = chunk as [string[], string, any];

        if (mode === "messages") {
          const items = Array.isArray(data) ? data : [data];
          for (const m of items) {
            const type = m?._getType?.() ?? m?.type ?? "";
            if (type !== "ai") continue;

            const content = m?.content;
            if (typeof content === "string" && content) {
              responseText += content;
            } else if (Array.isArray(content)) {
              for (const block of content) {
                if (typeof block === "string") responseText += block;
                else if (block?.type === "text" && block?.text) responseText += block.text;
              }
            }
          }
        }
      }

      // Clean up: remove duplicate text from token streaming
      // The PM agent streams tokens then the final message contains the full text
      // We want the final complete message, not accumulated tokens
      const finalText = responseText.trim();

      if (finalText) {
        await msg.reply(finalText);
        console.log(chalk.gray(`  ✓ Replied to ${msg.senderName} (${finalText.length} chars)`));
      } else {
        await msg.reply("✅ Done! Check the project directory for results.");
        console.log(chalk.gray(`  ✓ Task completed for ${msg.senderName}`));
      }
    } catch (err) {
      console.error(chalk.red(`  ✗ Error handling message from ${msg.senderName}:`), err);
      try {
        await msg.reply("❌ An error occurred while processing your request. Check the CLI for details.");
      } catch {
        // Reply failed too, nothing we can do
      }
    }
  }
}
