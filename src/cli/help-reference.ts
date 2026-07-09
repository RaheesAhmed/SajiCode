import chalk from "chalk";

/** Top-level CLI subcommands — keep in sync with src/cli/index.ts. */
export const CLI_SUBCOMMAND_NAMES = [
  "build",
  "init",
  "status",
  "config",
  "audit",
  "undo",
  "snapshots",
  "standup",
  "revert",
  "resume",
  "config-doctor",
  "skill",
  "mcp",
  "plugin",
  "costs",
  "fix-ci",
  "serve",
  "daemon",
  "task",
  "persona",
  "sbom",
  "eval",
  "guardian",
] as const;

export const CLI_SUBCOMMANDS = new Set<string>(CLI_SUBCOMMAND_NAMES);

const CLI_HELP_FLAGS = new Set(["-h", "--help", "-V", "--version"]);

export interface CliCommandEntry {
  name: string;
  description: string;
  subcommands?: string[];
}

export const CLI_COMMAND_REFERENCE: CliCommandEntry[] = [
  { name: "build", description: "Start the full agent team on a task" },
  { name: "init", description: "Initialize SajiCode in the current directory" },
  { name: "status", description: "Show team status and active milestones" },
  { name: "config", description: "Set API keys, model, and preferences" },
  { name: "config-doctor", description: "Validate .sajicode/config.json" },
  { name: "audit", description: "Run the Security Agent on the codebase" },
  { name: "undo", description: "Undo the last file change made by an agent" },
  { name: "snapshots", description: "List recent file snapshots from agents" },
  { name: "standup", description: "Daily briefing: commits, unfinished work, next steps" },
  { name: "revert", description: "Revert all agent changes in the current session" },
  { name: "resume", description: "Resume the last session from a LangGraph checkpoint" },
  { name: "fix-ci", description: "Fetch failed CI log and run headless fix" },
  { name: "serve", description: "Long-running team server (HTTP + channels)" },
  {
    name: "daemon",
    description: "Always-on daemon (serve + task queue + heartbeat)",
    subcommands: ["start", "stop", "status", "deploy", "install"],
  },
  {
    name: "task",
    description: "Durable cross-session task queue",
    subcommands: ["add", "list", "cancel"],
  },
  {
    name: "mcp",
    description: "Manage MCP servers (.sajicode/mcp.json)",
    subcommands: ["list", "add", "test", "auth"],
  },
  {
    name: "plugin",
    description: "Manage SajiCode plugins",
    subcommands: ["list", "add", "install", "search", "remove"],
  },
  {
    name: "skill",
    description: "Manage agent skills",
    subcommands: ["list", "new", "add", "lint"],
  },
  {
    name: "persona",
    description: "Manage PM persona (SOUL.md-style identity)",
    subcommands: ["list", "set", "business-mcp"],
  },
  {
    name: "guardian",
    description: "Guardian Swarm — defensive SOC scan + incidents",
    subcommands: ["scan", "incidents"],
  },
  { name: "eval", description: "Run eval harness scenarios" },
  { name: "sbom", description: "Generate CycloneDX SBOM" },
  { name: "costs", description: "Show estimated API usage costs" },
];

/** Strip Node/npm `--` separator so `node dist/index.js -- mcp list` works. */
export function normalizeCliArgv(argv: string[]): string[] {
  const args = [...argv];
  while (args[0] === "--") {
    args.shift();
  }
  return args;
}

export function shouldRouteToCli(argv: string[]): boolean {
  if (argv.length === 0) return false;
  if (argv.some((arg) => CLI_HELP_FLAGS.has(arg))) return true;
  const subcommand = argv[0];
  if (subcommand === "help") return true;
  return CLI_SUBCOMMANDS.has(subcommand!);
}

/** Map bare `help` to Commander's `--help`. */
export function argvForCli(rawArgv: string[]): string[] {
  const args = normalizeCliArgv(rawArgv);
  if (args[0] === "help" && !args.some((arg) => CLI_HELP_FLAGS.has(arg))) {
    return ["--help", ...args.slice(1)];
  }
  return args;
}

export function printCliCommandsReference(): void {
  const dim = chalk.hex("#555555");
  const label = chalk.hex("#FF9500");
  const desc = chalk.hex("#888888");
  const sub = chalk.hex("#666666");

  console.log("");
  console.log(dim("  ─── CLI commands (run from shell, not in REPL) ─"));
  console.log(dim("  sajicode <command>   or   node dist/index.js <command>"));
  console.log("");

  for (const cmd of CLI_COMMAND_REFERENCE) {
    const nameCol = label(cmd.name.padEnd(14));
    const subHint = cmd.subcommands?.length
      ? sub(`  ${cmd.subcommands.join(" | ")}`)
      : "";
    console.log(`  ${nameCol}${subHint}`);
    console.log(`  ${"".padEnd(16)}${desc(cmd.description)}`);
  }

  console.log(dim("  ──────────────────────────────────────────"));
  console.log(dim("  Full options: exit REPL → sajicode --help  or  sajicode <cmd> --help"));
  console.log("");
}
