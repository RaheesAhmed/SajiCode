import { describe, it, expect, afterEach } from "vitest";
import { Client } from "@langchain/langgraph-sdk";
import {
  buildAsyncSubAgentSpecs,
  isAsyncSubagentsEnabled,
} from "../src/agents/async-subagents.js";
import {
  LocalAgentProtocolServer,
  stopAgentProtocolSession,
} from "../src/agents/local-agent-protocol.js";

describe("async subagents", () => {
  afterEach(async () => {
    await stopAgentProtocolSession();
  });

  it("isAsyncSubagentsEnabled defaults to true", () => {
    expect(isAsyncSubagentsEnabled(undefined)).toBe(true);
    expect(isAsyncSubagentsEnabled({})).toBe(true);
    expect(isAsyncSubagentsEnabled({ enabled: false })).toBe(false);
  });

  it("buildAsyncSubAgentSpecs maps leads to graphId specs", () => {
    const specs = buildAsyncSubAgentSpecs(
      [
        {
          name: "backend-lead",
          description: "Backend work",
          runnable: {} as any,
        },
      ],
      { url: "http://127.0.0.1:8123" },
    );

    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({
      name: "backend-lead",
      description: "Backend work",
      graphId: "backend-lead",
      url: "http://127.0.0.1:8123",
    });
  });

  it("local Agent Protocol server runs a registered graph", async () => {
    const server = new LocalAgentProtocolServer();
    server.registerGraph("echo-agent", {
      invoke: async (input: unknown) => ({
        messages: [
          {
            role: "assistant",
            content: `done: ${JSON.stringify(input)}`,
          },
        ],
      }),
    });

    const url = await server.start(0);
    const client = new Client({ apiUrl: url, apiKey: null });

    const thread = await client.threads.create();
    const run = await client.runs.create(thread.thread_id, "echo-agent", {
      input: {
        messages: [{ role: "user", content: "hello async" }],
      },
    });

    let status = "pending";
    for (let i = 0; i < 50 && status !== "success"; i++) {
      const current = await client.runs.get(thread.thread_id, run.run_id);
      status = current.status;
      if (status === "success" || status === "error" || status === "cancelled") {
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(status).toBe("success");

    const state = await client.threads.getState(thread.thread_id);
    const messages = (state.values as { messages?: Array<{ content?: string }> })?.messages ?? [];
    expect(messages.length).toBeGreaterThan(0);

    await server.stop();
  });
});
