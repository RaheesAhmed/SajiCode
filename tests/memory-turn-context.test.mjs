import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const memory = await import("../dist/memory/three-layer-memory.js");
const turnContext = await import("../dist/memory/turn-context.js");

test("buildMemoryTurnContext loads relevant updated topics and transcript matches", async () => {
  const projectPath = await mkdtemp(path.join(tmpdir(), "sajicode-memory-"));
  try {
    await memory.initThreeLayerMemory(projectPath);
    const created = await memory.createMemoryTopic(
      projectPath,
      "Database Setup",
      "Use postgres with Prisma migrations. Do not use sqlite for production.",
      "Production database decisions and migration rules",
      ["transcripts/session-memory.log"],
    );
    assert.equal(created.success, true);

    await memory.appendTranscript(projectPath, "session-memory.log", {
      timestamp: "2026-06-05T00:00:00.000Z",
      agent: "pm-agent",
      action: "decision",
      context: "Database Setup uses postgres with Prisma migrations",
    });

    const context = await turnContext.buildMemoryTurnContext(
      projectPath,
      "continue the database setup and migration work",
    );

    assert.match(context, /MEMORY CONTEXT/);
    assert.match(context, /Database Setup/);
    assert.match(context, /Use postgres with Prisma migrations/);
    assert.match(context, /Transcript Matches/);
    assert.match(context, /session-memory\.log/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test("augmentInputWithMemoryContext injects current memory without mutating the original input", async () => {
  const projectPath = await mkdtemp(path.join(tmpdir(), "sajicode-memory-"));
  try {
    await memory.initThreeLayerMemory(projectPath);
    await memory.createMemoryTopic(
      projectPath,
      "Auth Rules",
      "Use OAuth device flow for CLI auth and store tokens in the OS keychain.",
      "CLI authentication decisions",
    );

    const input = {
      messages: [{ role: "user", content: "implement cli auth rules" }],
    };

    const augmented = await turnContext.augmentInputWithMemoryContext(projectPath, input);

    assert.notEqual(augmented, input);
    assert.equal(input.messages[0].content, "implement cli auth rules");
    assert.match(augmented.messages[0].content, /Relevant Topic Details/);
    assert.match(augmented.messages[0].content, /OAuth device flow/);

    const index = await readFile(
      path.join(projectPath, ".sajicode", "memories", "index", "pointer-index.md"),
      "utf-8",
    );
    assert.match(index, /Auth Rules/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test("grepTranscripts searches transcript content without shell grep", async () => {
  const projectPath = await mkdtemp(path.join(tmpdir(), "sajicode-memory-"));
  try {
    await memory.initThreeLayerMemory(projectPath);
    await writeFile(
      path.join(projectPath, ".sajicode", "memories", "transcripts", "manual.log"),
      "first line\nsecond line has WindowsSafeNeedle\n",
      "utf-8",
    );

    const results = await memory.grepTranscripts(projectPath, "WindowsSafeNeedle");

    assert.equal(results.length, 1);
    assert.match(results[0], /manual\.log:2:second line/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});
