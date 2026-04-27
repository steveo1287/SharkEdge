import type { LeagueKey } from "@/lib/types/domain";
import { compareNbaIntelligence } from "@/services/simulation/nba-intelligence-model";

type FlexibleRow = Record<string, unknown>;

export type RealityFactor = {
  label: string;
  value: number;
  weight: number;
  source: "team" | "player" | "advanced" | "rating" | "context" | "history";
};

export type RealitySimIntel = {
  modelVersion: "reality-sim-v1" | "nba-intel-v1";
  dataSource: string;
  homeEdge: number;
  projectedTotal: number;
  volatilityIndex: number;
  confidence: number;
  factors: RealityFactor[];
  modules: Array<{ label: string; status: "real" | "synthetic"; note: string }>;
  ratingBlend: {
    teamPower: number;
    playerPower: number;
    advancedPower: number;
    gameRatingPower: number;
    contextPower: number;
    historyPower?: number;
  };
};

type TeamProfile = {
  teamName: string;
  source: "real" | "synthetic";
  offense: number;
  defense: number;
  pace: number;
  recentForm: number;
  rest: number;
  turnoverMargin: number;
  rebounding: number;
  specialTeams: number;
  goalieOrKeeper: number;
  strengthOfSchedule: number;
  clutch: number;
  homeAdvantage: number;
  injuryDrag: number;
};

type PlayerSummary = {
  teamName: string;
  source: "real" | "synthetic";
  starPower: number;
  depthPower: number;
  creation: number;
  defense: number;
  availability: number;
  fatigue: number;
  volatility: number;
};

type GameRating = {
  teamName: string;
  source: "real" | "synthetic";
  overall: number;
  offense: number;
  defense: number;
  speed: number;
  physicality: number;
  clutch: number;
};

const TEAM_URLS: Partial<Record<LeagueKey, string[]>> = {
  NHL: ["NHL_TEAM_ANALYTICS_URL", "TEAM_ANALYTICS_URL", "SIM_TEAM_STATS_URL"],
  NFL: ["NFL_TEAM_ANALYTICS_URL", "TEAM_ANALYTICS_URL", "SIM_TEAM_STATS_URL"],
  NCAAF: ["NCAAF_TEAM_ANALYTICS_URL", "TEAM_ANALYTICS_URL", "SIM_TEAM_STATS_URL"],
  UFC: ["UFC_FIGHTER_ANALYTICS_URL", "PLAYER_ANALYTICS_URL", "SIM_PLAYER_STATS_URL"],
  BOXING: ["BOXING_FIGHTER_ANALYTICS_URL", "PLAYER_ANALYTICS_URL", "SIM_PLAYER_STATS_URL"]
};

const PLAYER_URLS: Partial<Record<LeagueKey, string[]>> = {
  NHL: ["NHL_PLAYER_ANALYTICS_URL", "PLAYER_ANALYTICS_URL", "SIM_PLAYER_STATS_URL"],
  NFL: ["NFL_PLAYER_ANALYTICS_URL", "PLAYER_ANALYTICS_URL", "SIM_PLAYER_STATS_URL"],
  NCAAF: ["NCAAF_PLAYER_ANALYTICS_URL", "PLAYER_ANALYTICS_URL", "SIM_PLAYER_STATS_URL"],
  UFC: ["UFC_FIGHTER_ANALYTICS_URL", "PLAYER_ANALYTICS_URL", "SIM_PLAYER_STATS_URL"],
  BOXING: ["BOXING_FIGHTER_ANALYTICS_URL", "PLAYER_ANALYTICS_URL", "SIM_PLAYER_STATS_URL"]
};

const RATING_URLS: Partial<Record<LeagueKey, string[]>> = {
  NHL: ["NHL_GAME_RATINGS_URL", "GAME_RATINGS_URL", "VIDEO_GAME_RATINGS_URL"],
  NFL: ["NFL_GAME_RATINGS_URL", "GAME_RATINGS_URL", "VIDEO_GAME_RATINGS_URL"],
  NCAAF: ["NCAAF_GAME_RATINGS_URL", "GAME_RATINGS_URL", "VIDEO_GAME_RATINGS_URL"],
  UFC: ["UFC_GAME_RATINGS_URL", "GAME_RATINGS_URL", "VIDEO_GAME_RATINGS_URL"],
  BOXING: ["BOXING_GAME_RATINGS_URL", "GAME_RATINGS_URL", "VIDEO_GAME_RATINGS_URL"]
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(seed: number) {
  return (seed % 10000) / 10000;
}

function range(seed: number, min: number, max: number) {
  return Number((min + unit(seed) * (max - min)).toFixed(3));
}

function num(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function rowsFromBody(body: unknown): FlexibleRow[] {
  const value = body as { teams?: FlexibleRow[]; players?: FlexibleRow[]; fighters?: FlexibleRow[]; ratings?: FlexibleRow[]; data?: FlexibleRow[]; rows?: FlexibleRow[] };
  if (Array.isArray(body)) return body as FlexibleRow[];
  if (Array.isArray(value.teams)) return value.teams;
  if (Array.isArray(value.players)) return value.players;
  if (Array.isArray(value.fighters)) return value.fighters;
  if (Array.isArray(value.ratings)) return value.ratings;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.rows)) return value.rows;
  return [];
}

function firstUrl(keys: string[] | undefined) {
  for (const key of keys ?? []) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

async function fetchRows(url: string | null): Promise<FlexibleRow[] | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return rowsFromBody(await response.json());
  } catch {
    return null;
  }
}

function syntheticTeam(league: LeagueKey, teamName: string): TeamProfile {
  const seed = hashString(`${league}:${teamName}:team`);
  const combat = league === "UFC" || league === "BOXING";
  return {
    teamName,
    source: "synthetic",
    offense: range(seed >>> 1, combat ? 58 : 86, combat ? 94 : 118),
    defense: range(seed >>> 2, combat ? 58 : 86, combat ? 94 : 118),
    pace: range(seed >>> 3, combat ? 0.88 : 92, combat ? 1.14 : 104),
    recentForm: range(seed >>> 4, -6, 7),
    rest: range(seed >>> 5, -2, 3),
    turnoverMargin: range(seed >>> 6, -4, 4),
    rebounding: range(seed >>> 7, -6, 6),
    specialTeams: range(seed >>> 8, -5, 6),
    goalieOrKeeper: range(seed >>> 9, -5, 6),
    strengthOfSchedule: range(seed >>> 10, -5, 5),
    clutch: range(seed >>> 11, -4, 6),
    homeAdvantage: range(seed >>> 12, 0.6, combat ? 0.9 : 2.6),
    injuryDrag: range(seed >>> 13, 0, 2.8)
  };
}

function rawTeam(row: FlexibleRow, fallbackName: string, league: LeagueKey): TeamProfile | null {
  const teamName = text(row.teamName, row.team, row.team_name, row.name, row.TEAM_NAME, row.fighterName, row.fighter) ?? fallbackName;
  if (!teamName) return null;
  const base = syntheticTeam(league, teamName);
  return {
    ...base,
    source: "real",
    offense: num(row.offense ?? row.offensiveRating ?? row.off_rating ?? row.ortg ?? row.pointsForRating ?? row.strikingOffense, base.offense),
    defense: num(row.defense ?? row.defensiveRating ?? row.def_rating ?? row.drtg ?? row.pointsAgainstRating ?? row.strikingDefense, base.defense),
    pace: num(row.pace ?? row.tempo ?? row.playsPerGame ?? row.possessions ?? row.fightPace, base.pace),
    recentForm: num(row.recentForm ?? row.form ?? row.last10Net ?? row.recent_net, base.recentForm),
    rest: num(row.rest ?? row.restAdvantage ?? row.daysRest ?? row.travelRest, base.rest),
    turnoverMargin: num(row.turnoverMargin ?? row.turnover_margin ?? row.takeawayGiveaway ?? row.tovMargin, base.turnoverMargin),
    rebounding: num(row.rebounding ?? row.reboundRate ?? row.rebRate ?? row.possessionEdge, base.rebounding),
    specialTeams: num(row.specialTeams ?? row.powerPlayPenaltyKill ?? row.specialTeamsRating, base.specialTeams),
    goalieOrKeeper: num(row.goalieOrKeeper ?? row.goalieRating ?? row.qbRating ?? row.goaltending ?? row.groundGame, base.goalieOrKeeper),
    strengthOfSchedule: num(row.strengthOfSchedule ?? row.sos ?? row.scheduleStrength, base.strengthOfSchedule),
    clutch: num(row.clutch ?? row.lateGame ?? row.closeGameRating, base.clutch),
    homeAdvantage: num(row.homeAdvantage ?? row.homeCourt ?? row.homeField, base.homeAdvantage),
    injuryDrag: num(row.injuryDrag ?? row.injuries ?? row.injuryPenalty ?? row.healthPenalty, base.injuryDrag)
  };
}

function syntheticPlayers(league: LeagueKey, teamName: string): PlayerSummary {
  const seed = hashString(`${league}:${teamName}:players`);
  return {
    teamName,
    source: "synthetic",
    starPower: range(seed >>> 1, -1.5, 6.5),
    depthPower: range(seed >>> 2, -2.5, 5.5),
    creation: range(seed >>> 3, -2, 6),
    defense: range(seed >>> 4, -3, 5),
    availability: range(seed >>> 5, -3.5, 0.8),
    fatigue: range(seed >>> 6, 0, 2.5),
    volatility: range(seed >>> 7, 0.85, 1.45)
  };
}

function rawPlayerSummary(rows: FlexibleRow[] | null, league: LeagueKey, teamName: string): PlayerSummary {
  const base = syntheticPlayers(league, teamName);
  const key = normalizeName(teamName);
  const matched = (rows ?? []).filter((row) => normalizeName(text(row.teamName, row.team, row.team_name, row.TEAM_NAME, row.fighterTeam, row.camp) ?? "") === key || normalizeName(text(row.playerName, row.player, row.name, row.fighterName, row.fighter) ?? "") === key);
  if (!matched.length) return base;

  let starPower = 0;
  let depthPower = 0;
  let creation = 0;
  let defense = 0;
  let availability = 0;
  let fatigue = 0;
  let volatility = 0;
  let totalWeight = 0;

  matched.forEach((row, index) => {
    const weight = Math.max(0.25, num(row.minutes ?? row.projectedMinutes ?? row.snapShare ?? row.usage ?? row.projectedRole ?? row.roundShare, index < 3 ? 3 : 1));
    const rating = num(row.rating ?? row.overall ?? row.playerRating ?? row.impactRating ?? row.epm ?? row.raptor ?? row.war ?? row.bpm, 0);
    starPower += rating * weight;
    depthPower += num(row.depthValue ?? row.benchImpact ?? row.roleValue ?? row.war ?? row.value, rating * 0.45) * weight;
    creation += num(row.creation ?? row.usageCreation ?? row.offensiveImpact ?? row.epa ?? row.shotCreation, rating * 0.4) * weight;
    defense += num(row.defense ?? row.defensiveImpact ?? row.dEpm ?? row.tackleValue ?? row.grapplingDefense, 0) * weight;
    availability += -Math.abs(num(row.injuryPenalty ?? row.healthPenalty ?? row.statusPenalty ?? row.availabilityDrag, 0)) * weight;
    fatigue += Math.max(0, num(row.fatigue ?? row.fatigueRisk ?? row.load ?? row.shortRest, 0)) * weight;
    volatility += Math.max(0.7, num(row.volatility ?? row.variance ?? row.consistencyRisk, 1)) * weight;
    totalWeight += weight;
  });

  const divisor = totalWeight || 1;
  return {
    teamName,
    source: "real",
    starPower: Number((starPower / divisor).toFixed(2)),
    depthPower: Number((depthPower / divisor).toFixed(2)),
    creation: Number((creation / divisor).toFixed(2)),
    defense: Number((defense / divisor).toFixed(2)),
    availability: Number((availability / divisor).toFixed(2)),
    fatigue: Number((fatigue / divisor).toFixed(2)),
    volatility: Number((volatility / divisor).toFixed(2))
  };
}

function syntheticRating(league: LeagueKey, teamName: string): GameRating {
  const seed = hashString(`${league}:${teamName}:rating`);
  return {
    teamName,
    source: "synthetic",
    overall: range(seed >>> 1, 72, 92),
    offense: range(seed >>> 2, 70, 94),
    defense: range(seed >>> 3, 70, 94),
    speed: range(seed >>> 4, 68, 95),
    physicality: range(seed >>> 5, 68, 95),
    clutch: range(seed >>> 6, 68, 95)
  };
}

function rawRating(rows: FlexibleRow[] | null, league: LeagueKey, teamName: string): GameRating {
  const base = syntheticRating(league, teamName);
  const key = normalizeName(teamName);
  const row = (rows ?? []).find((item) => normalizeName(text(item.teamName, item.team, item.name, item.fighterName, item.playerName) ?? "") === key);
  if (!row) return base;
  return {
    ...base,
    source: "real",
    overall: num(row.overall ?? row.ovr ?? row.rating ?? row.gameRating, base.overall),
    offense: num(row.offense ?? row.offensiveRating ?? row.offenseRating, base.offense),
    defense: num(row.defense ?? row.defensiveRating ?? row.defenseRating, base.defense),
    speed: num(row.speed ?? row.tempoRating ?? row.athleticism, base.speed),
    physicality: num(row.physicality ?? row.strength ?? row.toughness, base.physicality),
    clutch: num(row.clutch ?? row.awareness ?? row.composure, base.clutch)
  };
}

function edge(left: number, right: number, scale = 1) {
  return Number(((right - left) * scale).toFixed(2));
}

function sportWeights(league: LeagueKey) {
  switch (league) {
    case "NFL": return { team: 0.31, player: 0.25, advanced: 0.19, rating: 0.12, context: 0.13, totalBase: 45, totalScale: 2.2 };
    case "NCAAF": return { team: 0.32, player: 0.21, advanced: 0.17, rating: 0.13, context: 0.17, totalBase: 53, totalScale: 3.1 };
    case "NHL": return { team: 0.29, player: 0.23, advanced: 0.23, rating: 0.1, context: 0.15, totalBase: 6.1, totalScale: 0.42 };
    case "UFC":
    case "BOXING": return { team: 0.24, player: 0.36, advanced: 0.18, rating: 0.15, context: 0.07, totalBase: 0, totalScale: 0 };
    default: return { team: 0.3, player: 0.25, advanced: 0.2, rating: 0.12, context: 0.13, totalBase: 10, totalScale: 1 };
  }
}

function addFactor(factors: RealityFactor[], label: string, value: number, weight: number, source: RealityFactor["source"]) {
  factors.push({ label, value: Number(value.toFixed(2)), weight, source });
}

function buildNbaRealityIntel(nba: Awaited<ReturnType<typeof compareNbaIntelligence>>): RealitySimIntel {
  return {
    modelVersion: nba.modelVersion,
    dataSource: nba.dataSource,
    homeEdge: nba.homeEdge,
    projectedTotal: nba.projectedTotal,
    volatilityIndex: nba.volatilityIndex,
    confidence: nba.confidence,
    modules: nba.modules,
    ratingBlend: nba.ratingBlend,
    factors: nba.factors.map((factor) => ({
      label: factor.label,
      value: factor.value,
      weight: factor.weight ?? 0.04,
      source: factor.source ?? "advanced"
    }))
  };
}

export async function buildRealitySimIntel(league: LeagueKey, matchup: { away: string; home: string }): Promise<RealitySimIntel | null> {
  if (league === "MLB") return null;

  if (league === "NBA") {
    const nba = await compareNbaIntelligence(matchup.away, matchup.home);
    return buildNbaRealityIntel(nba);
  }

  const weights = sportWeights(league);
  const [teamRows, playerRows, ratingRows] = await Promise.all([
    fetchRows(firstUrl(TEAM_URLS[league])),
    fetchRows(firstUrl(PLAYER_URLS[league])),
    fetchRows(firstUrl(RATING_URLS[league]))
  ]);

  const awayTeam = rawTeam((teamRows ?? []).find((row) => normalizeName(text(row.teamName, row.team, row.name, row.fighterName) ?? "") === normalizeName(matchup.away)) ?? {}, matchup.away, league) ?? syntheticTeam(league, matchup.away);
  const homeTeam = rawTeam((teamRows ?? []).find((row) => normalizeName(text(row.teamName, row.team, row.name, row.fighterName) ?? "") === normalizeName(matchup.home)) ?? {}, matchup.home, league) ?? syntheticTeam(league, matchup.home);
  const awayPlayers = rawPlayerSummary(playerRows, league, matchup.away);
  const homePlayers = rawPlayerSummary(playerRows, league, matchup.home);
  const awayRating = rawRating(ratingRows, league, matchup.away);
  const homeRating = rawRating(ratingRows, league, matchup.home);

  const factors: RealityFactor[] = [];
  const teamPower = edge(awayTeam.offense - awayTeam.defense * 0.72, homeTeam.offense - homeTeam.defense * 0.72, 0.18);
  const efficiency = edge(awayTeam.offense + awayTeam.turnoverMargin + awayTeam.rebounding * 0.5, homeTeam.offense + homeTeam.turnoverMargin + homeTeam.rebounding * 0.5, 0.11);
  const defenseStop = edge(homeTeam.defense + homeTeam.goalieOrKeeper, awayTeam.defense + awayTeam.goalieOrKeeper, -0.1);
  const playerPower = edge(awayPlayers.starPower + awayPlayers.depthPower + awayPlayers.creation + awayPlayers.defense, homePlayers.starPower + homePlayers.depthPower + homePlayers.creation + homePlayers.defense, 0.22);
  const health = edge(awayPlayers.availability - awayPlayers.fatigue - awayTeam.injuryDrag, homePlayers.availability - homePlayers.fatigue - homeTeam.injuryDrag, 0.28);
  const ratingPower = edge(awayRating.overall + awayRating.offense * 0.45 + awayRating.defense * 0.38 + awayRating.clutch * 0.17, homeRating.overall + homeRating.offense * 0.45 + homeRating.defense * 0.38 + homeRating.clutch * 0.17, 0.045);
  const context = Number((homeTeam.homeAdvantage + edge(awayTeam.recentForm + awayTeam.rest + awayTeam.strengthOfSchedule * 0.35, homeTeam.recentForm + homeTeam.rest + homeTeam.strengthOfSchedule * 0.35, 0.18)).toFixed(2));
  const nerd = edge(awayTeam.pace + awayTeam.specialTeams + awayTeam.clutch, homeTeam.pace + homeTeam.specialTeams + homeTeam.clutch, league === "NHL" ? 0.08 : 0.04);

  addFactor(factors, "Team power equation", teamPower, weights.team, "team");
  addFactor(factors, "Efficiency + possession", efficiency, weights.advanced, "advanced");
  addFactor(factors, "Defensive stop value", defenseStop, weights.advanced, "advanced");
  addFactor(factors, "Player/star impact", playerPower, weights.player, "player");
  addFactor(factors, "Health + fatigue", health, weights.player, "player");
  addFactor(factors, "Video-game rating blend", ratingPower, weights.rating, "rating");
  addFactor(factors, "Venue/rest/context", context, weights.context, "context");
  addFactor(factors, "Pace/special/clutch", nerd, weights.advanced, "advanced");

  const homeEdge = Number(factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0).toFixed(2));
  const totalTempo = ((awayTeam.pace + homeTeam.pace) / 2 - (league === "NHL" || league === "UFC" || league === "BOXING" ? 1 : 100));
  const offenseTotal = Math.abs(awayTeam.offense - 100) + Math.abs(homeTeam.offense - 100);
  const volatilityIndex = Number(clamp(1 + Math.abs(homeEdge) / 18 + (awayPlayers.volatility + homePlayers.volatility) / 12 + Math.abs(health) / 18, 0.78, 2.05).toFixed(2));
  const projectedTotal = league === "UFC" || league === "BOXING"
    ? 0
    : Number(Math.max(league === "NHL" ? 3.8 : 24, weights.totalBase + totalTempo * weights.totalScale + offenseTotal * 0.08 + (awayTeam.injuryDrag + homeTeam.injuryDrag) * -0.2).toFixed(1));
  const confidence = Number(clamp(0.56 + Math.abs(homeEdge) / 30 - (volatilityIndex - 1) * 0.06 + (teamRows ? 0.025 : 0) + (playerRows ? 0.025 : 0) + (ratingRows ? 0.015 : 0), 0.48, 0.86).toFixed(3));

  return {
    modelVersion: "reality-sim-v1",
    dataSource: [teamRows ? "team:real" : "team:synthetic", playerRows ? "player:real" : "player:synthetic", ratingRows ? "ratings:real" : "ratings:synthetic"].join("+"),
    homeEdge,
    projectedTotal,
    volatilityIndex,
    confidence,
    factors: factors.sort((left, right) => Math.abs(right.value * right.weight) - Math.abs(left.value * left.weight)),
    modules: [
      { label: "Team stats", status: teamRows ? "real" : "synthetic", note: teamRows ? "External team analytics feed applied." : "Synthetic team profile used until a team stats feed is configured." },
      { label: "Player impact", status: playerRows ? "real" : "synthetic", note: playerRows ? "External player/fighter feed applied." : "Synthetic player impact used until a player stats feed is configured." },
      { label: "Game ratings", status: ratingRows ? "real" : "synthetic", note: ratingRows ? "Video-game/rating feed applied." : "Synthetic game-rating blend used until ratings feed is configured." }
    ],
    ratingBlend: {
      teamPower,
      playerPower,
      advancedPower: Number((efficiency + defenseStop + nerd).toFixed(2)),
      gameRatingPower: ratingPower,
      contextPower: context
    }
  };
}
