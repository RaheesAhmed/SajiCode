import fs from "node:fs/promises";
import path from "node:path";
import type { BackendDeployResult } from "./types.js";

export async function deployModalBackend(projectPath: string): Promise<BackendDeployResult> {
  const resolved = path.resolve(projectPath);
  const modalPy = `import modal

app = modal.App("sajicode-daemon")

image = modal.Image.debian_slim().pip_install("nodejs", "npm")

@app.function(
    image=image,
    timeout=86400,
    secrets=[modal.Secret.from_name("sajicode-env")],
)
def run_daemon():
    import subprocess
    subprocess.run(
        ["node", "dist/index.js", "daemon", "start", "-p", "/workspace", "--host", "0.0.0.0"],
        cwd="/workspace",
        check=True,
    )

# Deploy: modal deploy .sajicode/backends/modal_daemon.py
# Wake on demand via Modal web endpoint or scheduled cron.
`;

  const artifactPath = path.join(resolved, ".sajicode", "backends", "modal_daemon.py");
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, modalPy, "utf-8");

  return {
    backend: "modal",
    artifactPaths: [artifactPath],
    instructions: [
      "Modal serverless daemon (hibernates when idle):",
      "  pip install modal",
      "  modal secret create sajicode-env OPENAI_API_KEY=...",
      `  cd ${resolved}`,
      `  modal deploy ${artifactPath}`,
      "  Use Modal cron or webhooks to wake the daemon on demand.",
    ].join("\n"),
  };
}
