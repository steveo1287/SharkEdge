import { Prisma } from "@prisma/client";

import {
  americanToImplied,
  calculateEV,
  fairOddsAmericanFromProbability,
  kellySize,
  stripVig
} from "@/lib/odds/index";
import { prisma } from "@/lib/db/prisma";
import { estimateOverUnderProbabilities } from "@/services/modeling/market-distribution";

function confidenceLabel(sampleSize: number, edgeDelta: number, hold: number) {
  const base = Math.min(1, sampleSize / 50) * 50;
  const edgeBoost = Math.min(30, Math.abs(edgeDelta) * 100);
  const holdPenalty = Math.min(25, hold * 100);
  return Math.max(0, Math.min(100, base + edgeBoost - holdPenalty));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function impliedProbabilityFromAmerican(odds: number | null | undefined) {
  return typeof odds === "number" ? americanToImplied(odds) : null;
}

function noVigFromTwoWay(leftOdds?: number | null, rightOdds?: number | null) {
  const left = impliedProbabilityFromAmerican(leftOdds);
  const right = impliedProbabilityFromAmerican(rightOdds);
  if (typeof left !== "number" || typeof right !== "number") return null;
  const stripped = stripVig([left, right]);
  if (stripped.length !== 2) return null;
  return { left: stripped[0], right: stripped[1], hold: left + right - 1 };
}

function eventProjectionMetadata(eventProjection: { metadataJson: Prisma.JsonValue | null } | null | undefined) {
  return asRecord(eventProjection?.metadataJson);
}

function getPeriodBlock(metadata: Record<string, any>, period: string) {
  return (period === "first_5" ? metadata.firstFive : metadata.fullGame) ?? {};
}

function buildProjectionMap(
  projections: Array<{
    playerId: string;
    statKey: string;
    meanValue: number;
    stdDev: number | null;
    modelRunId: string;
    metadataJson: Prisma.JsonValue | null;
  }>
) {
  const map = new Map<string, (typeof projections)[number]>();
  for (const projection of projections) {
    const key = `${projection.playerId}:${projection.statKey}`;
    if (!map.has(key)) map.set(key, projection);
  }
  return map;
}

function buildFairPrice(probability: number | null | undefined) {
  if (typeof probability !== "number" || !Number.isFinite(probability) || probability <= 0 || probability >= 1) return null;
  return fairOddsAmericanFromProbability(probability);
}

function getTunedPropGate(args: {
  projectionMeta: Record<string, any>;
  side: "over" | "under";
  modelProb: number;
  noVigProb?: number | null;
  evPercent: number;
}) {
  const calibration = asRecord(args.projectionMeta.marketCalibration);
  const tuningAction = String(args.projectionMeta.tuningAction ?? calibration.tuningAction ?? "STANDARD").toUpperCase();
  const minPlayableEdge =
    readNumber(args.projectionMeta.minPlayableEdge) ??
    readNumber(calibration.minPlayableEdge) ??
    0.04;
  const calibrationModelEdge = readNumber(calibration.modelEdgeProbability);
  const modelEdgeProbability =
    typeof args.noVigProb === "number"
      ? args.modelProb - args.noVigProb
      : calibrationModelEdge;
  const effectiveEdge = typeof modelEdgeProbability === "number" ? modelEdgeProbability : args.evPercent / 100;
  const marketBlendWeight = readNumber(calibration.marketBlendWeight);
  const confidence = readNumber(calibration.confidence);
  const flags: string[] = [];

  if (tuningAction === "PASS_ONLY") flags.push("TUNING_PASS_ONLY");
  if (tuningAction === "CAUTION") flags.push("TUNING_CAUTION");
  if (effectiveEdge < minPlayableEdge) flags.push("TUNED_EDGE_BELOW_THRESHOLD");

  return {
    pass: tuningAction !== "PASS_ONLY" && effectiveEdge >= minPlayableEdge,
    tuningAction,
    minPlayableEdge,
    modelEdgeProbability,
    effectiveEdge,
    marketBlendWeight,
    confidence,
    flags
  };
}

async function createEdgeSignal(args: {
  eventId: string;
  marketType: string;
  period: string;
  selectionCompetitorId?: string | null;
  playerId?: string | null;
  sportsbookId: string;
  side: string;
  lineValue?: number | null;
  offeredOddsAmerican: number;
  modelProb: number;
  noVigProb?: number | null;
  evPercent: number;
  fairOddsAmerican?: number | null;
  modelRunId?: string | null;
  flags: string[];
  metadata?: Record<string, unknown>;
  sampleSize?: number;
  hold?: number;
}) {
  const hold = args.hold ?? 0.05;
  const confidenceScore = confidenceLabel(args.sampleSize ?? 20, args.evPercent / 100, hold);
  const kellyFull = kellySize({ offeredOddsAmerican: args.offeredOddsAmerican, modelProbability: args.modelProb }) ?? 0;

  await prisma.edgeSignal.create({
    data: {
      eventId: args.eventId,
      marketType: args.marketType as never,
      period: args.period,
      selectionCompetitorId: args.selectionCompetitorId ?? null,
      playerId: args.playerId ?? null,
      sportsbookId: args.sportsbookId,
      side: args.side,
      lineValue: args.lineValue ?? null,
      offeredOddsAmerican: args.offeredOddsAmerican,
      fairOddsAmerican: args.fairOddsAmerican ?? null,
      modelProb: round(args.modelProb, 6),
      noVigProb: typeof args.noVigProb === "number" ? round(args.noVigProb, 6) : null,
      evPercent: round(args.evPercent, 4),
      kellyFull: Math.min(25, kellyFull),
      kellyHalf: Math.min(12.5, kellyFull / 2),
      confidenceScore,
      edgeScore: round(args.evPercent + confidenceScore / 10, 4),
      flagsJson: args.flags as Prisma.InputJsonValue,
      modelRunId: args.modelRunId ?? null,
      metadataJson: args.metadata ? (args.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      isActive: true
    } as any
  });
}

export async function recomputeCurrentMarketState(eventId?: string) {
  const events = await prisma.event.findMany({ where: eventId ? { id: eventId } : undefined, select: { id: true } });

  for (const event of events) {
    await prisma.currentMarketState.deleteMany({ where: { eventId: event.id } });
    const eventMarkets = await prisma.eventMarket.findMany({ where: { eventId: event.id }, orderBy: { updatedAt: "desc" } });
    const groups = new Map<string, typeof eventMarkets>();

    for (const market of eventMarkets) {
      const key = [market.marketType, market.period ?? "full_game", market.selectionCompetitorId ?? "none", market.playerId ?? "none"].join(":");
      groups.set(key, [...(groups.get(key) ?? []), market]);
    }

    console.log(`[market-state] event=${event.id} rawEventMarkets=${eventMarkets.length} groups=${groups.size}`);

    for (const [groupKey, groupMarkets] of groups.entries()) {
      const [marketType, period, selectionCompetitorIdRaw, playerIdRaw] = groupKey.split(":");
      const selectionCompetitorId = selectionCompetitorIdRaw === "none" ? null : selectionCompetitorIdRaw;
      const playerId = playerIdRaw === "none" ? null : playerIdRaw;
      const latestByBookAndSide = new Map<string, (typeof groupMarkets)[number]>();

      for (const market of groupMarkets) {
        const dedupeKey = [market.sportsbookId ?? "none", market.side ?? "none", normalizeToken(market.selection), selectionCompetitorId ?? "none", playerId ?? "none"].join(":");
        const existing = latestByBookAndSide.get(dedupeKey);
        if (!existing || existing.updatedAt < market.updatedAt) latestByBookAndSide.set(dedupeKey, market);
      }

      const markets = Array.from(latestByBookAndSide.values());
      const home = markets.filter((row) => row.side === "home").sort((a, b) => b.oddsAmerican - a.oddsAmerican)[0];
      const away = markets.filter((row) => row.side === "away").sort((a, b) => b.oddsAmerican - a.oddsAmerican)[0];
      const over = markets.filter((row) => row.side === "over").sort((a, b) => b.oddsAmerican - a.oddsAmerican)[0];
      const under = markets.filter((row) => row.side === "under").sort((a, b) => b.oddsAmerican - a.oddsAmerican)[0];
      const hasUsableOdds = [home, away, over, under].some((row) => typeof row?.oddsAmerican === "number");
      if (!hasUsableOdds) continue;

      const lineRows = markets.filter((row) => typeof (row.currentLine ?? row.line) === "number");
      const consensusLineValue = lineRows.length
        ? lineRows.reduce((sum, row) => sum + Number(row.currentLine ?? row.line ?? 0), 0) / lineRows.length
        : null;

      await prisma.currentMarketState.create({
        data: {
          eventId: event.id,
          marketType: marketType as never,
          period,
          selectionCompetitorId,
          playerId,
          consensusLineValue,
          bestHomeOddsAmerican: home?.oddsAmerican ?? null,
          bestHomeBookId: home?.sportsbookId ?? null,
          bestAwayOddsAmerican: away?.oddsAmerican ?? null,
          bestAwayBookId: away?.sportsbookId ?? null,
          bestOverOddsAmerican: over?.oddsAmerican ?? null,
          bestOverBookId: over?.sportsbookId ?? null,
          bestUnderOddsAmerican: under?.oddsAmerican ?? null,
          bestUnderBookId: under?.sportsbookId ?? null,
          noVigSource: home && away ? "market-average" : over && under ? "market-average" : null
        } as any
      });
    }
  }
}

export async function recomputeEdgeSignals(eventId?: string) {
  const events = await prisma.event.findMany({
    where: eventId ? { id: eventId } : undefined,
    include: {
      participants: { include: { competitor: true } },
      currentMarketStates: true,
      eventProjections: { orderBy: { modelRun: { createdAt: "desc" } }, take: 1 },
      playerProjections: { orderBy: [{ modelRun: { createdAt: "desc" } }, { id: "desc" }] }
    }
  });

  for (const event of events) {
    await prisma.edgeSignal.updateMany({ where: { eventId: event.id, isActive: true }, data: { isActive: false, expiresAt: new Date() } });

    const eventProjection = event.eventProjections[0] ?? null;
    const eventMetadata = eventProjectionMetadata(eventProjection);
    const playerProjectionMap = buildProjectionMap(event.playerProjections);
    const homeTeamId = eventMetadata.homeTeam?.id ?? null;
    const awayTeamId = eventMetadata.awayTeam?.id ?? null;
    const homeCompetitorId = event.participants.find((participant) => participant.role === "HOME")?.competitorId ?? null;
    const awayCompetitorId = event.participants.find((participant) => participant.role === "AWAY")?.competitorId ?? null;

    for (const marketState of event.currentMarketStates) {
      const periodBlock = getPeriodBlock(eventMetadata, (marketState as any).period ?? "full_game");
      const period = (marketState as any).period ?? "full_game";

      if (marketState.marketType === "moneyline" && !eventProjection) {
        const noVig = noVigFromTwoWay(marketState.bestHomeOddsAmerican, marketState.bestAwayOddsAmerican);
        if (noVig && typeof marketState.bestHomeOddsAmerican === "number" && marketState.bestHomeBookId) {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestHomeOddsAmerican, modelProbability: noVig.left });
          if (evPercent !== null) await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, sportsbookId: marketState.bestHomeBookId, side: "home", lineValue: marketState.consensusLineValue, offeredOddsAmerican: marketState.bestHomeOddsAmerican, modelProb: noVig.left, noVigProb: noVig.left, fairOddsAmerican: buildFairPrice(noVig.left), evPercent, flags: ["NO_VIG_EDGE", "NO_MODEL"], metadata: { engine: "no-vig-consensus", marketFamily: "moneyline", period }, sampleSize: 10, hold: noVig.hold });
        }
        if (noVig && typeof marketState.bestAwayOddsAmerican === "number" && marketState.bestAwayBookId) {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestAwayOddsAmerican, modelProbability: noVig.right });
          if (evPercent !== null) await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, sportsbookId: marketState.bestAwayBookId, side: "away", lineValue: marketState.consensusLineValue, offeredOddsAmerican: marketState.bestAwayOddsAmerican, modelProb: noVig.right, noVigProb: noVig.right, fairOddsAmerican: buildFairPrice(noVig.right), evPercent, flags: ["NO_VIG_EDGE", "NO_MODEL"], metadata: { engine: "no-vig-consensus", marketFamily: "moneyline", period }, sampleSize: 10, hold: noVig.hold });
        }
      }

      if (marketState.marketType === "total" && !eventProjection) {
        const noVig = noVigFromTwoWay(marketState.bestOverOddsAmerican, marketState.bestUnderOddsAmerican);
        if (noVig && typeof marketState.bestOverOddsAmerican === "number" && marketState.bestOverBookId) {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestOverOddsAmerican, modelProbability: noVig.left });
          if (evPercent !== null) await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, sportsbookId: marketState.bestOverBookId, side: "over", lineValue: marketState.consensusLineValue, offeredOddsAmerican: marketState.bestOverOddsAmerican, modelProb: noVig.left, noVigProb: noVig.left, fairOddsAmerican: buildFairPrice(noVig.left), evPercent, flags: ["NO_VIG_EDGE", "NO_MODEL", "TOTAL_MARKET"], metadata: { engine: "no-vig-consensus", marketFamily: "total", period }, sampleSize: 10, hold: noVig.hold });
        }
        if (noVig && typeof marketState.bestUnderOddsAmerican === "number" && marketState.bestUnderBookId) {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestUnderOddsAmerican, modelProbability: noVig.right });
          if (evPercent !== null) await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, sportsbookId: marketState.bestUnderBookId, side: "under", lineValue: marketState.consensusLineValue, offeredOddsAmerican: marketState.bestUnderOddsAmerican, modelProb: noVig.right, noVigProb: noVig.right, fairOddsAmerican: buildFairPrice(noVig.right), evPercent, flags: ["NO_VIG_EDGE", "NO_MODEL", "TOTAL_MARKET"], metadata: { engine: "no-vig-consensus", marketFamily: "total", period }, sampleSize: 10, hold: noVig.hold });
        }
      }

      if (marketState.marketType === "moneyline" && eventProjection) {
        const noVig = noVigFromTwoWay(marketState.bestHomeOddsAmerican, marketState.bestAwayOddsAmerican);
        const probabilities = {
          home: typeof periodBlock.winProbHome === "number" ? periodBlock.winProbHome : eventProjection.winProbHome,
          away: typeof periodBlock.winProbAway === "number" ? periodBlock.winProbAway : eventProjection.winProbAway
        };
        if (typeof marketState.bestHomeOddsAmerican === "number" && marketState.bestHomeBookId && typeof probabilities.home === "number") {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestHomeOddsAmerican, modelProbability: probabilities.home });
          if (evPercent !== null) await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, sportsbookId: marketState.bestHomeBookId, side: "home", lineValue: marketState.consensusLineValue, offeredOddsAmerican: marketState.bestHomeOddsAmerican, modelProb: probabilities.home, noVigProb: noVig?.left ?? null, fairOddsAmerican: buildFairPrice(probabilities.home), evPercent, modelRunId: eventProjection.modelRunId, flags: ["MODEL_EDGE", ...(period === "first_5" ? ["FIRST_5"] : [])], metadata: { engine: eventMetadata.engine ?? "event-projection", marketFamily: "moneyline", period }, sampleSize: 30, hold: noVig?.hold ?? 0.04 });
        }
        if (typeof marketState.bestAwayOddsAmerican === "number" && marketState.bestAwayBookId && typeof probabilities.away === "number") {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestAwayOddsAmerican, modelProbability: probabilities.away });
          if (evPercent !== null) await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, sportsbookId: marketState.bestAwayBookId, side: "away", lineValue: marketState.consensusLineValue, offeredOddsAmerican: marketState.bestAwayOddsAmerican, modelProb: probabilities.away, noVigProb: noVig?.right ?? null, fairOddsAmerican: buildFairPrice(probabilities.away), evPercent, modelRunId: eventProjection.modelRunId, flags: ["MODEL_EDGE", ...(period === "first_5" ? ["FIRST_5"] : [])], metadata: { engine: eventMetadata.engine ?? "event-projection", marketFamily: "moneyline", period }, sampleSize: 30, hold: noVig?.hold ?? 0.04 });
        }
      }

      if (marketState.marketType === "total" && eventProjection) {
        const probabilities = estimateOverUnderProbabilities({ mean: typeof periodBlock.projectedTotalRuns === "number" ? periodBlock.projectedTotalRuns : eventProjection.projectedTotal, line: marketState.consensusLineValue, stdDev: typeof periodBlock.totalStdDev === "number" ? periodBlock.totalStdDev : 1.8 });
        const noVig = noVigFromTwoWay(marketState.bestOverOddsAmerican, marketState.bestUnderOddsAmerican);
        if (probabilities && typeof marketState.bestOverOddsAmerican === "number" && marketState.bestOverBookId) {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestOverOddsAmerican, modelProbability: probabilities.overProb });
          if (evPercent !== null) await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, sportsbookId: marketState.bestOverBookId, side: "over", lineValue: marketState.consensusLineValue, offeredOddsAmerican: marketState.bestOverOddsAmerican, modelProb: probabilities.overProb, noVigProb: noVig?.left ?? null, fairOddsAmerican: buildFairPrice(probabilities.overProb), evPercent, modelRunId: eventProjection.modelRunId, flags: ["MODEL_EDGE", "TOTAL_MARKET", ...(period === "first_5" ? ["FIRST_5"] : [])], metadata: { engine: eventMetadata.engine ?? "event-projection", marketFamily: "total", period, pushProb: probabilities.pushProb }, sampleSize: 30, hold: noVig?.hold ?? 0.04 });
        }
        if (probabilities && typeof marketState.bestUnderOddsAmerican === "number" && marketState.bestUnderBookId) {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestUnderOddsAmerican, modelProbability: probabilities.underProb });
          if (evPercent !== null) await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, sportsbookId: marketState.bestUnderBookId, side: "under", lineValue: marketState.consensusLineValue, offeredOddsAmerican: marketState.bestUnderOddsAmerican, modelProb: probabilities.underProb, noVigProb: noVig?.right ?? null, fairOddsAmerican: buildFairPrice(probabilities.underProb), evPercent, modelRunId: eventProjection.modelRunId, flags: ["MODEL_EDGE", "TOTAL_MARKET", ...(period === "first_5" ? ["FIRST_5"] : [])], metadata: { engine: eventMetadata.engine ?? "event-projection", marketFamily: "total", period, pushProb: probabilities.pushProb }, sampleSize: 30, hold: noVig?.hold ?? 0.04 });
        }
      }

      if (marketState.marketType === "team_total" && eventProjection && (marketState as any).selectionCompetitorId) {
        const selectionCompetitorId = (marketState as any).selectionCompetitorId as string;
        const isHome = selectionCompetitorId === homeCompetitorId || selectionCompetitorId === homeTeamId;
        const teamMean = typeof (isHome ? periodBlock.projectedHomeRuns : periodBlock.projectedAwayRuns) === "number" ? (isHome ? periodBlock.projectedHomeRuns : periodBlock.projectedAwayRuns) : isHome ? eventProjection.projectedHomeScore : eventProjection.projectedAwayScore;
        const teamStdDev = typeof (isHome ? periodBlock.homeRunsStdDev : periodBlock.awayRunsStdDev) === "number" ? (isHome ? periodBlock.homeRunsStdDev : periodBlock.awayRunsStdDev) : 1.35;
        const probabilities = estimateOverUnderProbabilities({ mean: teamMean, line: marketState.consensusLineValue, stdDev: teamStdDev });
        const noVig = noVigFromTwoWay(marketState.bestOverOddsAmerican, marketState.bestUnderOddsAmerican);
        if (probabilities && typeof marketState.bestOverOddsAmerican === "number" && marketState.bestOverBookId) {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestOverOddsAmerican, modelProbability: probabilities.overProb });
          if (evPercent !== null) await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, selectionCompetitorId, sportsbookId: marketState.bestOverBookId, side: "over", lineValue: marketState.consensusLineValue, offeredOddsAmerican: marketState.bestOverOddsAmerican, modelProb: probabilities.overProb, noVigProb: noVig?.left ?? null, fairOddsAmerican: buildFairPrice(probabilities.overProb), evPercent, modelRunId: eventProjection.modelRunId, flags: ["MODEL_EDGE", "TEAM_TOTAL", ...(period === "first_5" ? ["FIRST_5"] : [])], metadata: { engine: eventMetadata.engine ?? "event-projection", marketFamily: "team_total", period, teamSide: isHome ? "home" : "away", projectedRuns: teamMean, pushProb: probabilities.pushProb }, sampleSize: 26, hold: noVig?.hold ?? 0.05 });
        }
        if (probabilities && typeof marketState.bestUnderOddsAmerican === "number" && marketState.bestUnderBookId) {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestUnderOddsAmerican, modelProbability: probabilities.underProb });
          if (evPercent !== null) await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, selectionCompetitorId, sportsbookId: marketState.bestUnderBookId, side: "under", lineValue: marketState.consensusLineValue, offeredOddsAmerican: marketState.bestUnderOddsAmerican, modelProb: probabilities.underProb, noVigProb: noVig?.right ?? null, fairOddsAmerican: buildFairPrice(probabilities.underProb), evPercent, modelRunId: eventProjection.modelRunId, flags: ["MODEL_EDGE", "TEAM_TOTAL", ...(period === "first_5" ? ["FIRST_5"] : [])], metadata: { engine: eventMetadata.engine ?? "event-projection", marketFamily: "team_total", period, teamSide: isHome ? "home" : "away", projectedRuns: teamMean, pushProb: probabilities.pushProb }, sampleSize: 26, hold: noVig?.hold ?? 0.05 });
        }
      }

      if (marketState.playerId) {
        const projection = playerProjectionMap.get(`${marketState.playerId}:${marketState.marketType}`);
        if (!projection) continue;
        const projectionMeta = asRecord(projection.metadataJson);
        const lineValue = marketState.consensusLineValue ?? projection.meanValue;
        const probabilities = estimateOverUnderProbabilities({ mean: projection.meanValue, line: lineValue, stdDev: projection.stdDev ?? 1.2 });
        const noVig = noVigFromTwoWay(marketState.bestOverOddsAmerican, marketState.bestUnderOddsAmerican);
        if (!probabilities) continue;

        if (typeof marketState.bestOverOddsAmerican === "number" && marketState.bestOverBookId) {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestOverOddsAmerican, modelProbability: probabilities.overProb });
          if (evPercent !== null) {
            const gate = getTunedPropGate({ projectionMeta, side: "over", modelProb: probabilities.overProb, noVigProb: noVig?.left ?? null, evPercent });
            if (gate.pass) {
              await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, playerId: marketState.playerId, sportsbookId: marketState.bestOverBookId, side: "over", lineValue, offeredOddsAmerican: marketState.bestOverOddsAmerican, modelProb: probabilities.overProb, noVigProb: noVig?.left ?? null, fairOddsAmerican: buildFairPrice(probabilities.overProb), evPercent, modelRunId: projection.modelRunId, flags: ["MODEL_EDGE", "PLAYER_PROP", "TUNED_PROP_GATE", ...gate.flags], metadata: { engine: projectionMeta.engine ?? "player-projection", starterName: projectionMeta.starterName ?? null, statKey: projection.statKey, pushProb: probabilities.pushProb, minPlayableEdge: gate.minPlayableEdge, modelEdgeProbability: gate.modelEdgeProbability, effectiveEdge: gate.effectiveEdge, tuningAction: gate.tuningAction, marketBlendWeight: gate.marketBlendWeight, calibrationConfidence: gate.confidence }, sampleSize: Number(projectionMeta.sampleSize ?? 12), hold: noVig?.hold ?? 0.05 });
            }
          }
        }

        if (typeof marketState.bestUnderOddsAmerican === "number" && marketState.bestUnderBookId) {
          const evPercent = calculateEV({ offeredOddsAmerican: marketState.bestUnderOddsAmerican, modelProbability: probabilities.underProb });
          if (evPercent !== null) {
            const gate = getTunedPropGate({ projectionMeta, side: "under", modelProb: probabilities.underProb, noVigProb: noVig?.right ?? null, evPercent });
            if (gate.pass) {
              await createEdgeSignal({ eventId: event.id, marketType: marketState.marketType, period, playerId: marketState.playerId, sportsbookId: marketState.bestUnderBookId, side: "under", lineValue, offeredOddsAmerican: marketState.bestUnderOddsAmerican, modelProb: probabilities.underProb, noVigProb: noVig?.right ?? null, fairOddsAmerican: buildFairPrice(probabilities.underProb), evPercent, modelRunId: projection.modelRunId, flags: ["MODEL_EDGE", "PLAYER_PROP", "TUNED_PROP_GATE", ...gate.flags], metadata: { engine: projectionMeta.engine ?? "player-projection", starterName: projectionMeta.starterName ?? null, statKey: projection.statKey, pushProb: probabilities.pushProb, minPlayableEdge: gate.minPlayableEdge, modelEdgeProbability: gate.modelEdgeProbability, effectiveEdge: gate.effectiveEdge, tuningAction: gate.tuningAction, marketBlendWeight: gate.marketBlendWeight, calibrationConfidence: gate.confidence }, sampleSize: Number(projectionMeta.sampleSize ?? 12), hold: noVig?.hold ?? 0.05 });
            }
          }
        }
      }
    }
  }
}
