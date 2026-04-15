import assert from "node:assert/strict";

import {
  deriveOverallReadinessState,
  selectPreferredBoardProvider,
  type BoardProviderReadiness
} from "@/services/current-odds/provider-readiness-service";

function provider(overrides: Partial<BoardProviderReadiness>): BoardProviderReadiness {
  return {
    providerKey: "provider",
    label: "Provider",
    state: "READY",
    configured: true,
    checkedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    freshnessMinutes: 1,
    errors: [],
    warnings: [],
    providerMode: null,
    sportsCount: 4,
    gameCount: 24,
    sourceUrl: null,
    ...overrides
  };
}

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
  await run("backend wins tie on readiness selection", () => {
    const winner = selectPreferredBoardProvider([
      provider({ providerKey: "current-odds-backend", label: "Backend" }),
      provider({ providerKey: "therundown", label: "TheRundown" })
    ]);

    assert.equal(winner.providerKey, "current-odds-backend");
    assert.equal(winner.label, "Backend");
  });

  await run("stale provider loses to fresher provider", () => {
    const winner = selectPreferredBoardProvider([
      provider({ providerKey: "current-odds-backend", label: "Backend", freshnessMinutes: 21 }),
      provider({ providerKey: "therundown", label: "TheRundown", freshnessMinutes: 3 })
    ]);

    assert.equal(winner.providerKey, "therundown");
  });

  await run("overall readiness degrades on degraded feeds", () => {
    const state = deriveOverallReadinessState([
      { providerKey: "backend", label: "Backend", state: "READY", warnings: [] },
      { providerKey: "draftkings", label: "DraftKings", state: "DEGRADED", warnings: ["stale"] }
    ]);

    assert.equal(state, "DEGRADED");
  });

  await run("overall readiness errors when no provider path is healthy", () => {
    const state = deriveOverallReadinessState([
      { providerKey: "backend", label: "Backend", state: "ERROR", warnings: ["offline"] },
      { providerKey: "therundown", label: "TheRundown", state: "NOT_CONFIGURED", warnings: [] }
    ]);

    assert.equal(state, "ERROR");
  });

  console.log("All provider readiness tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
