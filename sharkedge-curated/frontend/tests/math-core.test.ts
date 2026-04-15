import assert from "node:assert/strict";

import {
  americanToDecimalOdds,
  americanToImpliedProbability,
  calculateClvPct,
  calculateExpectedValuePct,
  calculateKellyFraction,
  noVigProbabilityFromAmericanPair
} from "@/lib/math";
import {
  buildCanonicalMarketFamilyKey,
  buildCanonicalMarketKey,
  createCanonicalMarket,
  describeCanonicalMarketMismatch
} from "@/lib/market/canonical";
import { buildFairPrice, buildEvResult } from "@/services/fair-price/fair-price-service";
import { buildMarketIntelligence } from "@/services/market-intelligence/market-intelligence-service";
import { buildNormalizedSnapshotsFromPriceSamples } from "@/services/odds-normalization/odds-snapshot-repository";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("odds conversion and no-vig math stay deterministic", () => {
  assert.equal(americanToDecimalOdds(-110), 1.9090909090909092);
  assert.equal(Number((americanToImpliedProbability(+150) ?? 0).toFixed(4)), 0.4);

  const noVig = noVigProbabilityFromAmericanPair(-110, -110);
  assert.ok(noVig);
  assert.equal(Number((noVig?.sideProbability ?? 0).toFixed(4)), 0.5);
});

run("canonical market keys distinguish line and period changes", () => {
  const base = {
    sport: "BASKETBALL" as const,
    league: "NBA" as const,
    eventId: "evt_1",
    providerEventId: "provider_evt_1",
    sportsbookKey: "draftkings",
    marketType: "player_points" as const,
    marketScope: "player" as const,
    period: "full_game" as const,
    side: "OVER",
    line: 27.5,
    outcomeType: "over" as const,
    participantTeamId: "team_lal",
    participantPlayerId: "player_lebron",
    capturedAt: "2026-04-01T12:00:00.000Z",
    isLive: false,
    source: "live",
    status: "active" as const
  };

  const marketA = createCanonicalMarket(base);
  const marketB = createCanonicalMarket({ ...base, line: 28.5 });
  const marketC = createCanonicalMarket({ ...base, period: "first_half" });

  assert.notEqual(buildCanonicalMarketFamilyKey(base), buildCanonicalMarketFamilyKey({ ...base, line: 28.5 }));
  assert.notEqual(marketA.canonicalMarketKey, buildCanonicalMarketKey({ ...base, period: "first_half" }));
  assert.deepEqual(describeCanonicalMarketMismatch(marketA, marketB), ["line"]);
  assert.ok(describeCanonicalMarketMismatch(marketA, marketC).includes("period"));
});

run("fair price and ev outputs stay explicit", () => {
  const fairPrice = buildFairPrice({
    method: "consensus_no_vig",
    sidePrices: [-105, -110],
    oppositePrices: [-115, -110],
    matchedPairCount: 2,
    staleCount: 0
  });

  assert.equal(fairPrice.pricingMethod, "consensus_no_vig");
  assert.ok((fairPrice.fairProb ?? 0) > 0.49 && (fairPrice.fairProb ?? 0) < 0.53);

  const ev = buildEvResult({
    offeredOddsAmerican: +105,
    fairPrice,
    marketIntelligence: {
      sourceCount: 2,
      bestPriceFlag: true,
      bestAvailableSportsbookKey: "draftkings",
      bestAvailableOddsAmerican: 105,
      consensusImpliedProbability: 0.5,
      consensusLine: null,
      snapshotAgeSeconds: 42,
      staleFlag: false,
      staleCount: 0,
      marketDisagreementScore: 0.03,
      openToCurrentDelta: 0,
      lineMovement: {
        openPrice: 100,
        currentPrice: 105,
        openLine: null,
        currentLine: null,
        priceDelta: 5,
        lineDelta: null,
        summary: "Moneyline moved +5 price."
      },
      notes: []
    }
  });

  assert.ok(ev);
  assert.ok((ev?.edgePct ?? 0) > 0);
  assert.ok((ev?.rankScore ?? 0) > 0);
});

run("normalized snapshots power market intelligence cleanly", () => {
  const snapshots = buildNormalizedSnapshotsFromPriceSamples(
    {
      sport: "BASKETBALL",
      league: "NBA",
      eventId: "evt_2",
      providerEventId: "evt_2",
      marketType: "spread",
      marketScope: "game",
      side: "team_home",
      line: -3.5,
      participantTeamId: "team_home",
      isLive: false,
      source: "mock",
      sourceName: "Seed test",
      sourceType: "mock"
    },
    [
      { bookKey: "draftkings", bookName: "DraftKings", price: -108, line: -3.5, updatedAt: "2026-04-01T12:00:00.000Z" },
      { bookKey: "fanduel", bookName: "FanDuel", price: -105, line: -3.5, updatedAt: "2026-04-01T12:01:00.000Z" }
    ]
  );

  const intelligence = buildMarketIntelligence({
    marketLabel: "Spread",
    sideSnapshots: snapshots,
    offeredSportsbookKey: "fanduel"
  });

  assert.equal(intelligence.bestPriceFlag, true);
  assert.equal(intelligence.sourceCount, 2);
  assert.equal(intelligence.bestAvailableOddsAmerican, -105);
});

run("clv and kelly stay numerically sane", () => {
  assert.equal(calculateClvPct({ betOddsAmerican: -110, closingOddsAmerican: -125 }), 3.1746);
  assert.ok((calculateExpectedValuePct({ oddsAmerican: +110, fairProbability: 0.52 }) ?? 0) > 0);
  assert.ok((calculateKellyFraction({ oddsAmerican: +110, fairProbability: 0.52, fraction: 0.25 }) ?? 0) > 0);
});

console.log("All SharkEdge math tests passed.");
