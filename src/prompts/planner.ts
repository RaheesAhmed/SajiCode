/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */


export function buildPlannerPrompt(task: string): string {
  return `You are the Planning Agent. Break down the following task into a clear, ordered milestone plan.

## Task
${task}

## Output Format
Produce a numbered list of milestones. Each milestone should have:
1. A clear, actionable title
2. A list of specific files to create/modify
3. Expected outcome

Be thorough but concise. Consider edge cases and testing.`;
}
