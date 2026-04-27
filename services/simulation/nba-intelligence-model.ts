import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

export type NbaIntelFactor = {
  label: string;
  value: number;
  weight?: number;
  source?: "team" | "player" | "advanced" | "rating" | "history" | "context";
};

export type NbaIntel = {
  modelVersion: "nba-intel-v1";
  dataSource: string;
  homeEdge: number;
  projectedTotal: number;
  volatilityIndex: number;
  confidence: number;
  modules: Array<{ label: string; status: "real" | "synthetic"; note: string }>;
  ratingBlend: {
    teamPower: number;
    playerPower: number;
    advancedPower: number;
    gameRatingPower: number;
    contextPower: number;
    historyPower: number;
  };
  factors: NbaIntelFactor[];
};

type Row = Record<string, unknown>;

type NbaTeamProfile = {
  teamName: string;
  source: "real" | "synthetic";
  offensiveRating: number;
  defensiveRating: number;
  netRating: number;
  trueShooting: number;
  effectiveFg: number;
  threePointRate: number;
  threePointAccuracy: number;
  rimPressure: number;
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

type NbaPlayerProfile = {
  teamName: string;
  source: "real" | "synthetic";
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

type NbaRatingProfile = {
  teamName: string;
  source: "real" | "synthetic";
  overall: number;
  offense: number;
  defense: number;
  shooting: number;
  playmaking: number;
  athleticism: number;
  rebounding: number;
  depth: number;
  clutch: number;
  health: number;
};

type NbaHistoryProfile = {
  teamName: string;
  source: "real" | "synthetic";
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

const TEAM_CACHE_KEY = "nba:intel:team:v1";
const PLAYER_CACHE_KEY = "nba:intel:player:v1";
const RATING_CACHE_KEY = "nba:intel:ratings:v1";
const HISTORY_CACHE_KEY = "nba:intel:history:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 4;

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

function seedUnit(seed: number) {
  return (seed % 10000) / 10000;
}

function range(seed: number, min: number, max: number) {
  return Number((min + seedUnit(seed) * (max - min)).toFixed(3));
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

async function fetchRows(url: string | null): Promise<Row[] | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return rowsFromBody(await response.json());
  } catch {
    return null;
  }
}

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function syntheticTeam(teamName: string): NbaTeamProfile {
  const seed = hashString(`${teamName}:nba-team`);
  const offensiveRating = range(seed >>> 1, 108, 122);
  const defensiveRating = range(seed >>> 2, 108, 121);
  return {
    teamName,
    source: "synthetic",
    offensiveRating,
    defensiveRating,
    netRating: Number((offensiveRating - defensiveRating).toFixed(2)),
    trueShooting: range(seed >>> 3, 55.5, 61.8),
    effectiveFg: range(seed >>> 4, 51.5, 58.8),
    threePointRate: range(seed >>> 5, 32, 47),
    threePointAccuracy: range(seed >>> 6, 33.2, 40.5),
    rimPressure: range(seed >>> 7, -4, 6),
    freeThrowRate: range(seed >>> 8, 18, 27),
    turnoverRate: range(seed >>> 9, 11, 16.5),
    offensiveReboundRate: range(seed >>> 10, 23, 32),
    defensiveReboundRate: range(seed >>> 11, 68, 77),
    pace: range(seed >>> 12, 96, 104),
    transition: range(seed >>> 13, -4, 6),
    halfCourt: range(seed >>> 14, -5, 7),
    clutch: range(seed >>> 15, -5, 6),
    rest: range(seed >>> 16, -2.4, 2.6),
    travel: range(seed >>> 17, -2.2, 1.4),
    recentForm: range(seed >>> 18, -6, 7),
    homeAdvantage: range(seed >>> 19, 1.1, 3.1),
    injuryDrag: range(seed >>> 20, 0, 4.2)
  };
}

function teamFromRow(row: Row, fallbackName: string): NbaTeamProfile {
  const teamName = text(row.teamName, row.team, row.team_name, row.name, row.TEAM_NAME) ?? fallbackName;
  const base = syntheticTeam(teamName);
  return {
    ...base,
    source: "real",
    offensiveRating: num(row.offensiveRating ?? row.off_rating ?? row.ortg ?? row.offense, base.offensiveRating),
    defensiveRating: num(row.defensiveRating ?? row.def_rating ?? row.drtg ?? row.defense, base.defensiveRating),
    netRating: num(row.netRating ?? row.net_rating ?? row.net, base.netRating),
    trueShooting: num(row.trueShooting ?? row.tsPct ?? row.ts ?? row.true_shooting, base.trueShooting),
    effectiveFg: num(row.effectiveFg ?? row.efgPct ?? row.efg ?? row.effective_fg, base.effectiveFg),
    threePointRate: num(row.threePointRate ?? row.threePar ?? row.three_rate ?? row.threePointAttemptRate, base.threePointRate),
    threePointAccuracy: num(row.threePointAccuracy ?? row.threePct ?? row.three_point_pct, base.threePointAccuracy),
    rimPressure: num(row.rimPressure ?? row.paintPressure ?? row.rimRate ?? row.paintPointsEdge, base.rimPressure),
    freeThrowRate: num(row.freeThrowRate ?? row.ftr ?? row.ftRate, base.freeThrowRate),
    turnoverRate: num(row.turnoverRate ?? row.tovPct ?? row.tovRate, base.turnoverRate),
    offensiveReboundRate: num(row.offensiveReboundRate ?? row.orebPct ?? row.orebRate, base.offensiveReboundRate),
    defensiveReboundRate: num(row.defensiveReboundRate ?? row.drebPct ?? row.drebRate, base.defensiveReboundRate),
    pace: num(row.pace ?? row.tempo ?? row.possessions, base.pace),
    transition: num(row.transition ?? row.fastBreakRating ?? row.transitionEdge, base.transition),
    halfCourt: num(row.halfCourt ?? row.halfCourtRating ?? row.halfCourtEdge, base.halfCourt),
    clutch: num(row.clutch ?? row.lateGame ?? row.closeGameRating, base.clutch),
    rest: num(row.rest ?? row.restAdvantage ?? row.daysRest, base.rest),
    travel: num(row.travel ?? row.travelPenalty ?? row.roadFatigue, base.travel),
    recentForm: num(row.recentForm ?? row.last10Net ?? row.form ?? row.recent_net, base.recentForm),
    homeAdvantage: num(row.homeAdvantage ?? row.homeCourt ?? row.homeCourtAdvantage, base.homeAdvantage),
    injuryDrag: num(row.injuryDrag ?? row.healthPenalty ?? row.injuries, base.injuryDrag)
  };
}

function syntheticPlayer(teamName: string): NbaPlayerProfile {
  const seed = hashString(`${teamName}:nba-player`);
  return {
    teamName,
    source: "synthetic",
    starPower: range(seed >>> 1, -1.5, 7.5),
    usageCreation: range(seed >>> 2, -2, 7),
    onOffImpact: range(seed >>> 3, -4, 8),
    spacing: range(seed >>> 4, -3, 6),
    playmaking: range(seed >>> 5, -3, 6),
    rimPressure: range(seed >>> 6, -3, 6),
    rebounding: range(seed >>> 7, -3, 5.5),
    perimeterDefense: range(seed >>> 8, -3, 5),
    rimProtection: range(seed >>> 9, -3, 5),
    depthPower: range(seed >>> 10, -3.5, 5.5),
    availability: range(seed >>> 11, -4.5, 1.2),
    fatigue: range(seed >>> 12, 0, 3),
    volatility: range(seed >>> 13, 0.9, 1.55)
  };
}

function playerSummaryFromRows(rows: Row[] | null, teamName: string): NbaPlayerProfile {
  const base = syntheticPlayer(teamName);
  const key = normalizeName(teamName);
  const matched = (rows ?? []).filter((row) => normalizeName(text(row.teamName, row.team, row.team_name, row.TEAM_NAME) ?? "") === key);
  if (!matched.length) return base;

  const totals = matched.reduce((acc, row, index) => {
    const weight = Math.max(0.4, num(row.minutes ?? row.projectedMinutes ?? row.usage ?? row.roleWeight, index < 5 ? 3 : 1));
    const impact = num(row.impactRating ?? row.epm ?? row.raptor ?? row.bpm ?? row.lebron ?? row.onOff ?? row.plusMinus, 0);
    acc.starPower += num(row.starPower ?? row.starRating ?? row.topPlayerImpact ?? row.usageImpact, impact) * weight;
    acc.usageCreation += num(row.usageCreation ?? row.creation ?? row.usage ?? row.shotCreation, impact * 0.55) * weight;
    acc.onOffImpact += num(row.onOffImpact ?? row.onOff ?? row.plusMinus ?? row.netOnOff, impact) * weight;
    acc.spacing += num(row.spacing ?? row.threePointGravity ?? row.shootingGravity, 0) * weight;
    acc.playmaking += num(row.playmaking ?? row.assistImpact ?? row.creationPassing, 0) * weight;
    acc.rimPressure += num(row.rimPressure ?? row.paintTouchImpact ?? row.drives, 0) * weight;
    acc.rebounding += num(row.rebounding ?? row.reboundImpact ?? row.rebImpact, 0) * weight;
    acc.perimeterDefense += num(row.perimeterDefense ?? row.defensiveImpact ?? row.dEpm, 0) * weight;
    acc.rimProtection += num(row.rimProtection ?? row.blockImpact ?? row.interiorDefense, 0) * weight;
    acc.depthPower += num(row.depthPower ?? row.benchImpact ?? row.roleValue, impact * 0.35) * weight;
    acc.availability += -Math.abs(num(row.availabilityDrag ?? row.injuryPenalty ?? row.healthPenalty ?? row.statusPenalty, 0)) * weight;
    acc.fatigue += Math.max(0, num(row.fatigue ?? row.load ?? row.backToBackRisk, 0)) * weight;
    acc.volatility += Math.max(0.75, num(row.volatility ?? row.variance ?? row.consistencyRisk, 1)) * weight;
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
    source: "real",
    starPower: Number((totals.starPower / divisor).toFixed(2)),
    usageCreation: Number((totals.usageCreation / divisor).toFixed(2)),
    onOffImpact: Number((totals.onOffImpact / divisor).toFixed(2)),
    spacing: Number((totals.spacing / divisor).toFixed(2)),
    playmaking: Number((totals.playmaking / divisor).toFixed(2)),
    rimPressure: Number((totals.rimPressure / divisor).toFixed(2)),
    rebounding: Number((totals.rebounding / divisor).toFixed(2)),
    perimeterDefense: Number((totals.perimeterDefense / divisor).toFixed(2)),
    rimProtection: Number((totals.rimProtection / divisor).toFixed(2)),
    depthPower: Number((totals.depthPower / divisor).toFixed(2)),
    availability: Number((totals.availability / divisor).toFixed(2)),
    fatigue: Number((totals.fatigue / divisor).toFixed(2)),
    volatility: Number((totals.volatility / divisor).toFixed(2))
  };
}

function syntheticRating(teamName: string): NbaRatingProfile {
  const seed = hashString(`${teamName}:nba-rating`);
  return {
    teamName,
    source: "synthetic",
    overall: range(seed >>> 1, 72, 94),
    offense: range(seed >>> 2, 70, 95),
    defense: range(seed >>> 3, 70, 95),
    shooting: range(seed >>> 4, 68, 96),
    playmaking: range(seed >>> 5, 68, 96),
    athleticism: range(seed >>> 6, 68, 96),
    rebounding: range(seed >>> 7, 68, 94),
    depth: range(seed >>> 8, 66, 92),
    clutch: range(seed >>> 9, 66, 94),
    health: range(seed >>> 10, 74, 98)
  };
}

function ratingFromRow(row: Row | undefined, teamName: string): NbaRatingProfile {
  const base = syntheticRating(teamName);
  if (!row) return base;
  return {
    ...base,
    source: "real",
    overall: num(row.overall ?? row.ovr ?? row.rating ?? row.teamOverall, base.overall),
    offense: num(row.offense ?? row.offenseRating ?? row.offensiveRating, base.offense),
    defense: num(row.defense ?? row.defenseRating ?? row.defensiveRating, base.defense),
    shooting: num(row.shooting ?? row.shootingRating ?? row.threePointRating, base.shooting),
    playmaking: num(row.playmaking ?? row.passing ?? row.creationRating, base.playmaking),
    athleticism: num(row.athleticism ?? row.speed ?? row.transitionRating, base.athleticism),
    rebounding: num(row.rebounding ?? row.reboundRating, base.rebounding),
    depth: num(row.depth ?? row.benchRating ?? row.rosterDepth, base.depth),
    clutch: num(row.clutch ?? row.composure ?? row.lateGame, base.clutch),
    health: num(row.health ?? row.healthRating ?? row.durability, base.health)
  };
}

function syntheticHistory(teamName: string): NbaHistoryProfile {
  const seed = hashString(`${teamName}:nba-history`);
  return {
    teamName,
    source: "synthetic",
    headToHeadEdge: range(seed >>> 1, -2.5, 2.5),
    recentOffense: range(seed >>> 2, -4.5, 5.5),
    recentDefense: range(seed >>> 3, -4.5, 5.5),
    recentShooting: range(seed >>> 4, -4, 4.5),
    recentTurnovers: range(seed >>> 5, -3.5, 3.5),
    recentRebounding: range(seed >>> 6, -3.5, 3.5),
    starMatchup: range(seed >>> 7, -4, 5),
    benchTrend: range(seed >>> 8, -3.5, 4.5),
    restHistory: range(seed >>> 9, -2.5, 2.8),
    clutchRecent: range(seed >>> 10, -3, 3.5),
    sample: Math.round(range(seed >>> 11, 8, 55))
  };
}

function historyFromRow(row: Row | undefined, teamName: string): NbaHistoryProfile {
  const base = syntheticHistory(teamName);
  if (!row) return base;
  return {
    ...base,
    source: "real",
    headToHeadEdge: num(row.headToHeadEdge ?? row.h2hEdge ?? row.matchupHistory, base.headToHeadEdge),
    recentOffense: num(row.recentOffense ?? row.last10Offense ?? row.recentOffRating, base.recentOffense),
    recentDefense: num(row.recentDefense ?? row.last10Defense ?? row.recentDefRating, base.recentDefense),
    recentShooting: num(row.recentShooting ?? row.last10Shooting ?? row.recentTs ?? row.recentEfg, base.recentShooting),
    recentTurnovers: num(row.recentTurnovers ?? row.turnoverTrend ?? row.recentTov, base.recentTurnovers),
    recentRebounding: num(row.recentRebounding ?? row.reboundTrend ?? row.recentReb, base.recentRebounding),
    starMatchup: num(row.starMatchup ?? row.primaryMatchup ?? row.starEdge, base.starMatchup),
    benchTrend: num(row.benchTrend ?? row.recentBench ?? row.secondUnit, base.benchTrend),
    restHistory: num(row.restHistory ?? row.restTrend ?? row.scheduleHistory, base.restHistory),
    clutchRecent: num(row.clutchRecent ?? row.recentClutch ?? row.closeGameRecent, base.clutchRecent),
    sample: num(row.sample ?? row.historySample ?? row.gamesSample, base.sample)
  };
}

async function groupedRows(cacheKey: string, url: string | null) {
  const cached = await readHotCache<Record<string, Row>>(cacheKey);
  if (cached) return cached;
  const rows = await fetchRows(url);
  if (!rows?.length) return null;
  const grouped: Record<string, Row> = {};
  rows.forEach((row) => {
    const name = text(row.teamName, row.team, row.team_name, row.name, row.TEAM_NAME);
    if (name) grouped[normalizeName(name)] = row;
  });
  if (Object.keys(grouped).length) {
    await writeHotCache(cacheKey, grouped, CACHE_TTL_SECONDS);
    return grouped;
  }
  return null;
}

async function playerRows() {
  const cached = await readHotCache<Row[]>(PLAYER_CACHE_KEY);
  if (cached) return cached;
  const rows = await fetchRows(firstEnv("NBA_PLAYER_ANALYTICS_URL", "PLAYER_ANALYTICS_URL", "SIM_PLAYER_STATS_URL"));
  if (rows?.length) {
    await writeHotCache(PLAYER_CACHE_KEY, rows, CACHE_TTL_SECONDS);
    return rows;
  }
  return null;
}

function diff(home: number, away: number, scale = 1) {
  return Number(((home - away) * scale).toFixed(2));
}

function addFactor(factors: NbaIntelFactor[], label: string, value: number, weight: number, source: NbaIntelFactor["source"]) {
  factors.push({ label, value: Number(value.toFixed(2)), weight, source });
}

export async function compareNbaIntelligence(awayTeam: string, homeTeam: string): Promise<NbaIntel> {
  const [teamRows, players, ratingRows, historyRows] = await Promise.all([
    groupedRows(TEAM_CACHE_KEY, firstEnv("NBA_TEAM_ANALYTICS_URL", "TEAM_ANALYTICS_URL", "SIM_TEAM_STATS_URL")),
    playerRows(),
    groupedRows(RATING_CACHE_KEY, firstEnv("NBA_GAME_RATINGS_URL", "GAME_RATINGS_URL", "VIDEO_GAME_RATINGS_URL")),
    groupedRows(HISTORY_CACHE_KEY, firstEnv("NBA_RECENT_FORM_URL", "NBA_MATCHUP_HISTORY_URL", "SIM_RECENT_FORM_URL"))
  ]);

  const awayKey = normalizeName(awayTeam);
  const homeKey = normalizeName(homeTeam);
  const awayTeamProfile = teamFromRow(teamRows?.[awayKey] ?? {}, awayTeam);
  const homeTeamProfile = teamFromRow(teamRows?.[homeKey] ?? {}, homeTeam);
  const awayPlayerProfile = playerSummaryFromRows(players, awayTeam);
  const homePlayerProfile = playerSummaryFromRows(players, homeTeam);
  const awayRating = ratingFromRow(ratingRows?.[awayKey], awayTeam);
  const homeRating = ratingFromRow(ratingRows?.[homeKey], homeTeam);
  const awayHistory = historyFromRow(historyRows?.[awayKey], awayTeam);
  const homeHistory = historyFromRow(historyRows?.[homeKey], homeTeam);

  const factors: NbaIntelFactor[] = [];
  const teamNet = diff(homeTeamProfile.netRating, awayTeamProfile.netRating, 0.42);
  const offense = diff(homeTeamProfile.offensiveRating, awayTeamProfile.offensiveRating, 0.24);
  const defense = diff(awayTeamProfile.defensiveRating, homeTeamProfile.defensiveRating, 0.24);
  const shotQuality = diff(
    homeTeamProfile.trueShooting * 0.5 + homeTeamProfile.effectiveFg * 0.32 + homeTeamProfile.threePointAccuracy * 0.18,
    awayTeamProfile.trueShooting * 0.5 + awayTeamProfile.effectiveFg * 0.32 + awayTeamProfile.threePointAccuracy * 0.18,
    0.18
  );
  const possession = diff(
    homeTeamProfile.offensiveReboundRate + homeTeamProfile.defensiveReboundRate * 0.35 - homeTeamProfile.turnoverRate * 1.4 + homeTeamProfile.freeThrowRate * 0.28,
    awayTeamProfile.offensiveReboundRate + awayTeamProfile.defensiveReboundRate * 0.35 - awayTeamProfile.turnoverRate * 1.4 + awayTeamProfile.freeThrowRate * 0.28,
    0.12
  );
  const pace = diff(homeTeamProfile.pace, awayTeamProfile.pace, 0.08);
  const playStyle = diff(homeTeamProfile.transition + homeTeamProfile.halfCourt, awayTeamProfile.transition + awayTeamProfile.halfCourt, 0.16);
  const recentTeamForm = diff(homeTeamProfile.recentForm, awayTeamProfile.recentForm, 0.18);
  const context = Number((homeTeamProfile.homeAdvantage + diff(homeTeamProfile.rest + homeTeamProfile.travel, awayTeamProfile.rest + awayTeamProfile.travel, 0.26)).toFixed(2));
  const playerImpact = diff(
    homePlayerProfile.starPower + homePlayerProfile.usageCreation + homePlayerProfile.onOffImpact + homePlayerProfile.spacing + homePlayerProfile.playmaking,
    awayPlayerProfile.starPower + awayPlayerProfile.usageCreation + awayPlayerProfile.onOffImpact + awayPlayerProfile.spacing + awayPlayerProfile.playmaking,
    0.2
  );
  const playerDefense = diff(
    homePlayerProfile.perimeterDefense + homePlayerProfile.rimProtection + homePlayerProfile.rebounding,
    awayPlayerProfile.perimeterDefense + awayPlayerProfile.rimProtection + awayPlayerProfile.rebounding,
    0.16
  );
  const health = diff(
    homePlayerProfile.availability - homePlayerProfile.fatigue - homeTeamProfile.injuryDrag,
    awayPlayerProfile.availability - awayPlayerProfile.fatigue - awayTeamProfile.injuryDrag,
    0.36
  );
  const depth = diff(homePlayerProfile.depthPower, awayPlayerProfile.depthPower, 0.24);
  const ratingOverall = diff(homeRating.overall, awayRating.overall, 0.06);
  const ratingShooting = diff(homeRating.shooting + homeRating.offense * 0.35, awayRating.shooting + awayRating.offense * 0.35, 0.035);
  const ratingDefense = diff(homeRating.defense + homeRating.rebounding * 0.24, awayRating.defense + awayRating.rebounding * 0.24, 0.035);
  const ratingDepth = diff(homeRating.depth + homeRating.health * 0.3, awayRating.depth + awayRating.health * 0.3, 0.03);
  const history = diff(homeHistory.headToHeadEdge, awayHistory.headToHeadEdge, 0.22);
  const recentOffense = diff(homeHistory.recentOffense, awayHistory.recentOffense, 0.2);
  const recentDefense = diff(homeHistory.recentDefense, awayHistory.recentDefense, 0.18);
  const recentShooting = diff(homeHistory.recentShooting, awayHistory.recentShooting, 0.18);
  const recentTurnovers = diff(awayHistory.recentTurnovers, homeHistory.recentTurnovers, 0.15);
  const recentRebounding = diff(homeHistory.recentRebounding, awayHistory.recentRebounding, 0.14);
  const starMatchup = diff(homeHistory.starMatchup, awayHistory.starMatchup, 0.2);
  const benchTrend = diff(homeHistory.benchTrend, awayHistory.benchTrend, 0.16);
  const restHistory = diff(homeHistory.restHistory, awayHistory.restHistory, 0.14);
  const clutchRecent = diff(homeHistory.clutchRecent, awayHistory.clutchRecent, 0.12);

  addFactor(factors, "Team net rating", teamNet, 0.16, "team");
  addFactor(factors, "Offensive efficiency", offense, 0.1, "team");
  addFactor(factors, "Defensive efficiency", defense, 0.1, "team");
  addFactor(factors, "Shot quality", shotQuality, 0.09, "advanced");
  addFactor(factors, "Possession battle", possession, 0.08, "advanced");
  addFactor(factors, "Pace/tempo", pace, 0.04, "advanced");
  addFactor(factors, "Style fit", playStyle, 0.05, "advanced");
  addFactor(factors, "Recent team form", recentTeamForm, 0.07, "history");
  addFactor(factors, "Venue/rest/context", context, 0.07, "context");
  addFactor(factors, "Star/player impact", playerImpact, 0.14, "player");
  addFactor(factors, "Defensive matchup", playerDefense, 0.07, "player");
  addFactor(factors, "Availability", health, 0.08, "player");
  addFactor(factors, "Depth/bench", depth, 0.05, "player");
  addFactor(factors, "Ratings overall", ratingOverall, 0.04, "rating");
  addFactor(factors, "Ratings shooting", ratingShooting, 0.03, "rating");
  addFactor(factors, "Ratings defense", ratingDefense, 0.03, "rating");
  addFactor(factors, "Ratings depth", ratingDepth, 0.02, "rating");
  addFactor(factors, "Head-to-head history", history, 0.035, "history");
  addFactor(factors, "Recent offense", recentOffense, 0.045, "history");
  addFactor(factors, "Recent defense", recentDefense, 0.04, "history");
  addFactor(factors, "Recent shooting", recentShooting, 0.035, "history");
  addFactor(factors, "Recent turnovers", recentTurnovers, 0.03, "history");
  addFactor(factors, "Recent rebounding", recentRebounding, 0.03, "history");
  addFactor(factors, "Star matchup", starMatchup, 0.04, "history");
  addFactor(factors, "Bench trend", benchTrend, 0.03, "history");
  addFactor(factors, "Rest history", restHistory, 0.025, "history");
  addFactor(factors, "Clutch recent", clutchRecent, 0.02, "history");

  const homeEdge = Number(factors.reduce((total, factor) => total + factor.value * (factor.weight ?? 1), 0).toFixed(2));
  const projectedTotal = Number(Math.max(184, Math.min(268,
    224 +
    ((homeTeamProfile.pace + awayTeamProfile.pace) / 2 - 100) * 2.7 +
    (homeTeamProfile.offensiveRating + awayTeamProfile.offensiveRating - 226) * 0.55 +
    (homeHistory.recentOffense + awayHistory.recentOffense) * 0.38 +
    (homeHistory.recentShooting + awayHistory.recentShooting) * 0.24 -
    (homeTeamProfile.injuryDrag + awayTeamProfile.injuryDrag) * 0.42
  )).toFixed(1));
  const volatilityIndex = Number(Math.max(0.76, Math.min(2.05,
    1 + Math.abs(homeEdge) / 24 + (homePlayerProfile.volatility + awayPlayerProfile.volatility) / 12 + Math.abs(health) / 20
  )).toFixed(2));
  const realModules = [teamRows, players, ratingRows, historyRows].filter(Boolean).length;
  const confidence = Number(Math.max(0.49, Math.min(0.86,
    0.56 + Math.abs(homeEdge) / 28 - (volatilityIndex - 1) * 0.055 + realModules * 0.018
  )).toFixed(3));

  return {
    modelVersion: "nba-intel-v1",
    dataSource: [
      teamRows ? "team:real" : "team:synthetic",
      players ? "player:real" : "player:synthetic",
      ratingRows ? "ratings:real" : "ratings:synthetic",
      historyRows ? "history:real" : "history:synthetic"
    ].join("+"),
    homeEdge,
    projectedTotal,
    volatilityIndex,
    confidence,
    modules: [
      { label: "Team efficiency", status: teamRows ? "real" : "synthetic", note: teamRows ? "External NBA team analytics feed applied." : "Synthetic team efficiency profile used until NBA team feed is configured." },
      { label: "Player impact", status: players ? "real" : "synthetic", note: players ? "External NBA player impact feed applied." : "Synthetic player impact profile used until NBA player feed is configured." },
      { label: "Ratings blend", status: ratingRows ? "real" : "synthetic", note: ratingRows ? "NBA ratings feed applied." : "Synthetic ratings blend used until NBA ratings feed is configured." },
      { label: "Recent/history", status: historyRows ? "real" : "synthetic", note: historyRows ? "Recent-form and matchup-history feed applied." : "Synthetic recent/history profile used until NBA history feed is configured." }
    ],
    ratingBlend: {
      teamPower: Number((teamNet + offense + defense).toFixed(2)),
      playerPower: Number((playerImpact + playerDefense + health + depth).toFixed(2)),
      advancedPower: Number((shotQuality + possession + pace + playStyle).toFixed(2)),
      gameRatingPower: Number((ratingOverall + ratingShooting + ratingDefense + ratingDepth).toFixed(2)),
      contextPower: context,
      historyPower: Number((history + recentOffense + recentDefense + recentShooting + recentTurnovers + recentRebounding + starMatchup + benchTrend + restHistory + clutchRecent).toFixed(2))
    },
    factors: factors.sort((left, right) => Math.abs(right.value * (right.weight ?? 1)) - Math.abs(left.value * (left.weight ?? 1)))
  };
}
