/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */

import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  projectPath: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => process.cwd(),
  }),
  userLevel: Annotation<"beginner" | "intermediate" | "expert">({
    reducer: (_prev, next) => next,
    default: () => "expert" as const,
  }),
  // Shared Team State
  milestones: Annotation<
    Array<{
      id: string;
      title: string;
      status: "pending" | "in_progress" | "completed" | "failed";
      assignee: "planner" | "backend" | "frontend" | "security" | "devops";
      requirements: string[];
    }>
  >({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  next_agent: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "planner",
  }),
});

export type AgentStateType = typeof AgentState.State;
