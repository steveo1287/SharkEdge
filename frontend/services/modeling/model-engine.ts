import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { buildFightHistoryFeatureView } from "@/services/modeling/fight-history-warehouse";
import { buildFightProjection } from "@/services/modeling/fight-projection-core";
import { buildMlbEventProjection, buildMlbPlayerPropProjections } from "@/services/modeling/mlb-game-sim-service";
import { buildGenericEventProjection, buildWeightedAverage } from "@/services/modeling/team-projection-core";
import { resolveWeatherAdjustment, type WeatherSnapshotInput } from "@/services/modeling/weather-context";

function getNumericStat(stats: Prisma.JsonValue, keys: string[]) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    return null;
  }
  const record = stats as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return null;
  }
  const mean = average(values) ?? 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}


function asRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function buildEventWeatherSnapshot(event: {
  metadataJson: Prisma.JsonValue | null;
}) : WeatherSnapshotInput | null {
  const metadata = asRecord(event.metadataJson);
  if (!metadata) {
    return null;
  }
  const weatherRecord = asRecord((metadata.weather ?? null) as Prisma.JsonValue | null) ?? metadata;
  const windMph = coerceNumber(weatherRecord.windMph ?? weatherRecord.wind_speed_mph ?? weatherRecord.wind);
  const tempF = coerceNumber(weatherRecord.tempF ?? weatherRecord.temperatureF ?? weatherRecord.temp);
  const precipitationProbability = coerceNumber(
    weatherRecord.precipitationProbability ?? weatherRecord.precipProbability ?? weatherRecord.rainChance
  );
  const humidity = coerceNumber(weatherRecord.humidity ?? weatherRecord.humidityPct);
  const altitudeFeet = coerceNumber(weatherRecord.altitudeFeet ?? weatherRecord.altitude);
  const roofStatus = typeof weatherRecord.roofStatus === "string" ? weatherRecord.roofStatus : typeof metadata.roofStatus === "string" ? metadata.roofStatus : null;
  const source = typeof weatherRecord.source === "string" ? weatherRecord.source : typeof metadata.weatherSource === "string" ? metadata.weatherSource : null;
  const indoorOverride =
    typeof weatherRecord.indoorOverride === "boolean"
      ? weatherRecord.indoorOverride
      : typeof metadata.isIndoor === "boolean"
        ? metadata.isIndoor
        : null;

  if ([windMph, tempF, precipitationProbability, humidity, altitudeFeet].every((value) => value === null) && !roofStatus && !source && indoorOverride === null) {
    return null;
  }

  return {
    source,
    tempF,
    windMph,
    precipitationProbability,
    humidity,
    altitudeFeet,
    roofStatus,
    indoorOverride
  };
}

function buildSportFeatureSet(sportKey: string) {
  switch (sportKey) {
    case "NBA":
    case "NCAAB":
      return {
        offense: ["points", "PTS", "points_per_game"],
        defense: ["opp_points", "oppPTS", "points_allowed"],
        pace: ["pace", "possessions"],
        player: {
          player_points: ["points", "PTS"],
          player_rebounds: ["rebounds", "REB"],
          player_assists: ["assists", "AST"],
          player_threes: ["threes", "FG3M", "3PM"]
        }
      };
    case "MLB":
      return {
        offense: ["runs", "R", "runs_per_game", "runs_scored"],
        defense: ["runs_allowed", "RA", "opp_runs", "era"],
        pace: ["innings", "plate_appearances"],
        player: {
          other: ["hits", "H", "strikeouts", "SO", "total_bases", "TB"]
        }
      };
    case "NHL":
      return {
        offense: ["goals", "G", "goals_per_game", "xgf"],
        defense: ["goals_allowed", "GA", "xga"],
        pace: ["shots", "SOG", "tempo"],
        player: {
          other: ["shots", "SOG", "points", "PTS", "saves", "SV"]
        }
      };
    case "NFL":
    case "NCAAF":
      return {
        offense: ["yards", "total_yards", "epa_offense", "points"],
        defense: ["yards_allowed", "epa_defense", "points_allowed"],
        pace: ["plays", "plays_per_game"],
        player: {
          other: ["passing_yards", "rushing_yards", "receiving_yards", "receptions", "touchdowns"]
        }
      };
    case "UFC":
    case "BOXING":
      return {
        offense: ["strikes_landed", "sig_strikes", "finish_rate"],
        defense: ["strikes_absorbed", "sig_strikes_absorbed"],
        pace: ["control_time", "rounds"],
        player: {
          other: ["sig_strikes", "takedowns", "rounds"]
        }
      };
    default:
      return {
        offense: ["points"],
        defense: ["opp_points"],
        pace: ["pace"],
        player: {
          other: ["points"]
        }
      };
  }
}

export async function buildEventProjectionFromHistory(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participantContexts: true,
      participants: {
        include: {
          competitor: {
            include: {
              team: {
                include: {
                  teamGameStats: {
                    orderBy: { createdAt: "desc" },
                    take: 12
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!event) {
    throw new Error("Event not found for projection build.");
  }

  if (event.league.key === "MLB") {
    const mlbProjection = await buildMlbEventProjection(eventId);
    if (mlbProjection) {
      return mlbProjection;
    }
  }

  if (event.league.key === "UFC" || event.league.key === "BOXING" || event.eventType === "COMBAT_HEAD_TO_HEAD") {
    const fighterA =
      event.participants.find((participant) => participant.role === "COMPETITOR_A") ?? event.participants[0] ?? null;
    const fighterB =
      event.participants.find((participant) => participant.role === "COMPETITOR_B") ?? event.participants[1] ?? null;

    if (!fighterA || !fighterB) {
      return null;
    }

    const fighterAContext = event.participantContexts.find((row) => row.competitorId === fighterA.competitorId) ?? null;
    const fighterBContext = event.participantContexts.find((row) => row.competitorId === fighterB.competitorId) ?? null;
    const eventMetadata = asRecord(event.metadataJson);
    const rounds = coerceNumber(eventMetadata?.rounds) ?? (event.league.key === "UFC" ? 3 : 10);
    const fighterAMetadata = {
      ...(asRecord(fighterA.competitor.metadataJson) ?? {}),
      ...(asRecord(fighterA.metadataJson) ?? {}),
      ...(asRecord(fighterAContext?.metadataJson) ?? {})
    };
    const fighterBMetadata = {
      ...(asRecord(fighterB.competitor.metadataJson) ?? {}),
      ...(asRecord(fighterB.metadataJson) ?? {}),
      ...(asRecord(fighterBContext?.metadataJson) ?? {})
    };

    const fightProjection = buildFightProjection({
      sportKey: event.league.key as "UFC" | "BOXING",
      rounds,
      fighterA: {
        name: fighterA.competitor.name,
        record: fighterA.record,
        recentWinRate: fighterAContext?.recentWinRate ?? null,
        recentMargin: fighterAContext?.recentMargin ?? null,
        daysRest: fighterAContext?.daysRest ?? null,
        metadata: fighterAMetadata
      },
      fighterB: {
        name: fighterB.competitor.name,
        record: fighterB.record,
        recentWinRate: fighterBContext?.recentWinRate ?? null,
        recentMargin: fighterBContext?.recentMargin ?? null,
        daysRest: fighterBContext?.daysRest ?? null,
        metadata: fighterBMetadata
      }
    });

    const fightFeatureBuckets = buildFightHistoryFeatureView({
      sportKey: event.league.key as "UFC" | "BOXING",
      rounds,
      fighter: {
        record: fighterA.record,
        recentWinRate: fighterAContext?.recentWinRate ?? null,
        recentMargin: fighterAContext?.recentMargin ?? null,
        metadata: fighterAMetadata
      },
      opponent: {
        record: fighterB.record,
        recentWinRate: fighterBContext?.recentWinRate ?? null,
        recentMargin: fighterBContext?.recentMargin ?? null,
        metadata: fighterBMetadata
      }
    });

    return {
      modelKey: `fight-projection-${event.league.key.toLowerCase()}`,
      modelVersion: "v4",
      eventId: event.id,
      projectedHomeScore: fightProjection.projectedHomeScore,
      projectedAwayScore: fightProjection.projectedAwayScore,
      projectedTotal: fightProjection.projectedTotal,
      projectedSpreadHome: fightProjection.projectedSpreadHome,
      winProbHome: fightProjection.winProbHome,
      winProbAway: fightProjection.winProbAway,
      metadata: {
        sport: event.league.sport,
        league: event.league.key,
        rounds,
        titleFight: Boolean(eventMetadata?.titleFight),
        confidenceLabel: fightProjection.metadata.confidenceLabel,
        confidenceScore: fightProjection.metadata.confidenceScore,
        uncertaintyScore: fightProjection.metadata.uncertaintyScore,
        confidencePenalty: fightProjection.metadata.confidencePenalty,
        paceScore: fightProjection.metadata.paceScore,
        methodProbabilities: fightProjection.metadata.methodProbabilities,
        finishRoundExpectation: fightProjection.metadata.finishRoundExpectation,
        diagnostics: fightProjection.metadata.diagnostics,
        featureBuckets: fightFeatureBuckets
      }
    };
  }

  const features = buildSportFeatureSet(event.league.key);
  const awayTeam =
    event.participants.find((participant) => participant.role === "AWAY")?.competitor.team ??
    event.participants[0]?.competitor.team ??
    null;
  const homeTeam =
    event.participants.find((participant) => participant.role === "HOME")?.competitor.team ??
    event.participants[1]?.competitor.team ??
    null;

  if (!awayTeam || !homeTeam) {
    return null;
  }

  const homeOffense = homeTeam.teamGameStats
    .map((row) => getNumericStat(row.statsJson, features.offense))
    .filter((value): value is number => value !== null);
  const awayOffense = awayTeam.teamGameStats
    .map((row) => getNumericStat(row.statsJson, features.offense))
    .filter((value): value is number => value !== null);
  const homeDefense = homeTeam.teamGameStats
    .map((row) => getNumericStat(row.statsJson, features.defense))
    .filter((value): value is number => value !== null);
  const awayDefense = awayTeam.teamGameStats
    .map((row) => getNumericStat(row.statsJson, features.defense))
    .filter((value): value is number => value !== null);
  const paceSamples = [
    ...homeTeam.teamGameStats
      .map((row) => getNumericStat(row.statsJson, features.pace))
      .filter((value): value is number => value !== null),
    ...awayTeam.teamGameStats
      .map((row) => getNumericStat(row.statsJson, features.pace))
      .filter((value): value is number => value !== null)
  ];

  const weather = resolveWeatherAdjustment({
    sportKey: event.league.key,
    venueName: event.venue ?? null,
    weather: buildEventWeatherSnapshot(event)
  });

  const projection = buildGenericEventProjection({
    sportKey: event.league.key,
    homeOffense,
    awayOffense,
    homeDefense,
    awayDefense,
    paceSamples,
    weather
  });

  return {
    modelKey: `team-efficiency-${event.league.key.toLowerCase()}`,
    modelVersion: "v4",
    eventId: event.id,
    projectedHomeScore: projection.projectedHomeScore,
    projectedAwayScore: projection.projectedAwayScore,
    projectedTotal: projection.projectedTotal,
    projectedSpreadHome: projection.projectedSpreadHome,
    winProbHome: projection.winProbHome,
    winProbAway: projection.winProbAway,
    metadata: {
      sport: event.league.sport,
      league: event.league.key,
      confidenceLabel: projection.metadata.confidenceLabel,
      confidenceScore: projection.metadata.confidenceScore,
      uncertaintyScore: projection.metadata.uncertaintyScore,
      confidencePenalty: projection.metadata.confidencePenalty,
      paceFactor: projection.metadata.paceFactor,
      scoreStdDev: projection.metadata.scoreStdDev,
      projectionBand: projection.metadata.projectionBand,
      summaries: projection.metadata.summaries,
      weather: projection.metadata.weather
    }
  };
}

export async function buildPlayerPropProjectionsForEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participants: {
        include: {
          competitor: {
            include: {
              team: true
            }
          }
        }
      }
    }
  });
  if (!event) {
    return [];
  }

  const teamIds = event.participants
    .map((participant) => participant.competitor.team?.id)
    .filter((value): value is string => Boolean(value));
  if (!teamIds.length) {
    return [];
  }

  if (event.league.key === "MLB") {
    return buildMlbPlayerPropProjections(eventId);
  }

  const features = buildSportFeatureSet(event.league.key);
  const statKeys = Object.entries(features.player);

  const roster = await prisma.player.findMany({
    where: {
      teamId: { in: teamIds }
    },
    include: {
      playerGameStats: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  return roster.flatMap((player) => {
    return statKeys
      .map(([marketType, keys]) => {
        const values = player.playerGameStats
          .map((row) => getNumericStat(row.statsJson, keys))
          .filter((value): value is number => value !== null);
        const meanValue = buildWeightedAverage(values) ?? average(values);
        if (meanValue === null) {
          return null;
        }
        const sorted = [...values].sort((left, right) => left - right);
        const stdDev = standardDeviation(values) ?? 0;
        return {
          modelKey: `player-props-${event.league.key.toLowerCase()}`,
          modelVersion: "v4",
          eventId: event.id,
          playerId: player.id,
          statKey: marketType === "other" ? keys[0] : marketType,
          meanValue,
          medianValue: sorted[Math.floor(sorted.length / 2)] ?? meanValue,
          stdDev,
          hitProbOver: {},
          hitProbUnder: {},
          metadata: {
            sampleSize: values.length,
            source: "recent_game_history",
            weightedMean: meanValue,
            recentMedian: sorted[Math.floor(sorted.length / 2)] ?? meanValue,
            volatility: stdDev
          }
        };
      })
      .filter(Boolean);
  });
}
