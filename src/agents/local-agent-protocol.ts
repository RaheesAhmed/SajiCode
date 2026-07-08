import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";

type GraphRunnable = {
  invoke: (input: unknown, config?: Record<string, unknown>) => Promise<unknown>;
};

type RunStatus = "pending" | "running" | "success" | "error" | "cancelled";

interface RunRecord {
  runId: string;
  threadId: string;
  assistantId: string;
  status: RunStatus;
  abortController: AbortController;
}

interface ThreadRecord {
  threadId: string;
  values: Record<string, unknown>;
}

/**
 * Minimal Agent Protocol server for in-process async subagent dispatch.
 * Exposes the endpoints used by @langchain/langgraph-sdk Client (threads + runs).
 */
export class LocalAgentProtocolServer {
  private readonly app: Express;
  private server: Server | null = null;
  private url = "";
  private readonly threads = new Map<string, ThreadRecord>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly graphs = new Map<string, GraphRunnable>();

  constructor() {
    this.app = express();
    this.app.use(express.json({ limit: "10mb" }));
    this.registerRoutes();
  }

  registerGraph(graphId: string, runnable: GraphRunnable): void {
    this.graphs.set(graphId, runnable);
  }

  getUrl(): string {
    return this.url;
  }

  async start(preferredPort = 0): Promise<string> {
    if (this.server) return this.url;

    await new Promise<void>((resolve, reject) => {
      this.server = this.app.listen(preferredPort, "127.0.0.1", () => {
        const address = this.server?.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to bind local Agent Protocol server"));
          return;
        }
        this.url = `http://127.0.0.1:${address.port}`;
        resolve();
      });
      this.server?.on("error", reject);
    });

    return this.url;
  }

  async stop(): Promise<void> {
    for (const run of this.runs.values()) {
      run.abortController.abort();
    }
    this.runs.clear();
    this.threads.clear();

    if (!this.server) return;

    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()));
    });
    this.server = null;
    this.url = "";
  }

  private registerRoutes(): void {
    this.app.post("/threads", (_req: Request, res: Response) => {
      const threadId = randomUUID();
      this.threads.set(threadId, { threadId, values: {} });
      res.status(200).json({ thread_id: threadId });
    });

    this.app.post("/threads/:threadId/runs", (req: Request, res: Response) => {
      const threadId = String(req.params["threadId"] ?? "");
      if (!threadId || !this.threads.has(threadId)) {
        res.status(404).json({ error: "Thread not found" });
        return;
      }

      const assistantId = String(req.body?.assistant_id ?? "");
      const graph = this.graphs.get(assistantId);
      if (!graph) {
        res.status(404).json({ error: `Unknown assistant_id: ${assistantId}` });
        return;
      }

      const runId = randomUUID();
      const abortController = new AbortController();
      const run: RunRecord = {
        runId,
        threadId,
        assistantId,
        status: "pending",
        abortController,
      };
      this.runs.set(runId, run);

      const multitaskStrategy = req.body?.multitask_strategy;
      if (multitaskStrategy === "interrupt") {
        for (const existing of this.runs.values()) {
          if (existing.threadId === threadId && existing.status === "running") {
            existing.abortController.abort();
            existing.status = "cancelled";
          }
        }
      }

      void this.executeRun(run, graph, req.body?.input ?? {}, threadId);

      res.status(200).json({
        run_id: runId,
        thread_id: threadId,
        status: "pending",
      });
    });

    this.app.get("/threads/:threadId/runs/:runId", (req: Request, res: Response) => {
      const threadId = String(req.params["threadId"] ?? "");
      const runId = String(req.params["runId"] ?? "");
      const run = this.runs.get(runId);
      if (!run || run.threadId !== threadId) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      res.status(200).json({
        run_id: run.runId,
        thread_id: run.threadId,
        status: run.status,
      });
    });

    this.app.get("/threads/:threadId/state", (req: Request, res: Response) => {
      const thread = this.threads.get(String(req.params["threadId"] ?? ""));
      if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
      }
      res.status(200).json({ values: thread.values });
    });

    this.app.post("/threads/:threadId/runs/:runId/cancel", (req: Request, res: Response) => {
      const threadId = String(req.params["threadId"] ?? "");
      const runId = String(req.params["runId"] ?? "");
      const run = this.runs.get(runId);
      if (!run || run.threadId !== threadId) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      run.abortController.abort();
      run.status = "cancelled";
      res.status(202).json({ status: "cancelled" });
    });
  }

  private async executeRun(
    run: RunRecord,
    graph: GraphRunnable,
    input: unknown,
    threadId: string,
  ): Promise<void> {
    run.status = "running";
    const thread = this.threads.get(threadId);
    if (!thread) {
      run.status = "error";
      return;
    }

    try {
      const result = await graph.invoke(input, {
        configurable: { thread_id: threadId },
        recursionLimit: 500,
        signal: run.abortController.signal,
      });
      if (run.abortController.signal.aborted) {
        run.status = "cancelled";
        return;
      }
      thread.values =
        result && typeof result === "object"
          ? (result as Record<string, unknown>)
          : { result };
      run.status = "success";
    } catch {
      run.status = run.abortController.signal.aborted ? "cancelled" : "error";
    }
  }
}

let activeServer: LocalAgentProtocolServer | null = null;

export function getActiveAgentProtocolServer(): LocalAgentProtocolServer | null {
  return activeServer;
}

export async function stopAgentProtocolSession(): Promise<void> {
  if (!activeServer) return;
  await activeServer.stop();
  activeServer = null;
}

export async function startAgentProtocolSession(
  graphs: Array<{ graphId: string; runnable: GraphRunnable }>,
  options: { port?: number } = {},
): Promise<{ url: string; server: LocalAgentProtocolServer }> {
  await stopAgentProtocolSession();

  const server = new LocalAgentProtocolServer();
  for (const { graphId, runnable } of graphs) {
    server.registerGraph(graphId, runnable);
  }

  const url = await server.start(options.port ?? 0);
  activeServer = server;
  return { url, server };
}
