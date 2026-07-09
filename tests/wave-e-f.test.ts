import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildAgentCard, SAJICODE_A2A_SKILLS } from "../src/a2a/agent-card.js";
import { skillToPrompt, isAsyncCapability } from "../src/server/capabilities.js";
import {
  resolveDaemonBackend,
  deployDaemonBackend,
} from "../src/daemon/backends/index.js";
import {
  listBusinessMcpTemplates,
  applyBusinessMcpTemplate,
} from "../src/persona/business-mcp.js";
import { listPersonaPacks } from "../src/persona/index.js";
import { getActionTier, buildAction, formatTierPlan } from "../src/guardian/tiers.js";
import {
  defaultConsensusPositions,
  evaluateContainmentConsensus,
} from "../src/guardian/consensus.js";
import {
  openIncident,
  loadIncidentGraph,
  predictIncidentRisk,
} from "../src/guardian/incident-graph.js";
import { runGuardianCycle } from "../src/guardian/orchestrator.js";
import { getDefaultConfig } from "../src/config/index.js";

describe("A2A agent card", () => {
  it("builds agent card with sajicode skills", () => {
    const card = buildAgentCard("http://127.0.0.1:3920");
    expect(card.name).toBe("SajiCode");
    expect(card.skills.length).toBe(SAJICODE_A2A_SKILLS.length);
    expect(card.url).toBe("http://127.0.0.1:3920");
  });

  it("maps skills to prompts", () => {
    expect(isAsyncCapability("sajicode_build")).toBe(true);
    expect(isAsyncCapability("sajicode_status")).toBe(false);
    const audit = skillToPrompt("sajicode_audit", "check auth");
    expect(audit.onboarding.projectType).toBe("audit");
    expect(audit.prompt).toContain("auth");
  });
});

describe("daemon backends", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-backend-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("resolves backend from config", () => {
    const config = getDefaultConfig(tmpDir);
    expect(resolveDaemonBackend(config)).toBe("local");
    expect(resolveDaemonBackend({ ...config, daemon: { backend: "modal" } })).toBe("modal");
  });

  it("generates modal deploy artifact", async () => {
    const result = await deployDaemonBackend(tmpDir, "modal");
    expect(result.artifactPaths[0]).toContain("modal_daemon.py");
    const content = await fs.readFile(result.artifactPaths[0]!, "utf-8");
    expect(content).toContain("modal.App");
  });

  it("generates daytona deploy artifact", async () => {
    const result = await deployDaemonBackend(tmpDir, "daytona");
    expect(result.artifactPaths[0]).toContain("daytona.json");
  });
});

describe("business personas and MCP templates", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-biz-"));
    await fs.mkdir(path.join(tmpDir, ".sajicode"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("lists business MCP templates", () => {
    const templates = listBusinessMcpTemplates();
    expect(templates.some((t) => t.id === "store-retail")).toBe(true);
  });

  it("includes security-officer persona", async () => {
    const packs = await listPersonaPacks(tmpDir);
    expect(packs.some((p) => p.id === "security-officer")).toBe(true);
  });

  it("writes MCP config from template", async () => {
    const result = await applyBusinessMcpTemplate(tmpDir, "business-ops");
    expect(result.saved.length).toBeGreaterThan(0);
    const mcpRaw = await fs.readFile(path.join(tmpDir, ".sajicode", "mcp.json"), "utf-8");
    expect(mcpRaw).toContain("sheets");
  });
});

describe("Guardian swarm", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-guardian-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("assigns response tiers", () => {
    expect(getActionTier("investigate")).toBe(1);
    expect(getActionTier("rate_limit_ip")).toBe(2);
    expect(getActionTier("isolate_host")).toBe(3);
    const plan = formatTierPlan([
      buildAction("alert", "Notify on-call"),
      buildAction("rollback_deploy", "Revert bad deploy"),
    ]);
    expect(plan).toContain("Tier 1");
    expect(plan).toContain("Tier 2");
  });

  it("gates tier 2 actions with consensus", () => {
    const action = buildAction("rotate_key", "Rotate leaked API key");
    const positions = defaultConsensusPositions(action);
    const decision = evaluateContainmentConsensus(action, positions);
    expect(decision.consensusRequired).toBe(true);
    expect(decision.tier).toBe(2);
  });

  it("runs guardian cycle and opens incidents", async () => {
    const config = getDefaultConfig(tmpDir);
    const result = await runGuardianCycle(tmpDir, config, [
      { source: "test", message: "critical: failed login spike from 10.0.0.5", severity: "critical" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.incidents.length).toBe(1);
    const graph = await loadIncidentGraph(tmpDir);
    expect(graph.incidents.length).toBe(1);
  });

  it("predicts risk from incident history", async () => {
    await openIncident(tmpDir, {
      title: "Past auth brute force",
      summary: "failed login spike",
      severity: "high",
      telemetryIds: ["tel-1"],
    });

    const graph = await loadIncidentGraph(tmpDir);
    const prediction = predictIncidentRisk(graph, [
      {
        id: "tel-2",
        source: "test",
        severity: "warning",
        message: "failed login attempts increased",
        timestamp: new Date().toISOString(),
      },
    ]);
    expect(["medium", "high"]).toContain(prediction.risk);
  });
});
