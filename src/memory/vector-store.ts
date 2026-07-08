import fs from "node:fs/promises";
import path from "node:path";

export interface VectorRecord {
  id: string;
  source: "experience" | "transcript" | "pattern" | "topic";
  text: string;
  vector: number[];
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface VectorStoreData {
  version: 1;
  records: VectorRecord[];
}

const VECTORS_FILE = ".sajicode/vectors.json";

export async function loadVectorStore(projectPath: string): Promise<VectorStoreData> {
  const filePath = path.join(projectPath, VECTORS_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as VectorStoreData;
  } catch {
    return { version: 1, records: [] };
  }
}

export async function saveVectorStore(
  projectPath: string,
  store: VectorStoreData,
): Promise<void> {
  const filePath = path.join(projectPath, VECTORS_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  if (store.records.length > 2000) {
    store.records = store.records.slice(-2000);
  }

  await fs.writeFile(filePath, JSON.stringify(store), "utf-8");
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function upsertVector(
  projectPath: string,
  record: Omit<VectorRecord, "timestamp"> & { timestamp?: string },
): Promise<void> {
  const store = await loadVectorStore(projectPath);
  const existingIndex = store.records.findIndex((r) => r.id === record.id);

  const entry: VectorRecord = {
    ...record,
    timestamp: record.timestamp ?? new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    store.records[existingIndex] = entry;
  } else {
    store.records.push(entry);
  }

  await saveVectorStore(projectPath, store);
}

export async function semanticSearch(
  projectPath: string,
  queryVector: number[],
  options: { k?: number; source?: VectorRecord["source"] } = {},
): Promise<Array<VectorRecord & { score: number }>> {
  const store = await loadVectorStore(projectPath);
  const k = options.k ?? 8;

  const scored = store.records
    .filter((r) => !options.source || r.source === options.source)
    .map((record) => ({
      ...record,
      score: cosineSimilarity(queryVector, record.vector),
    }))
    .filter((r) => r.score > 0.05)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, k);
}
