import path from "node:path";
import { fileURLToPath } from "node:url";
import { runEvals } from "../src/evals/harness.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function main(): Promise<void> {
  const scenarioIdx = process.argv.indexOf("--scenario");
  const scenario = scenarioIdx >= 0 ? process.argv[scenarioIdx + 1] : undefined;

  const { allPassed, results } = await runEvals({ repoRoot, scenario });

  console.log(`Running ${results.length} eval scenario(s)...\n`);

  for (const result of results) {
    const icon = result.passed ? "✅" : "❌";
    console.log(`${icon} ${result.name}`);
    if (!result.passed) {
      for (const detail of result.details) {
        console.log(`   • ${detail}`);
      }
    }
  }

  console.log("");
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
