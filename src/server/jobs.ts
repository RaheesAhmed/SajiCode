export type DispatchJobStatus = "queued" | "running" | "completed" | "failed";

export interface DispatchJob {
  jobId: string;
  prompt: string;
  status: DispatchJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
}

const jobs = new Map<string, DispatchJob>();

export function createJob(jobId: string, prompt: string): DispatchJob {
  const job: DispatchJob = {
    jobId,
    prompt,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  jobs.set(jobId, job);
  return job;
}

export function getJob(jobId: string): DispatchJob | undefined {
  return jobs.get(jobId);
}

export function listJobs(limit = 20): DispatchJob[] {
  return Array.from(jobs.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function updateJob(
  jobId: string,
  patch: Partial<DispatchJob>,
): DispatchJob | undefined {
  const existing = jobs.get(jobId);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch };
  jobs.set(jobId, updated);
  return updated;
}

export function clearJobs(): void {
  jobs.clear();
}
