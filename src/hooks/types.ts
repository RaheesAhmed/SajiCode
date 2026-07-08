export type HookEventName =
  | "sessionStart"
  | "sessionEnd"
  | "preTask"
  | "postTask"
  | "preToolUse"
  | "postToolUse"
  | "preFileWrite"
  | "postFileWrite"
  | "preShell"
  | "preCommit"
  | "agentDispatch"
  | "agentComplete"
  | "buildResult"
  | "notification";

export interface HookMatcher {
  toolName?: string;
  argsPattern?: string;
  paths?: string[];
  status?: string;
  agentName?: string;
}

export interface HookDefinition {
  matcher?: HookMatcher;
  command: string;
  blocking?: boolean;
  timeout?: number;
}

/** Legacy string or v2 matcher-based hook config per event. */
export type HookEventConfig = string | HookDefinition | Array<string | HookDefinition>;

export interface HooksConfigV2 {
  sessionStart?: HookEventConfig;
  sessionEnd?: HookEventConfig;
  preTask?: HookEventConfig;
  postTask?: HookEventConfig;
  onExit?: HookEventConfig;
  preToolUse?: HookEventConfig;
  postToolUse?: HookEventConfig;
  preFileWrite?: HookEventConfig;
  postFileWrite?: HookEventConfig;
  preShell?: HookEventConfig;
  preCommit?: HookEventConfig;
  agentDispatch?: HookEventConfig;
  agentComplete?: HookEventConfig;
  buildResult?: HookEventConfig;
  notification?: HookEventConfig;
}

export interface HookPayload {
  projectPath?: string;
  sessionId?: string;
  task?: string;
  summary?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  agentName?: string;
  paths?: string[];
  command?: string;
  riskScore?: number;
  message?: string;
  files?: string[];
  status?: "pass" | "fail";
  errors?: string[];
  reason?: string;
}

export interface HookRunResult {
  allowed: boolean;
  denyReason?: string;
  warnings: string[];
}

export interface HookContext {
  projectPath: string;
  hooks: HooksConfigV2 | undefined;
  defaultAgentName?: string;
}
