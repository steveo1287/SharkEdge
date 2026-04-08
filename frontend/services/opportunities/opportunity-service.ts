import type {
  BetSignalView,
  BoardMarketView,
  GameCardView,
  PropCardView,
  ProviderHealthView,
  ReasonAttributionView
} from "@/lib/types/domain";
import type { PerformanceDashboardView } from "@/lib/types/ledger";
import type {
  OpportunityConfidenceTier,
  OpportunityHomeSnapshot,
  OpportunityKind,
  OpportunityProfile,
  OpportunityView
} from "@/lib/types/opportunity";
import { buildOpportunityExplanation } from "@/services/opportunities/opportunity-explainer";
import {
  buildOpportunityPersonalization,
  buildOpportunityProfile
} from "@/services/opportunities/opportunity-personalization";
import { buildOpportunityScore } from "@/services/opportunities/opportunity-scoring";
import { buildOpportunityTiming } from "@/services/opportunities/opportunity-timing";
import { buildOpportunityTrapFlags } from "@/services/opportunities/opportunity-traps";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number | null | undefined, digits = 2) {
  return typeof value === "number" ? Number(value.toFixed(digits)) : null;
}

function getConfidenceTier(
  score: number,
  trapFlags: string[]
): OpportunityConfidenceTier {
  if (trapFlags.includes("STALE_EDGE") || trapFlags.includes("LOW_PROVIDER_HEALTH")) {
    return score >= 72 ? "B" : score >= 58 ? "C" : "D";
  }

  if (trapFlags.includes("ONE_BOOK_OUTLIER") || trapFlags.includes("FAKE_MOVE_RISK")) {
    return score >= 86 ? "B" : score >= 70 ? "C" : "D";
  }

  if (score >= 88) {
    return "A";
  }

  if (score >= 74) {
    return "B";
  }

  if (score >= 60) {
    return "C";
  }

  return "D";
}

function normalizeSportsbookName(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase();
}

function getSportsbookSharpnessBoost(
  sportsbookName: string | null | undefined,
  bestPriceFlag: boolean,
  bookCount: number
) {
  const normalized = normalizeSportsbookName(sportsbookName);

  if (!normalized) {
    return 0;
  }

  if (
    normalized.includes("pinnacle") ||
    normalized.includes("circa") ||
    normalized.includes("bookmaker") ||
    normalized.includes("betcris")
  ) {
    return bestPriceFlag ? 6 : 4;
  }

  if (
    normalized.includes("draftkings") ||
    normalized.includes("fanduel") ||
    normalized.includes("betmgm")
  ) {
    return bestPriceFlag && bookCount >= 4 ? 2 : 1;
  }

  return 0;
}

function supportScoreFromReasons(args: {
  reasons: ReasonAttributionView[];
  sportsbookName: string | null;
  bestPriceFlag: boolean;
  bookCount: number;
  marketDisagreementScore: number | null;
  freshnessMinutes: number | null;
}) {
  let total = args.reasons.slice(0, 3).reduce((score, reason) => {
    if (reason.category === "market_edge" || reason.category === "trend_support") {
      return score + 4;
    }

    if (reason.category === "model_edge" || reason.category === "momentum_edge") {
      return score + 3;
    }

    return score + 1;
  }, 0);

  total += getSportsbookSharpnessBoost(
    args.sportsbookName,
    args.bestPriceFlag,
    args.bookCount
  );

  if (
    args.bestPriceFlag &&
    args.bookCount >= 4 &&
    (args.marketDisagreementScore ?? 0) <= 0.08
  ) {
    total += 2;
  }

  if (args.freshnessMinutes !== null && args.freshnessMinutes <= 8) {
    total += 1;
  }

  return total;
}

function getProviderFreshnessMinutes(args: {
  providerHealth?: ProviderHealthView | null;
  snapshotAgeSeconds?: number | null;
}) {
  if (typeof args.snapshotAgeSeconds === "number") {
    return Math.round(args.snapshotAgeSeconds / 60);
  }

  return args.providerHealth?.freshnessMinutes ?? null;
}

function getActionPriority(actionState: OpportunityView["actionState"]) {
  if (actionState === "BET_NOW") {
    return 4;
  }

  if (actionState === "WAIT") {
    return 3;
  }

  if (actionState === "WATCH") {
    return 2;
  }

  return 1;
}

function getConfidencePriority(confidenceTier: OpportunityConfidenceTier) {
  if (confidenceTier === "A") {
    return 4;
  }

  if (confidenceTier === "B") {
    return 3;
  }

  if (confidenceTier === "C") {
    return 2;
  }

  return 1;
}

function shouldSurfaceHomeOpportunity(opportunity: OpportunityView) {
  if (opportunity.actionState === "PASS") {
    return false;
  }

  if (opportunity.staleFlag) {
    return false;
  }

  if (opportunity.sourceHealth.state === "OFFLINE") {
    return false;
  }

  if (
    opportunity.trapFlags.includes("LOW_PROVIDER_HEALTH") ||
    opportunity.trapFlags.includes("STALE_EDGE") ||
    opportunity.trapFlags.includes("ONE_BOOK_OUTLIER")
  ) {
    return false;
  }

  if (
    opportunity.actionState === "BET_NOW" &&
    opportunity.opportunityScore >= 78 &&
    opportunity.confidenceTier !== "D"
  ) {
    return true;
  }

  if (
    opportunity.actionState === "WAIT" &&
    opportunity.opportunityScore >= 84 &&
    (opportunity.confidenceTier === "A" || opportunity.confidenceTier === "B")
  ) {
    return true;
  }

  return false;
}

type BaseOpportunityArgs = {
  id: string;
  kind: OpportunityKind;
  league: OpportunityView["league"];
  eventId: string;
  eventLabel: string;
  marketType: string;
  selectionLabel: string;
  sportsbookKey: string | null;
  sportsbookName: string | null;
  displayOddsAmerican: number | null;
  displayLine: string | number | null;
  fairPriceAmerican: number | null;
  fairPriceMethod: OpportunityView["fairPriceMethod"];
  expectedValuePct: number | null;
  marketDeltaAmerican: number | null;
  consensusImpliedProbability: number | null;
  marketDisagreementScore: number | null;
  providerHealth?: ProviderHealthView | null;
  snapshotAgeSeconds?: number | null;
  staleFlag: boolean;
  bookCount: number;
  lineMovement: number | null;
  edgeScore: number;
  confidenceScore: number;
  qualityScore: number;
  fairLineGap: number | null;
  bestPriceFlag: boolean;
  reasons: ReasonAttributionView[];
  sourceNote: string;
  truthClassification: OpportunityView["truthClassification"];
  profile?: OpportunityProfile | null;
  conflictSignal?: boolean;
};

function buildOpportunity(args: BaseOpportunityArgs): OpportunityView {
  const providerFreshnessMinutes = getProviderFreshnessMinutes({
    providerHealth: args.providerHealth,
    snapshotAgeSeconds: args.snapshotAgeSeconds
  });

  const trapFlags = buildOpportunityTrapFlags({
    fairPrice: args.fairPriceMethod
      ? ({
          pricingConfidenceScore: args.confidenceScore
        } as any)
      : null,
    marketIntelligence: {
      staleFlag: args.staleFlag,
      marketDisagreementScore: args.marketDisagreementScore ?? 0,
      bestPriceFlag: args.bestPriceFlag
    } as any,
    marketTruth: {
      bookCount: args.bookCount,
      stale: args.staleFlag,
      disagreementPct:
        typeof args.marketDisagreementScore === "number"
          ? args.marketDisagreementScore * 100
          : null,
      movementStrength: args.lineMovement === null ? null : Math.abs(args.lineMovement),
      classification: args.truthClassification
    } as any,
    providerHealth: args.providerHealth,
    bookCount: args.bookCount,
    lineMovement: args.lineMovement,
    conflictSignal: args.conflictSignal
  });

  const provisionalTiming = buildOpportunityTiming({
    score: clamp(args.edgeScore, 0, 100),
    expectedValuePct: args.expectedValuePct,
    lineMovement: args.lineMovement,
    bestPriceFlag: args.bestPriceFlag,
    freshnessMinutes: providerFreshnessMinutes,
    trapFlags,
    disagreementScore: args.marketDisagreementScore
  });

  const personalizationAdjustments = buildOpportunityPersonalization({
    opportunity: {
      league: args.league,
      marketType: args.marketType,
      sportsbookName: args.sportsbookName,
      timingState: provisionalTiming.timingState
    } as OpportunityView,
    profile: args.profile
  });

  const personalizationDelta = personalizationAdjustments.reduce(
    (total, item) => total + item.delta,
    0
  );

  const supportScore = supportScoreFromReasons({
    reasons: args.reasons,
    sportsbookName: args.sportsbookName,
    bestPriceFlag: args.bestPriceFlag,
    bookCount: args.bookCount,
    marketDisagreementScore: args.marketDisagreementScore,
    freshnessMinutes: providerFreshnessMinutes
  });

  const scoring = buildOpportunityScore({
    expectedValuePct: args.expectedValuePct,
    fairLineGap: args.fairLineGap,
    edgeScore: args.edgeScore,
    confidenceScore: args.confidenceScore,
    qualityScore: args.qualityScore,
    disagreementScore: args.marketDisagreementScore,
    freshnessMinutes: providerFreshnessMinutes,
    bookCount: args.bookCount,
    timingQuality: provisionalTiming.timingQuality,
    supportScore,
    trapFlags,
    personalizationDelta
  });

  const timing = buildOpportunityTiming({
    score: scoring.score,
    expectedValuePct: args.expectedValuePct,
    lineMovement: args.lineMovement,
    bestPriceFlag: args.bestPriceFlag,
    freshnessMinutes: providerFreshnessMinutes,
    trapFlags,
    disagreementScore: args.marketDisagreementScore
  });

  const explanation = buildOpportunityExplanation({
    eventLabel: args.eventLabel,
    selectionLabel: args.selectionLabel,
    expectedValuePct: args.expectedValuePct,
    fairLineGap: args.fairLineGap,
    bestPriceFlag: args.bestPriceFlag,
    bookCount: args.bookCount,
    lineMovement: args.lineMovement,
    marketDisagreementScore: args.marketDisagreementScore,
    freshnessMinutes: providerFreshnessMinutes,
    pricingMethod: args.fairPriceMethod,
    confidenceScore: args.confidenceScore,
    reasons: args.reasons,
    trapFlags,
    actionState: timing.actionState,
    timingState: timing.timingState
  });

  return {
    id: args.id,
    kind: args.kind,
    league: args.league,
    eventId: args.eventId,
    eventLabel: args.eventLabel,
    marketType: args.marketType,
    selectionLabel: args.selectionLabel,
    sportsbookKey: args.sportsbookKey,
    sportsbookName: args.sportsbookName,
    displayOddsAmerican: args.displayOddsAmerican,
    displayLine: args.displayLine,
    fairPriceAmerican: args.fairPriceAmerican,
    fairPriceMethod: args.fairPriceMethod,
    expectedValuePct: round(args.expectedValuePct),
    marketDeltaAmerican: round(args.marketDeltaAmerican),
    consensusImpliedProbability:
      typeof args.consensusImpliedProbability === "number"
        ? Number((args.consensusImpliedProbability * 100).toFixed(2))
        : null,
    marketDisagreementScore: round(args.marketDisagreementScore, 3),
    providerFreshnessMinutes,
    staleFlag: args.staleFlag,
    bookCount: args.bookCount,
    lineMovement: round(args.lineMovement),
    edgeScore: Math.round(args.edgeScore),
    opportunityScore: scoring.score,
    confidenceTier: getConfidenceTier(scoring.score, trapFlags),
    actionState: timing.actionState,
    timingState: timing.timingState,
    trapFlags,
    whyItShows: explanation.whyItShows,
    whatCouldKillIt: explanation.whatCouldKillIt,
    reasonSummary: explanation.reasonSummary,
    personalizationAdjustments,
    sourceHealth: {
      state: args.providerHealth?.state ?? "HEALTHY",
      freshnessMinutes: providerFreshnessMinutes,
      warnings: args.providerHealth?.warnings ?? []
    },
    sourceNote: args.sourceNote,
    scoreComponents: scoring.components,
    truthClassification: args.truthClassification
  };
}

function marketLabelToKind(
  marketType: "spread" | "moneyline" | "total"
): OpportunityKind {
  if (marketType === "moneyline") {
    return "moneyline";
  }

  if (marketType === "total") {
    return "game_total";
  }

  return "game_side";
}

export function buildGameMarketOpportunity(
  game: GameCardView,
  marketType: "spread" | "moneyline" | "total",
  providerHealth?: ProviderHealthView | null,
  profile?: OpportunityProfile | null
): OpportunityView {
  const market: BoardMarketView = game[marketType];
  const eventLabel = `${game.awayTeam.name} @ ${game.homeTeam.name}`;
  const fairGap = market.evProfile?.fairLineGap ?? market.marketTruth?.sharpGapAmerican ?? null;
  const offeredOdds = market.bestOdds && market.bestOdds !== 0 ? market.bestOdds : null;

  return buildOpportunity({
    id: `${game.id}:${marketType}`,
    kind: marketLabelToKind(marketType),
    league: game.leagueKey,
    eventId: game.id,
    eventLabel,
    marketType,
    selectionLabel: market.label,
    sportsbookKey: market.marketIntelligence?.bestAvailableSportsbookKey ?? null,
    sportsbookName: market.bestBook !== "Unavailable" ? market.bestBook : null,
    displayOddsAmerican: offeredOdds,
    displayLine: market.lineLabel,
    fairPriceAmerican:
      market.fairPrice?.fairOddsAmerican ?? market.marketTruth?.fairOddsAmerican ?? null,
    fairPriceMethod: market.fairPrice?.pricingMethod ?? null,
    expectedValuePct: market.evProfile?.edgePct ?? null,
    marketDeltaAmerican:
      market.marketTruth?.consensusOddsAmerican && offeredOdds
        ? offeredOdds - market.marketTruth.consensusOddsAmerican
        : null,
    consensusImpliedProbability:
      market.marketIntelligence?.consensusImpliedProbability ?? null,
    marketDisagreementScore: market.marketIntelligence?.marketDisagreementScore ?? null,
    providerHealth,
    snapshotAgeSeconds: market.marketIntelligence?.snapshotAgeSeconds ?? null,
    staleFlag: market.marketIntelligence?.staleFlag ?? market.marketTruth?.stale ?? false,
    bookCount: market.marketTruth?.bookCount ?? game.bestBookCount,
    lineMovement: market.movement,
    edgeScore: Math.max(game.edgeScore.score, market.evProfile?.rankScore ?? 0),
    confidenceScore: market.confidenceScore ?? market.fairPrice?.pricingConfidenceScore ?? 0,
    qualityScore: market.marketTruth?.qualityScore ?? 0,
    fairLineGap: fairGap,
    bestPriceFlag: market.marketIntelligence?.bestPriceFlag ?? false,
    reasons: market.reasons ?? [],
    sourceNote: market.marketTruth?.note ?? providerHealth?.summary ?? "Market context only.",
    truthClassification: market.marketTruth?.classification ?? null,
    profile
  });
}

export function buildPropOpportunity(
  prop: PropCardView,
  providerHealth?: ProviderHealthView | null,
  profile?: OpportunityProfile | null
): OpportunityView {
  const offeredOdds = prop.bestAvailableOddsAmerican ?? prop.oddsAmerican;
  const eventLabel = prop.gameLabel ?? `${prop.team.name} vs ${prop.opponent.name}`;

  return buildOpportunity({
    id: prop.id,
    kind: "prop",
    league: prop.leagueKey,
    eventId: prop.gameId,
    eventLabel,
    marketType: prop.marketType,
    selectionLabel: `${prop.player.name} ${prop.side} ${prop.line}`,
    sportsbookKey: prop.sportsbook.key,
    sportsbookName: prop.bestAvailableSportsbookName ?? prop.sportsbook.name,
    displayOddsAmerican: offeredOdds,
    displayLine: prop.line,
    fairPriceAmerican:
      prop.fairPrice?.fairOddsAmerican ?? prop.marketTruth?.fairOddsAmerican ?? null,
    fairPriceMethod: prop.fairPrice?.pricingMethod ?? null,
    expectedValuePct: prop.expectedValuePct ?? prop.evProfile?.edgePct ?? null,
    marketDeltaAmerican:
      typeof prop.marketDeltaAmerican === "number"
        ? prop.marketDeltaAmerican
        : typeof prop.averageOddsAmerican === "number"
          ? offeredOdds - prop.averageOddsAmerican
          : null,
    consensusImpliedProbability:
      prop.marketIntelligence?.consensusImpliedProbability ?? null,
    marketDisagreementScore: prop.marketIntelligence?.marketDisagreementScore ?? null,
    providerHealth,
    snapshotAgeSeconds: prop.marketIntelligence?.snapshotAgeSeconds ?? null,
    staleFlag: prop.marketIntelligence?.staleFlag ?? prop.marketTruth?.stale ?? false,
    bookCount: prop.marketTruth?.bookCount ?? prop.sportsbookCount ?? 1,
    lineMovement: prop.lineMovement ?? prop.marketIntelligence?.openToCurrentDelta ?? null,
    edgeScore: Math.max(prop.edgeScore.score, prop.evProfile?.rankScore ?? 0),
    confidenceScore: prop.confidenceScore ?? prop.fairPrice?.pricingConfidenceScore ?? 0,
    qualityScore: prop.marketTruth?.qualityScore ?? 0,
    fairLineGap: prop.evProfile?.fairLineGap ?? prop.marketTruth?.sharpGapAmerican ?? null,
    bestPriceFlag: prop.marketIntelligence?.bestPriceFlag ?? false,
    reasons: prop.reasons ?? [],
    sourceNote:
      prop.supportNote ?? prop.marketTruth?.note ?? providerHealth?.summary ?? "Prop context only.",
    truthClassification: prop.marketTruth?.classification ?? null,
    profile
  });
}

export function buildBetSignalOpportunity(
  signal: BetSignalView,
  league: OpportunityView["league"],
  providerHealth?: ProviderHealthView | null,
  profile?: OpportunityProfile | null
): OpportunityView {
  return buildOpportunity({
    id: signal.id,
    kind:
      signal.marketType === "moneyline"
        ? "moneyline"
        : signal.marketType === "total"
          ? "game_total"
          : signal.marketType.startsWith("player_") || signal.marketType === "fight_winner"
            ? "prop"
            : "game_side",
    league,
    eventId: signal.externalEventId ?? signal.id,
    eventLabel: signal.eventLabel,
    marketType: signal.marketType,
    selectionLabel: signal.selection,
    sportsbookKey: signal.sportsbookKey ?? null,
    sportsbookName: signal.sportsbookName ?? null,
    displayOddsAmerican: signal.oddsAmerican,
    displayLine: signal.line ?? signal.selection,
    fairPriceAmerican:
      signal.fairPrice?.fairOddsAmerican ?? signal.marketTruth?.fairOddsAmerican ?? null,
    fairPriceMethod: signal.fairPrice?.pricingMethod ?? null,
    expectedValuePct: signal.expectedValuePct ?? signal.evProfile?.edgePct ?? null,
    marketDeltaAmerican:
      typeof signal.marketDeltaAmerican === "number"
        ? signal.marketDeltaAmerican
        : signal.marketTruth?.sharpGapAmerican ?? null,
    consensusImpliedProbability:
      signal.marketIntelligence?.consensusImpliedProbability ?? null,
    marketDisagreementScore: signal.marketIntelligence?.marketDisagreementScore ?? null,
    providerHealth,
    snapshotAgeSeconds: signal.marketIntelligence?.snapshotAgeSeconds ?? null,
    staleFlag: signal.marketIntelligence?.staleFlag ?? signal.marketTruth?.stale ?? false,
    bookCount: signal.marketTruth?.bookCount ?? 1,
    lineMovement: signal.marketIntelligence?.openToCurrentDelta ?? null,
    edgeScore: Math.max(signal.edgeScore.score, signal.evProfile?.rankScore ?? 0),
    confidenceScore: signal.confidenceScore ?? signal.fairPrice?.pricingConfidenceScore ?? 0,
    qualityScore: signal.marketTruth?.qualityScore ?? 0,
    fairLineGap: signal.evProfile?.fairLineGap ?? signal.marketTruth?.sharpGapAmerican ?? null,
    bestPriceFlag: signal.marketIntelligence?.bestPriceFlag ?? false,
    reasons: signal.reasons ?? [],
    sourceNote:
      signal.supportNote ?? signal.marketTruth?.note ?? providerHealth?.summary ?? "Signal context only.",
    truthClassification: signal.marketTruth?.classification ?? null,
    profile
  });
}

export function rankOpportunities<T extends OpportunityView>(opportunities: T[]) {
  return [...opportunities].sort((a, b) => {
    const aDead =
      a.actionState === "PASS" ||
      a.trapFlags.includes("STALE_EDGE") ||
      a.trapFlags.includes("LOW_PROVIDER_HEALTH");

    const bDead =
      b.actionState === "PASS" ||
      b.trapFlags.includes("STALE_EDGE") ||
      b.trapFlags.includes("LOW_PROVIDER_HEALTH");

    if (aDead !== bDead) {
      return aDead ? 1 : -1;
    }

    const actionDelta =
      getActionPriority(b.actionState) - getActionPriority(a.actionState);
    if (actionDelta !== 0) {
      return actionDelta;
    }

    const timingDelta =
      (b.scoreComponents?.timingQuality ?? 0) -
      (a.scoreComponents?.timingQuality ?? 0);
    if (timingDelta !== 0) {
      return timingDelta;
    }

    const scoreDelta = b.opportunityScore - a.opportunityScore;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const confidenceDelta =
      getConfidencePriority(b.confidenceTier) -
      getConfidencePriority(a.confidenceTier);
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }

    return (b.expectedValuePct ?? -999) - (a.expectedValuePct ?? -999);
  });
}

export function buildHomeOpportunitySnapshot(args: {
  games: GameCardView[];
  props: PropCardView[];
  providerHealth?: ProviderHealthView | null;
  performance?: PerformanceDashboardView | null;
}): OpportunityHomeSnapshot {
  const profile = buildOpportunityProfile(args.performance);

  const boardCandidates = args.games.flatMap((game) =>
    (["spread", "moneyline", "total"] as const).map((marketType) =>
      buildGameMarketOpportunity(game, marketType, args.providerHealth, profile)
    )
  );

  const propCandidates = args.props.map((prop) =>
    buildPropOpportunity(prop, args.providerHealth, profile)
  );

  const boardTop = rankOpportunities(
    boardCandidates.filter(shouldSurfaceHomeOpportunity)
  ).slice(0, 5);

  const propsTop = rankOpportunities(
    propCandidates.filter(shouldSurfaceHomeOpportunity)
  ).slice(0, 5);

  const surfaced = [...boardTop, ...propsTop];

  const traps = rankOpportunities(
    surfaced.filter((opportunity) => opportunity.trapFlags.length)
  )
    .sort((left, right) => right.trapFlags.length - left.trapFlags.length)
    .slice(0, 3);

  const timingWindows = rankOpportunities(
    surfaced.filter((opportunity) => opportunity.actionState === "BET_NOW")
  ).slice(0, 4);

  return {
    boardTop,
    propsTop,
    traps,
    timingWindows
  };
}