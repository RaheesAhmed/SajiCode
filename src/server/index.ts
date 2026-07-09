import express, { type Express, type Request, type Response } from "express";
import chalk from "chalk";
import type { Server } from "node:http";
import type { ProjectConfig, OnboardingResult } from "../types/index.js";
import { ChannelRouter } from "../channels/router.js";
import { WhatsAppAdapter } from "../channels/whatsapp.js";
import { TelegramAdapter } from "../channels/telegram.js";
import { SlackEventsAdapter } from "../channels/slack.js";
import { createJob, getJob, listJobs } from "./jobs.js";
import { runDispatchJob } from "./dispatch.js";

export interface ServeOptions {
  projectPath: string;
  config: ProjectConfig;
  onboardingResult: OnboardingResult;
  port?: number;
  host?: string;
  enableWhatsApp?: boolean;
  enableTelegram?: boolean;
  enableSlack?: boolean;
  enableA2a?: boolean;
}

export interface ServeHandle {
  url: string;
  app: Express;
  stop: () => Promise<void>;
}

function buildDashboardHtml(projectPath: string, port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SajiCode Server</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem; color: #111; }
    h1 { color: #ff8c00; }
    code { background: #f4f4f5; padding: 0.15rem 0.4rem; border-radius: 4px; }
    .card { border: 1px solid #e4e4e7; border-radius: 8px; padding: 1rem 1.25rem; margin: 1rem 0; }
    textarea, input { width: 100%; box-sizing: border-box; margin: 0.5rem 0; padding: 0.5rem; }
    button { background: #ff8c00; color: #fff; border: 0; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
    pre { background: #f8fafc; padding: 0.75rem; overflow: auto; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>SajiCode Server</h1>
  <p>Team server mode — dispatch tasks and monitor jobs.</p>
  <div class="card"><strong>Project</strong><br /><code>${projectPath}</code></div>
  <div class="card">
    <strong>Dispatch task</strong>
    <textarea id="prompt" rows="4" placeholder="Describe what the team should build..."></textarea>
    <button onclick="dispatch()">Run</button>
    <pre id="out">Ready.</pre>
  </div>
  <div class="card">
    <strong>Recent jobs</strong>
    <pre id="jobs">Loading...</pre>
  </div>
  <script>
    async function dispatch() {
      const prompt = document.getElementById('prompt').value.trim();
      if (!prompt) return;
      const out = document.getElementById('out');
      out.textContent = 'Submitting...';
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      out.textContent = JSON.stringify(data, null, 2);
      pollJob(data.jobId);
      refreshJobs();
    }
    async function pollJob(id) {
      if (!id) return;
      for (let i = 0; i < 120; i++) {
        const res = await fetch('/api/jobs/' + id);
        const job = await res.json();
        if (job.status === 'completed' || job.status === 'failed') {
          document.getElementById('out').textContent = JSON.stringify(job, null, 2);
          refreshJobs();
          return;
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    async function refreshJobs() {
      const res = await fetch('/api/jobs');
      const jobs = await res.json();
      document.getElementById('jobs').textContent = JSON.stringify(jobs, null, 2);
    }
    refreshJobs();
    setInterval(refreshJobs, 10000);
  </script>
  <p>Port <code>${port}</code></p>
</body>
</html>`;
}

export async function startServeServer(options: ServeOptions): Promise<ServeHandle> {
  const {
    projectPath,
    config,
    onboardingResult,
    port = 3920,
    host = "127.0.0.1",
    enableWhatsApp = false,
    enableTelegram = false,
    enableSlack = false,
    enableA2a = true,
  } = options;

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const startedAt = new Date().toISOString();
  let channelRouter: ChannelRouter | null = null;
  let slackAdapter: SlackEventsAdapter | null = null;

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, uptimeSince: startedAt });
  });

  app.get("/api/status", (_req: Request, res: Response) => {
    res.json({
      projectPath,
      model: config.modelConfig.modelName,
      provider: config.modelConfig.provider,
      riskTolerance: config.riskTolerance,
      offline: config.offline?.enabled === true,
      jobs: listJobs(10).length,
      channels: {
        whatsapp: enableWhatsApp && config.whatsapp?.enabled === true,
        telegram: enableTelegram,
        slack: enableSlack,
      },
      startedAt,
    });
  });

  app.get("/api/jobs", (_req: Request, res: Response) => {
    res.json(listJobs(20));
  });

  app.get("/api/jobs/:jobId", (req: Request, res: Response) => {
    const job = getJob(String(req.params["jobId"] ?? ""));
    if (!job) {
      res.status(404).json({ error: "job not found" });
      return;
    }
    res.json(job);
  });

  app.get("/", (_req: Request, res: Response) => {
    res.type("html").send(buildDashboardHtml(projectPath, port));
  });

  app.post("/api/dispatch", async (req: Request, res: Response) => {
    const prompt = String(req.body?.prompt ?? "").trim();
    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    createJob(jobId, prompt);

    res.status(202).json({ jobId, status: "accepted", prompt });

    void runDispatchJob(jobId, projectPath, config, onboardingResult, prompt);
    console.log(chalk.gray(`[serve] dispatch ${jobId}: ${prompt.slice(0, 120)}`));
  });

  const adapters: Array<{ name: string; enabled: boolean }> = [];

  if (enableWhatsApp && config.whatsapp?.enabled) {
    adapters.push({ name: "whatsapp", enabled: true });
  }
  if (enableTelegram && process.env["TELEGRAM_BOT_TOKEN"]) {
    adapters.push({ name: "telegram", enabled: true });
  }
  if (enableSlack && process.env["SLACK_BOT_TOKEN"] && process.env["SLACK_SIGNING_SECRET"]) {
    adapters.push({ name: "slack", enabled: true });
  }

  if (adapters.length > 0) {
    channelRouter = new ChannelRouter(config, onboardingResult);
    if (enableWhatsApp && config.whatsapp?.enabled) {
      channelRouter.addAdapter(new WhatsAppAdapter(projectPath, config.whatsapp));
    }
    if (enableTelegram && process.env["TELEGRAM_BOT_TOKEN"]) {
      channelRouter.addAdapter(new TelegramAdapter(process.env["TELEGRAM_BOT_TOKEN"]));
    }
    if (
      enableSlack &&
      process.env["SLACK_BOT_TOKEN"] &&
      process.env["SLACK_SIGNING_SECRET"]
    ) {
      slackAdapter = new SlackEventsAdapter(
        process.env["SLACK_BOT_TOKEN"],
        process.env["SLACK_SIGNING_SECRET"],
      );
      slackAdapter.mount(app);
      channelRouter.addAdapter(slackAdapter);
    }
  }

  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.on("error", reject);
  });

  const url = `http://${host}:${port}`;

  const a2aEnabled = enableA2a && config.a2a?.enabled !== false;
  if (a2aEnabled) {
    const { mountA2aRoutes } = await import("../a2a/server.js");
    mountA2aRoutes(app, {
      projectPath,
      config,
      onboardingResult,
      publicUrl: config.a2a?.publicUrl ?? url,
    });
    console.log(chalk.green(`  ✓ A2A agent card at ${config.a2a?.publicUrl ?? url}/.well-known/agent.json`));
  }

  if (channelRouter) {
    await channelRouter.start();
    console.log(chalk.green(`  ✓ Channels: ${adapters.map((a) => a.name).join(", ")}`));
  }

  console.log(chalk.hex("#FF8C00").bold(`\n🚀 SajiCode server running at ${url}\n`));

  return {
    url,
    app,
    stop: async () => {
      if (channelRouter) await channelRouter.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
