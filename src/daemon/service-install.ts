import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface ServiceInstallResult {
  platform: "linux" | "macos" | "windows" | "unknown";
  instructions: string;
  artifactPath?: string;
}

function nodePath(): string {
  return process.execPath;
}

function sajicodeEntry(): string {
  return path.join(path.dirname(nodePath()), "sajicode");
}

export async function generateServiceInstall(
  projectPath: string,
): Promise<ServiceInstallResult> {
  const resolved = path.resolve(projectPath);
  const platform = process.platform;

  if (platform === "linux") {
    const unit = `[Unit]
Description=SajiCode daemon for ${resolved}
After=network.target

[Service]
Type=simple
WorkingDirectory=${resolved}
ExecStart=${nodePath()} ${path.join(resolved, "node_modules", "sajicode", "dist", "index.js")} daemon start -p ${resolved}
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;
    const artifactPath = path.join(resolved, ".sajicode", "sajicode-daemon.service");
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, unit, "utf-8");

    return {
      platform: "linux",
      artifactPath,
      instructions: [
        "Linux systemd install:",
        `  sudo cp ${artifactPath} /etc/systemd/system/sajicode-daemon.service`,
        "  sudo systemctl daemon-reload",
        "  sudo systemctl enable sajicode-daemon",
        "  sudo systemctl start sajicode-daemon",
      ].join("\n"),
    };
  }

  if (platform === "darwin") {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sajicode.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath()}</string>
    <string>${path.join(resolved, "node_modules", "sajicode", "dist", "index.js")}</string>
    <string>daemon</string>
    <string>start</string>
    <string>-p</string>
    <string>${resolved}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${resolved}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>`;

    const artifactPath = path.join(resolved, ".sajicode", "com.sajicode.daemon.plist");
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, plist, "utf-8");

    return {
      platform: "macos",
      artifactPath,
      instructions: [
        "macOS LaunchAgent install:",
        `  cp ${artifactPath} ~/Library/LaunchAgents/com.sajicode.daemon.plist`,
        "  launchctl load ~/Library/LaunchAgents/com.sajicode.daemon.plist",
        "  launchctl start com.sajicode.daemon",
      ].join("\n"),
    };
  }

  if (platform === "win32") {
    const script = `@echo off
cd /d "${resolved}"
"${nodePath()}" "${path.join(resolved, "node_modules", "sajicode", "dist", "index.js")}" daemon start -p "${resolved}"
`;
    const artifactPath = path.join(resolved, ".sajicode", "start-daemon.cmd");
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, script, "utf-8");

    return {
      platform: "windows",
      artifactPath,
      instructions: [
        "Windows service (manual):",
        `  Run at login: ${artifactPath}`,
        "  Or create a Scheduled Task pointing to that script.",
        `  Node: ${nodePath()}`,
        `  Entry: ${sajicodeEntry()}`,
      ].join("\n"),
    };
  }

  return {
    platform: "unknown",
    instructions: `Unsupported platform ${os.platform()}. Run: sajicode daemon start -p ${resolved}`,
  };
}
