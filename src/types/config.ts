export interface ModelConfig {
  provider: string;
  modelName: string;
  temperature?: number;
  maxRetries?: number;
  maxTokens?: number;
  baseUrl?: string;
  apiKey?: string;
}

export interface ModelRoutingConfig {
  planner?: string;
  leads?: string;
  cheap?: string;
  fallback?: string;
  fallbackProvider?: string;
  perAgent?: Record<string, string>;
  cheapAgents?: string[];
}

export interface BudgetConfig {
  perSession?: number;
  perTask?: number;
  action?: "warn" | "pause";
}

export interface SandboxConfig {
  mode?: "none" | "docker";
  image?: string;
  network?: "bridge" | "none";
}

export interface AsyncSubagentsConfig {
  /** Default true — uses embedded local Agent Protocol when url is omitted */
  enabled?: boolean;
  /** External LangGraph / Agent Protocol server URL (skip embedded server) */
  url?: string;
  /** Optional fixed port for embedded server (0 = ephemeral) */
  port?: number;
  headers?: Record<string, string>;
}

export interface ProjectConfig {
  projectPath: string;
  modelConfig: ModelConfig;
  modelRouting?: ModelRoutingConfig;
  budget?: BudgetConfig;
  sandbox?: SandboxConfig;
  asyncSubagents?: AsyncSubagentsConfig;
  riskTolerance: RiskTolerance;
  humanInTheLoop?: HumanInTheLoopConfig;
  whatsapp?: WhatsAppConfig;
  hooks?: HooksConfig;
}

export type ExperienceLevel = "beginner" | "intermediate" | "expert";

export interface OnboardingResult {
  experienceLevel: ExperienceLevel;
  projectDescription: string;
  projectType: string;
  features: string[];
  stackPreferences: StackPreferences;
}

export interface StackPreferences {
  framework?: string;
  database?: string;
  auth?: string;
  hosting?: string;
  styling?: string;
  testing?: string;
}

export type RiskTolerance = "low" | "medium" | "high";

export interface HumanInTheLoopToolConfig {
  allowedDecisions: Array<"approve" | "edit" | "reject">;
}

export interface HumanInTheLoopConfig {
  enabled: boolean;
  /** Per-tool interrupt config. true = all decisions allowed, false = no interrupt */
  tools: Record<string, boolean | HumanInTheLoopToolConfig>;
  /** Command prefixes that are automatically approved without asking the user */
  allowedCommands: string[];
}

export type WhatsAppMode = "admin" | "personal";

export interface WhatsAppConfig {
  enabled: boolean;
  mode: WhatsAppMode;
  personalBotPrompt?: string;
}

export interface HooksConfig {
  sessionStart?: import("../hooks/types.js").HookEventConfig;
  sessionEnd?: import("../hooks/types.js").HookEventConfig;
  preTask?: import("../hooks/types.js").HookEventConfig;
  postTask?: import("../hooks/types.js").HookEventConfig;
  onExit?: import("../hooks/types.js").HookEventConfig;
  preToolUse?: import("../hooks/types.js").HookEventConfig;
  postToolUse?: import("../hooks/types.js").HookEventConfig;
  preFileWrite?: import("../hooks/types.js").HookEventConfig;
  postFileWrite?: import("../hooks/types.js").HookEventConfig;
  preShell?: import("../hooks/types.js").HookEventConfig;
  preCommit?: import("../hooks/types.js").HookEventConfig;
  agentDispatch?: import("../hooks/types.js").HookEventConfig;
  agentComplete?: import("../hooks/types.js").HookEventConfig;
  buildResult?: import("../hooks/types.js").HookEventConfig;
  notification?: import("../hooks/types.js").HookEventConfig;
}

export enum AgentRole {
  PM = "pm-agent",
  Backend = "backend-lead",
  Frontend = "frontend-lead",
  FullStack = "fullstack-lead",
  Mobile = "mobile-lead",
  DataAI = "data-ai-lead",
  Platform = "platform-lead",
  Test = "qa-lead",
  Security = "security-lead",
  Review = "review-agent",
  Deploy = "deploy-lead",
}

export interface Milestone {
  id: number;
  title: string;
  description: string;
  assignedAgent: AgentRole;
  status: MilestoneStatus;
  acceptanceCriteria: string[];
}

export type MilestoneStatus = "pending" | "in_progress" | "completed" | "failed";

export enum RiskLevel {
  Safe = "safe",
  Caution = "caution",
  HighRisk = "high_risk",
  Critical = "critical",
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  reason: string;
  filesAffected: number;
  isReversible: boolean;
}

export const AGENT_ICONS: Record<AgentRole, string> = {
  [AgentRole.PM]:       "\x1b[38;2;255;106;0m●\x1b[0m",
  [AgentRole.Backend]:  "\x1b[36m●\x1b[0m",
  [AgentRole.Frontend]: "\x1b[35m●\x1b[0m",
  [AgentRole.FullStack]:"\x1b[38;2;0;200;200m●\x1b[0m",
  [AgentRole.Mobile]:   "\x1b[38;2;100;180;255m●\x1b[0m",
  [AgentRole.DataAI]:   "\x1b[38;2;180;100;255m●\x1b[0m",
  [AgentRole.Platform]: "\x1b[38;2;255;180;0m●\x1b[0m",
  [AgentRole.Test]:     "\x1b[33m●\x1b[0m",
  [AgentRole.Security]: "\x1b[31m●\x1b[0m",
  [AgentRole.Review]:   "\x1b[34m●\x1b[0m",
  [AgentRole.Deploy]:   "\x1b[32m●\x1b[0m",
};

export const AGENT_LABELS: Record<AgentRole, string> = {
  [AgentRole.PM]:       "PM Agent",
  [AgentRole.Backend]:  "Backend Lead",
  [AgentRole.Frontend]: "Frontend Lead",
  [AgentRole.FullStack]:"Full-Stack Lead",
  [AgentRole.Mobile]:   "Mobile Lead",
  [AgentRole.DataAI]:   "Data & AI Lead",
  [AgentRole.Platform]: "Platform Lead",
  [AgentRole.Test]:     "QA Lead",
  [AgentRole.Security]: "Security Lead",
  [AgentRole.Review]:   "Review Agent",
  [AgentRole.Deploy]:   "Deploy Lead",
};
