import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const DYNAMIC_PATTERNS_FILE = ".sajicode/patterns.json";

export interface Pattern {
  id: string;
  tech: string[];
  category: "pitfall" | "convention" | "performance" | "security";
  title: string;
  description: string;
  source: "static" | "learned";
  learnedFrom?: string;
  timestamp?: string;
}

export const STATIC_PATTERNS: Pattern[] = [
  {
    id: "prisma-nullish-coalescing",
    tech: ["prisma"],
    category: "pitfall",
    title: "Nullish Coalescing for Optional Fields",
    description:
      "Prisma v5 requires explicit nullish coalescing (??) for optional fields in where clauses",
    source: "static",
  },
  {
    id: "prisma-transaction",
    tech: ["prisma"],
    category: "convention",
    title: "Use $transaction for Multi-Table Writes",
    description:
      "$transaction required for multi-table writes to maintain atomicity",
    source: "static",
  },
  {
    id: "react-query-v5-callbacks",
    tech: ["react-query", "tanstack-query"],
    category: "pitfall",
    title: "onSuccess/onError Callbacks Removed in v5",
    description:
      "onSuccess/onError callbacks removed — use useEffect or mutation.isSuccess instead",
    source: "static",
  },
  {
    id: "fastapi-annotations-import",
    tech: ["fastapi", "python", "pydantic"],
    category: "pitfall",
    title: "Future Annotations Must Be First Line",
    description:
      "from __future__ import annotations must be first line for proper Pydantic v2 forward refs",
    source: "static",
  },
  {
    id: "nextjs-server-components-hooks",
    tech: ["nextjs", "next.js", "react"],
    category: "pitfall",
    title: "Server Components Cannot Use Hooks",
    description:
      "Server Components cannot use hooks — move state/effects to client components with 'use client'",
    source: "static",
  },
  {
    id: "nextjs-metadata-export",
    tech: ["nextjs", "next.js"],
    category: "convention",
    title: "Metadata Export Must Be in page.tsx",
    description:
      "App Router: metadata export must be in page.tsx, not layout.tsx for page-specific meta",
    source: "static",
  },
  {
    id: "stripe-idempotency-keys",
    tech: ["stripe"],
    category: "pitfall",
    title: "Webhook Handlers Need Idempotency Keys",
    description:
      "Webhook handlers need idempotency keys — check event.id before processing",
    source: "static",
  },
  {
    id: "stripe-webhook-signature",
    tech: ["stripe"],
    category: "security",
    title: "Always Verify Webhook Signature",
    description:
      "Always verify webhook signature with stripe.webhooks.constructEvent before processing",
    source: "static",
  },
  {
    id: "express-body-validation",
    tech: ["express", "expressjs"],
    category: "security",
    title: "Validate req.body Before Processing",
    description:
      "Never trust req.body without validation — use zod or joi schema before processing",
    source: "static",
  },
  {
    id: "typescript-avoid-any",
    tech: ["typescript"],
    category: "convention",
    title: "Avoid 'as any' Casts",
    description:
      "Avoid 'as any' — use unknown + type guards or proper generics instead",
    source: "static",
  },
  {
    id: "typescript-index-signatures",
    tech: ["typescript"],
    category: "pitfall",
    title: "Index Signatures Make All Properties Accept Undefined",
    description:
      "Index signatures [key: string]: T make all known properties accept undefined — use Record<K, T> instead",
    source: "static",
  },
  {
    id: "postgresql-parameterized-queries",
    tech: ["postgresql", "postgres", "pg", "sql"],
    category: "security",
    title: "Always Use Parameterized Queries",
    description:
      "Always use parameterized queries — never concatenate user input into SQL strings",
    source: "static",
  },
  {
    id: "docker-multi-stage-builds",
    tech: ["docker", "dockerfile"],
    category: "performance",
    title: "Use Multi-Stage Builds",
    description:
      "Multi-stage builds: install deps in build stage, copy only dist to production stage",
    source: "static",
  },
  {
    id: "env-never-commit",
    tech: ["env", "dotenv", "environment"],
    category: "security",
    title: "Never Commit .env Files",
    description:
      "Never commit .env — always provide .env.example with all required keys and descriptions",
    source: "static",
  },
  {
    id: "react-useeffect-async",
    tech: ["react"],
    category: "pitfall",
    title: "useEffect with Async Functions",
    description:
      "useEffect with async function: create inner async fn, call it, return cleanup — never make useEffect itself async",
    source: "static",
  },
  {
    id: "langchain-max-tokens-timeout",
    tech: ["langchain", "langchainjs", "langchain.js"],
    category: "performance",
    title: "Set max_tokens and Timeout on LLM Calls",
    description:
      "Always set max_tokens and timeout on LLM calls to prevent runaway costs",
    source: "static",
  },
  {
    id: "security-jwt-secret-length",
    tech: ["jwt", "jsonwebtoken", "security"],
    category: "security",
    title: "JWT Secrets Must Be >= 256 Bits",
    description:
      "JWT secrets must be >= 256 bits — short secrets are brute-forceable",
    source: "static",
  },
  {
    id: "cors-no-wildcard-production",
    tech: ["cors", "express", "fastapi", "nextjs"],
    category: "security",
    title: "Never Use Wildcard CORS in Production",
    description:
      "Never use wildcard CORS (*) in production — explicitly list allowed origins",
    source: "static",
  },
  {
    id: "bcrypt-cost-factor",
    tech: ["bcrypt", "security", "auth"],
    category: "security",
    title: "Use bcrypt Cost Factor >= 12 in Production",
    description:
      "Use bcrypt cost factor >= 12 in production — lower values are too fast to brute-force",
    source: "static",
  },
  {
    id: "ratelimit-before-auth",
    tech: ["express", "fastapi", "nextjs", "security", "ratelimit"],
    category: "security",
    title: "Apply Rate Limiting Before Auth Middleware",
    description:
      "Apply rate limiting before auth middleware — prevents auth endpoint enumeration",
    source: "static",
  },
];

async function loadDynamicPatterns(projectPath: string): Promise<Pattern[]> {
  const filePath = join(projectPath, DYNAMIC_PATTERNS_FILE);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as Pattern[];
    }
    return [];
  } catch {
    return [];
  }
}

async function saveDynamicPatterns(
  projectPath: string,
  patterns: Pattern[]
): Promise<void> {
  const filePath = join(projectPath, DYNAMIC_PATTERNS_FILE);
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, JSON.stringify(patterns, null, 2), "utf-8");
}

function patternMatchesTechStack(
  pattern: Pattern,
  techStack: string[]
): boolean {
  const lowerTechStack = techStack.map((t) => t.toLowerCase());
  return pattern.tech.some((pt) => {
    const lpt = pt.toLowerCase();
    return lowerTechStack.some(
      (st) => st.includes(lpt) || lpt.includes(st)
    );
  });
}

export async function getRelevantPatterns(
  projectPath: string,
  techStack: string[]
): Promise<Pattern[]> {
  const matchingStatic = STATIC_PATTERNS.filter((p) =>
    patternMatchesTechStack(p, techStack)
  );

  const dynamicPatterns = await loadDynamicPatterns(projectPath);
  const matchingDynamic = dynamicPatterns.filter((p) =>
    patternMatchesTechStack(p, techStack)
  );

  const combined: Pattern[] = [];
  const seenIds = new Set<string>();

  for (const p of [...matchingStatic, ...matchingDynamic]) {
    if (!seenIds.has(p.id)) {
      seenIds.add(p.id);
      combined.push(p);
    }
  }

  return combined.slice(0, 15);
}

export function formatPatternsForPrompt(patterns: Pattern[]): string {
  if (patterns.length === 0) {
    return "## Known Patterns & Pitfalls for This Stack\n\nNo specific patterns found for the current tech stack.";
  }

  const lines = patterns.map((p) => {
    const techLabel = p.tech.join(", ").toUpperCase();
    return `⚠️ [${techLabel}] ${p.title}: ${p.description}`;
  });

  return `## Known Patterns & Pitfalls for This Stack\n\n${lines.join("\n")}`;
}

function isSimilarTitle(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const wordsA = new Set(na.split(/\s+/).filter(Boolean));
  const wordsB = new Set(nb.split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const similarity = overlap / Math.max(wordsA.size, wordsB.size);
  return similarity >= 0.7;
}

export function createPatternTools(projectPath: string) {
  const getPatternsToolInstance = tool(
    async ({ techStack }: { techStack: string[] }) => {
      const patterns = await getRelevantPatterns(projectPath, techStack);
      return formatPatternsForPrompt(patterns);
    },
    {
      name: "get_patterns",
      description:
        "Retrieve known patterns, pitfalls, and conventions for a given tech stack. Used by PM and agents before planning or writing code.",
      schema: z.object({
        techStack: z
          .array(z.string())
          .describe(
            "List of technologies in use, e.g. ['nextjs', 'prisma', 'typescript']"
          ),
      }),
    }
  );

  const recordPatternToolInstance = tool(
    async ({
      tech,
      category,
      title,
      description,
      learnedFrom,
    }: {
      tech: string[];
      category: "pitfall" | "convention" | "performance" | "security";
      title: string;
      description: string;
      learnedFrom?: string;
    }) => {
      const existing = await loadDynamicPatterns(projectPath);

      const allPatterns = [...STATIC_PATTERNS, ...existing];
      const duplicate = allPatterns.find((p) => isSimilarTitle(p.title, title));
      if (duplicate) {
        return `Pattern not recorded — a similar pattern already exists: "${duplicate.title}" (id: ${duplicate.id})`;
      }

      const newPattern: Pattern = {
        id: `learned-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tech,
        category,
        title,
        description,
        source: "learned",
        learnedFrom,
        timestamp: new Date().toISOString(),
      };

      existing.push(newPattern);
      await saveDynamicPatterns(projectPath, existing);

      return `Pattern recorded successfully with id: ${newPattern.id} — "${newPattern.title}"`;
    },
    {
      name: "record_pattern",
      description:
        "Record a new learned pattern or pitfall to the project pattern library for future reference.",
      schema: z.object({
        tech: z
          .array(z.string())
          .describe(
            "Technologies this pattern applies to, e.g. ['prisma', 'postgresql']"
          ),
        category: z
          .enum(["pitfall", "convention", "performance", "security"])
          .describe("Category of the pattern"),
        title: z.string().describe("Short descriptive title for the pattern"),
        description: z
          .string()
          .describe("Full explanation of the pattern or pitfall"),
        learnedFrom: z
          .string()
          .optional()
          .describe("Optional: source or context where this pattern was learned"),
      }),
    }
  );

  return [getPatternsToolInstance, recordPatternToolInstance];
}
