import { z } from "zod";

export const pluginManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  capabilities: z
    .array(z.enum(["agents", "skills", "tools", "mcp", "hooks"]))
    .default([]),
  permissions: z
    .object({
      network: z.array(z.string()).optional(),
      shell: z.boolean().optional(),
      filesystem: z.enum(["project-only", "read-only", "none"]).optional(),
    })
    .optional(),
  sajicodeVersion: z.string().optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export function parsePluginManifest(raw: unknown): PluginManifest {
  return pluginManifestSchema.parse(raw);
}

export function safeParsePluginManifest(
  raw: unknown,
): { success: true; data: PluginManifest } | { success: false; error: string } {
  const result = pluginManifestSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const lines = result.error.issues.map(
    (i) => `${i.path.join(".")}: ${i.message}`,
  );
  return { success: false, error: lines.join("; ") };
}
