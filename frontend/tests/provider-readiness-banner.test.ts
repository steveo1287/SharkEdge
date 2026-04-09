import assert from "node:assert/strict";

import { buildProviderReadinessView } from "@/services/current-odds/provider-readiness-service";

const view = buildProviderReadinessView({
  generatedAt: new Date().toISOString(),
  overallState: "READY",
  selectedBoardProvider: {
    providerKey: "current-odds-backend",
    label: "Current odds backend",
    score: 42,
    reason: "Backend board wins on freshness."
  },
  boardProviders: [
    {
      providerKey: "current-odds-backend",
      label: "Current odds backend",
      state: "READY",
      configured: true,
      checkedAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      freshnessMinutes: 1,
      errors: [],
      warnings: [],
      providerMode: "odds_api",
      sportsCount: 4,
      gameCount: 24,
      sourceUrl: "https://example.com/api/odds/board"
    },
    {
      providerKey: "therundown",
      label: "TheRundown",
      state: "NOT_CONFIGURED",
      configured: false,
      checkedAt: new Date().toISOString(),
      generatedAt: null,
      freshnessMinutes: null,
      errors: [],
      warnings: [],
      providerMode: "therundown",
      sportsCount: 0,
      gameCount: 0,
      sourceUrl: null
    }
  ],
  bookFeeds: [
    {
      providerKey: "draftkings",
      label: "DraftKings book feed",
      sportsbookKey: "draftkings",
      state: "READY",
      configured: true,
      checkedAt: new Date().toISOString(),
      warnings: [],
      reason: "Configured feed URL",
      sourceUrl: "https://example.com/dk",
      lastAttemptAt: null,
      lastSuccessAt: new Date().toISOString(),
      nextAllowedAt: null,
      consecutiveFailures: 0,
      leagues: ["MLB"]
    }
  ],
  warnings: [],
  notes: []
});

assert.equal(view.state, "HEALTHY");
assert.equal(view.liveBoardProvider, "Current odds backend");
assert.match(view.summary, /includes/i);
assert.match(view.safePathSummary, /No page-request scraping needed/i);
assert.deepEqual(view.booksOnBoard.slice(0, 2), ["draftkings", "fanduel"]);

console.log("provider-readiness-banner ok");
