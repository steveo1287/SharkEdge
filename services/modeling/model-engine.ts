import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { buildMlbEventProjection, buildMlbPlayerPropProjections } from "@/services/modeling/mlb-game-sim-service";
import { buildUfcEventProjection } from "@/services/modeling/ufc-fight-sim-service";
import { simulateContextualGame, type MlbPregameEloContext } from "@/services/simulation/contextual-game-sim";
import {
  buildCoachTendencyProfile,
  buildEventIntangibleProfile,
  buildHeadToHeadSimulationContext,
  buildTeamPlaystyleProfile
} from "@/services/simulation/context-profiles";
import { buildEventGameRatingsPrior } from "@/services/simulation/game-ratings-prior";
import { simulatePlayerPropProjection } from "@/services/simulation/player-prop-sim";

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

type TeamStatRow = { statsJson: Prisma.JsonValue };

type TeamScoringProfile = {
  scored: number;
  allowed: number;
  actualWins?: number | null;
  actualLosses?: number | null;
};

function numericStatsByRow(rows: TeamStatRow[], keys: string[]) {
  return rows.map((row) => getNumericStat(row.statsJson, keys));
}

function sumNumericStats(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0);
}

function getScoringProfileKeys(leagueKey: string): { scored: string[]; allowed: string[] } | null {
  switch (leagueKey) {
    case "MLB":
      return {
        scored: ["runs", "R", "runs_scored", "team_runs", "score"],
        allowed: ["runs_allowed", "RA", "opp_runs", "opponent_runs", "opp_score"]
      };
    case "NBA":
      return {
        scored: ["points", "PTS", "points_scored", "team_points", "score"],
        allowed: ["opp_points", "oppPTS", "points_allowed", "opponent_points", "opp_score"]
      };
    case "NFL":
      return {
        scored: ["points", "PTS", "points_scored", "team_points", "score"],
        allowed: ["points_allowed", "PA", "opp_points", "opponent_points", "opp_score"]
      };
    default:
      return null;
  }
}

function buildTeamScoringProfile(leagueKey: string, rows: TeamStatRow[]): TeamScoringProfile | null {
  const keys = getScoringProfileKeys(leagueKey);
  if (!keys || rows.length < 2) return null;

  const scoredRows = numericStatsByRow(rows, keys.scored);
  const allowedRows = numericStatsByRow(rows, keys.allowed);
  const validPairedRows = scoredRows.filter((scored, index) => scored != null && allowedRows[index] != null).length;
  if (validPairedRows < 2) return null;

  const scored = sumNumericStats(scoredRows);
  const allowed = sumNumericStats(allowedRows);

  if (scored == null || allowed == null || scored < 0 || allowed < 0) return null;

  return {
    scored,
    allowed
  };
}

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getNumericFromObjects(objects: Array<Record<string, unknown>>, keys: string[]) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

function getBooleanFromObjects(objects: Array<Record<string, unknown>>, keys: string[]) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "boolean") return value;
    }
  }
  return null;
}

function buildMlbPregameEloContext(args: {
  leagueKey: string;
  isHome: boolean;
  participantContext?: { daysRest: number | null; metadataJson: Prisma.JsonValue | null } | null;
  participantMetadata?: Prisma.JsonValue | null;
  eventMetadata?: Prisma.JsonValue | null;
}): MlbPregameEloContext | null {
  if (args.leagueKey !== "MLB") return null;
  const contextMetadata = jsonObject(args.participantContext?.metadataJson);
  const participantMetadata = jsonObject(args.participantMetadata);
  const eventMetadata = jsonObject(args.eventMetadata);
  const objects = [contextMetadata, participantMetadata, eventMetadata];
  const value: MlbPregameEloContext = {
    rating: getNumericFromObjects(objects, ["mlbEloRating", "eloRating", "teamEloRating"]),
    milesTraveled: getNumericFromObjects(objects, ["milesTraveled", "travelMiles", "travelDistanceMiles"]),
    restDays: typeof args.participantContext?.daysRest === "number" ? args.participantContext.daysRest : null,
    pitcherRollingGameScore: getNumericFromObjects(objects, ["pitcherRollingGameScore", "probableStarterRollingGameScore", "starterRollingGameScore"]),
    teamRollingGameScore: getNumericFromObjects(objects, ["teamRollingGameScore", "teamStarterRollingGameScore"]),
    isOpener: getBooleanFromObjects(objects, ["isOpener", "probableStarterIsOpener"]),
    noFans: getBooleanFromObjects(objects, ["noFans", "emptyStadium", "noFansHomeField"])
  };

  return Object.values(value).some((field) => field != null) ? value : null;
}

function getCurrentMarketAnchor(
  states: Array<{
    marketType: string;
    period: string;
    selectionCompetitorId: string | null;
    consensusLineValue: number | null;
    bestHomeOddsAmerican?: number | null;
    bestAwayOddsAmerican?: number | null;
    bestOverOddsAmerican?: number | null;
    bestUnderOddsAmerican?: number | null;
  }>,
  homeCompetitorId: string | null,
  awayCompetitorId: string | null
) {
  const fullGameStates = states.filter((state) => state.period === "full_game");

  const totalState =
    fullGameStates.find((state) => state.marketType === "total" && state.selectionCompetitorId === null) ??
    fullGameStates.find((state) => state.marketType === "total") ??
    null;

  const homeMoneylineState =
    fullGameStates.find((state) => state.marketType === "moneyline" && state.selectionCompetitorId === homeCompetitorId) ??
    fullGameStates.find((state) => state.marketType === "moneyline" && typeof state.bestHomeOddsAmerican === "number") ??
    null;

  const awayMoneylineState =
    fullGameStates.find((state) => state.marketType === "moneyline" && state.selectionCompetitorId === awayCompetitorId) ??
    fullGameStates.find((state) => state.marketType === "moneyline" && typeof state.bestAwayOddsAmerican === "number") ??
    null;

  const homeSpreadState =
    fullGameStates.find((state) => state.marketType === "spread" && state.selectionCompetitorId === homeCompetitorId) ??
    fullGameStates.find((state) => state.marketType === "spread" && typeof state.bestHomeOddsAmerican === "number") ??
    null;

  const awaySpreadState =
    fullGameStates.find((state) => state.marketType === "spread" && state.selectionCompetitorId === awayCompetitorId) ??
    fullGameStates.find((state) => state.marketType === "spread" && typeof state.bestAwayOddsAmerican === "number") ??
    null;

  const spreadHome =
    typeof homeSpreadState?.consensusLineValue === "number"
      ? homeSpreadState.consensusLineValue
      : typeof awaySpreadState?.consensusLineValue === "number"
        ? -awaySpreadState.consensusLineValue
        : null;

  const spreadAway =
    typeof awaySpreadState?.consensusLineValue === "number"
      ? awaySpreadState.consensusLineValue
      : typeof spreadHome === "number"
        ? -spreadHome
        : null;

  return {
    total: totalState?.consensusLineValue ?? null,
    spreadHome,
    spreadAway,
    homeMoneylineOdds: homeMoneylineState?.bestHomeOddsAmerican ?? null,
    awayMoneylineOdds: awayMoneylineState?.bestAwayOddsAmerican ?? null,
    homeSpreadOdds: homeSpreadState?.bestHomeOddsAmerican ?? null,
    awaySpreadOdds: awaySpreadState?.bestAwayOddsAmerican ?? null,
    overOdds: totalState?.bestOverOddsAmerican ?? null,
    underOdds: totalState?.bestUnderOddsAmerican ?? null
  };
}

function inferWeatherTotalFactor(leagueKey: string, venue: string | null | undefined, metadataJson: Prisma.JsonValue | null | undefined) {
  const metadata = metadataJson && typeof metadataJson === "object" && !Array.isArray(metadataJson)
    ? (metadataJson as Record<string, unknown>)
    : {};
  const weather = metadata.weather && typeof metadata.weather === "object" && !Array.isArray(metadata.weather)
    ? (metadata.weather as Record<string, unknown>)
    : {};
  const venueToken = String(venue ?? "").toLowerCase();

  const roofStatus = typeof weather.roofStatus === "string"
    ? weather.roofStatus.toLowerCase()
    : typeof metadata.roofStatus === "string"
      ? String(metadata.roofStatus).toLowerCase()
      : venueToken.includes("dome") || venueToken.includes("indoor")
        ? "closed"
        : null;

  const windMph = typeof weather.windMph === "number"
    ? weather.windMph
    : typeof weather.windSpeedMph === "number"
      ? weather.windSpeedMph
      : null;

  const precipitation = typeof weather.precipitationChance === "number"
    ? weather.precipitationChance
    : typeof weather.precipChance === "number"
      ? weather.precipChance
      : null;

  const temperature = typeof weather.temperatureF === "number"
    ? weather.temperatureF
    : typeof weather.tempF === "number"
      ? weather.tempF
      : null;

  let totalFactor = 1;
  const notes: string[] = [];

  if (roofStatus === "closed") {
    notes.push("Roof/indoor context suppresses weather volatility.");
  } else if ((leagueKey === "MLB" || leagueKey === "NFL" || leagueKey === "NCAAF") && typeof windMph === "number") {
    if (windMph >= 18) {
      totalFactor *= 0.96;
      notes.push("High wind suppresses long-ball and deep passing efficiency.");
    } else if (windMph >= 10) {
      totalFactor *= 0.985;
      notes.push("Moderate wind slightly compresses scoring efficiency.");
    }
  }

  if (typeof precipitation === "number" && precipitation >= 0.45) {
    totalFactor *= leagueKey.includes("NFL") || leagueKey.includes("NCAAF") ? 0.96 : 0.985;
    notes.push("Wet conditions shave offensive efficiency.");
  }

  if (typeof temperature === "number" && leagueKey === "MLB") {
    if (temperature >= 86) {
      totalFactor *= 1.018;
      notes.push("Warm air slightly boosts carry.");
    } else if (temperature <= 42) {
      totalFactor *= 0.982;
      notes.push("Cold air slightly suppresses carry.");
    }
  }

  return {
    available: notes.length > 0,
    totalFactor,
    note: notes.join(" ")
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
        defense: ["runs_allowed", "RA", "opp_runs", "opponent_runs"],
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


function buildPlayerMarketStateMap(
  states: Array<{
    marketType: string;
    period: string;
    playerId: string | null;
    consensusLineValue: number | null;
    bestOverOddsAmerican?: number | null;
    bestUnderOddsAmerican?: number | null;
  }>
) {
  const map = new Map<
    string,
    {
      line: number | null;
      overOdds: number | null;
      underOdds: number | null;
    }
  >();

  states.forEach((state) => {
    if (!state.playerId || state.period !== "full_game") {
      return;
    }
    map.set(`${state.playerId}:${state.marketType}`, {
      line: state.consensusLineValue ?? null,
      overOdds: state.bestOverOddsAmerican ?? null,
      underOdds: state.bestUnderOddsAmerican ?? null
    });
  });

  return map;
}

export async function buildEventProjectionFromHistory(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participantContexts: true,
      currentMarketStates: {
        select: {
          marketType: true,
          period: true,
          selectionCompetitorId: true,
          consensusLineValue: true,
          bestHomeOddsAmerican: true,
          bestAwayOddsAmerican: true,
          bestOverOddsAmerican: true,
          bestUnderOddsAmerican: true
        }
      },
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

  if (event.league.key === "UFC") {
    const ufcProjection = await buildUfcEventProjection(eventId);
    if (ufcProjection) {
      return ufcProjection;
    }
  }

  const features = buildSportFeatureSet(event.league.key);
  const awayParticipant =
    event.participants.find((participant) => participant.role === "AWAY") ??
    event.participants[0] ??
    null;
  const homeParticipant =
    event.participants.find((participant) => participant.role === "HOME") ??
    event.participants[1] ??
    null;

  const awayTeam = awayParticipant?.competitor.team ?? null;
  const homeTeam = homeParticipant?.competitor.team ?? null;

  if (!awayTeam || !homeTeam) {
    return null;
  }

  const teamIds = [homeTeam.id, awayTeam.id];
  const roster = await prisma.player.findMany({
    where: {
      teamId: { in: teamIds }
    },
    include: {
      playerGameStats: {
        orderBy: { createdAt: "desc" },
        take: 8
      }
    }
  });

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

  const homeScoringProfile = buildTeamScoringProfile(event.league.key, homeTeam.teamGameStats);
  const awayScoringProfile = buildTeamScoringProfile(event.league.key, awayTeam.teamGameStats);

  const homeContext = event.participantContexts.find(
    (context) => context.competitorId === homeParticipant?.competitorId
  ) ?? null;
  const awayContext = event.participantContexts.find(
    (context) => context.competitorId === awayParticipant?.competitorId
  ) ?? null;

  const ratingsPrior = buildEventGameRatingsPrior({
    leagueKey: event.league.key,
    homePlayers: roster
      .filter((player) => player.teamId === homeTeam.id)
      .map((player) => ({
        id: player.id,
        name: player.name,
        position: player.position,
        recentStats: player.playerGameStats.map((row) => row.statsJson)
      })),
    awayPlayers: roster
      .filter((player) => player.teamId === awayTeam.id)
      .map((player) => ({
        id: player.id,
        name: player.name,
        position: player.position,
        recentStats: player.playerGameStats.map((row) => row.statsJson)
      }))
  });

  const homeStyle = buildTeamPlaystyleProfile({
    leagueKey: event.league.key,
    teamName: homeTeam.name,
    statRows: homeTeam.teamGameStats,
    participantContext: homeContext
  });
  const awayStyle = buildTeamPlaystyleProfile({
    leagueKey: event.league.key,
    teamName: awayTeam.name,
    statRows: awayTeam.teamGameStats,
    participantContext: awayContext
  });
  const homeCoach = buildCoachTendencyProfile({
    leagueKey: event.league.key,
    teamName: homeTeam.name,
    statRows: homeTeam.teamGameStats,
    participantContext: homeContext
  });
  const awayCoach = buildCoachTendencyProfile({
    leagueKey: event.league.key,
    teamName: awayTeam.name,
    statRows: awayTeam.teamGameStats,
    participantContext: awayContext
  });
  const homeIntangibles = buildEventIntangibleProfile({
    teamName: homeTeam.name,
    participantContext: homeContext
  });
  const awayIntangibles = buildEventIntangibleProfile({
    teamName: awayTeam.name,
    participantContext: awayContext
  });
  const interactionContext = buildHeadToHeadSimulationContext({
    leagueKey: event.league.key,
    homeStyle,
    awayStyle,
    homeCoach,
    awayCoach,
    homeIntangibles,
    awayIntangibles
  });

  const marketAnchor = getCurrentMarketAnchor(
    event.currentMarketStates.map((state) => ({
      marketType: state.marketType,
      period: state.period,
      selectionCompetitorId: state.selectionCompetitorId,
      consensusLineValue: state.consensusLineValue,
      bestHomeOddsAmerican: state.bestHomeOddsAmerican,
      bestAwayOddsAmerican: state.bestAwayOddsAmerican,
      bestOverOddsAmerican: state.bestOverOddsAmerican,
      bestUnderOddsAmerican: state.bestUnderOddsAmerican
    })),
    homeParticipant?.competitorId ?? null,
    awayParticipant?.competitorId ?? null
  );
  const weather = inferWeatherTotalFactor(event.league.key, event.venue, event.metadataJson);
  const homeMlbPregameEloContext = buildMlbPregameEloContext({
    leagueKey: event.league.key,
    isHome: true,
    participantContext: homeContext,
    participantMetadata: homeParticipant?.metadataJson,
    eventMetadata: event.metadataJson
  });
  const awayMlbPregameEloContext = buildMlbPregameEloContext({
    leagueKey: event.league.key,
    isHome: false,
    participantContext: awayContext,
    participantMetadata: awayParticipant?.metadataJson,
    eventMetadata: event.metadataJson
  });

  const simulation = simulateContextualGame({
    leagueKey: event.league.key,
    home: {
      teamName: homeTeam.name,
      offense: homeOffense,
      defense: awayDefense > 0 ? awayDefense : homeDefense,
      pace,
      recentForm: homeContext?.recentMargin ?? 0,
      recentWinRate: homeContext?.recentWinRate ?? null,
      restDays: homeContext?.daysRest ?? null,
      travelProxyScore: homeContext?.travelProxyScore ?? null,
      backToBack: homeContext?.isBackToBack ?? false,
      revengeSpot: homeContext?.revengeSpot ?? false,
      teamStrengthContext: homeScoringProfile,
      linearWinExpectancy: homeScoringProfile,
      mlbPregameEloContext: homeMlbPregameEloContext,
      ratings: ratingsPrior.home,
      style: homeStyle,
      coach: homeCoach,
      intangibles: homeIntangibles
    },
    away: {
      teamName: awayTeam.name,
      offense: awayOffense,
      defense: homeDefense > 0 ? homeDefense : awayDefense,
      pace,
      recentForm: awayContext?.recentMargin ?? 0,
      recentWinRate: awayContext?.recentWinRate ?? null,
      restDays: awayContext?.daysRest ?? null,
      travelProxyScore: awayContext?.travelProxyScore ?? null,
      backToBack: awayContext?.isBackToBack ?? false,
      revengeSpot: awayContext?.revengeSpot ?? false,
      teamStrengthContext: awayScoringProfile,
      linearWinExpectancy: awayScoringProfile,
      mlbPregameEloContext: awayMlbPregameEloContext,
      ratings: ratingsPrior.away,
      style: awayStyle,
      coach: awayCoach,
      intangibles: awayIntangibles
    },
    ratingsPrior,
    venue: {
      name: event.venue,
      homeEdge: null
    },
    weather,
    marketAnchor,
    interactionContext,
    samples: event.league.key.includes("NFL") ? 3000 : 2500,
    seed: event.id.length * 37 + event.league.key.length * 101
  });

  return {
    modelKey: `contextual-sim-${event.league.key.toLowerCase()}`,
    modelVersion: "v3",
    eventId: event.id,
    projectedHomeScore: simulation.projectedHomeScore,
    projectedAwayScore: simulation.projectedAwayScore,
    projectedTotal: simulation.projectedTotal,
    projectedSpreadHome: simulation.projectedSpreadHome,
    winProbHome: simulation.winProbHome,
    winProbAway: simulation.winProbAway,
    metadata: {
      engine: simulation.engine,
      sport: event.league.sport,
      league: event.league.key,
      venue: event.venue,
      homeTeam: {
        id: homeTeam.id,
        name: homeTeam.name,
        abbreviation: homeTeam.abbreviation
      },
      awayTeam: {
        id: awayTeam.id,
        name: awayTeam.name,
        abbreviation: awayTeam.abbreviation
      },
      marketAnchor,
      weather,
      ratingsPrior,
      teamStrengthPriors: {
        home: homeScoringProfile,
        away: awayScoringProfile,
        log5: simulation.teamStrengthPriors?.log5 ?? null,
        linear: simulation.teamStrengthPriors?.linear ?? null,
        mlbElo: simulation.teamStrengthPriors?.mlbElo ?? null,
        mlbEloInputs: {
          home: homeMlbPregameEloContext,
          away: awayMlbPregameEloContext
        }
      },
      styleProfiles: {
        home: homeStyle,
        away: awayStyle
      },
      coachProfiles: {
        home: homeCoach,
        away: awayCoach
      },
      intangibles: {
        home: homeIntangibles,
        away: awayIntangibles
      },
      interactionContext,
      simulation
    }
  };
}

export async function buildPlayerPropProjectionsForEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participantContexts: true,
      currentMarketStates: {
        select: {
          marketType: true,
          period: true,
          playerId: true,
          consensusLineValue: true,
          bestOverOddsAmerican: true,
          bestUnderOddsAmerican: true
        }
      },
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

  const awayParticipant =
    event.participants.find((participant) => participant.role === "AWAY") ??
    event.participants[0] ??
    null;
  const homeParticipant =
    event.participants.find((participant) => participant.role === "HOME") ??
    event.participants[1] ??
    null;
  const awayTeam = awayParticipant?.competitor.team ?? null;
  const homeTeam = homeParticipant?.competitor.team ?? null;
  const awayContext = event.participantContexts.find(
    (context) => context.competitorId === awayParticipant?.competitorId
  ) ?? null;
  const homeContext = event.participantContexts.find(
    (context) => context.competitorId === homeParticipant?.competitorId
  ) ?? null;

  const homeStyle = homeTeam
    ? buildTeamPlaystyleProfile({
        leagueKey: event.league.key,
        teamName: homeTeam.name,
        statRows: homeTeam.teamGameStats,
        participantContext: homeContext
      })
    : null;
  const awayStyle = awayTeam
    ? buildTeamPlaystyleProfile({
        leagueKey: event.league.key,
        teamName: awayTeam.name,
        statRows: awayTeam.teamGameStats,
        participantContext: awayContext
      })
    : null;
  const homeCoach = homeTeam
    ? buildCoachTendencyProfile({
        leagueKey: event.league.key,
        teamName: homeTeam.name,
        statRows: homeTeam.teamGameStats,
        participantContext: homeContext
      })
    : null;
  const awayCoach = awayTeam
    ? buildCoachTendencyProfile({
        leagueKey: event.league.key,
        teamName: awayTeam.name,
        statRows: awayTeam.teamGameStats,
        participantContext: awayContext
      })
    : null;
  const homeIntangibles = homeTeam
    ? buildEventIntangibleProfile({
        teamName: homeTeam.name,
        participantContext: homeContext
      })
    : null;
  const awayIntangibles = awayTeam
    ? buildEventIntangibleProfile({
        teamName: awayTeam.name,
        participantContext: awayContext
      })
    : null;

  const interactionContext =
    homeStyle && awayStyle && homeCoach && awayCoach && homeIntangibles && awayIntangibles
      ? buildHeadToHeadSimulationContext({
          leagueKey: event.league.key,
          homeStyle,
          awayStyle,
          homeCoach,
          awayCoach,
          homeIntangibles,
          awayIntangibles
        })
      : null;

  const marketStateMap = buildPlayerMarketStateMap(event.currentMarketStates);

  const roster = await prisma.player.findMany({
    where: {
      teamId: { in: teamIds }
    },
    include: {
      playerGameStats: {
        orderBy: { createdAt: "desc" },
        take: 12
      }
    }
  });

  return roster.flatMap((player) => {
    const isHome = player.teamId === homeTeam?.id;
    const teamStyle = isHome ? homeStyle : awayStyle;
    const opponentStyle = isHome ? awayStyle : homeStyle;
    const teamCoach = isHome ? homeCoach : awayCoach;
    const opponentCoach = isHome ? awayCoach : homeCoach;
    const playerIntangibles = isHome ? homeIntangibles : awayIntangibles;

    return statKeys
      .map(([marketType, keys]) => {
        const statKey = marketType === "other" ? keys[0] : marketType;
        const marketState = marketStateMap.get(`${player.id}:${statKey}`) ?? {
          line: null,
          overOdds: null,
          underOdds: null
        };

        const simulation = simulatePlayerPropProjection({
          leagueKey: event.league.key,
          statKey,
          playerId: player.id,
          playerName: player.name,
          position: player.position,
          recentStats: player.playerGameStats.map((row) => row.statsJson),
          teamStyle,
          opponentStyle,
          teamCoach,
          opponentCoach,
          playerIntangibles,
          interactionContext,
          marketLine: marketState.line,
          marketOddsOver: marketState.overOdds,
          marketOddsUnder: marketState.underOdds
        });

        if (!Number.isFinite(simulation.meanValue) || simulation.meanValue <= 0) {
          return null;
        }

        return {
          modelKey: `player-props-contextual-${event.league.key.toLowerCase()}`,
          modelVersion: "v2",
          eventId: event.id,
          playerId: player.id,
          statKey,
          meanValue: simulation.meanValue,
          medianValue: simulation.medianValue,
          stdDev: simulation.stdDev,
          hitProbOver: simulation.hitProbOver,
          hitProbUnder: simulation.hitProbUnder,
          metadata: {
            sampleSize: player.playerGameStats.length,
            source: "recent_game_history_with_contextual_sim",
            playerName: player.name,
            position: player.position,
            marketLine: marketState.line,
            marketOddsOver: marketState.overOdds,
            marketOddsUnder: marketState.underOdds,
            contextualEdgeScore: simulation.contextualEdgeScore,
            p10: simulation.p10,
            p50: simulation.p50,
            p90: simulation.p90,
            priorWeight: simulation.priorWeight,
            sourceSummary: simulation.sourceSummary,
            drivers: simulation.drivers,
            teamStyle,
            opponentStyle,
            teamCoach,
            opponentCoach,
            playerIntangibles,
            interactionContext
          }
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);
  });
}
