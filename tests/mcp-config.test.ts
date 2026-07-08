import { describe, it, expect } from "vitest";
import {
  interpolateEnvString,
  serverVisibleToAgent,
  toolPassesFilter,
} from "../src/mcp/config.js";

describe("mcp config", () => {
  it("interpolates environment variables in strings", () => {
    process.env["TEST_MCP_KEY"] = "secret-value";
    expect(interpolateEnvString("Bearer ${TEST_MCP_KEY}")).toBe("Bearer secret-value");
    delete process.env["TEST_MCP_KEY"];
  });

  it("scopes servers to listed agents", () => {
    const server = {
      name: "db",
      transport: "stdio" as const,
      enabled: true,
      disabled: false,
      agents: ["backend-lead"],
    };
    expect(serverVisibleToAgent(server, "backend-lead")).toBe(true);
    expect(serverVisibleToAgent(server, "frontend-lead")).toBe(false);
    expect(serverVisibleToAgent(server, "pm-agent")).toBe(false);
  });

  it("allows all agents when agents list is empty", () => {
    const server = {
      name: "all",
      transport: "stdio" as const,
      enabled: true,
      disabled: false,
    };
    expect(serverVisibleToAgent(server, "frontend-lead")).toBe(true);
  });

  it("applies tool deny filters", () => {
    expect(toolPassesFilter("drop_table", { deny: ["drop_table"] })).toBe(false);
    expect(toolPassesFilter("select_rows", { deny: ["drop_table"] })).toBe(true);
  });
});
