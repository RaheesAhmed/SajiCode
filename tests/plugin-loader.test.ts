import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { installPluginFromPath, discoverPlugins } from "../src/plugins/loader.js";

describe("plugin loader", () => {
  let tmpProject = "";
  const fixturePath = path.resolve("tests/fixtures/demo-plugin");

  beforeAll(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), "sajicode-plugin-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it("installs and discovers a plugin in the project layer", async () => {
    const dest = await installPluginFromPath(fixturePath, "project", tmpProject);
    expect(dest).toContain("demo-plugin");

    const plugins = await discoverPlugins(tmpProject);
    expect(plugins.some((p) => p.manifest.name === "demo-plugin")).toBe(true);
  });
});
