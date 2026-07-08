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
  "riskTolerance",
  "humanInTheLoop",
  "whatsapp",
  "hooks",
]);

/** Shape of `.sajicode/config.json` on disk (uses `model`, not `modelConfig`). */
export const configFileSchema = z.object({
  model: modelConfigSchema.optional(),
  modelConfig: modelConfigSchema.optional(),
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
