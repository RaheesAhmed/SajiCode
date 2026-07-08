import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { embedText } from "../memory/embeddings.js";
import { semanticSearch, upsertVector } from "../memory/vector-store.js";
import { queryExperiences } from "../memory/experience-replay.js";
import type { Experience } from "../memory/experience-replay.js";
import type { ModelConfig } from "../types/index.js";

export async function indexSingleExperience(
  projectPath: string,
  experience: Experience,
  modelConfig?: ModelConfig,
): Promise<void> {
  const text = [
    experience.description,
    experience.errorPattern ?? "",
    experience.resolution ?? "",
    ...experience.lessons,
    ...experience.tags,
  ].join(" ");

  const vector = await embedText(text, modelConfig);
  await upsertVector(projectPath, {
    id: `experience:${experience.id}`,
    source: "experience",
    text: text.slice(0, 2000),
    vector,
    metadata: {
      agent: experience.agent,
      outcome: experience.outcome,
      taskType: experience.taskType,
    },
  });
}

export async function indexExperienceEmbeddings(
  projectPath: string,
  modelConfig?: ModelConfig,
): Promise<number> {
  const experiences = await queryExperiences(projectPath, {});
  let count = 0;

  for (const exp of experiences.slice(-100)) {
    const text = [
      exp.description,
      exp.errorPattern ?? "",
      exp.resolution ?? "",
      ...exp.lessons,
      ...exp.tags,
    ].join(" ");

    const vector = await embedText(text, modelConfig);
    await upsertVector(projectPath, {
      id: `experience:${exp.id}`,
      source: "experience",
      text: text.slice(0, 2000),
      vector,
      metadata: {
        agent: exp.agent,
        outcome: exp.outcome,
        taskType: exp.taskType,
      },
    });
    count++;
  }

  return count;
}

export function createSemanticMemoryTools(
  projectPath: string,
  modelConfig?: ModelConfig,
) {
  const semanticRecallTool = tool(
    async (input: { query: string; k?: number; source?: string }) => {
      const queryVector = await embedText(input.query, modelConfig);
      const results = await semanticSearch(projectPath, queryVector, {
        k: input.k ?? 8,
        source: input.source as any,
      });

      if (results.length === 0) {
        // Fallback to keyword experience search
        const keywordMatches = await queryExperiences(projectPath, {
          tags: input.query.toLowerCase().split(/\s+/).filter(Boolean),
        });
        if (keywordMatches.length === 0) {
          return "No semantic matches found. Try rephrasing or record more experiences.";
        }
        return [
          "Keyword fallback matches:",
          ...keywordMatches.slice(0, 5).map(
            (e) => `- [${e.outcome}] ${e.description}\n  Lessons: ${e.lessons.join("; ")}`,
          ),
        ].join("\n");
      }

      return results
        .map(
          (r, i) =>
            `${i + 1}. [${r.source}] score=${r.score.toFixed(3)}\n${r.text.slice(0, 400)}`,
        )
        .join("\n\n");
    },
    {
      name: "semantic_recall",
      description:
        "Semantic search over past experiences, transcripts, and patterns. " +
        "Use BEFORE starting unfamiliar work: 'have we solved JWT refresh issues before?'",
      schema: z.object({
        query: z.string().describe("Natural language query"),
        k: z.number().int().min(1).max(20).optional().describe("Max results"),
        source: z
          .enum(["experience", "transcript", "pattern", "topic"])
          .optional()
          .describe("Filter by source type"),
      }),
    },
  );

  const indexMemoryTool = tool(
    async () => {
      const count = await indexExperienceEmbeddings(projectPath, modelConfig);
      return `Indexed ${count} experience record(s) for semantic recall.`;
    },
    {
      name: "index_semantic_memory",
      description: "Re-index experiences into the semantic vector store.",
      schema: z.object({}),
    },
  );

  return [semanticRecallTool, indexMemoryTool];
}
