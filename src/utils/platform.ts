
export interface PlatformInfo {
  isWindows: boolean;
  platform: string;
  pathSep: string;
  shell: string;
}

export function getPlatformInfo(): PlatformInfo {
  const isWindows = process.platform === "win32";
  return {
    isWindows,
    platform: isWindows ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux",
    pathSep: isWindows ? "\\" : "/",
    shell: isWindows ? "cmd.exe" : "bash",
  };
}

export function getPlatformPrompt(projectPath: string): string {
  const info = getPlatformInfo();

  if (info.isWindows) {
    return `PLATFORM: Windows (cmd.exe — NOT PowerShell)
PROJECT ROOT: ${projectPath}

⚠️ SHELL IS cmd.exe — PowerShell commands DO NOT WORK.

WINDOWS cmd.exe COMMAND RULES — CRITICAL:
  FORBIDDEN (WILL FAIL)              → USE INSTEAD:
  mkdir -p dir1/dir2                 → mkdir dir1\\dir2 (auto-creates parents on Windows)
  rm -rf folder/                     → rmdir /s /q folder
  cat file.txt                       → type file.txt
  grep "pattern" file                → findstr "pattern" file
  ls / ls -la                        → dir
  head -n 10 file                    → (not available, use type file)
  touch file.txt                     → type nul > file.txt
  which cmd                          → where cmd
  export VAR=val                     → set VAR=val
  command1 && command2               → command1 && command2 (this works in cmd)
  Get-ChildItem                      → dir (this is cmd, NOT PowerShell)
  New-Item                           → mkdir (this is cmd, NOT PowerShell)
  Remove-Item                        → rmdir /s /q (this is cmd, NOT PowerShell)
  Select-String                      → findstr (this is cmd, NOT PowerShell)

  FOR SCAFFOLDING NEW PROJECTS:
  → Always create directory first: mkdir ${projectPath}\\project-name
  → Then cd into it and scaffold: cd ${projectPath}\\project-name && npx -y create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm
  → If directory has .sajicode folder, move it first: move .sajicode ..\\temp_sajicode && npx create-next-app ... && move ..\\temp_sajicode .sajicode

  PATH RULES:
  • Use backslash in commands: src\\routes\\tasks.ts
  • Use forward slash in code imports: "./routes/tasks"
  • NEVER prefix paths with /d/ or /c/ — use d:\\ or c:\\
  • All file paths must use project root: ${projectPath}\\src\\server.ts
  • NEVER delete files. Overwrite or instruct a sub-agent to fix.`;
  }

  return `PLATFORM: ${info.platform}
PROJECT ROOT: ${projectPath}

SHELL RULES:
  • Use forward slash paths: src/routes/tasks.ts
  • Standard Unix commands: ls, mkdir -p, cat, grep
  • NEVER delete files. If a file has errors, overwrite it or instruct a sub-agent to fix it.`;
}
