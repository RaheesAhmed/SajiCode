import type { ModelConfig } from "../types/index.js";

const EMBED_DIM = 128;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/** Local fallback embedding — no external API required. */
export function embedTextLocally(text: string): number[] {
  const vector = new Array<number>(EMBED_DIM).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    const index = hash % EMBED_DIM;
    vector[index] = (vector[index] ?? 0) + 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

export async function embedText(
  text: string,
  modelConfig?: ModelConfig,
): Promise<number[]> {
  const provider = modelConfig?.provider?.toLowerCase() ?? "ollama";
  const baseUrl = modelConfig?.baseUrl ?? "http://localhost:11434";
  const embedModel =
    process.env["SAJICODE_EMBED_MODEL"] ?? "nomic-embed-text";

  if (provider === "ollama") {
    try {
      const response = await fetch(`${baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: embedModel, prompt: text.slice(0, 8000) }),
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        const data = (await response.json()) as { embedding?: number[] };
        if (Array.isArray(data.embedding) && data.embedding.length > 0) {
          return data.embedding;
        }
      }
    } catch {
      // fall through to local embedding
    }
  }

  return embedTextLocally(text);
}

export function getEmbedDimension(): number {
  return EMBED_DIM;
}
