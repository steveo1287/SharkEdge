import { spawnSync } from "node:child_process";

const tests = [
  "tests/ufc-fight-iq.test.ts",
  "tests/ufc-fighter-skill-profile.test.ts",
  "tests/ufc-skill-markov-sim.test.ts",
  "tests/ufc-warehouse-ingestion.test.ts",
  "tests/ufc-operational-proof.test.ts",
  "tests/ufc-real-data-ingestion.test.ts",
  "tests/ufc-card-runner.test.ts",
  "tests/ufc-provider-adapters.test.ts",
  "tests/ufc-exchange-monte-carlo.test.ts",
  "tests/ufc-ensemble-sim.test.ts",
  "tests/ufcstats-parser.test.ts",
  "tests/ufcstats-normalizer.test.ts",
  "tests/ufcstats-fetcher.test.ts",
  "tests/ufcstats-hardening.test.ts",
  "tests/ufcstats-smoke-report.test.ts"
];

for (const test of tests) {
  console.log(`\n[UFC TEST] ${test}`);
  const result = spawnSync("npx", ["tsx", test], { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nUFC test suite passed");
