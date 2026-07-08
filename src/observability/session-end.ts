import { writeSessionReport } from "./session-report.js";
import { formatCostsReport } from "./usage-tracker.js";

export async function finalizeSession(
  projectPath: string,
  sessionId: string,
  threadId?: string,
): Promise<void> {
  try {
    const reportPath = await writeSessionReport({
      sessionId,
      projectPath,
      ...(threadId ? { threadId } : {}),
      summary: "Session ended — see audit log for full tool history.",
    });

    const costSummary = await formatCostsReport(projectPath, 1);
    if (!costSummary.includes("No usage recorded")) {
      console.log(`\n${costSummary}`);
    }

    console.log(`Session report: ${reportPath}`);
  } catch {
    // Non-fatal — session cleanup should not block exit
  }
}
