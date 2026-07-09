import { z } from "zod";

const riskToleranceSchema = z.enum(["low", "medium", "high"]);

const modelConfigSchema = z.object({
  provider: z.string().min(1).optional(),
  modelName: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxRetries: z.number().int().min(0).optional(),
  maxTokens: z.number().int().positive().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
});

const humanInTheLoopToolSchema = z.union([
  z.boolean(),
  z.object({
    allowedDecisions: z.array(z.enum(["approve", "edit", "reject"])).min(1),
  }),
]);

const humanInTheLoopSchema = z.object({
  enabled: z.boolean().optional(),
  tools: z.record(humanInTheLoopToolSchema).optional(),
  allowedCommands: z.array(z.string()).optional(),
});

const whatsAppSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["admin", "personal"]).optional(),
  personalBotPrompt: z.string().optional(),
});

const hookMatcherSchema = z.object({
  toolName: z.string().optional(),
  argsPattern: z.string().optional(),
  paths: z.array(z.string()).optional(),
  status: z.string().optional(),
  agentName: z.string().optional(),
});

const hookDefinitionSchema = z.object({
  matcher: hookMatcherSchema.optional(),
  command: z.string(),
  blocking: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
});

const hookEventSchema = z.union([
  z.string(),
  hookDefinitionSchema,
  z.array(z.union([z.string(), hookDefinitionSchema])),
]);

const modelRoutingSchema = z.object({
  planner: z.string().optional(),
  leads: z.string().optional(),
  cheap: z.string().optional(),
  fallback: z.string().optional(),
  fallbackProvider: z.string().optional(),
  perAgent: z.record(z.string()).optional(),
  cheapAgents: z.array(z.string()).optional(),
});

const budgetSchema = z.object({
  perSession: z.number().positive().optional(),
  perTask: z.number().positive().optional(),
  action: z.enum(["warn", "pause"]).optional(),
});

const sandboxSchema = z.object({
  mode: z.enum(["none", "docker"]).optional(),
  image: z.string().optional(),
  network: z.enum(["bridge", "none"]).optional(),
});

const asyncSubagentsSchema = z.object({
  enabled: z.boolean().optional(),
  url: z.string().optional(),
  port: z.number().int().min(0).optional(),
  headers: z.record(z.string()).optional(),
});

const policyConfigSchema = z.object({
  protectedPaths: z.array(z.string()).optional(),
  requireApproval: z.array(z.string()).optional(),
  forbiddenDependencies: z.array(z.string()).optional(),
  maxFilesPerSession: z.number().int().positive().optional(),
  secretsScan: z.enum(["off", "warn", "block"]).optional(),
});

const vaultConfigSchema = z.object({
  enabled: z.boolean().optional(),
  wrapper: z.enum(["op", "doppler", "custom"]).optional(),
  commandPrefix: z.string().optional(),
});

const offlineConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.string().optional(),
  modelName: z.string().optional(),
  baseUrl: z.string().optional(),
});

const codeGraphConfigSchema = z.object({
  enabled: z.boolean().optional(),
});

const compressionConfigSchema = z.object({
  enabled: z.boolean().optional(),
  minChars: z.number().int().positive().optional(),
  maxChars: z.number().int().positive().optional(),
  tools: z.array(z.string()).optional(),
});

const daemonConfigSchema = z.object({
  heartbeatIntervalMs: z.number().int().positive().optional(),
  taskPollIntervalMs: z.number().int().positive().optional(),
  port: z.number().int().positive().optional(),
  backend: z.enum(["local", "docker", "modal", "daytona"]).optional(),
});

const browserConfigSchema = z.object({
  cdpUrl: z.string().optional(),
  allowedDomains: z.array(z.string()).optional(),
});

const a2aConfigSchema = z.object({
  enabled: z.boolean().optional(),
  publicUrl: z.string().url().optional(),
});

const guardianConfigSchema = z.object({
  enabled: z.boolean().optional(),
  tier3Auto: z.boolean().optional(),
  telemetrySources: z.array(z.string()).optional(),
});

const hooksSchema = z.object({
  sessionStart: hookEventSchema.optional(),
  sessionEnd: hookEventSchema.optional(),
  preTask: hookEventSchema.optional(),
  postTask: hookEventSchema.optional(),
  onExit: hookEventSchema.optional(),
  preToolUse: hookEventSchema.optional(),
  postToolUse: hookEventSchema.optional(),
  preFileWrite: hookEventSchema.optional(),
  postFileWrite: hookEventSchema.optional(),
  preShell: hookEventSchema.optional(),
  preCommit: hookEventSchema.optional(),
  agentDispatch: hookEventSchema.optional(),
  agentComplete: hookEventSchema.optional(),
  buildResult: hookEventSchema.optional(),
  notification: hookEventSchema.optional(),
});

const KNOWN_CONFIG_KEYS = new Set([
  "model",
  "modelConfig",
  "modelRouting",
  "budget",
  "sandbox",
  "asyncSubagents",
  "policies",
  "vault",
  "offline",
  "codeGraph",
  "compression",
  "daemon",
  "browser",
  "a2a",
  "guardian",
  "pluginRegistryUrl",
  "riskTolerance",
  "humanInTheLoop",
  "whatsapp",
  "hooks",
]);

/** Shape of `.sajicode/config.json` on disk (uses `model`, not `modelConfig`). */
export const configFileSchema = z.object({
  model: modelConfigSchema.optional(),
  modelConfig: modelConfigSchema.optional(),
  modelRouting: modelRoutingSchema.optional(),
  budget: budgetSchema.optional(),
  sandbox: sandboxSchema.optional(),
  asyncSubagents: asyncSubagentsSchema.optional(),
  policies: policyConfigSchema.optional(),
  vault: vaultConfigSchema.optional(),
  offline: offlineConfigSchema.optional(),
  codeGraph: codeGraphConfigSchema.optional(),
  compression: compressionConfigSchema.optional(),
  daemon: daemonConfigSchema.optional(),
  browser: browserConfigSchema.optional(),
  a2a: a2aConfigSchema.optional(),
  guardian: guardianConfigSchema.optional(),
  pluginRegistryUrl: z.string().url().optional(),
  riskTolerance: riskToleranceSchema.optional(),
  humanInTheLoop: humanInTheLoopSchema.optional(),
  whatsapp: whatsAppSchema.optional(),
  hooks: hooksSchema.optional(),
});

export function findUnknownConfigKeys(raw: Record<string, unknown>): string[] {
  return Object.keys(raw).filter((key) => !KNOWN_CONFIG_KEYS.has(key));
}

export type ConfigFileInput = z.infer<typeof configFileSchema>;

export function formatConfigValidationErrors(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `  • ${pathLabel}: ${issue.message}`;
  });
  return ["Invalid .sajicode/config.json:", ...lines].join("\n");
}

export function parseConfigFile(raw: unknown): ConfigFileInput {
  return configFileSchema.parse(raw);
}

export function safeParseConfigFile(
  raw: unknown,
): { success: true; data: ConfigFileInput } | { success: false; error: string } {
  const result = configFileSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: formatConfigValidationErrors(result.error) };
}
