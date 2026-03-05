import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  recordExperience,
  queryExperiences,
  formatExperiencesForPrompt,
} from "../memory/experience-replay.js";

export function createExperienceTools(projectPath: string) {
  const recordTool = tool(
    async (input: {
      taskType: string;
      techStack: string[];
      agent: string;
      outcome: "success" | "failure" | "partial";
      description: string;
      errorPattern?: string;
      resolution?: string;
      lessons: string[];
      tags: string[];
    }) => {
      const record: Parameters<typeof recordExperience>[1] = {
        taskType: input.taskType,
        techStack: input.techStack,
        agent: input.agent,
        outcome: input.outcome,
        description: input.description,
        lessons: input.lessons,
        tags: input.tags,
      };
      if (input.errorPattern) record.errorPattern = input.errorPattern;
      if (input.resolution) record.resolution = input.resolution;
      const id = await recordExperience(projectPath, record);
      return `Experience recorded: ${id} (${input.outcome})`;
    },
    {
      name: "record_experience",
      description:
        "Record a learning experience after completing or failing a task. " +
        "This builds institutional knowledge — future tasks will benefit from these lessons. " +
        "ALWAYS record: (1) errors you encountered + how you fixed them, " +
        "(2) approaches that worked well, (3) package/version quirks.",
      schema: z.object({
        taskType: z.string().describe("Type of task (e.g. 'create-react-component', 'setup-api', 'install-deps')"),
        techStack: z.array(z.string()).describe("Technologies involved (e.g. ['react', '@xyflow/react', 'zustand'])"),
        agent: z.string().describe("Your agent name"),
        outcome: z.enum(["success", "failure", "partial"]),
        description: z.string().describe("What was attempted"),
        errorPattern: z.string().optional().describe("Normalized error pattern if failure (e.g. 'TS2305: no exported member')"),
        resolution: z.string().optional().describe("How the error was fixed"),
        lessons: z.array(z.string()).describe("Key takeaways for future tasks"),
        tags: z.array(z.string()).describe("Search tags (e.g. ['typescript', 'import-error', 'xyflow'])"),
      }),
    }
  );

  const queryTool = tool(
    async (input: {
      techStack?: string[];
      taskType?: string;
      outcome?: "success" | "failure" | "partial";
      tags?: string[];
    }) => {
      const filters: Parameters<typeof queryExperiences>[1] = {};
      if (input.techStack) filters.techStack = input.techStack;
      if (input.taskType) filters.taskType = input.taskType;
      if (input.outcome) filters.outcome = input.outcome;
      if (input.tags) filters.tags = input.tags;
      const experiences = await queryExperiences(projectPath, filters);

      if (experiences.length === 0) {
        return "No relevant past experiences found.";
      }

      return formatExperiencesForPrompt(experiences);
    },
    {
      name: "query_experiences",
      description:
        "Search past experiences for relevant lessons BEFORE starting a task. " +
        "Query by tech stack, task type, or tags to find previous errors and solutions. " +
        "Include matching experiences in your task() delegations as PAST_EXPERIENCES.",
      schema: z.object({
        techStack: z.array(z.string()).optional().describe("Filter by technologies"),
        taskType: z.string().optional().describe("Filter by task type"),
        outcome: z.enum(["success", "failure", "partial"]).optional().describe("Filter by outcome"),
        tags: z.array(z.string()).optional().describe("Filter by tags"),
      }),
    }
  );

  return [recordTool, queryTool];
}
