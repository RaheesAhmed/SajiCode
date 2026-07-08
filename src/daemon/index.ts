import chalk from "chalk";
import type { ProjectConfig, OnboardingResult } from "../types/index.js";
import { startServeServer, type ServeHandle } from "../server/index.js";
import {
  claimNextRunnableTask,
  enqueueDueScheduledTasks,
  recoverStaleRunningTasks,
  addTask,
  listTasks,
} from "../tasks/queue.js";
import {
  evaluateHeartbeat,
  ensureHeartbeatFile,
  isHeartbeatOkResponse,
} from "./heartbeat.js";
import {
  executeTaskRecord,
  runAgentTask,
  writeDaemonPid,
  clearDaemonPid,
} from "./task-runner.js";

export interface DaemonOptions {
  projectPath: string;
  config: ProjectConfig;
  onboardingResult: OnboardingResult;
  port?: number;
  host?: string;
  enableWhatsApp?: boolean;
  enableTelegram?: boolean;
  enableSlack?: boolean;
  heartbeatIntervalMs?: number;
  taskPollIntervalMs?: number;
}

export interface DaemonHandle {
  stop: () => Promise<void>;
}

async function ensureNightlyConsolidationTask(projectPath: string): Promise<void> {
  const existing = await listTasks(projectPath, { limit: 100 });
  if (existing.some((t) => t.kind === "consolidation" && t.cron === "0 2 * * *")) {
    return;
  }

  await addTask(projectPath, {
    prompt: "Run sleep-time memory consolidation for experiences and mailbox.",
    kind: "consolidation",
    cron: "0 2 * * *",
    priority: 3,
    source: "daemon:nightly",
  });
}

export async function startDaemon(options: DaemonOptions): Promise<DaemonHandle> {
  const {
    projectPath,
    config,
    onboardingResult,
    port = config.daemon?.port ?? 3920,
    host = "127.0.0.1",
    enableWhatsApp = false,
    enableTelegram = false,
    enableSlack = false,
    heartbeatIntervalMs = config.daemon?.heartbeatIntervalMs ?? 30 * 60_000,
    taskPollIntervalMs = config.daemon?.taskPollIntervalMs ?? 15_000,
  } = options;

  await ensureHeartbeatFile(projectPath);
  await ensureNightlyConsolidationTask(projectPath);
  await writeDaemonPid(projectPath, process.pid);
  await recoverStaleRunningTasks(projectPath);

  let serveHandle: ServeHandle | null = null;
  let stopped = false;
  const timers: NodeJS.Timeout[] = [];

  serveHandle = await startServeServer({
    projectPath,
    config,
    onboardingResult,
    port,
    host,
    enableWhatsApp,
    enableTelegram,
    enableSlack,
  });

  const processQueue = async () => {
    if (stopped) return;

    try {
      await enqueueDueScheduledTasks(projectPath);
      const task = await claimNextRunnableTask(projectPath);
      if (!task) return;

      console.log(chalk.gray(`[daemon] running task ${task.id} (${task.kind})`));
      await executeTaskRecord(projectPath, config, task);
      console.log(chalk.green(`[daemon] task ${task.id} finished`));
    } catch (error) {
      console.error(chalk.red("[daemon] task error:"), error);
    }
  };

  const runHeartbeat = async () => {
    if (stopped) return;

    try {
      const evaluation = await evaluateHeartbeat(projectPath);
      if (evaluation.ok) {
        console.log(chalk.gray("[daemon] HEARTBEAT_OK"));
        return;
      }

      const pending = evaluation.items.filter((i) => !i.checked).length;
      console.log(chalk.cyan(`[daemon] heartbeat — ${pending} pending checklist items`));

      const result = await runAgentTask(projectPath, config, evaluation.prompt);
      if (isHeartbeatOkResponse(result)) {
        console.log(chalk.gray("[daemon] HEARTBEAT_OK"));
      } else {
        console.log(chalk.green(`[daemon] heartbeat action taken (${result.length} chars)`));
      }
    } catch (error) {
      console.error(chalk.red("[daemon] heartbeat error:"), error);
    }
  };

  timers.push(setInterval(() => void processQueue(), taskPollIntervalMs));
  timers.push(setInterval(() => void runHeartbeat(), heartbeatIntervalMs));

  void processQueue();
  void runHeartbeat();

  console.log(chalk.hex("#FF8C00").bold("\n🫀 SajiCode daemon running\n"));
  console.log(chalk.gray(`  heartbeat every ${Math.round(heartbeatIntervalMs / 60_000)}m`));
  console.log(chalk.gray(`  task poll every ${Math.round(taskPollIntervalMs / 1000)}s`));

  return {
    stop: async () => {
      stopped = true;
      for (const timer of timers) clearInterval(timer);
      if (serveHandle) await serveHandle.stop();
      await clearDaemonPid(projectPath);
    },
  };
}
