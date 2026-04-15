import assert from "node:assert/strict";

import { buildProviderHealth } from "@/services/providers/provider-health";

async function run(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main() {
  await run("healthy live feed stays healthy when fresh", () => {
    const health = buildProviderHealth({
      supportStatus: "LIVE",
      source: "live",
      generatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      healthySummary: "Healthy",
      fallbackSummary: "Fallback",
      offlineSummary: "Offline"
    });

    assert.equal(health.state, "HEALTHY");
    assert.equal(health.freshnessLabel, "Fresh");
    assert.equal(health.warnings.length, 0);
  });

  await run("stale live feed becomes degraded with a warning", () => {
    const health = buildProviderHealth({
      supportStatus: "LIVE",
      source: "live",
      generatedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      healthySummary: "Healthy",
      degradedSummary: "Degraded",
      fallbackSummary: "Fallback",
      offlineSummary: "Offline"
    });

    assert.equal(health.state, "DEGRADED");
    assert.equal(health.freshnessLabel, "Stale");
    assert.ok(
      health.warnings.some((warning) => warning.includes("stale")),
      "expected a stale timestamp warning"
    );
  });

  await run("catalog source resolves to fallback mode", () => {
    const health = buildProviderHealth({
      source: "catalog",
      healthySummary: "Healthy",
      fallbackSummary: "Fallback",
      offlineSummary: "Offline"
    });

    assert.equal(health.state, "FALLBACK");
    assert.equal(health.label, "Fallback mode");
  });

  console.log("All provider health tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
