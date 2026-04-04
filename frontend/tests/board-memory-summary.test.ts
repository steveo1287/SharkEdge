import {
  getChangeBadgeLabel,
  getChangeExplanation,
  getChangeSummaryBadgeLabel,
  getChangeSummaryExplanation,
  hasRenderableChangeSummary
} from "@/components/intelligence/change-intelligence";
import type { DecisionMemorySummary } from "@/lib/types/decision-memory";
import type { GameCardView } from "@/lib/types/domain";
import { buildChangeIntelligence, buildDecisionStateRecord } from "@/services/decision/change-intelligence";
import {
  getBoardFocusMarket,
  getBoardGameIntelligenceKey,
  isDecisionMemorySummaryRenderable,
  isDecisionMemorySummaryStale
} from "@/services/decision/board-memory-summary";
import { buildDecisionMemorySync } from "@/services/decision/decision-memory-sync";
import { buildDecisionFromOpportunitySnapshot } from "@/services/decision/decision-engine";
import { buildOpportunitySnapshot } from "@/services/opportunities/opportunity-snapshot";
import type { OpportunityView } from "@/lib/types/opportunity";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeEvProfile(edgePct: number, fairLineGap: number, rankScore: number) {
  return {
    edgePct,
    evPerUnit: Number((edgePct / 100).toFixed(3)),
    minimumBeProb: 0.5,
    fairLineGap,
    rankScore,
    kellyFraction: Number((Math.max(rankScore, 1) / 1000).toFixed(3))
  };
}

function makeMarketTruth(args: {
  fairOddsAmerican: number;
  consensusOddsAmerican: number;
  sharpGapAmerican: number;
  bookCount: number;
  qualityScore: number;
  classification: "trustworthy";
  note: string;
}) {
  return {
    classification: args.classification,
    classificationLabel: "Trustworthy",
    qualityScore: args.qualityScore,
    confidenceBand: "high" as const,
    bookCount: args.bookCount,
    stale: false,
    staleAgeMinutes: 2,
    disagreementPct: 4,
    movementStrength: 0.4,
    clvSupportPct: 56,
    fairOddsAmerican: args.fairOddsAmerican,
    fairProbabilityPct: 53,
    consensusOddsAmerican: args.consensusOddsAmerican,
    sharpConsensusOddsAmerican: args.consensusOddsAmerican,
    sharpGapAmerican: args.sharpGapAmerican,
    impliedEdgePct: 4.8,
    note: args.note,
    flags: []
  };
}

function makeMarketIntelligence(args: {
  bestPriceFlag: boolean;
  marketDisagreementScore: number;
  consensusImpliedProbability: number;
  snapshotAgeSeconds: number;
  staleFlag: boolean;
}) {
  return {
    sourceCount: 5,
    bestPriceFlag: args.bestPriceFlag,
    bestAvailableSportsbookKey: "draftkings",
    bestAvailableOddsAmerican: -110,
    consensusImpliedProbability: args.consensusImpliedProbability,
    consensusLine: 4.5,
    snapshotAgeSeconds: args.snapshotAgeSeconds,
    staleFlag: args.staleFlag,
    staleCount: args.staleFlag ? 2 : 0,
    marketDisagreementScore: args.marketDisagreementScore,
    openToCurrentDelta: 1.5,
    lineMovement: {
      openPrice: -112,
      currentPrice: -110,
      openLine: 5.5,
      currentLine: 4.5,
      priceDelta: 2,
      lineDelta: -1,
      summary: "Market improved toward the current best number."
    },
    notes: []
  };
}

function makeGameCardView(overrides: Partial<GameCardView> = {}): GameCardView {
  return {
    id: "therundown:NBA:event-1",
    externalEventId: "therundown:NBA:event-1",
    leagueKey: "NBA",
    awayTeam: {
      id: "away",
      leagueId: "nba",
      name: "Los Angeles Lakers",
      abbreviation: "LAL",
      externalIds: {}
    },
    homeTeam: {
      id: "home",
      leagueId: "nba",
      name: "Boston Celtics",
      abbreviation: "BOS",
      externalIds: {}
    },
    startTime: "2026-04-04T00:00:00.000Z",
    status: "PREGAME",
    venue: "TD Garden",
    selectedBook: null,
    bestBookCount: 5,
    spread: {
      label: "LAL +4.5",
      lineLabel: "LAL +4.5",
      bestBook: "DraftKings",
      bestOdds: -110,
      movement: 1.5,
      evProfile: makeEvProfile(4.8, 16, 81),
      marketTruth: makeMarketTruth({
        fairOddsAmerican: -126,
        consensusOddsAmerican: -110,
        sharpGapAmerican: 16,
        bookCount: 5,
        qualityScore: 74,
        classification: "trustworthy",
        note: "Spread still off fair."
      }),
      marketIntelligence: makeMarketIntelligence({
        bestPriceFlag: true,
        marketDisagreementScore: 0.04,
        consensusImpliedProbability: 0.53,
        snapshotAgeSeconds: 120,
        staleFlag: false
      }),
      confidenceScore: 78,
      reasons: [],
      hidden: false
    },
    moneyline: {
      label: "LAL ML",
      lineLabel: "LAL ML",
      bestBook: "DraftKings",
      bestOdds: 142,
      movement: 0,
      evProfile: makeEvProfile(2.2, 7, 59),
      marketTruth: makeMarketTruth({
        fairOddsAmerican: 135,
        consensusOddsAmerican: 142,
        sharpGapAmerican: 7,
        bookCount: 5,
        qualityScore: 69,
        classification: "trustworthy",
        note: "Moneyline is thinner."
      }),
      marketIntelligence: makeMarketIntelligence({
        bestPriceFlag: false,
        marketDisagreementScore: 0.03,
        consensusImpliedProbability: 0.41,
        snapshotAgeSeconds: 120,
        staleFlag: false
      }),
      confidenceScore: 64,
      reasons: [],
      hidden: false
    },
    total: {
      label: "O/U 229.5",
      lineLabel: "O/U 229.5",
      bestBook: "DraftKings",
      bestOdds: -108,
      movement: 0.5,
      evProfile: makeEvProfile(2.7, 8, 61),
      marketTruth: makeMarketTruth({
        fairOddsAmerican: -116,
        consensusOddsAmerican: -108,
        sharpGapAmerican: 8,
        bookCount: 5,
        qualityScore: 66,
        classification: "trustworthy",
        note: "Total is playable but not leading."
      }),
      marketIntelligence: makeMarketIntelligence({
        bestPriceFlag: false,
        marketDisagreementScore: 0.04,
        consensusImpliedProbability: 0.52,
        snapshotAgeSeconds: 120,
        staleFlag: false
      }),
      confidenceScore: 62,
      reasons: [],
      hidden: false
    },
    edgeScore: {
      score: 78,
      label: "Strong"
    },
    detailHref: "/game/therundown:NBA:event-1",
    ...overrides
  };
}

function makeOpportunity(overrides: Partial<OpportunityView> = {}): OpportunityView {
  return {
    id: "opp-board-1",
    kind: "game_side",
    league: "NBA",
    eventId: "therundown:NBA:event-1",
    eventLabel: "Lakers at Celtics",
    marketType: "spread",
    selectionLabel: "LAL +4.5",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    displayOddsAmerican: -110,
    displayLine: 4.5,
    fairPriceAmerican: -126,
    fairPriceMethod: "blended_fair_price",
    expectedValuePct: 4.8,
    marketDeltaAmerican: 16,
    consensusImpliedProbability: 0.53,
    marketDisagreementScore: 0.04,
    providerFreshnessMinutes: 2,
    staleFlag: false,
    bookCount: 5,
    lineMovement: 1.5,
    edgeScore: 81,
    opportunityScore: 86,
    confidenceTier: "A",
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    trapFlags: [],
    whyItShows: ["Market is still off fair."],
    whatCouldKillIt: ["If price slips, edge quality falls off."],
    reasonSummary: "Spread still leads the board.",
    personalizationAdjustments: [],
    sourceHealth: {
      state: "HEALTHY",
      freshnessMinutes: 2,
      warnings: []
    },
    sourceNote: "Healthy board feed.",
    scoreComponents: {
      priceEdge: 25,
      expectedValue: 20,
      marketValidation: 15,
      timingQuality: 13,
      freshness: 8,
      support: 5,
      personalization: 0,
      penalties: 0
    },
    truthClassification: "trustworthy",
    ...overrides
  };
}

function buildDecision(overrides: Partial<OpportunityView> = {}) {
  return buildDecisionFromOpportunitySnapshot(buildOpportunitySnapshot(makeOpportunity(overrides))!);
}

function testBoardSummaryRendersMeaningfulState() {
  const summary = buildDecisionMemorySync({
    previousMemory: buildDecisionMemorySync({
      previousMemory: null,
      decision: buildDecision({ actionState: "WATCH", timingState: "MONITOR_ONLY", confidenceTier: "C", opportunityScore: 62 }),
      recordedAt: "2026-04-03T10:00:00.000Z"
    }).nextMemory,
    decision: buildDecision(),
    recordedAt: "2026-04-03T10:10:00.000Z"
  }).nextMemory.latestSummary;

  assert(isDecisionMemorySummaryRenderable(summary), "expected meaningful board summary to render");
  assert(hasRenderableChangeSummary(summary), "expected summary renderer to accept meaningful state");
  assert(getChangeSummaryBadgeLabel(summary).length > 0, "expected summary badge label");
  assert(getChangeSummaryExplanation(summary) === summary.shortExplanation, "expected board explanation to use summary text");
}

function testBoardSummaryHidesEmptyOrStaleState() {
  const emptySummary: DecisionMemorySummary = {
    currentSemanticSignature: null,
    latestChangeSignature: null,
    lastChangeSeverity: null,
    lastChangeDirection: null,
    shortExplanation: null,
    lastMeaningfulChangeAt: null,
    updatedAt: "2026-04-03T10:00:00.000Z"
  };
  assert(!isDecisionMemorySummaryRenderable(emptySummary), "expected empty summary to stay hidden");
  assert(!hasRenderableChangeSummary(emptySummary), "expected empty summary helper to stay hidden");

  const staleSummary: DecisionMemorySummary = {
    currentSemanticSignature: "sig",
    latestChangeSignature: "chg",
    lastChangeSeverity: "major",
    lastChangeDirection: "upgraded",
    shortExplanation: "Recommendation improved.",
    lastMeaningfulChangeAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z"
  };
  assert(isDecisionMemorySummaryStale(staleSummary, 30), "expected old summary to be stale");
}

function testBoardSummaryLanguageMatchesChangeSurface() {
  const previous = buildDecisionStateRecord(
    buildDecision({ actionState: "WATCH", timingState: "MONITOR_ONLY", confidenceTier: "C", opportunityScore: 62 }),
    "2026-04-03T10:00:00.000Z"
  );
  const current = buildDecision();
  const change = buildChangeIntelligence(previous, current, "2026-04-03T10:10:00.000Z");
  const summary = buildDecisionMemorySync({
    previousMemory: {
      version: 1,
      decisionState: previous,
      latestChange: null,
      latestSummary: {
        currentSemanticSignature: previous.decision?.dedupeSignature ?? null,
        latestChangeSignature: null,
        lastChangeSeverity: null,
        lastChangeDirection: null,
        shortExplanation: null,
        lastMeaningfulChangeAt: null,
        updatedAt: previous.recordedAt
      }
    },
    decision: current,
    recordedAt: "2026-04-03T10:10:00.000Z"
  }).nextMemory.latestSummary;

  assert(
    getChangeSummaryBadgeLabel(summary) === getChangeBadgeLabel(change),
    "expected board summary badge language to match change badge language"
  );
  assert(
    getChangeSummaryExplanation(summary) === getChangeExplanation(change),
    "expected board summary explanation to match change explanation language"
  );
}

function testBoardRetrievalKeysStayDeterministic() {
  const game = makeGameCardView();
  const focusMarket = getBoardFocusMarket(game);
  const key = getBoardGameIntelligenceKey(game, focusMarket);

  assert(focusMarket === "spread", `expected spread focus market, got ${focusMarket}`);
  assert(
    key === "NBA::therundown:NBA:event-1::spread::lal +4.5",
    `expected stable board key, got ${key}`
  );
}

function run() {
  testBoardSummaryRendersMeaningfulState();
  testBoardSummaryHidesEmptyOrStaleState();
  testBoardSummaryLanguageMatchesChangeSurface();
  testBoardRetrievalKeysStayDeterministic();
  console.log("Board memory summary tests passed.");
}

run();
