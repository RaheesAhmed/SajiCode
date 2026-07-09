#!/usr/bin/env node

import { argvForCli, shouldRouteToCli } from "./cli/help-reference.js";

const cliArgs = argvForCli(process.argv.slice(2));

if (shouldRouteToCli(cliArgs)) {
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
