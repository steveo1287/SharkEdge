import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { buildMlbEventProjection, buildMlbPlayerPropProjections } from "@/services/modeling/mlb-game-sim-service";
import { buildSimulationEnhancementReport, summarizeXFactors } from "@/services/analytics/xfactor-engine";
import { buildScenarioSet, buildSimulationDecomposition } from "@/services/modeling/simulation-decomposition";

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


function estimateTravelFatigue(homeVenue: string | null | undefined, awayVenue: string | null | undefined) {
  const home = (homeVenue ?? "").toLowerCase();
  const away = (awayVenue ?? "").toLowerCase();
  if (!home || !away) {
    return 0.04;
  }
  return home === away ? 0.02 : 0.1;
}

function buildDefaultWeatherProviders() {
  return [
    {
      provider: "Windy",
      model: "ECMWF",
      temperatureF: 68,
      windMph: 10,
      gustMph: 16,
      humidityPct: 55,
      precipitationProbabilityPct: 18,
      cloudCoverPct: 42,
      confidence: 0.72
    },
    {
      provider: "NOAA",
      model: "NDFD",
      temperatureF: 67,
      windMph: 9,
      gustMph: 14,
      humidityPct: 57,
      precipitationProbabilityPct: 20,
      cloudCoverPct: 45,
      confidence: 0.69
    }
  ];
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

  const homeOffense =
    average(
      homeTeam.teamGameStats
        .map((row) => getNumericStat(row.statsJson, features.offense))
        .filter((value): value is number => value !== null)
    ) ?? 0;
  const awayOffense =
    average(
      awayTeam.teamGameStats
        .map((row) => getNumericStat(row.statsJson, features.offense))
        .filter((value): value is number => value !== null)
    ) ?? 0;
  const homeDefense =
    average(
      homeTeam.teamGameStats
        .map((row) => getNumericStat(row.statsJson, features.defense))
        .filter((value): value is number => value !== null)
    ) ?? 0;
  const awayDefense =
    average(
      awayTeam.teamGameStats
        .map((row) => getNumericStat(row.statsJson, features.defense))
        .filter((value): value is number => value !== null)
    ) ?? 0;
  const pace =
    average([
      ...homeTeam.teamGameStats
        .map((row) => getNumericStat(row.statsJson, features.pace))
        .filter((value): value is number => value !== null),
      ...awayTeam.teamGameStats
        .map((row) => getNumericStat(row.statsJson, features.pace))
        .filter((value): value is number => value !== null)
    ]) ?? 1;

  const projectedHomeScore = (homeOffense + awayDefense) / 2;
  const projectedAwayScore = (awayOffense + homeDefense) / 2;
  const projectedTotal = projectedHomeScore + projectedAwayScore;
  const projectedSpreadHome = projectedHomeScore - projectedAwayScore;
  const winProbHome = 1 / (1 + Math.exp(-projectedSpreadHome / Math.max(1, pace / 10)));

  const xfactorReport = buildSimulationEnhancementReport({
    sport: event.league.sport,
    eventId: event.id,
    weather: {
      indoor: event.metadataJson && typeof event.metadataJson === "object" && !Array.isArray(event.metadataJson)
        ? Boolean((event.metadataJson as Record<string, unknown>).indoor ?? false)
        : false,
      surface:
        event.metadataJson && typeof event.metadataJson === "object" && !Array.isArray(event.metadataJson)
          ? ((event.metadataJson as Record<string, unknown>).surface as string | undefined) ?? null
          : null,
      altitudeFt:
        event.metadataJson && typeof event.metadataJson === "object" && !Array.isArray(event.metadataJson)
          ? Number((event.metadataJson as Record<string, unknown>).altitudeFt ?? 0) || null
          : null,
      travelMilesHome: 25,
      travelMilesAway: 450,
      circadianPenaltyHome: 0.01,
      circadianPenaltyAway: estimateTravelFatigue(homeTeam.name, awayTeam.name),
      providers: buildDefaultWeatherProviders()
    },
    offenseVsDefenseGap: (homeOffense - awayDefense) / Math.max(1, pace * 2),
    tempoGap: (pace - 100) / 100,
    styleClash: (projectedSpreadHome / Math.max(1, projectedTotal)) * 2,
    travelFatigueAway: estimateTravelFatigue(homeTeam.name, awayTeam.name),
    travelFatigueHome: 0.02,
    ratings: {
      teamOverall: 82,
      teamOffense: 81,
      teamDefense: 80,
      starPowerIndex: 0.58,
      depthIndex: 0.54
    }
  });
  const xfactorSummary = summarizeXFactors(xfactorReport);
  const scenarios = buildScenarioSet({
    projectedHomeScore,
    projectedAwayScore,
    projectedTotal,
    projectedSpreadHome,
    winProbHome
  });
  const decomposition = buildSimulationDecomposition({
    baseRatingEdge: projectedSpreadHome / Math.max(1, projectedTotal),
    marketAnchorEffect: (winProbHome - 0.5) * 0.18,
    weatherEffect: xfactorReport.environment.weatherBlend.scoringEnvironmentDelta * 0.4,
    travelEffect: -(estimateTravelFatigue(homeTeam.name, awayTeam.name) * 0.22),
    styleEffect: (xFactorStyleEffect => xFactorStyleEffect)(xfactorReport.factors.find((factor) => factor.key === "style_clash")?.impactScore ?? 0),
    playerAvailabilityEffect: 0.015,
    residualModelEffect: (winProbHome - 0.5) * 0.06,
    uncertaintyPenalty: Math.max(0.04, 1 - xfactorSummary.confidence),
    confidence: xfactorSummary.confidence,
    scenarios
  });

  return {
    modelKey: `team-efficiency-${event.league.key.toLowerCase()}`,
    modelVersion: "v3",
    eventId: event.id,
    projectedHomeScore,
    projectedAwayScore,
    projectedTotal,
    projectedSpreadHome,
    winProbHome,
    winProbAway: 1 - winProbHome,
    metadata: {
      sport: event.league.sport,
      league: event.league.key,
      pace,
      xfactors: xfactorReport,
      xfactorSummary,
      decomposition,
      scenarios
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
        const meanValue = average(values);
        if (meanValue === null) {
          return null;
        }
        const sorted = [...values].sort((left, right) => left - right);
        const stdDev = standardDeviation(values) ?? 0;
        return {
          modelKey: `player-props-${event.league.key.toLowerCase()}`,
          modelVersion: "v1",
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
            source: "recent_game_history"
          }
        };
      })
      .filter(Boolean);
  });
}
