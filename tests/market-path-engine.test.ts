import { buildNormalizedSnapshotsFromPriceSamples } from "@/services/odds-normalization/odds-snapshot-repository";
import { buildMarketPath } from "@/services/market/market-path-service";
import { createOpportunityMarketPathResolver } from "@/services/opportunities/opportunity-market-path";
import { buildOpportunityScore } from "@/services/opportunities/opportunity-scoring";
import { buildOpportunityTiming } from "@/services/opportunities/opportunity-timing";
import type { TruthCalibrationSummaryRow } from "@/services/opportunities/opportunity-clv-service";
import type { MarketPathView } from "@/lib/types/domain";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function isoMinutesAgo(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function makeSummaryRow(
  label: string,
  overrides: Partial<TruthCalibrationSummaryRow> = {}
): TruthCalibrationSummaryRow {
  return {
    label,
    surfaced: 80,
    closed: 50,
    beatClose: 31,
    lostClose: 14,
    pushClose: 5,
    closeDataRate: 62.5,
    beatClosePct: 62,
    lostClosePct: 28,
    averageClvPct: 1.5,
    averageLineDelta: 0.4,
    averageTruthScore: 1.3,
    averageSurfaceScore: 78,
    averageExpectedValuePct: 2.4,
    ...overrides
  };
}

function buildSideSnapshots(args: {
  marketType: "spread" | "moneyline" | "total" | "player_points";
  side: string;
  histories: Array<{
    bookKey: string;
    bookName: string;
    history: Array<{ minutesAgo: number; price: number; line?: number | null }>;
  }>;
}) {
  return buildNormalizedSnapshotsFromPriceSamples(
    {
      sport: "BASKETBALL",
      league: "NBA",
      eventId: "event_test",
      marketType: args.marketType,
      marketScope: args.marketType === "player_points" ? "player" : "game",
      side: args.side,
      line: null,
      participantTeamId: args.marketType === "player_points" ? null : "team_home",
      participantPlayerId: args.marketType === "player_points" ? "player_1" : null,
      isLive: false,
      source: "test",
      sourceName: "Test feed",
      sourceType: "mock"
    },
    args.histories.map((entry) => ({
      bookKey: entry.bookKey,
      bookName: entry.bookName,
      price: entry.history[entry.history.length - 1]?.price ?? null,
      line: entry.history[entry.history.length - 1]?.line ?? null,
      updatedAt: isoMinutesAgo(entry.history[entry.history.length - 1]?.minutesAgo ?? 0),
      history: entry.history.map((point) => ({
        capturedAt: isoMinutesAgo(point.minutesAgo),
        price: point.price,
        line: point.line ?? null
      }))
    }))
  );
}

function testLeaderFollowerAndStaleCopyInference() {
  const sideSnapshots = buildSideSnapshots({
    marketType: "spread",
    side: "Boston Celtics",
    histories: [
      {
        bookKey: "pinnacle",
        bookName: "Pinnacle",
        history: [
          { minutesAgo: 8, price: -110, line: -3.5 },
          { minutesAgo: 6, price: -112, line: -4.5 }
        ]
      },
      {
        bookKey: "draftkings",
        bookName: "DraftKings",
        history: [
          { minutesAgo: 8, price: -110, line: -3.5 },
          { minutesAgo: 3, price: -112, line: -4.5 }
        ]
      },
      {
        bookKey: "fanduel",
        bookName: "FanDuel",
        history: [{ minutesAgo: 2, price: -110, line: -3.5 }]
      }
    ]
  });

  const marketPath = buildMarketPath({
    marketLabel: "Spread",
    marketType: "spread",
    sideSnapshots,
    offeredSportsbookKey: "fanduel",
    sportsbookNamesByKey: {
      pinnacle: "Pinnacle",
      draftkings: "DraftKings",
      fanduel: "FanDuel"
    }
  });

  assert(
    marketPath.leaderCandidates.includes("pinnacle"),
    "expected Pinnacle to lead the move"
  );
  assert(
    marketPath.followerBooks.includes("draftkings"),
    "expected DraftKings to follow into confirmation"
  );
  assert(
    marketPath.laggingBooks.includes("fanduel"),
    "expected FanDuel to remain the lagging stale-copy candidate"
  );
  assert(
    marketPath.regime === "STALE_COPY",
    `expected stale-copy regime, got ${marketPath.regime}`
  );
  assert(
    marketPath.executionHint === "HIT_NOW",
    `expected HIT_NOW execution hint, got ${marketPath.executionHint}`
  );
}

function testFalseStaleCopyRejectedInFragmentedPropMarket() {
  const sideSnapshots = buildSideSnapshots({
    marketType: "player_points",
    side: "Over",
    histories: [
      {
        bookKey: "draftkings",
        bookName: "DraftKings",
        history: [{ minutesAgo: 8, price: -110, line: 22.5 }]
      },
      {
        bookKey: "fanduel",
        bookName: "FanDuel",
        history: [{ minutesAgo: 6, price: -108, line: 23.5 }]
      },
      {
        bookKey: "betmgm",
        bookName: "BetMGM",
        history: [{ minutesAgo: 5, price: +100, line: 21.5 }]
      }
    ]
  });

  const marketPath = buildMarketPath({
    marketLabel: "Player points",
    marketType: "player_points",
    sideSnapshots,
    offeredSportsbookKey: "betmgm",
    sportsbookNamesByKey: {
      draftkings: "DraftKings",
      fanduel: "FanDuel",
      betmgm: "BetMGM"
    }
  });

  assert(
    marketPath.staleCopySuppressed,
    "expected stale-copy suppression in a fragmented prop market"
  );
  assert(
    marketPath.executionHint === "SUPPRESS",
    `expected SUPPRESS hint, got ${marketPath.executionHint}`
  );
  assert(
    marketPath.regime === "FRAGMENTED" || marketPath.regime === "NO_SIGNAL",
    `expected fragmented/no-signal regime, got ${marketPath.regime}`
  );
}

function testFastDecayContextPromotesBetNow() {
  const sideSnapshots = buildSideSnapshots({
    marketType: "spread",
    side: "Boston Celtics",
    histories: [
      {
        bookKey: "pinnacle",
        bookName: "Pinnacle",
        history: [
          { minutesAgo: 10, price: -110, line: -3.5 },
          { minutesAgo: 8, price: -112, line: -4.5 }
        ]
      },
      {
        bookKey: "draftkings",
        bookName: "DraftKings",
        history: [
          { minutesAgo: 10, price: -110, line: -3.5 },
          { minutesAgo: 4, price: -112, line: -4.5 }
        ]
      },
      {
        bookKey: "fanduel",
        bookName: "FanDuel",
        history: [{ minutesAgo: 2, price: -110, line: -3.5 }]
      }
    ]
  });
  const marketPath = buildMarketPath({
    marketLabel: "Spread",
    marketType: "spread",
    sideSnapshots,
    offeredSportsbookKey: "fanduel",
    sportsbookNamesByKey: {
      pinnacle: "Pinnacle",
      draftkings: "DraftKings",
      fanduel: "FanDuel"
    }
  });
  const resolver = createOpportunityMarketPathResolver({
    rowsByGroup: {
      market: [makeSummaryRow("spread")],
      timing: [makeSummaryRow("MONITOR_ONLY")],
      action: [makeSummaryRow("WATCH")],
      sportsbook: [makeSummaryRow("fanduel", { averageTruthScore: 1.1 })]
    }
  });

  const microstructure = resolver.resolve({
    league: "NBA",
    marketType: "spread",
    sportsbookKey: "fanduel",
    sportsbookName: "FanDuel",
    actionState: "WATCH",
    timingState: "MONITOR_ONLY",
    marketEfficiency: "HIGH_EFFICIENCY",
    bookCount: 3,
    bestPriceFlag: true,
    marketDisagreementScore: 0.04,
    providerFreshnessMinutes: 2,
    lineMovement: 6,
    trapFlags: [],
    marketPath
  });

  const baseTiming = buildOpportunityTiming({
    score: 74,
    expectedValuePct: 1.3,
    lineMovement: 6,
    bestPriceFlag: true,
    freshnessMinutes: 2,
    trapFlags: [],
    disagreementScore: 0.04,
    marketEfficiency: "HIGH_EFFICIENCY"
  });
  const calibratedTiming = buildOpportunityTiming({
    score: 74,
    expectedValuePct: 1.3,
    lineMovement: 6,
    bestPriceFlag: true,
    freshnessMinutes: 2,
    trapFlags: [],
    disagreementScore: 0.04,
    marketEfficiency: "HIGH_EFFICIENCY",
    marketPathTimingDelta: microstructure.timingDelta,
    marketPathExecutionHint: marketPath.executionHint,
    marketPathStaleCopyConfidence: marketPath.staleCopyConfidence,
    marketPathRepricingLikelihood: microstructure.repricingLikelihood,
    marketPathWaitImprovementLikelihood: microstructure.waitImprovementLikelihood,
    marketPathTrapEscalation: microstructure.trapEscalation
  });

  assert(baseTiming.actionState === "WATCH", `expected base WATCH, got ${baseTiming.actionState}`);
  assert(
    calibratedTiming.actionState === "BET_NOW",
    `expected market path to promote BET_NOW, got ${calibratedTiming.actionState}`
  );
}

function testImprovementProneContextAllowsWait() {
  const marketPath: MarketPathView = {
    regime: "BROAD_REPRICE",
    leaderCandidates: ["pinnacle"],
    confirmerBooks: ["pinnacle", "draftkings", "betmgm"],
    followerBooks: ["draftkings", "betmgm"],
    laggingBooks: [],
    outlierBooks: [],
    confirmationCount: 3,
    confirmationQuality: 74,
    leaderFollowerConfidence: 72,
    synchronizationState: "PARTIAL_CONFIRMATION",
    repriceSpread: null,
    staleCopyConfidence: 18,
    staleCopyReasons: [],
    staleCopySuppressed: false,
    executionHint: "WAIT_FOR_COPY",
    moveCoherenceScore: 72,
    notes: ["Board already repriced, but this lane often drifts back before close."],
    debug: []
  };
  const resolver = createOpportunityMarketPathResolver({
    rowsByGroup: {
      market: [
        makeSummaryRow("spread", {
          beatClosePct: 44,
          averageTruthScore: -0.8,
          averageClvPct: -0.6
        })
      ],
      timing: [
        makeSummaryRow("MONITOR_ONLY", {
          beatClosePct: 41,
          averageTruthScore: -1.1,
          averageClvPct: -0.9
        })
      ],
      action: [
        makeSummaryRow("WATCH", {
          beatClosePct: 43,
          averageTruthScore: -0.7,
          averageClvPct: -0.4
        })
      ]
    }
  });

  const microstructure = resolver.resolve({
    league: "NBA",
    marketType: "spread",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    actionState: "WATCH",
    timingState: "MONITOR_ONLY",
    marketEfficiency: "HIGH_EFFICIENCY",
    bookCount: 5,
    bestPriceFlag: true,
    marketDisagreementScore: 0.05,
    providerFreshnessMinutes: 3,
    lineMovement: 5,
    trapFlags: [],
    marketPath
  });

  const baseTiming = buildOpportunityTiming({
    score: 72,
    expectedValuePct: 1.2,
    lineMovement: 5,
    bestPriceFlag: true,
    freshnessMinutes: 3,
    trapFlags: [],
    disagreementScore: 0.05,
    marketEfficiency: "HIGH_EFFICIENCY"
  });
  const calibratedTiming = buildOpportunityTiming({
    score: 72,
    expectedValuePct: 1.2,
    lineMovement: 5,
    bestPriceFlag: true,
    freshnessMinutes: 3,
    trapFlags: [],
    disagreementScore: 0.05,
    marketEfficiency: "HIGH_EFFICIENCY",
    marketPathTimingDelta: microstructure.timingDelta,
    marketPathExecutionHint: marketPath.executionHint,
    marketPathStaleCopyConfidence: marketPath.staleCopyConfidence,
    marketPathRepricingLikelihood: microstructure.repricingLikelihood,
    marketPathWaitImprovementLikelihood: microstructure.waitImprovementLikelihood,
    marketPathTrapEscalation: microstructure.trapEscalation
  });

  assert(baseTiming.actionState === "WATCH", `expected base WATCH, got ${baseTiming.actionState}`);
  assert(
    calibratedTiming.actionState === "WAIT",
    `expected improvement-prone context to allow WAIT, got ${calibratedTiming.actionState}`
  );
}

function testIncoherentPathReducesScore() {
  const resolver = createOpportunityMarketPathResolver();
  const marketPath: MarketPathView = {
    regime: "FRAGMENTED",
    leaderCandidates: [],
    confirmerBooks: ["bovada"],
    followerBooks: [],
    laggingBooks: [],
    outlierBooks: ["fanduel", "draftkings"],
    confirmationCount: 1,
    confirmationQuality: 24,
    leaderFollowerConfidence: 18,
    synchronizationState: "FRAGMENTED",
    repriceSpread: 24,
    staleCopyConfidence: 12,
    staleCopyReasons: ["Books never converged on one path."],
    staleCopySuppressed: true,
    executionHint: "SUPPRESS",
    moveCoherenceScore: 22,
    notes: ["This looks like noisy one-book behavior, not a coordinated reprice."],
    debug: []
  };

  const microstructure = resolver.resolve({
    league: "NBA",
    marketType: "moneyline",
    sportsbookKey: "bovada",
    sportsbookName: "Bovada",
    actionState: "WATCH",
    timingState: "MONITOR_ONLY",
    marketEfficiency: "LOW_EFFICIENCY",
    bookCount: 3,
    bestPriceFlag: false,
    marketDisagreementScore: 0.18,
    providerFreshnessMinutes: 6,
    lineMovement: 14,
    trapFlags: ["FAKE_MOVE_RISK"],
    marketPath
  });

  const clean = buildOpportunityScore({
    expectedValuePct: 2.2,
    fairLineGap: 8,
    edgeScore: 66,
    confidenceScore: 60,
    qualityScore: 58,
    disagreementScore: 0.06,
    freshnessMinutes: 5,
    bookCount: 4,
    timingQuality: 66,
    supportScore: 6,
    sourceQualityScore: 58,
    marketEfficiencyScore: 4,
    edgeDecayPenalty: 10,
    trapFlags: [],
    personalizationDelta: 0
  });
  const fragmented = buildOpportunityScore({
    expectedValuePct: 2.2,
    fairLineGap: 8,
    edgeScore: 66,
    confidenceScore: 60,
    qualityScore: 58,
    disagreementScore: 0.18,
    freshnessMinutes: 5,
    bookCount: 3,
    timingQuality: 66,
    supportScore: 6,
    sourceQualityScore: 58,
    marketEfficiencyScore: 0,
    edgeDecayPenalty: 10,
    marketPathScoreDelta: microstructure.scoreDelta,
    trapFlags: ["FAKE_MOVE_RISK"],
    personalizationDelta: 0
  });

  assert(
    microstructure.scoreDelta < 0,
    `expected fragmented path to cut score, got ${microstructure.scoreDelta}`
  );
  assert(fragmented.score < clean.score, "expected fragmented path score to drop");
}

function testNoRegressionWhenPathEvidenceAbsent() {
  const resolver = createOpportunityMarketPathResolver();
  const microstructure = resolver.resolve({
    league: "NBA",
    marketType: "spread",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    actionState: "WATCH",
    timingState: "MONITOR_ONLY",
    marketEfficiency: "MID_EFFICIENCY",
    bookCount: 3,
    bestPriceFlag: true,
    marketDisagreementScore: 0.07,
    providerFreshnessMinutes: 4,
    lineMovement: 4,
    trapFlags: [],
    marketPath: null
  });

  const baseTiming = buildOpportunityTiming({
    score: 74,
    expectedValuePct: 1.6,
    lineMovement: 4,
    bestPriceFlag: true,
    freshnessMinutes: 4,
    trapFlags: [],
    disagreementScore: 0.07,
    marketEfficiency: "MID_EFFICIENCY"
  });
  const neutralTiming = buildOpportunityTiming({
    score: 74,
    expectedValuePct: 1.6,
    lineMovement: 4,
    bestPriceFlag: true,
    freshnessMinutes: 4,
    trapFlags: [],
    disagreementScore: 0.07,
    marketEfficiency: "MID_EFFICIENCY",
    marketPathTimingDelta: microstructure.timingDelta,
    marketPathExecutionHint: "SUPPRESS",
    marketPathStaleCopyConfidence: microstructure.staleCopyConfidence,
    marketPathRepricingLikelihood: microstructure.repricingLikelihood,
    marketPathWaitImprovementLikelihood: microstructure.waitImprovementLikelihood,
    marketPathTrapEscalation: microstructure.trapEscalation
  });

  assert(
    microstructure.status === "SKIPPED_NO_PATH",
    `expected no-path skip, got ${microstructure.status}`
  );
  assert(
    baseTiming.actionState === neutralTiming.actionState &&
      baseTiming.timingState === neutralTiming.timingState &&
      baseTiming.timingQuality === neutralTiming.timingQuality,
    "expected no-regression timing behavior when path evidence is absent"
  );
}

function run() {
  testLeaderFollowerAndStaleCopyInference();
  testFalseStaleCopyRejectedInFragmentedPropMarket();
  testFastDecayContextPromotesBetNow();
  testImprovementProneContextAllowsWait();
  testIncoherentPathReducesScore();
  testNoRegressionWhenPathEvidenceAbsent();
  console.log("Market path engine tests passed.");
}

run();
