import type { Express, Request, Response } from "express";
import type { ChannelAdapter, ChannelMessage } from "./channel.js";
import crypto from "node:crypto";

export class SlackEventsAdapter implements ChannelAdapter {
  readonly name = "slack";
  private handler: ((msg: ChannelMessage) => void) | null = null;
  private readonly botToken: string;
  private readonly signingSecret: string;
  private mounted = false;

  constructor(botToken: string, signingSecret: string) {
    this.botToken = botToken;
    this.signingSecret = signingSecret;
  }

  onMessage(handler: (msg: ChannelMessage) => void): void {
    this.handler = handler;
  }

  mount(app: Express, path = "/channels/slack/events"): void {
    if (this.mounted) return;
    this.mounted = true;

    app.post(path, async (req: Request, res: Response) => {
      if (!this.verifySlackSignature(req)) {
        res.status(401).json({ error: "invalid signature" });
        return;
      }

      const body = req.body as {
        type?: string;
        challenge?: string;
        event?: {
          type?: string;
          user?: string;
          text?: string;
          channel?: string;
          ts?: string;
          bot_id?: string;
          subtype?: string;
        };
      };

      if (body.type === "url_verification" && body.challenge) {
        res.json({ challenge: body.challenge });
        return;
      }

      res.status(200).send("");

      const event = body.event;
      if (!event || event.type !== "message" || !event.text) return;
      if (event.bot_id || event.subtype) return;
      if (!this.handler || !event.channel) return;

      const threadId = `${event.channel}:${event.ts ?? "main"}`;
      const msg: ChannelMessage = {
        channel: "slack",
        senderId: event.user ?? "unknown",
        senderName: event.user ?? "slack-user",
        text: event.text,
        threadId,
        timestamp: Date.now(),
        reply: async (text: string) => {
          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.botToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: event.channel,
              text: text.slice(0, 4000),
              thread_ts: event.ts,
            }),
          });
        },
      };

      void this.handler(msg);
    });
  }

  async start(): Promise<void> {
    // Events are delivered via HTTP — mount() must be called on the Express app.
  }

  async stop(): Promise<void> {
    // No persistent connection to tear down.
  }

  private verifySlackSignature(req: Request): boolean {
    if (process.env["SAJICODE_SLACK_SKIP_VERIFY"] === "1") return true;

    const timestamp = req.headers["x-slack-request-timestamp"];
    const signature = req.headers["x-slack-signature"];
    if (typeof timestamp !== "string" || typeof signature !== "string") return false;

    const fiveMinutes = 60 * 5;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > fiveMinutes) return false;

    const rawBody = JSON.stringify(req.body ?? {});
    const base = `v0:${timestamp}:${rawBody}`;
    const digest = `v0=${crypto
      .createHmac("sha256", this.signingSecret)
      .update(base)
      .digest("hex")}`;

    try {
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}
