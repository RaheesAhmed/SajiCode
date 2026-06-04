import { appendTranscript } from "./three-layer-memory.js";

const MAX_TRANSCRIPT_THREAD_LENGTH = 80;

export interface SessionTranscriptRecorder {
  projectPath: string;
  transcriptFile: string;
  record(agent: string, action: string, context: string): Promise<void>;
}

export function getSessionTranscriptFileName(threadId: string): string {
  const safeThreadId = threadId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TRANSCRIPT_THREAD_LENGTH);

  return `session-${safeThreadId || "unknown"}.log`;
}

export function createSessionTranscriptRecorder(
  projectPath: string,
  threadId: string,
): SessionTranscriptRecorder {
  const transcriptFile = getSessionTranscriptFileName(threadId);

  return {
    projectPath,
    transcriptFile,
    async record(agent: string, action: string, context: string): Promise<void> {
      await appendTranscript(projectPath, transcriptFile, {
        timestamp: new Date().toISOString(),
        agent,
        action,
        context,
      });
    },
  };
}
