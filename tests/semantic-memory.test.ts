import { describe, it, expect } from "vitest";
import { embedTextLocally } from "../src/memory/embeddings.js";
import { cosineSimilarity } from "../src/memory/vector-store.js";

describe("semantic memory", () => {
  it("produces normalized local embeddings", () => {
    const vector = embedTextLocally("JWT refresh token rotation race condition");
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(vector.length).toBeGreaterThan(0);
    expect(norm).toBeCloseTo(1, 5);
  });

  it("scores similar text higher than unrelated text", () => {
    const query = embedTextLocally("JWT refresh token rotation");
    const related = embedTextLocally("token renewal race condition in auth middleware");
    const unrelated = embedTextLocally("docker compose kubernetes deployment yaml");

    expect(cosineSimilarity(query, related)).toBeGreaterThan(
      cosineSimilarity(query, unrelated),
    );
  });
});
