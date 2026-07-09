export type A2aSkillId =
  | "sajicode_build"
  | "sajicode_audit"
  | "sajicode_guardian"
  | "sajicode_standup"
  | "sajicode_status";

export interface A2aSkill {
  id: A2aSkillId;
  name: string;
  description: string;
  tags: string[];
}

export interface A2aAgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  protocolVersion: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
  };
  skills: A2aSkill[];
  authentication: { schemes: string[] };
}

export type A2aTaskState = "submitted" | "working" | "completed" | "failed";

export interface A2aTaskMessage {
  role: "user" | "agent";
  parts: Array<{ type: "text"; text: string }>;
}

export interface A2aTask {
  id: string;
  skill: A2aSkillId;
  state: A2aTaskState;
  messages: A2aTaskMessage[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface A2aSendTaskRequest {
  skill: A2aSkillId;
  message: string;
  taskId?: string;
}

export interface A2aSendTaskResponse {
  task: A2aTask;
}
