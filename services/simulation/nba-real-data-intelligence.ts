import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

export type NbaRealDataFactor = {
  label: string;
  value: number;
  weight: number;
  source: "team" | "player" | "advanced" | "rating" | "history" | "context";
};

export type NbaRealDataIntel = {
  modelVersion: "nba-real-data-v1";
  dataSource: string;
  homeEdge: number;
  projectedTotal: number;
  volatilityIndex: number;
  confidence: number;
  modules: Array<{ label: string; status: "real" | "unavailable"; note: string }>;
  ratingBlend: {
    teamPower: number;
    playerPower: number;
    advancedPower: number;
    gameRatingPower: number;
    contextPower: number;
    historyPower: number;
  };
  factors: NbaRealDataFactor[];
  sourceHealth: {
    team: boolean;
    player: boolean;
    history: boolean;
    rating: boolean;
    realModules: number;
    requiredModulesReady: boolean;
  };
};

type Row = Record<string, unknown>;

type TeamProfile = {
  teamName: string;
  offensiveRating: number;
  defensiveRating: number;
  netRating: number;
  trueShooting: number;
  effectiveFg: number;
  threePointRate: number;
  threePointAccuracy: number;
  freeThrowRate: number;
  turnoverRate: number;
  offensiveReboundRate: number;
  defensiveReboundRate: number;
  pace: number;
  transition: number;
  halfCourt: number;
  clutch: number;
  rest: number;
  travel: number;
  recentForm: number;
  homeAdvantage: number;
  injuryDrag: number;
};

type PlayerProfile = {
  teamName: string;
  starPower: number;
  usageCreation: number;
  onOffImpact: number;
  spacing: number;
  playmaking: number;
  rimPressure: number;
  rebounding: number;
  perimeterDefense: number;
  rimProtection: number;
  depthPower: number;
  availability: number;
  fatigue: number;
  volatility: number;
};

type RatingProfile = {
  teamName: string;
  overall: number;
  offense: number;
  defense: number;
  shooting: number;
  playmaking: number;
  rebounding: number;
  depth: number;
  clutch: number;
  health: number;
};

type HistoryProfile = {
  teamName: string;
  headToHeadEdge: number;
  recentOffense: number;
  recentDefense: number;
  recentShooting: number;
  recentTurnovers: number;
  recentRebounding: number;
  starMatchup: number;
  benchTrend: number;
  restHistory: number;
  clutchRecent: number;
  sample: number;
};

type PlayerAccumulator = Omit<PlayerProfile, "teamName"> & { weight: number };

const TEAM_CACHE_KEY = "nba:real-data:team:v1";
const PLAYER_CACHE_KEY = "nba:real-data:player:v1";
const RATING_CACHE_KEY = "nba:real-data:rating:v1";
const HISTORY_CACHE_KEY = "nba:real-data:history:v1";
const CACHE_TTL_SECONDS = 60 * 30;

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function optionalNum(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function numOr(value: number | null, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rowsFromBody(body: unknown): Row[] {
  const value = body as { teams?: Row[]; players?: Row[]; ratings?: Row[]; history?: Row[]; data?: Row[]; rows?: Row[] };
  if (Array.isArray(body)) return body as Row[];
  if (Array.isArray(value.teams)) return value.teams;
  if (Array.isArray(value.players)) return value.players;
  if (Array.isArray(value.ratings)) return value.ratings;
  if (Array.isArray(value.history)) return value.history;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.rows)) return value.rows;
  return [];
}

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

async function fetchRows(url: string | null): Promise<Row[] | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const rows = rowsFromBody(await response.json());
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

async function cachedRows(cacheKey: string, url: string | null): Promise<Row[] | null> {
  const cached = await readHotCache<Row[]>(cacheKey);
  if (cached?.length) return cached;
  const rows = await fetchRows(url);
  if (rows?.length) await writeHotCache(cacheKey, rows, CACHE_TTL_SECONDS);
  return rows;
}

function groupByTeam(rows: Row[] | null) {
  const grouped: Record<string, Row> = {};
  for (const row of rows ?? []) {
    const name = text(row.teamName, row.team, row.team_name, row.name, row.TEAM_NAME, row.team_abbreviation, row.TEAM_ABBREVIATION);
    if (name) grouped[normalizeName(name)] = row;
  }
  return grouped;
}

function matchedPlayers(rows: Row[] | null, teamName: string) {
  const key = normalizeName(teamName);
  return (rows ?? []).filter((row) => normalizeName(text(row.teamName, row.team, row.team_name, row.TEAM_NAME, row.team_abbreviation, row.TEAM_ABBREVIATION) ?? "") === key);
}

function rowTeamProfile(row: Row | undefined, teamName: string): TeamProfile | null {
  if (!row) return null;
  const offensiveRating = optionalNum(row.offensiveRating, row.off_rating, row.ortg, row.offense);
  const defensiveRating = optionalNum(row.defensiveRating, row.def_rating, row.drtg, row.defense);
  if (offensiveRating == null || defensiveRating == null) return null;
  return {
    teamName: text(row.teamName, row.team, row.team_name, row.name, row.TEAM_NAME) ?? teamName,
    offensiveRating,
    defensiveRating,
    netRating: numOr(optionalNum(row.netRating, row.net_rating, row.net), offensiveRating - defensiveRating),
    trueShooting: numOr(optionalNum(row.trueShooting, row.tsPct, row.ts, row.true_shooting), 57),
    effectiveFg: numOr(optionalNum(row.effectiveFg, row.efgPct, row.efg, row.effective_fg), 54),
    threePointRate: numOr(optionalNum(row.threePointRate, row.threePar, row.three_rate, row.threePointAttemptRate), 38),
    threePointAccuracy: numOr(optionalNum(row.threePointAccuracy, row.threePct, row.three_point_pct), 36),
    freeThrowRate: numOr(optionalNum(row.freeThrowRate, row.ftr, row.ftRate), 22),
    turnoverRate: numOr(optionalNum(row.turnoverRate, row.tovPct, row.tovRate), 13),
    offensiveReboundRate: numOr(optionalNum(row.offensiveReboundRate, row.orebPct, row.orebRate), 27),
    defensiveReboundRate: numOr(optionalNum(row.defensiveReboundRate, row.drebPct, row.drebRate), 73),
    pace: numOr(optionalNum(row.pace, row.tempo, row.possessions), 99),
    transition: numOr(optionalNum(row.transition, row.fastBreakRating, row.transitionEdge), 0),
    halfCourt: numOr(optionalNum(row.halfCourt, row.halfCourtRating, row.halfCourtEdge), 0),
    clutch: numOr(optionalNum(row.clutch, row.lateGame, row.closeGameRating), 0),
    rest: numOr(optionalNum(row.rest, row.restAdvantage, row.daysRest), 0),
    travel: numOr(optionalNum(row.travel, row.travelPenalty, row.roadFatigue), 0),
    recentForm: numOr(optionalNum(row.recentForm, row.last10Net, row.form, row.recent_net), 0),
    homeAdvantage: numOr(optionalNum(row.homeAdvantage, row.homeCourt, row.homeCourtAdvantage), 2.1),
    injuryDrag: numOr(optionalNum(row.injuryDrag, row.healthPenalty, row.injuries), 0)
  };
}

function playerProfile(rows: Row[] | null, teamName: string): PlayerProfile | null {
  const matched = matchedPlayers(rows, teamName);
  if (!matched.length) return null;
  const totals = matched.reduce<PlayerAccumulator>((acc, row, index) => {
    const weight = Math.max(0.4, numOr(optionalNum(row.minutes, row.projectedMinutes, row.usage, row.roleWeight), index < 5 ? 3 : 1));
    const impact = numOr(optionalNum(row.impactRating, row.epm, row.raptor, row.bpm, row.lebron, row.onOff, row.plusMinus), 0);
    acc.starPower += numOr(optionalNum(row.starPower, row.starRating, row.topPlayerImpact, row.usageImpact), impact) * weight;
    acc.usageCreation += numOr(optionalNum(row.usageCreation, row.creation, row.usage, row.shotCreation), impact * 0.55) * weight;
    acc.onOffImpact += numOr(optionalNum(row.onOffImpact, row.onOff, row.plusMinus, row.netOnOff), impact) * weight;
    acc.spacing += numOr(optionalNum(row.spacing, row.threePointGravity, row.shootingGravity), 0) * weight;
    acc.playmaking += numOr(optionalNum(row.playmaking, row.assistImpact, row.creationPassing), 0) * weight;
    acc.rimPressure += numOr(optionalNum(row.rimPressure, row.paintTouchImpact, row.drives), 0) * weight;
    acc.rebounding += numOr(optionalNum(row.rebounding, row.reboundImpact, row.rebImpact), 0) * weight;
    acc.perimeterDefense += numOr(optionalNum(row.perimeterDefense, row.defensiveImpact, row.dEpm), 0) * weight;
    acc.rimProtection += numOr(optionalNum(row.rimProtection, row.blockImpact, row.interiorDefense), 0) * weight;
    acc.depthPower += numOr(optionalNum(row.depthPower, row.benchImpact, row.roleValue), impact * 0.35) * weight;
    acc.availability += -Math.abs(numOr(optionalNum(row.availabilityDrag, row.injuryPenalty, row.healthPenalty, row.statusPenalty), 0)) * weight;
    acc.fatigue += Math.max(0, numOr(optionalNum(row.fatigue, row.load, row.backToBackRisk), 0)) * weight;
    acc.volatility += Math.max(0.75, numOr(optionalNum(row.volatility, row.variance, row.consistencyRisk), 1)) * weight;
    acc.weight += weight;
    return acc;
  }, {
    starPower: 0,
    usageCreation: 0,
    onOffImpact: 0,
    spacing: 0,
    playmaking: 0,
    rimPressure: 0,
    rebounding: 0,
    perimeterDefense: 0,
    rimProtection: 0,
    depthPower: 0,
    availability: 0,
    fatigue: 0,
    volatility: 0,
    weight: 0
  });
  const divisor = totals.weight || 1;
  return {
    teamName,
    starPower: round(totals.starPower / divisor, 2),
    usageCreation: round(totals.usageCreation / divisor, 2),
    onOffImpact: round(totals.onOffImpact / divisor, 2),
    spacing: round(totals.spacing / divisor, 2),
    playmaking: round(totals.playmaking / divisor, 2),
    rimPressure: round(totals.rimPressure / divisor, 2),
    rebounding: round(totals.rebounding / divisor, 2),
    perimeterDefense: round(totals.perimeterDefense / divisor, 2),
    rimProtection: round(totals.rimProtection / divisor, 2),
    depthPower: round(totals.depthPower / divisor, 2),
    availability: round(totals.availability / divisor, 2),
    fatigue: round(totals.fatigue / divisor, 2),
    volatility: round(totals.volatility / divisor, 2)
  };
}

function ratingProfile(row: Row | undefined, teamName: string): RatingProfile | null {
  if (!row) return null;
  const overall = optionalNum(row.overall, row.ovr, row.rating, row.teamOverall);
  if (overall == null) return null;
  return {
    teamName: text(row.teamName, row.team, row.name) ?? teamName,
    overall,
    offense: numOr(optionalNum(row.offense, row.offenseRating, row.offensiveRating), overall),
    defense: numOr(optionalNum(row.defense, row.defenseRating, row.defensiveRating), overall),
    shooting: numOr(optionalNum(row.shooting, row.shootingRating, row.threePointRating), overall),
    playmaking: numOr(optionalNum(row.playmaking, row.passing, row.creationRating), overall),
    rebounding: numOr(optionalNum(row.rebounding, row.reboundRating), overall),
    depth: numOr(optionalNum(row.depth, row.benchRating, row.rosterDepth), overall),
    clutch: numOr(optionalNum(row.clutch, row.composure, row.lateGame), overall),
    health: numOr(optionalNum(row.health, row.healthRating, row.durability), 92)
  };
}

function historyProfile(row: Row | undefined, teamName: string): HistoryProfile | null {
  if (!row) return null;
  const sample = optionalNum(row.sample, row.historySample, row.gamesSample);
  if (sample == null || sample <= 0) return null;
  return {
    teamName: text(row.teamName, row.team, row.name) ?? teamName,
    headToHeadEdge: numOr(optionalNum(row.headToHeadEdge, row.h2hEdge, row.matchupHistory), 0),
    recentOffense: numOr(optionalNum(row.recentOffense, row.last10Offense, row.recentOffRating), 0),
    recentDefense: numOr(optionalNum(row.recentDefense, row.last10Defense, row.recentDefRating), 0),
    recentShooting: numOr(optionalNum(row.recentShooting, row.last10Shooting, row.recentTs, row.recentEfg), 0),
    recentTurnovers: numOr(optionalNum(row.recentTurnovers, row.turnoverTrend, row.recentTov), 0),
    recentRebounding: numOr(optionalNum(row.recentRebounding, row.reboundTrend, row.recentReb), 0),
    starMatchup: numOr(optionalNum(row.starMatchup, row.primaryMatchup, row.starEdge), 0),
    benchTrend: numOr(optionalNum(row.benchTrend, row.recentBench, row.secondUnit), 0),
    restHistory: numOr(optionalNum(row.restHistory, row.restTrend, row.scheduleHistory), 0),
    clutchRecent: numOr(optionalNum(row.clutchRecent, row.recentClutch, row.closeGameRecent), 0),
    sample
  };
}

function diff(home: number, away: number, scale = 1) {
  return round((home - away) * scale, 2);
}

function addFactor(factors: NbaRealDataFactor[], label: string, value: number, weight: number, source: NbaRealDataFactor["source"]) {
  factors.push({ label, value: round(value, 2), weight, source });
}

function unavailableIntel(reason: string, modules: NbaRealDataIntel["modules"]): NbaRealDataIntel {
  return {
    modelVersion: "nba-real-data-v1",
    dataSource: `real-data-only:unavailable:${reason}`,
    homeEdge: 0,
    projectedTotal: 0,
    volatilityIndex: 2.25,
    confidence: 0.18,
    modules,
    ratingBlend: { teamPower: 0, playerPower: 0, advancedPower: 0, gameRatingPower: 0, contextPower: 0, historyPower: 0 },
    factors: [{ label: "Real NBA data gate", value: 0, weight: 0, source: "context" }],
    sourceHealth: { team: false, player: false, history: false, rating: false, realModules: 0, requiredModulesReady: false }
  };
}

export async function compareNbaRealDataIntelligence(awayTeam: string, homeTeam: string): Promise<NbaRealDataIntel> {
  const [teamRows, players, ratingRows, historyRows] = await Promise.all([
    cachedRows(TEAM_CACHE_KEY, firstEnv("NBA_TEAM_ANALYTICS_URL", "TEAM_ANALYTICS_URL", "SIM_TEAM_STATS_URL")),
    cachedRows(PLAYER_CACHE_KEY, firstEnv("NBA_PLAYER_ANALYTICS_URL", "PLAYER_ANALYTICS_URL", "SIM_PLAYER_STATS_URL")),
    cachedRows(RATING_CACHE_KEY, firstEnv("NBA_GAME_RATINGS_URL", "GAME_RATINGS_URL", "VIDEO_GAME_RATINGS_URL")),
    cachedRows(HISTORY_CACHE_KEY, firstEnv("NBA_RECENT_FORM_URL", "NBA_MATCHUP_HISTORY_URL", "SIM_RECENT_FORM_URL"))
  ]);

  const teamGrouped = groupByTeam(teamRows);
  const ratingGrouped = groupByTeam(ratingRows);
  const historyGrouped = groupByTeam(historyRows);
  const awayKey = normalizeName(awayTeam);
  const homeKey = normalizeName(homeTeam);
  const maybeAwayTeam = rowTeamProfile(teamGrouped[awayKey], awayTeam);
  const maybeHomeTeam = rowTeamProfile(teamGrouped[homeKey], homeTeam);
  const maybeAwayPlayer = playerProfile(players, awayTeam);
  const maybeHomePlayer = playerProfile(players, homeTeam);
  const awayRating = ratingProfile(ratingGrouped[awayKey], awayTeam);
  const homeRating = ratingProfile(ratingGrouped[homeKey], homeTeam);
  const awayHistory = historyProfile(historyGrouped[awayKey], awayTeam);
  const homeHistory = historyProfile(historyGrouped[homeKey], homeTeam);

  const modules: NbaRealDataIntel["modules"] = [
    { label: "NBA team feed", status: maybeAwayTeam && maybeHomeTeam ? "real" : "unavailable", note: maybeAwayTeam && maybeHomeTeam ? "Real team advanced/warehouse rows loaded for both teams." : "Missing real team rows for one or both teams; no synthetic team strength used." },
    { label: "NBA player feed", status: maybeAwayPlayer && maybeHomePlayer ? "real" : "unavailable", note: maybeAwayPlayer && maybeHomePlayer ? "Real player impact rows loaded for both teams." : "Missing real player rows for one or both teams; no synthetic player strength used." },
    { label: "NBA history feed", status: awayHistory && homeHistory ? "real" : "unavailable", note: awayHistory && homeHistory ? "Real history/recent-form rows loaded for both teams." : "Missing real history rows for one or both teams; no synthetic history used." },
    { label: "NBA ratings feed", status: awayRating && homeRating ? "real" : "unavailable", note: awayRating && homeRating ? "Real derived/external ratings rows loaded for both teams." : "Missing real ratings rows; rating blend omitted." }
  ];

  if (!maybeAwayTeam || !maybeHomeTeam || !maybeAwayPlayer || !maybeHomePlayer) {
    return unavailableIntel("missing-required-team-or-player-feed", modules);
  }

  const awayTeamProfile = maybeAwayTeam;
  const homeTeamProfile = maybeHomeTeam;
  const awayPlayerProfile = maybeAwayPlayer;
  const homePlayerProfile = maybeHomePlayer;

  const factors: NbaRealDataFactor[] = [];
  const teamNet = diff(homeTeamProfile.netRating, awayTeamProfile.netRating, 0.42);
  const offense = diff(homeTeamProfile.offensiveRating, awayTeamProfile.offensiveRating, 0.24);
  const defense = diff(awayTeamProfile.defensiveRating, homeTeamProfile.defensiveRating, 0.24);
  const shotQuality = diff(homeTeamProfile.trueShooting * 0.5 + homeTeamProfile.effectiveFg * 0.32 + homeTeamProfile.threePointAccuracy * 0.18, awayTeamProfile.trueShooting * 0.5 + awayTeamProfile.effectiveFg * 0.32 + awayTeamProfile.threePointAccuracy * 0.18, 0.18);
  const possession = diff(homeTeamProfile.offensiveReboundRate + homeTeamProfile.defensiveReboundRate * 0.35 - homeTeamProfile.turnoverRate * 1.4 + homeTeamProfile.freeThrowRate * 0.28, awayTeamProfile.offensiveReboundRate + awayTeamProfile.defensiveReboundRate * 0.35 - awayTeamProfile.turnoverRate * 1.4 + awayTeamProfile.freeThrowRate * 0.28, 0.12);
  const pace = diff(homeTeamProfile.pace, awayTeamProfile.pace, 0.08);
  const playStyle = diff(homeTeamProfile.transition + homeTeamProfile.halfCourt, awayTeamProfile.transition + awayTeamProfile.halfCourt, 0.16);
  const context = round(homeTeamProfile.homeAdvantage + diff(homeTeamProfile.rest + homeTeamProfile.travel, awayTeamProfile.rest + awayTeamProfile.travel, 0.26), 2);
  const recentTeamForm = diff(homeTeamProfile.recentForm, awayTeamProfile.recentForm, 0.18);
  const playerImpact = diff(homePlayerProfile.starPower + homePlayerProfile.usageCreation + homePlayerProfile.onOffImpact + homePlayerProfile.spacing + homePlayerProfile.playmaking, awayPlayerProfile.starPower + awayPlayerProfile.usageCreation + awayPlayerProfile.onOffImpact + awayPlayerProfile.spacing + awayPlayerProfile.playmaking, 0.2);
  const playerDefense = diff(homePlayerProfile.perimeterDefense + homePlayerProfile.rimProtection + homePlayerProfile.rebounding, awayPlayerProfile.perimeterDefense + awayPlayerProfile.rimProtection + awayPlayerProfile.rebounding, 0.16);
  const health = diff(homePlayerProfile.availability - homePlayerProfile.fatigue - homeTeamProfile.injuryDrag, awayPlayerProfile.availability - awayPlayerProfile.fatigue - awayTeamProfile.injuryDrag, 0.36);
  const depth = diff(homePlayerProfile.depthPower, awayPlayerProfile.depthPower, 0.24);
  const ratingOverall = awayRating && homeRating ? diff(homeRating.overall, awayRating.overall, 0.06) : 0;
  const ratingShooting = awayRating && homeRating ? diff(homeRating.shooting + homeRating.offense * 0.35, awayRating.shooting + awayRating.offense * 0.35, 0.035) : 0;
  const ratingDefense = awayRating && homeRating ? diff(homeRating.defense + homeRating.rebounding * 0.24, awayRating.defense + awayRating.rebounding * 0.24, 0.035) : 0;
  const ratingDepth = awayRating && homeRating ? diff(homeRating.depth + homeRating.health * 0.3, awayRating.depth + awayRating.health * 0.3, 0.03) : 0;
  const history = awayHistory && homeHistory ? diff(homeHistory.headToHeadEdge, awayHistory.headToHeadEdge, 0.22) : 0;
  const recentOffense = awayHistory && homeHistory ? diff(homeHistory.recentOffense, awayHistory.recentOffense, 0.2) : 0;
  const recentDefense = awayHistory && homeHistory ? diff(homeHistory.recentDefense, awayHistory.recentDefense, 0.18) : 0;
  const recentShooting = awayHistory && homeHistory ? diff(homeHistory.recentShooting, awayHistory.recentShooting, 0.18) : 0;
  const recentTurnovers = awayHistory && homeHistory ? diff(awayHistory.recentTurnovers, homeHistory.recentTurnovers, 0.15) : 0;
  const recentRebounding = awayHistory && homeHistory ? diff(homeHistory.recentRebounding, awayHistory.recentRebounding, 0.14) : 0;
  const starMatchup = awayHistory && homeHistory ? diff(homeHistory.starMatchup, awayHistory.starMatchup, 0.2) : 0;
  const benchTrend = awayHistory && homeHistory ? diff(homeHistory.benchTrend, awayHistory.benchTrend, 0.16) : 0;
  const restHistory = awayHistory && homeHistory ? diff(homeHistory.restHistory, awayHistory.restHistory, 0.14) : 0;
  const clutchRecent = awayHistory && homeHistory ? diff(homeHistory.clutchRecent, awayHistory.clutchRecent, 0.12) : 0;

  addFactor(factors, "Team net rating", teamNet, 0.16, "team");
  addFactor(factors, "Offensive efficiency", offense, 0.1, "team");
  addFactor(factors, "Defensive efficiency", defense, 0.1, "team");
  addFactor(factors, "Shot quality", shotQuality, 0.09, "advanced");
  addFactor(factors, "Possession battle", possession, 0.08, "advanced");
  addFactor(factors, "Pace/tempo", pace, 0.04, "advanced");
  addFactor(factors, "Style fit", playStyle, 0.05, "advanced");
  addFactor(factors, "Venue/rest/context", context, 0.07, "context");
  addFactor(factors, "Recent team form", recentTeamForm, 0.07, "history");
  addFactor(factors, "Star/player impact", playerImpact, 0.14, "player");
  addFactor(factors, "Defensive matchup", playerDefense, 0.07, "player");
  addFactor(factors, "Availability", health, 0.08, "player");
  addFactor(factors, "Depth/bench", depth, 0.05, "player");
  if (awayRating && homeRating) {
    addFactor(factors, "Ratings overall", ratingOverall, 0.04, "rating");
    addFactor(factors, "Ratings shooting", ratingShooting, 0.03, "rating");
    addFactor(factors, "Ratings defense", ratingDefense, 0.03, "rating");
    addFactor(factors, "Ratings depth", ratingDepth, 0.02, "rating");
  }
  if (awayHistory && homeHistory) {
    addFactor(factors, "Head-to-head history", history, 0.02, "history");
    addFactor(factors, "Recent offense", recentOffense, 0.04, "history");
    addFactor(factors, "Recent defense", recentDefense, 0.035, "history");
    addFactor(factors, "Recent shooting", recentShooting, 0.03, "history");
    addFactor(factors, "Recent turnovers", recentTurnovers, 0.025, "history");
    addFactor(factors, "Recent rebounding", recentRebounding, 0.025, "history");
    addFactor(factors, "Star matchup", starMatchup, 0.03, "history");
    addFactor(factors, "Bench trend", benchTrend, 0.025, "history");
    addFactor(factors, "Rest history", restHistory, 0.02, "history");
    addFactor(factors, "Clutch recent", clutchRecent, 0.018, "history");
  }

  const leagueAvgOrtg = 113.2;
  const leagueAvgPtsPer100 = 113.5;
  const expectedHomePer100 = leagueAvgPtsPer100 * (homeTeamProfile.offensiveRating / leagueAvgOrtg) * (awayTeamProfile.defensiveRating / leagueAvgOrtg);
  const expectedAwayPer100 = leagueAvgPtsPer100 * (awayTeamProfile.offensiveRating / leagueAvgOrtg) * (homeTeamProfile.defensiveRating / leagueAvgOrtg);
  const opponentAdjustedEdge = diff(expectedHomePer100, expectedAwayPer100, 0.22);
  addFactor(factors, "Opponent-adjusted scoring edge", opponentAdjustedEdge, 0.14, "advanced");

  const homeEdge = round(factors.reduce((total, factor) => total + factor.value * factor.weight, 0), 2);
  const slowerPace = Math.min(homeTeamProfile.pace, awayTeamProfile.pace);
  const fasterPace = Math.max(homeTeamProfile.pace, awayTeamProfile.pace);
  const blendedPace = slowerPace * 0.58 + fasterPace * 0.42;
  const rawTotal = (expectedHomePer100 + expectedAwayPer100) * (blendedPace / 100);
  const scoringContext = (homeTeamProfile.trueShooting + awayTeamProfile.trueShooting - 114) * 0.42 + (homeTeamProfile.turnoverRate + awayTeamProfile.turnoverRate - 26) * -0.28;
  const projectedTotal = round(clamp(rawTotal + scoringContext, 190, 255), 1);
  const sourceHealth = {
    team: true,
    player: true,
    history: Boolean(awayHistory && homeHistory),
    rating: Boolean(awayRating && homeRating),
    realModules: modules.filter((module) => module.status === "real").length,
    requiredModulesReady: true
  };
  const volatilityIndex = round(clamp(0.92 + Math.abs(homeEdge) / 22 + Math.abs(health) / 15 + (homePlayerProfile.volatility + awayPlayerProfile.volatility) / 18 + (sourceHealth.history ? 0 : 0.08) + (sourceHealth.rating ? 0 : 0.05), 0.85, 2.05), 2);
  const confidence = round(clamp(0.5 + Math.abs(homeEdge) / 34 - (volatilityIndex - 1) * 0.06 + sourceHealth.realModules * 0.025, 0.42, 0.78), 3);
  const ratingBlend = {
    teamPower: round(teamNet + offense + defense, 2),
    playerPower: round(playerImpact + playerDefense + health + depth, 2),
    advancedPower: round(shotQuality + possession + pace + playStyle + opponentAdjustedEdge, 2),
    gameRatingPower: round(ratingOverall + ratingShooting + ratingDefense + ratingDepth, 2),
    contextPower: context,
    historyPower: round(history + recentOffense + recentDefense + recentShooting + recentTurnovers + recentRebounding + starMatchup + benchTrend + restHistory + clutchRecent, 2)
  };

  return {
    modelVersion: "nba-real-data-v1",
    dataSource: `real-data-only:team+player${sourceHealth.history ? "+history" : ""}${sourceHealth.rating ? "+rating" : ""}`,
    homeEdge,
    projectedTotal,
    volatilityIndex,
    confidence,
    modules,
    ratingBlend,
    factors: factors.sort((left, right) => Math.abs(right.value * right.weight) - Math.abs(left.value * left.weight)),
    sourceHealth
  };
}
