const sessionWriteCounts = new Map<string, number>();

function sessionKey(projectPath: string, sessionId: string): string {
  return `${projectPath}::${sessionId}`;
}

export function getSessionFilesWritten(
  projectPath: string,
  sessionId: string,
): number {
  return sessionWriteCounts.get(sessionKey(projectPath, sessionId)) ?? 0;
}

export function incrementSessionFilesWritten(
  projectPath: string,
  sessionId: string,
  delta: number,
): number {
  const key = sessionKey(projectPath, sessionId);
  const next = (sessionWriteCounts.get(key) ?? 0) + delta;
  sessionWriteCounts.set(key, next);
  return next;
}

export function resetSessionTracker(
  projectPath?: string,
  sessionId?: string,
): void {
  if (!projectPath) {
    sessionWriteCounts.clear();
    return;
  }
  if (sessionId) {
    sessionWriteCounts.delete(sessionKey(projectPath, sessionId));
    return;
  }
  for (const key of sessionWriteCounts.keys()) {
    if (key.startsWith(`${projectPath}::`)) {
      sessionWriteCounts.delete(key);
    }
  }
}
