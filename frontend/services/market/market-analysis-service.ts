import { buildReasonAttribution } from "@/services/market/reason-attribution-service";
import { buildMarketTruth, type MarketPriceSample } from "@/services/market/market-truth-service";
import { buildFairPrice, buildEvResult } from "@/services/fair-price/fair-price-service";
import { buildMarketIntelligence } from "@/services/market-intelligence/market-intelligence-service";
import { buildNormalizedSnapshotsFromPriceSamples, matchSnapshotsBySportsbook } from "@/services/odds-normalization/odds-snapshot-repository";
import type {
  BoardSupportStatus,
  ConfidenceBand,
  EvResultView,
  FairPriceMethod,
  FairPriceView,
  MarketIntelligenceView,
  MarketTruthView,
  ReasonAttributionView,
  MarketType,
  SportCode,
  LeagueKey
} from "@/lib/types/domain";

export type MarketAnalysisResult = {
  canonicalMarketKey: string | null;
  marketTruth: MarketTruthView;
  reasons: ReasonAttributionView[];
  confidenceBand: ConfidenceBand;
  confidenceScore: number;
  hidden: boolean;
  fairPrice: FairPriceView | null;
  ev: EvResultView | null;
  marketIntelligence: MarketIntelligenceView | null;
  expectedValuePct: number | null;
  bestPriceFlag: boolean;
};

export function analyzeMarket(args: {
  marketLabel: string;
  sport: SportCode;
  league: LeagueKey;
  eventId: string;
  providerEventId?: string | null;
  marketType: MarketType;
  marketScope: "game" | "team" | "player" | "fight" | "market";
  side: string;
  oppositeSide?: string | null;
  line?: number | null;
  participantTeamId?: string | null;
  participantPlayerId?: string | null;
  offeredSportsbookKey?: string | null;
  offeredOddsAmerican: number | null | undefined;
  sideSamples: MarketPriceSample[];
  oppositeSamples?: MarketPriceSample[];
  lineMovement?: number | null;
  supportNote?: string | null;
  supportStatus?: BoardSupportStatus;
  sourceName: string;
  sourceType: "api" | "scraper" | "manual" | "worker" | "derived" | "mock" | string;
  isLive: boolean;
  fairPriceMethod?: FairPriceMethod;
}) {
  const marketTruth = buildMarketTruth({
    marketLabel: args.marketLabel,
    offeredOddsAmerican: args.offeredOddsAmerican,
    sideSamples: args.sideSamples,
    oppositeSamples: args.oppositeSamples ?? [],
    lineMovement: args.lineMovement
  });

  const sideSnapshots = buildNormalizedSnapshotsFromPriceSamples(
    {
      sport: args.sport,
      league: args.league,
      eventId: args.eventId,
      providerEventId: args.providerEventId ?? null,
      marketType: args.marketType,
      marketScope: args.marketScope,
      side: args.side,
      line: args.line ?? null,
      participantTeamId: args.participantTeamId ?? null,
      participantPlayerId: args.participantPlayerId ?? null,
      isLive: args.isLive,
      source: args.sourceType,
      sourceName: args.sourceName,
      sourceType: args.sourceType
    },
    args.sideSamples
  );

  const oppositeSnapshots = buildNormalizedSnapshotsFromPriceSamples(
    {
      sport: args.sport,
      league: args.league,
      eventId: args.eventId,
      providerEventId: args.providerEventId ?? null,
      marketType: args.marketType,
      marketScope: args.marketScope,
      side: args.oppositeSide ?? "opposite",
      line: args.line ?? null,
      participantTeamId: args.participantTeamId ?? null,
      participantPlayerId: args.participantPlayerId ?? null,
      isLive: args.isLive,
      source: args.sourceType,
      sourceName: args.sourceName,
      sourceType: args.sourceType
    },
    args.oppositeSamples ?? []
  );

  const marketIntelligence = sideSnapshots.length
    ? buildMarketIntelligence({
        marketLabel: args.marketLabel,
        sideSnapshots,
        offeredSportsbookKey: args.offeredSportsbookKey ?? null
      })
    : null;

  const matchedPairs = matchSnapshotsBySportsbook(sideSnapshots, oppositeSnapshots);
  const fairPrice = buildFairPrice({
    method: args.fairPriceMethod ?? "consensus_no_vig",
    sidePrices: matchedPairs.map((pair) => pair.side.oddsAmerican),
    oppositePrices: matchedPairs.map((pair) => pair.opposite.oddsAmerican),
    matchedPairCount: matchedPairs.length,
    staleCount: matchedPairs.filter((pair) => pair.side.isStale || pair.opposite.isStale).length
  });
  const ev = buildEvResult({
    offeredOddsAmerican: args.offeredOddsAmerican,
    fairPrice,
    marketIntelligence
  });

  const attribution = buildReasonAttribution({
    marketLabel: args.marketLabel,
    marketTruth,
    modelEdgePct: ev?.edgePct ?? null,
    lineMovement: marketIntelligence?.lineMovement?.lineDelta ?? args.lineMovement ?? null,
    supportNote:
      fairPrice.coverageNote && fairPrice.pricingConfidenceScore < 40
        ? `${args.supportNote ?? ""} ${fairPrice.coverageNote}`.trim()
        : args.supportNote ?? null,
    valueFlag: marketIntelligence?.bestPriceFlag ? "BEST_PRICE" : "NONE"
  });

  return {
    canonicalMarketKey:
      sideSnapshots.find((snapshot) => snapshot.sportsbookKey === (args.offeredSportsbookKey ?? ""))?.canonicalMarketKey ??
      sideSnapshots[0]?.canonicalMarketKey ??
      null,
    marketTruth,
    reasons: attribution.reasons,
    confidenceBand: attribution.confidenceBand,
    confidenceScore: attribution.confidenceScore,
    hidden: attribution.suppress,
    fairPrice,
    ev,
    marketIntelligence,
    expectedValuePct: ev?.evPerUnit !== null && typeof ev?.evPerUnit === "number" ? Number((ev.evPerUnit * 100).toFixed(2)) : null,
    bestPriceFlag: marketIntelligence?.bestPriceFlag ?? false
  } satisfies MarketAnalysisResult;
}
