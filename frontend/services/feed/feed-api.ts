import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { prisma } from "@/lib/db/prisma";
import { getBoardFeed } from "@/services/market-data/market-data-service";
import { getPropsExplorerData } from "@/services/odds/props-service";
import { buildSimulationEnhancementReport, summarizeXFactors } from "@/services/analytics/xfactor-engine";
import { buildScenarioSet, buildSimulationDecomposition } from "@/services/modeling/simulation-decomposition";
import { persistEdgeExplanation } from "@/services/feed/edge-explanation-store";
import { applyFactorBucketPenalty, extractDegradedFactorBuckets, qualifiesWinnerMarket } from "@/services/calibration/calibration-actionability-service";
import { listRecentCalibrationSummaries } from "@/services/calibration/calibration-summary-store";
import { buildAdvancedStatContext } from "@/services/modeling/advanced-stat-context-service";

export async function getBoardApi(
  leagueKey?: string,
  options?: { skipCache?: boolean }
) {
  return getBoardFeed(leagueKey, options);
}


function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function extractEdgeXFactors(signal: {
  eventId: string;
  event: { league: { key: string; sport: string }; metadataJson?: unknown; name: string };
  side: string;
  metadataJson?: unknown;
}) {
  const metadata = asObject(signal.metadataJson);
  const embedded = asObject(metadata?.xfactors);
  if (embedded) {
    return embedded;
  }

  const report = buildSimulationEnhancementReport({
    sport: signal.event.league.sport,
    eventId: signal.eventId,
    weather: {
      indoor: Boolean(asObject(signal.event.metadataJson)?.indoor ?? false),
      surface: (asObject(signal.event.metadataJson)?.surface as string | undefined) ?? null,
      altitudeFt: Number(asObject(signal.event.metadataJson)?.altitudeFt ?? 0) || null,
      travelMilesHome: 30,
      travelMilesAway: 500,
      circadianPenaltyHome: 0.01,
      circadianPenaltyAway: 0.08,
      providers: [
        {
          provider: "Windy",
          model: "ECMWF",
          temperatureF: 66,
          windMph: 9,
          gustMph: 15,
          humidityPct: 59,
          precipitationProbabilityPct: 16,
          cloudCoverPct: 35,
          confidence: 0.71
        },
        {
          provider: "NOAA",
          model: "NDFD",
          temperatureF: 65,
          windMph: 8,
          gustMph: 13,
          humidityPct: 61,
          precipitationProbabilityPct: 18,
          cloudCoverPct: 41,
          confidence: 0.68
        }
      ]
    },
    offenseVsDefenseGap: typeof metadata?.modelProb === "number" ? metadata.modelProb - 0.5 : 0.05,
    tempoGap: 0.04,
    styleClash: signal.side.toLowerCase().includes("over") ? 0.06 : 0.03,
    travelFatigueAway: 0.08,
    travelFatigueHome: 0.02,
    ratings: {
      teamOverall: 82,
      teamOffense: 81,
      teamDefense: 80,
      starPowerIndex: 0.57,
      depthIndex: 0.55
    }
  });

  return {
    ...report,
    summary: summarizeXFactors(report)
  };
}

type EdgeScoreBlendInput = {
  baseEdgeScore: number | null;
  evPercent: number;
  confidenceScore: number | null;
  xfactorScore: number;
  xfactorConfidence: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function computeAdjustedEdgeScore(input: EdgeScoreBlendInput) {
  const baseEdgeScore = input.baseEdgeScore ?? 0;
  const normalizedEdge = clamp(baseEdgeScore / 100, -1, 1);
  const normalizedEv = clamp(input.evPercent / 10, -1, 1.5);
  const normalizedConfidence = clamp((input.confidenceScore ?? 50) / 100, 0, 1);
  const normalizedXFactor = clamp(input.xfactorScore, -0.35, 0.35);

  const cappedXFactorLift = clamp(normalizedXFactor * (0.08 + input.xfactorConfidence * 0.12), -0.06, 0.1);
  const baseComposite = normalizedEdge * 0.58 + normalizedEv * 0.27 + normalizedConfidence * 0.15;
  const adjustedComposite = baseComposite + cappedXFactorLift;
  const adjustedEdgeScore = round(adjustedComposite * 100, 2);

  return {
    adjustedEdgeScore,
    xfactorImpact: round(cappedXFactorLift * 100, 2),
    rankSignal: round(adjustedComposite, 4),
    caps: {
      minLift: -6,
      maxLift: 10
    }
  };
}


export async function getEdgesApi(options?: { skipCache?: boolean }) {
  const cacheKey = "edges:v1:all";
  if (!options?.skipCache) {
    const cached = await readHotCache<unknown>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const recentSummaries = await listRecentCalibrationSummaries(200);
  const degradedFactorBuckets = extractDegradedFactorBuckets(recentSummaries);

  const signals = await prisma.edgeSignal.findMany({
    where: { isActive: true },
    include: {
      event: { include: { league: true } },
      player: true,
      sportsbook: true
    },
    orderBy: [{ edgeScore: "desc" }, { evPercent: "desc" }],
    take: 100
  });

  const data = await Promise.all(signals.map(async (signal) => {
    const xfactors = extractEdgeXFactors(signal);
    const summary = asObject(xfactors)?.summary ?? summarizeXFactors(xfactors as never);
    const adjusted = computeAdjustedEdgeScore({
      baseEdgeScore: signal.edgeScore,
      evPercent: signal.evPercent,
      confidenceScore: signal.confidenceScore,
      xfactorScore: Number((summary as Record<string, unknown>).score ?? 0),
      xfactorConfidence: Number((summary as Record<string, unknown>).confidence ?? 0.55)
    });
    const decomposition = buildSimulationDecomposition({
      baseRatingEdge: Number(signal.edgeScore ?? 0) / 100,
      marketAnchorEffect: (Number(signal.noVigProb ?? 0.5) - 0.5) * 0.2,
      weatherEffect: Number(((asObject(asObject(xfactors)?.environment)?.weatherBlend as Record<string, unknown> | undefined)?.scoringEnvironmentDelta ?? 0)) * 0.25,
      travelEffect: -0.018,
      styleEffect: Number((summary as Record<string, unknown>).score ?? 0) * 0.18,
      playerAvailabilityEffect: 0.012,
      residualModelEffect: Number(signal.evPercent ?? 0) / 100 * 0.12,
      uncertaintyPenalty: Math.max(0.04, 1 - Number((summary as Record<string, unknown>).confidence ?? 0.6)),
      confidence: Number((summary as Record<string, unknown>).confidence ?? 0.6),
      scenarios: buildScenarioSet({
        projectedHomeScore: 24,
        projectedAwayScore: 21,
        projectedTotal: 45,
        projectedSpreadHome: 3,
        winProbHome: Number(signal.modelProb ?? 0.5)
      })
    });

    const advancedStats = buildAdvancedStatContext({
      sport: String(signal.event.league.key),
      eventId: signal.eventId
    });
    const factorBucket = String((decomposition.contributions ?? [])
      .slice()
      .sort((left, right) => Math.abs(Number(right.value ?? 0)) - Math.abs(Number(left.value ?? 0)))[0]?.key ?? "");
    const penalty = applyFactorBucketPenalty({
      rankSignal: adjusted.rankSignal,
      adjustedEdgeScore: adjusted.adjustedEdgeScore,
      factorBucket: factorBucket || null,
      degradedFactorBuckets
    });
    const winnerQualified = qualifiesWinnerMarket({
      marketType: String(signal.marketType),
      modelProb: Number(signal.modelProb ?? 0.5),
      confidenceScore: signal.confidenceScore,
      adjustedEdgeScore: adjusted.adjustedEdgeScore
    });

    const payload = {
      id: signal.id,
      eventId: signal.eventId,
      eventLabel: signal.event.name,
      league: signal.event.league.key,
      marketType: signal.marketType,
      player: signal.player?.name ?? null,
      sportsbook: signal.sportsbook.name,
      side: signal.side,
      lineValue: signal.lineValue,
      offeredOddsAmerican: signal.offeredOddsAmerican,
      fairOddsAmerican: signal.fairOddsAmerican,
      modelProb: signal.modelProb,
      noVigProb: signal.noVigProb,
      evPercent: signal.evPercent,
      kellyFull: signal.kellyFull,
      kellyHalf: signal.kellyHalf,
      confidenceScore: signal.confidenceScore,
      edgeScore: signal.edgeScore,
      adjustedEdgeScore: adjusted.adjustedEdgeScore,
      xfactorImpactOnEdgeScore: adjusted.xfactorImpact,
      rankSignal: adjusted.rankSignal,
      adjustedRankSignal: penalty.adjustedRankSignal,
      flags: signal.flagsJson,
      expiresAt: signal.expiresAt?.toISOString() ?? null,
      whyItGradesWell: {
        score: (summary as Record<string, unknown>).score ?? null,
        confidence: (summary as Record<string, unknown>).confidence ?? null,
        topReasons: (summary as Record<string, unknown>).topReasons ?? []
      },
      xfactors,
      advancedStats,
      topAdvancedStatDrivers: advancedStats.topDrivers,
      scoringBlend: {
        baseEdgeScore: signal.edgeScore,
        adjustedEdgeScore: adjusted.adjustedEdgeScore,
        xfactorImpactOnEdgeScore: adjusted.xfactorImpact,
        caps: adjusted.caps,
        degradedFactorBucketPenalty: penalty.downWeight
      },
      qualification: {
        isWinnerMarketQualified: winnerQualified,
        targetWinnerAccuracy: 0.7
      },
      decomposition,
      scenarios: decomposition.scenarios
    await persistEdgeExplanation({
      signalId: signal.id,
      metadataJson: {
        adjustedEdgeScore: adjusted.adjustedEdgeScore,
        xfactorImpactOnEdgeScore: adjusted.xfactorImpact,
        rankSignal: adjusted.rankSignal,
        whyItGradesWell: payload.whyItGradesWell,
        xfactors: payload.xfactors,
        advancedStats: payload.advancedStats,
        topAdvancedStatDrivers: payload.topAdvancedStatDrivers,
        decomposition: payload.decomposition,
        scenarios: payload.scenarios
      }
    });

    return payload;
  })).then((items) => items.sort((left, right) => right.adjustedRankSignal - left.adjustedRankSignal));

  const payload = {
    generatedAt: new Date().toISOString(),
    count: data.length,
    data
  };
  await writeHotCache(cacheKey, payload, 45);
  return payload;
}

export async function getEventApi(
  eventId: string,
  options?: { skipCache?: boolean }
) {
  const cacheKey = `event:v1:${eventId}`;
  if (!options?.skipCache) {
    const cached = await readHotCache<unknown>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participants: {
        include: { competitor: true }
      },
      currentMarketStates: {
        include: {
          bestHomeBook: true,
          bestAwayBook: true,
          bestOverBook: true,
          bestUnderBook: true
        }
      },
      eventProjections: {
        orderBy: { modelRun: { createdAt: "desc" } },
        take: 1
      },
      playerProjections: {
        include: { player: true },
        orderBy: { meanValue: "desc" },
        take: 25
      },
      edgeSignals: {
        where: { isActive: true },
        orderBy: [{ edgeScore: "desc" }, { evPercent: "desc" }],
        take: 20,
        include: { player: true, sportsbook: true }
      },
      lineMovements: {
        orderBy: { movedAt: "desc" },
        take: 25,
        include: { sportsbook: true, player: true }
      },
      eventResult: true
    }
  });

  if (!event) {
    throw new Error("Event not found.");
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    event
  };
  await writeHotCache(cacheKey, payload, 45);
  return payload;
}

export async function getPropsApi() {
  try {
    const projections = await prisma.playerProjection.findMany({
      include: {
        event: { include: { league: true } },
        player: true,
        modelRun: true
      },
      orderBy: [{ meanValue: "desc" }],
      take: 200
    });

    return {
      generatedAt: new Date().toISOString(),
      count: projections.length,
      source: "player_projections",
      data: projections.map((projection) => ({
        id: projection.id,
        eventId: projection.eventId,
        eventLabel: projection.event.name,
        league: projection.event.league.key,
        playerId: projection.playerId,
        playerName: projection.player.name,
        statKey: projection.statKey,
        meanValue: projection.meanValue,
        medianValue: projection.medianValue,
        stdDev: projection.stdDev,
        metadata: projection.metadataJson
      }))
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const missingProjectionTable =
      message.includes("player_projections") || message.includes("playerProjection");

    if (!missingProjectionTable) {
      throw error;
    }

    const fallback = await getPropsExplorerData({
      league: "ALL",
      marketType: "ALL",
      team: "all",
      player: "all",
      sportsbook: "all",
      valueFlag: "all",
      sortBy: "best_price"
    });

    return {
      generatedAt: new Date().toISOString(),
      count: fallback.props.length,
      source: "props_explorer_fallback",
      note: "Player projections are not migrated in this runtime yet. Falling back to live/stored props explorer rows.",
      data: fallback.props.map((prop) => ({
        id: prop.id,
        eventId: prop.gameId,
        eventLabel: prop.gameLabel ?? `${prop.team.abbreviation} vs ${prop.opponent.abbreviation}`,
        league: prop.leagueKey,
        playerId: prop.player.id,
        playerName: prop.player.name,
        statKey: prop.marketType,
        meanValue: prop.line,
        medianValue: null,
        stdDev: null,
        metadata: {
          source: prop.source ?? fallback.source,
          supportStatus: prop.supportStatus ?? null,
          sportsbook: prop.bestAvailableSportsbookName ?? prop.sportsbook.name,
          oddsAmerican: prop.bestAvailableOddsAmerican ?? prop.oddsAmerican,
          expectedValuePct: prop.expectedValuePct ?? null
        }
      }))
    };
  }
}

export async function getLineMovementsApi() {
  const rows = await prisma.lineMovement.findMany({
    include: {
      event: { include: { league: true } },
      sportsbook: true,
      player: true
    },
    orderBy: { movedAt: "desc" },
    take: 200
  });

  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    data: rows
  };
}
