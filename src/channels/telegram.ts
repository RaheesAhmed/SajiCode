import type { ChannelAdapter, ChannelMessage } from "./channel.js";

const TELEGRAM_API = "https://api.telegram.org/bot";

export class TelegramAdapter implements ChannelAdapter {
  readonly name = "telegram";
  private handler: ((msg: ChannelMessage) => void) | null = null;
  private polling = false;
  private offset = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  onMessage(handler: (msg: ChannelMessage) => void): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    this.polling = true;
    await this.pollOnce();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, 2000);
  }

  async stop(): Promise<void> {
    this.polling = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async pollOnce(): Promise<void> {
    if (!this.polling || !this.handler) return;

    try {
      const url = `${TELEGRAM_API}${this.token}/getUpdates?offset=${this.offset + 1}&timeout=1`;
      const response = await fetch(url);
      if (!response.ok) return;

      const body = (await response.json()) as {
        ok?: boolean;
        result?: Array<{
          update_id: number;
          message?: {
            message_id: number;
            chat: { id: number };
            from?: { id: number; first_name?: string; username?: string };
            text?: string;
          };
        }>;
      };

      if (!body.ok || !body.result) return;

      for (const update of body.result) {
        this.offset = Math.max(this.offset, update.update_id);
        const message = update.message;
        if (!message?.text) continue;

        const chatId = String(message.chat.id);
        const senderName =
          message.from?.username ??
          message.from?.first_name ??
          String(message.from?.id ?? "user");

        await this.handler({
          channel: "telegram",
          senderId: chatId,
          senderName,
          text: message.text,
          threadId: chatId,
          timestamp: Date.now(),
          reply: async (text: string) => {
            await fetch(`${TELEGRAM_API}${this.token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: message.chat.id, text: text.slice(0, 4096) }),
            });
          },
        });
      }
    } catch {
      // polling errors are non-fatal
    }
  }
}
