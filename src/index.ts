#!/usr/bin/env node

const CLI_SUBCOMMANDS = new Set([
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
  "sbom",
]);

/** Strip Node/npm `--` separator so `node dist/index.js -- mcp list` works. */
function normalizeCliArgv(argv: string[]): string[] {
  const args = [...argv];
  while (args[0] === "--") {
    args.shift();
  }
  return args;
}

const cliArgs = normalizeCliArgv(process.argv.slice(2));
const subcommand = cliArgs[0];

if (subcommand && CLI_SUBCOMMANDS.has(subcommand)) {
  process.argv = [process.argv[0]!, process.argv[1]!, ...cliArgs];
  await import("./cli/index.js");
} else {
  const { runRepl } = await import("./repl.js");
  await runRepl().catch((error: Error) => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

export {};
