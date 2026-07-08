export interface RegistryPluginEntry {
  name: string;
  version: string;
  description: string;
  npm?: string;
  repository?: string;
  tags?: string[];
}

/** Curated starter registry — extend via config `pluginRegistryUrl`. */
export const BUNDLED_PLUGIN_REGISTRY: RegistryPluginEntry[] = [
  {
    name: "sajicode-plugin-stripe",
    version: "1.0.0",
    description: "Stripe payments agent spec, skill, and webhook test tools",
    npm: "sajicode-plugin-stripe",
    tags: ["payments", "stripe", "backend"],
  },
  {
    name: "sajicode-plugin-supabase",
    version: "1.0.0",
    description: "Supabase MCP + migration helpers for fullstack projects",
    npm: "sajicode-plugin-supabase",
    tags: ["database", "supabase", "fullstack"],
  },
  {
    name: "sajicode-plugin-linear",
    version: "1.0.0",
    description: "Linear issue sync, standup enrichment, and PM context tools",
    npm: "sajicode-plugin-linear",
    tags: ["project-management", "linear"],
  },
];

export async function fetchPluginRegistry(
  registryUrl?: string,
): Promise<RegistryPluginEntry[]> {
  if (!registryUrl) return BUNDLED_PLUGIN_REGISTRY;

  try {
    const response = await fetch(registryUrl, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return BUNDLED_PLUGIN_REGISTRY;
    const body = (await response.json()) as { plugins?: RegistryPluginEntry[] };
    return body.plugins?.length ? body.plugins : BUNDLED_PLUGIN_REGISTRY;
  } catch {
    return BUNDLED_PLUGIN_REGISTRY;
  }
}

export function resolveRegistryEntry(
  entries: RegistryPluginEntry[],
  nameOrNpm: string,
): RegistryPluginEntry | undefined {
  const needle = nameOrNpm.trim().toLowerCase();
  return entries.find(
    (entry) =>
      entry.name.toLowerCase() === needle ||
      entry.npm?.toLowerCase() === needle,
  );
}

export function searchRegistry(
  entries: RegistryPluginEntry[],
  query: string,
): RegistryPluginEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;

  return entries.filter((entry) => {
    const haystack = [
      entry.name,
      entry.description,
      ...(entry.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function formatRegistryResults(entries: RegistryPluginEntry[]): string {
  if (entries.length === 0) return "No plugins matched your search.";

  return [
    "Plugin registry:",
    "",
    ...entries.map((e) => {
      const npmHint = e.npm ? `  npm: ${e.npm}` : "";
      return `- ${e.name}@${e.version} — ${e.description}${npmHint ? `\n${npmHint}` : ""}`;
    }),
    "",
    "Install: sajicode plugin install <name>",
  ].join("\n");
}
