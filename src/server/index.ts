import express, { type Express, type Request, type Response } from "express";
import chalk from "chalk";
import type { Server } from "node:http";
import type { ProjectConfig, OnboardingResult } from "../types/index.js";
import { ChannelRouter } from "../channels/router.js";
import { WhatsAppAdapter } from "../channels/whatsapp.js";

export interface ServeOptions {
  projectPath: string;
  config: ProjectConfig;
  onboardingResult: OnboardingResult;
  port?: number;
  host?: string;
  enableWhatsApp?: boolean;
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
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #111; }
    h1 { color: #ff8c00; }
    code { background: #f4f4f5; padding: 0.15rem 0.4rem; border-radius: 4px; }
    .card { border: 1px solid #e4e4e7; border-radius: 8px; padding: 1rem 1.25rem; margin: 1rem 0; }
    ul { padding-left: 1.25rem; }
  </style>
</head>
<body>
  <h1>SajiCode Server</h1>
  <p>Team server mode — dispatch tasks and monitor status over HTTP.</p>
  <div class="card">
    <strong>Project</strong><br /><code>${projectPath}</code>
  </div>
  <div class="card">
    <strong>Endpoints</strong>
    <ul>
      <li><code>GET /health</code> — liveness</li>
      <li><code>GET /api/status</code> — project + session summary</li>
      <li><code>POST /api/dispatch</code> — <code>{ "prompt": "..." }</code> enqueue a build task</li>
    </ul>
  </div>
  <p>Listening on port <code>${port}</code>.</p>
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
  } = options;

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const startedAt = new Date().toISOString();
  let dispatchCount = 0;
  let channelRouter: ChannelRouter | null = null;

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, uptimeSince: startedAt });
  });

  app.get("/api/status", (_req: Request, res: Response) => {
    res.json({
      projectPath,
      model: config.modelConfig.modelName,
      provider: config.modelConfig.provider,
      riskTolerance: config.riskTolerance,
      dispatches: dispatchCount,
      whatsapp: enableWhatsApp && config.whatsapp?.enabled === true,
      startedAt,
    });
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

    dispatchCount += 1;
    const jobId = `job-${Date.now()}-${dispatchCount}`;

    res.status(202).json({
      jobId,
      status: "accepted",
      message: "Task queued — run `sajicode build` locally for full interactive mode today.",
      prompt,
    });

    console.log(chalk.gray(`[serve] dispatch ${jobId}: ${prompt.slice(0, 120)}`));
  });

  if (enableWhatsApp && config.whatsapp?.enabled) {
    channelRouter = new ChannelRouter(config, onboardingResult);
    channelRouter.addAdapter(new WhatsAppAdapter(projectPath, config.whatsapp));
  }

  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.on("error", reject);
  });

  const url = `http://${host}:${port}`;

  if (channelRouter) {
    await channelRouter.start();
    console.log(chalk.green(`  ✓ WhatsApp channel attached`));
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
