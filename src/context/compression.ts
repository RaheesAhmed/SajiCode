export interface CompressionOptions {
  /** Query or focus terms — lines matching these score higher. */
  query?: string;
  /** Approximate max output characters (~4 chars/token). */
  maxChars?: number;
  /** Only compress when input exceeds this size. */
  minChars?: number;
}

const STRUCTURAL_LINE =
  /^(import |export |class |function |interface |type |const |let |def |async |#|\/\/|\*\s|```|\{|\}|\]|\[)/;

/**
 * Query-aware line-level compression inspired by LongLLMLingua.
 * Keeps structural lines and query-relevant lines within a char budget.
 */
export function compressText(content: string, options: CompressionOptions = {}): string {
  const minChars = options.minChars ?? 8_000;
  const maxChars = options.maxChars ?? 12_000;

  if (content.length <= minChars) return content;

  const queryTerms = (options.query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const lines = content.split("\n");
  const scored = lines.map((line, index) => {
    let score = 0;
    const lower = line.toLowerCase();

    if (STRUCTURAL_LINE.test(line.trim())) score += 2;
    if (line.trim().length === 0) score -= 1;

    for (const term of queryTerms) {
      if (lower.includes(term)) score += 4;
    }

    if (index < 5 || index >= lines.length - 3) score += 1;

    return { line, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const kept = new Set<number>();
  let used = 0;

  for (const item of scored) {
    const lineCost = item.line.length + 1;
    if (used + lineCost > maxChars && kept.size > 20) continue;
    kept.add(item.index);
    used += lineCost;
  }

  const output = [...kept]
    .sort((a, b) => a - b)
    .map((i) => lines[i]!);

  const ratio = ((1 - output.join("\n").length / content.length) * 100).toFixed(0);
  return [
    `[compressed ${ratio}% — ${content.length} → ${output.join("\n").length} chars; query: ${options.query ?? "none"}]`,
    ...output,
  ].join("\n");
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface CompressionConfig {
  enabled?: boolean;
  /** Compress tool results above this char count. */
  minChars?: number;
  /** Target max chars after compression. */
  maxChars?: number;
  /** Tool names to compress (default: read_file, code_search, collect_repo_map). */
  tools?: string[];
}

export const DEFAULT_COMPRESS_TOOLS = new Set([
  "read_file",
  "read_file_chunk",
  "code_search",
  "collect_repo_map",
  "code_map",
]);

export function isCompressionEnabled(config?: CompressionConfig): boolean {
  return config?.enabled === true;
}

export function resolveCompressionOptions(
  config: CompressionConfig | undefined,
  toolName: string,
  query?: string,
): CompressionOptions | null {
  if (!isCompressionEnabled(config)) return null;
  const tools = config?.tools?.length ? new Set(config.tools) : DEFAULT_COMPRESS_TOOLS;
  if (!tools.has(toolName)) return null;

  return {
    query,
    minChars: config?.minChars ?? 8_000,
    maxChars: config?.maxChars ?? 12_000,
  };
}
