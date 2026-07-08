import { z } from "zod";

export const policyConfigSchema = z.object({
  protectedPaths: z.array(z.string()).optional(),
  requireApproval: z.array(z.string()).optional(),
  forbiddenDependencies: z.array(z.string()).optional(),
  maxFilesPerSession: z.number().int().positive().optional(),
  secretsScan: z.enum(["off", "warn", "block"]).optional(),
});

export const policiesFileSchema = z.object({
  policies: policyConfigSchema.optional(),
});

export type PolicyConfig = z.infer<typeof policyConfigSchema>;

export function parsePolicyConfig(raw: unknown): PolicyConfig {
  return policyConfigSchema.parse(raw);
}

export function safeParsePoliciesFile(
  raw: unknown,
): { success: true; data: PolicyConfig } | { success: false; error: string } {
  const result = policiesFileSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data.policies ?? {} };
}
