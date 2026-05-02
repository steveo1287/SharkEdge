import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { NbaPlayerProfile, NbaTeamPlayerProfileSummary } from "@/services/simulation/nba-player-profiles";
import { compareNbaProfilesReal } from "@/services/simulation/nba-team-analytics";
import { getNbaDecisionContext } from "@/services/simulation/nba-decision-context";
import { getNbaSynergyContext } from "@/services/simulation/nba-synergy-context";
import { getSimRunDepth } from "@/services/simulation/sim-run-depth";

type TeamSide = "home" | "away";
type PropStatKey = "points" | "rebounds" | "assists" | "threes";

type PropMarketLine = {
  playerName: string;
  stat: PropStatKey;
  line: number;
  oddsOver: number | null;
  oddsUnder: number | null;
  source: string;
};

type PropHitProbability = {
  line: number;
  overProbability: number;
  underProbability: number;
  oddsOver: number | null;
  oddsUnder: number | null;
  edgeToLine: number;
  recommendedSide: "OVER" | "UNDER" | "PASS";
  source: string;
};

type MatchupHistory = {
  playerName: string;
  opponentTeam: string;
  sampleSize: number;
  pointsAvg: number;
  reboundsAvg: number;
  assistsAvg: number;
  threesAvg: number;
  paceMultiplier: number;
  defensePressureAdjustment: number;
  source: string;
};

type CoachStyle = {
  teamName: string;
  tempoControl: number;
  aggression: number;
  rotationTightness: number;
  adaptability: number;
  source: string;
};

type PlayerRating = {
  playerName: string;
  overall: number;
  offense: number;
  defense: number;
  playmaking: number;
  source: string;
};

type PlayerContext = {
  player: NbaPlayerProfile;
  teamSummary: NbaTeamPlayerProfileSummary;
  opponentSummary: NbaTeamPlayerProfileSummary;
  teamSide: TeamSide;
  projectedTotal: number;
  volatilityIndex: number;
  modelConfidence: number;
  teamDefenseRating: number;
  opponentDefenseRating: number;
  paceAverage: number;
  decisionPaceBias: number;
  synergyPaceBias: number;
  opponentPointOfAttackEdge: number;
  opponentSwitchabilityEdge: number;
  opponentRimDeterrenceEdge: number;
  teammateUsageSupport: number;
  coach: CoachStyle | null;
  matchupHistory: MatchupHistory | null;
  rating: PlayerRating | null;
  seedKey: string;
  marketLines: Partial<Record<PropStatKey, PropMarketLine>> | undefined;
};

export type NbaPlayerStatProjection = {
  playerName: string;
  teamName: string;
  teamSide: TeamSide;
  status: string;
  projectedMinutes: number;
  projectedPoints: number;
  projectedRebounds: number;
  projectedAssists: number;
  projectedThrees: number;
  floor: {
    points: number;
    rebounds: number;
    assists: number;
    threes: number;
  };
  median: {
    points: number;
    rebounds: number;
    assists: number;
    threes: number;
  };
  ceiling: {
    points: number;
    rebounds: number;
    assists: number;
    threes: number;
  };
  confidence: number;
  simulationRuns: number;
  propHitProbabilities: Partial<Record<PropStatKey, PropHitProbability>>;
  whyLikely: string[];
  whyNotLikely: string[];
  source: string;
};

type SimInput = {
  homeSummary: NbaTeamPlayerProfileSummary;
  awaySummary: NbaTeamPlayerProfileSummary;
  projectedTotal: number;
  volatilityIndex: number;
  confidence: number;
  seedKey: string;
  simulationRuns?: number;
};

const DEFAULT_RUNS = 10_000;
const PROP_CACHE_KEY = "nba:player-prop-lines:v1";
const PROP_CACHE_TTL_SECONDS = 60 * 3;
const HISTORY_CACHE_KEY = "nba:player-matchup-history:v1";
const HISTORY_CACHE_TTL_SECONDS = 60 * 15;
const COACH_CACHE_KEY = "nba:coach-style:v1";
const COACH_CACHE_TTL_SECONDS = 60 * 20;
const RATING_CACHE_KEY = "nba:player-ratings:v1";
const RATING_CACHE_TTL_SECONDS = 60 * 60;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
  return sorted[index] ?? 0;
}

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function toPropStatKey(value: unknown): PropStatKey | null {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("point")) return "points";
  if (text.includes("rebound")) return "rebounds";
  if (text.includes("assist")) return "assists";
  if (text.includes("three") || text.includes("3pm") || text.includes("fg3")) return "threes";
  return null;
}

function rowsFromBody(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const keys = ["rows", "data", "props", "lines", "playerProps", "history", "players", "teams"];
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as Record<string, unknown>[];
    }
  }
  return [];
}

function normalizeLineRow(row: Record<string, unknown>): PropMarketLine | null {
  const playerName = String(row.playerName ?? row.player ?? row.name ?? row.athlete ?? "").trim();
  if (!playerName) return null;
  const stat = toPropStatKey(row.stat ?? row.statKey ?? row.market ?? row.marketType ?? row.propType);
  if (!stat) return null;
  const line = toNumber(row.line ?? row.marketLine ?? row.pointsLine ?? row.propLine);
  if (line == null) return null;
  return {
    playerName,
    stat,
    line,
    oddsOver: toNumber(row.oddsOver ?? row.overOdds ?? row.priceOver),
    oddsUnder: toNumber(row.oddsUnder ?? row.underOdds ?? row.priceUnder),
    source: String(row.source ?? "external_prop_feed")
  };
}

function normalizeHistoryRow(row: Record<string, unknown>): MatchupHistory | null {
  const playerName = String(row.playerName ?? row.player ?? row.name ?? "").trim();
  const opponentTeam = String(row.opponentTeam ?? row.opponent ?? row.vsTeam ?? "").trim();
  if (!playerName || !opponentTeam) return null;
  return {
    playerName,
    opponentTeam,
    sampleSize: Math.max(0, Math.round(toNumber(row.sampleSize ?? row.games ?? row.matchups) ?? 0)),
    pointsAvg: toNumber(row.pointsAvg ?? row.avgPoints ?? row.points) ?? 0,
    reboundsAvg: toNumber(row.reboundsAvg ?? row.avgRebounds ?? row.rebounds) ?? 0,
    assistsAvg: toNumber(row.assistsAvg ?? row.avgAssists ?? row.assists) ?? 0,
    threesAvg: toNumber(row.threesAvg ?? row.avgThrees ?? row.threes) ?? 0,
    paceMultiplier: clamp(toNumber(row.paceMultiplier ?? row.tempoMultiplier) ?? 1, 0.84, 1.2),
    defensePressureAdjustment: clamp(toNumber(row.defensePressureAdjustment ?? row.guardPressure ?? row.onBallDefense) ?? 0, -0.35, 0.4),
    source: String(row.source ?? "matchup_history_feed")
  };
}

function normalizeCoachRow(row: Record<string, unknown>): CoachStyle | null {
  const teamName = String(row.teamName ?? row.team ?? row.name ?? "").trim();
  if (!teamName) return null;
  return {
    teamName,
    tempoControl: clamp(toNumber(row.tempoControl ?? row.tempo ?? row.paceControl) ?? 50, 15, 95),
    aggression: clamp(toNumber(row.aggression ?? row.offenseAggression ?? row.styleAggression) ?? 50, 15, 95),
    rotationTightness: clamp(toNumber(row.rotationTightness ?? row.rotation ?? row.rotationDiscipline) ?? 50, 15, 95),
    adaptability: clamp(toNumber(row.adaptability ?? row.adjustments ?? row.inGameAdjustments) ?? 50, 15, 95),
    source: String(row.source ?? "coach_style_feed")
  };
}

function normalizeRatingRow(row: Record<string, unknown>): PlayerRating | null {
  const playerName = String(row.playerName ?? row.player ?? row.name ?? "").trim();
  if (!playerName) return null;
  return {
    playerName,
    overall: clamp(toNumber(row.overall ?? row.ovr ?? row.rating ?? row.nba2kOverall) ?? 75, 55, 99),
    offense: clamp(toNumber(row.offense ?? row.offensiveRating ?? row.nba2kOffense) ?? 75, 55, 99),
    defense: clamp(toNumber(row.defense ?? row.defensiveRating ?? row.nba2kDefense) ?? 75, 55, 99),
    playmaking: clamp(toNumber(row.playmaking ?? row.passing ?? row.nba2kPlaymaking) ?? 75, 50, 99),
    source: String(row.source ?? "nba2k_rating_feed")
  };
}

async function fetchRows(url: string | null) {
  if (!url) return [] as Record<string, unknown>[];
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return [];
    return rowsFromBody(await response.json());
  } catch {
    return [];
  }
}

async function getPropLinesByPlayer() {
  const cached = await readHotCache<Record<string, Partial<Record<PropStatKey, PropMarketLine>>>>(PROP_CACHE_KEY);
  if (cached) return cached;
  const url = firstEnv("NBA_PLAYER_PROP_LINES_URL", "PLAYER_PROP_LINES_URL");
  const rows = await fetchRows(url);
  const map: Record<string, Partial<Record<PropStatKey, PropMarketLine>>> = {};
  rows.forEach((row) => {
    const normalized = normalizeLineRow(row);
    if (!normalized) return;
    const key = normalizeName(normalized.playerName);
    map[key] = { ...(map[key] ?? {}), [normalized.stat]: normalized };
  });
  if (Object.keys(map).length) {
    await writeHotCache(PROP_CACHE_KEY, map, PROP_CACHE_TTL_SECONDS);
    return map;
  }
  return null;
}

async function getMatchupHistoryByPlayerOpponent() {
  const cached = await readHotCache<Record<string, MatchupHistory>>(HISTORY_CACHE_KEY);
  if (cached) return cached;
  const url = firstEnv("NBA_PLAYER_MATCHUP_HISTORY_URL", "NBA_MATCHUP_HISTORY_PLAYER_URL");
  const rows = await fetchRows(url);
  const map: Record<string, MatchupHistory> = {};
  rows.forEach((row) => {
    const normalized = normalizeHistoryRow(row);
    if (!normalized) return;
    const key = `${normalizeName(normalized.playerName)}:${normalizeName(normalized.opponentTeam)}`;
    map[key] = normalized;
  });
  if (Object.keys(map).length) {
    await writeHotCache(HISTORY_CACHE_KEY, map, HISTORY_CACHE_TTL_SECONDS);
    return map;
  }
  return null;
}

async function getCoachStyleByTeam() {
  const cached = await readHotCache<Record<string, CoachStyle>>(COACH_CACHE_KEY);
  if (cached) return cached;
  const url = firstEnv("NBA_COACH_STYLE_CONTEXT_URL", "COACH_STYLE_CONTEXT_URL");
  const rows = await fetchRows(url);
  const map: Record<string, CoachStyle> = {};
  rows.forEach((row) => {
    const normalized = normalizeCoachRow(row);
    if (!normalized) return;
    map[normalizeName(normalized.teamName)] = normalized;
  });
  if (Object.keys(map).length) {
    await writeHotCache(COACH_CACHE_KEY, map, COACH_CACHE_TTL_SECONDS);
    return map;
  }
  return null;
}

async function getRatingsByPlayer() {
  const cached = await readHotCache<Record<string, PlayerRating>>(RATING_CACHE_KEY);
  if (cached) return cached;
  const url = firstEnv("NBA2K_PLAYER_RATINGS_URL", "NBA_PLAYER_RATINGS_URL", "PLAYER_RATINGS_URL");
  const rows = await fetchRows(url);
  const map: Record<string, PlayerRating> = {};
  rows.forEach((row) => {
    const normalized = normalizeRatingRow(row);
    if (!normalized) return;
    map[normalizeName(normalized.playerName)] = normalized;
  });
  if (Object.keys(map).length) {
    await writeHotCache(RATING_CACHE_KEY, map, RATING_CACHE_TTL_SECONDS);
    return map;
  }
  return null;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return function next() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSample(next: () => number) {
  const u1 = Math.max(1e-9, next());
  const u2 = Math.max(1e-9, next());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function statusPenalty(status: string) {
  const value = status.toLowerCase();
  if (value === "out") return 0.72;
  if (value === "doubtful") return 0.48;
  if (value === "questionable") return 0.22;
  if (value === "unknown") return 0.12;
  return 0;
}

function roleBoost(role: NbaPlayerProfile["role"]) {
  switch (role) {
    case "star": return 1.2;
    case "starter": return 1.05;
    case "rotation": return 0.9;
    case "bench": return 0.8;
    default: return 0.75;
  }
}

function confidenceForPlayer(context: PlayerContext) {
  const ratingBoost = context.rating ? (context.rating.overall - 75) / 250 : 0;
  const historyBoost = context.matchupHistory ? Math.min(0.06, context.matchupHistory.sampleSize / 200) : 0;
  return clamp(
    context.modelConfidence +
    context.player.projectedMinutes / 170 +
    context.player.usageRate / 320 +
    ratingBoost +
    historyBoost -
    context.player.fatigueRisk * 0.16 -
    statusPenalty(context.player.status) -
    (context.volatilityIndex - 1) * 0.09,
    0.3,
    0.93
  );
}

function probabilityOver(values: number[], line: number) {
  if (!values.length) return 0.5;
  const hits = values.filter((value) => value > line).length;
  return hits / values.length;
}

function buildPropProb(
  stat: PropStatKey,
  outcomes: number[],
  projectedValue: number,
  marketLines: Partial<Record<PropStatKey, PropMarketLine>> | undefined
): PropHitProbability | undefined {
  const market = marketLines?.[stat];
  if (!market) return undefined;
  const overProbability = clamp(probabilityOver(outcomes, market.line), 0.001, 0.999);
  const underProbability = clamp(1 - overProbability, 0.001, 0.999);
  const diff = Math.abs(overProbability - 0.5);
  const recommendedSide = diff < 0.04 ? "PASS" : overProbability > 0.5 ? "OVER" : "UNDER";
  return {
    line: market.line,
    overProbability: round(overProbability, 3),
    underProbability: round(underProbability, 3),
    oddsOver: market.oddsOver,
    oddsUnder: market.oddsUnder,
    edgeToLine: round(projectedValue - market.line, 2),
    recommendedSide,
    source: market.source
  };
}

function playerReasons(context: PlayerContext) {
  const likely: string[] = [];
  const unlikely: string[] = [];
  if (context.player.projectedMinutes >= 33) likely.push("Projected heavy minutes create stable opportunity.");
  if (context.player.usageRate >= 27) likely.push("High usage profile supports touch volume.");
  if (context.paceAverage >= 100) likely.push("Tempo profile implies extra possessions.");
  if (context.rating && context.rating.overall >= 86) likely.push(`NBA2K prior (${context.rating.overall}) supports top-tier role stability.`);
  if (context.matchupHistory && context.matchupHistory.sampleSize >= 4) likely.push("Vs-opponent history has a usable sample.");
  if ((context.coach?.aggression ?? 50) >= 58) likely.push("Coach aggression profile supports offensive volume.");
  if (context.opponentDefenseRating <= 111.5) likely.push("Opponent defense rating is attackable.");
  if (context.player.status !== "available") unlikely.push(`Availability risk is flagged (${context.player.status}).`);
  if (context.player.fatigueRisk >= 0.55) unlikely.push("Fatigue profile is elevated.");
  if (context.opponentDefenseRating >= 115) unlikely.push("Opponent defense rating is strong.");
  if (context.opponentPointOfAttackEdge <= -0.7) unlikely.push("On-ball defense matchup is difficult.");
  if (context.opponentRimDeterrenceEdge <= -0.8) unlikely.push("Rim deterrence suppresses interior scoring.");
  if ((context.coach?.rotationTightness ?? 50) <= 42) unlikely.push("Rotation instability can compress minutes.");
  return { likely: likely.slice(0, 4), unlikely: unlikely.slice(0, 4) };
}

function simulatePlayer(context: PlayerContext, runs = DEFAULT_RUNS): NbaPlayerStatProjection {
  const rng = mulberry32(hashString(`${context.seedKey}:${context.teamSide}:${context.player.teamName}:${context.player.playerName}`));
  const roleFactor = roleBoost(context.player.role);
  const ratingSkill = context.rating ? clamp((context.rating.offense - 70) / 35, 0.55, 1.15) : 0.88;
  const ratingPlaymaking = context.rating ? clamp((context.rating.playmaking - 70) / 35, 0.5, 1.2) : 0.82;
  const ratingDefensePenalty = context.rating ? clamp((context.rating.defense - 75) / 80, -0.08, 0.2) : 0;
  const historyWeight = context.matchupHistory ? clamp(context.matchupHistory.sampleSize / 12, 0.08, 0.32) : 0;
  const historyPoints = context.matchupHistory?.pointsAvg ?? 0;
  const historyRebounds = context.matchupHistory?.reboundsAvg ?? 0;
  const historyAssists = context.matchupHistory?.assistsAvg ?? 0;
  const historyThrees = context.matchupHistory?.threesAvg ?? 0;
  const coachAggression = clamp((context.coach?.aggression ?? 50) / 50, 0.7, 1.35);
  const coachTempo = clamp((context.coach?.tempoControl ?? 50) / 50, 0.7, 1.25);
  const coachRotation = clamp((context.coach?.rotationTightness ?? 50) / 50, 0.65, 1.3);
  const coachAdaptability = clamp((context.coach?.adaptability ?? 50) / 50, 0.7, 1.3);
  const matchupPace = context.matchupHistory?.paceMultiplier ?? 1;
  const decisionPace = clamp(1 + context.decisionPaceBias * 0.05, 0.85, 1.14);
  const synergyPace = clamp(1 + context.synergyPaceBias * 0.08, 0.85, 1.17);
  const paceFactor = clamp((context.paceAverage / 99) * matchupPace * decisionPace * synergyPace * (1 + (context.projectedTotal - 224) / 300), 0.78, 1.24);
  const defensePressureBase = clamp(
    ((context.opponentDefenseRating - 112) / 13) +
    (-context.opponentPointOfAttackEdge * 0.45) +
    (-context.opponentSwitchabilityEdge * 0.25) +
    (-context.opponentRimDeterrenceEdge * 0.28) +
    (context.matchupHistory?.defensePressureAdjustment ?? 0),
    -0.35,
    0.65
  );
  const teammateCreationBuffer = clamp(context.teammateUsageSupport / 18, -0.12, 0.2);

  const pointsOutcomes: number[] = [];
  const reboundsOutcomes: number[] = [];
  const assistsOutcomes: number[] = [];
  const threesOutcomes: number[] = [];
  const minuteOutcomes: number[] = [];

  for (let index = 0; index < runs; index += 1) {
    const minutesNoise = normalSample(rng) * (3.4 + context.player.fatigueRisk * 2.3 + (1 - coachRotation) * 1.5);
    const minutes = clamp(context.player.projectedMinutes * clamp(1 - statusPenalty(context.player.status), 0.42, 1) + minutesNoise, 6, 44);
    const possessionCount = Math.round(clamp((context.projectedTotal / 2.18) * paceFactor * coachTempo, 78, 128));
    const baseUsage = clamp(
      context.player.usageRate * roleFactor * coachAggression * coachAdaptability + normalSample(rng) * (2 + (context.volatilityIndex - 1) * 2.1),
      5,
      43
    );
    const minuteShare = clamp(minutes / 48, 0.12, 0.95);
    const touches = Math.round(clamp(possessionCount * (baseUsage / 100) * minuteShare * 1.04, 4, 65));
    const shotThreeBias = clamp(context.player.threePointGravity / 100 + teammateCreationBuffer * 0.15, 0.03, 0.75);
    const assistBias = clamp(context.player.assistRate / 100 * ratingPlaymaking * (1 + teammateCreationBuffer * 0.2), 0.02, 0.55);
    const reboundChance = clamp(context.player.reboundRate / 100 * (1 + Math.max(0, defensePressureBase) * 0.22), 0.03, 0.42);

    let points = 0;
    let rebounds = 0;
    let assists = 0;
    let threes = 0;
    let fatigueState = clamp(context.player.fatigueRisk * 0.7 + statusPenalty(context.player.status) * 0.35, 0, 0.9);

    // Possession-level simulation to approximate defender assignment, fatigue climb, and touch quality.
    for (let p = 0; p < possessionCount; p += 1) {
      const playProgress = p / Math.max(1, possessionCount);
      fatigueState = clamp(fatigueState + 0.0018 + playProgress * 0.0012, 0, 0.98);
      const involvementProb = clamp((touches / Math.max(1, possessionCount)) * (1 - fatigueState * 0.18), 0.02, 0.88);
      const involved = rng() < involvementProb;
      if (!involved) {
        const randomBoard = rng() < reboundChance * 0.26 * (1 - fatigueState * 0.1);
        if (randomBoard) rebounds += 1;
        continue;
      }

      const guardPressure = clamp(defensePressureBase + normalSample(rng) * 0.08 + fatigueState * 0.12 + ratingDefensePenalty, -0.45, 0.9);
      const assistEvent = rng() < assistBias * (1 - guardPressure * 0.18);
      if (assistEvent) {
        assists += rng() < clamp(0.5 + context.player.offensiveEpm * 0.03 + coachAdaptability * 0.06 - fatigueState * 0.15, 0.22, 0.86) ? 1 : 0;
      }

      const isThree = rng() < shotThreeBias;
      const shotQuality = clamp(
        ratingSkill * (isThree ? 0.95 : 1.02) +
        (context.player.trueShooting - 56) * 0.016 +
        context.player.rimPressure * 0.009 -
        guardPressure * 0.35 -
        fatigueState * 0.2 +
        teammateCreationBuffer +
        (context.matchupHistory ? context.matchupHistory.defensePressureAdjustment * -0.12 : 0),
        0.28,
        1.45
      );
      const makeProb = clamp(0.31 + shotQuality * 0.24, 0.12, 0.84);
      if (rng() < makeProb) {
        if (isThree) {
          points += 3;
          threes += 1;
        } else {
          points += 2;
        }
      } else if (rng() < clamp(0.09 + context.player.rimPressure * 0.006 + coachAggression * 0.03 - guardPressure * 0.02, 0.03, 0.3)) {
        points += rng() < 0.74 ? 2 : 1;
      }

      if (rng() < reboundChance * 0.16 * (1 - fatigueState * 0.08)) rebounds += 1;
    }

    const blend = (simulated: number, history: number) => historyWeight > 0 ? simulated * (1 - historyWeight) + history * historyWeight : simulated;
    const pointsFinal = clamp(blend(points, historyPoints), 0, 68);
    const reboundsFinal = clamp(blend(rebounds, historyRebounds), 0, 28);
    const assistsFinal = clamp(blend(assists, historyAssists), 0, 22);
    const threesFinal = clamp(blend(threes, historyThrees), 0, 13);

    minuteOutcomes.push(minutes);
    pointsOutcomes.push(pointsFinal);
    reboundsOutcomes.push(reboundsFinal);
    assistsOutcomes.push(assistsFinal);
    threesOutcomes.push(threesFinal);
  }

  const projectedPoints = quantile(pointsOutcomes, 0.5);
  const projectedRebounds = quantile(reboundsOutcomes, 0.5);
  const projectedAssists = quantile(assistsOutcomes, 0.5);
  const projectedThrees = quantile(threesOutcomes, 0.5);
  const reasons = playerReasons(context);

  return {
    playerName: context.player.playerName,
    teamName: context.player.teamName,
    teamSide: context.teamSide,
    status: context.player.status,
    projectedMinutes: round(quantile(minuteOutcomes, 0.5), 1),
    projectedPoints: round(projectedPoints, 1),
    projectedRebounds: round(projectedRebounds, 1),
    projectedAssists: round(projectedAssists, 1),
    projectedThrees: round(projectedThrees, 1),
    floor: {
      points: round(quantile(pointsOutcomes, 0.1), 1),
      rebounds: round(quantile(reboundsOutcomes, 0.1), 1),
      assists: round(quantile(assistsOutcomes, 0.1), 1),
      threes: round(quantile(threesOutcomes, 0.1), 1)
    },
    median: {
      points: round(quantile(pointsOutcomes, 0.5), 1),
      rebounds: round(quantile(reboundsOutcomes, 0.5), 1),
      assists: round(quantile(assistsOutcomes, 0.5), 1),
      threes: round(quantile(threesOutcomes, 0.5), 1)
    },
    ceiling: {
      points: round(quantile(pointsOutcomes, 0.9), 1),
      rebounds: round(quantile(reboundsOutcomes, 0.9), 1),
      assists: round(quantile(assistsOutcomes, 0.9), 1),
      threes: round(quantile(threesOutcomes, 0.9), 1)
    },
    confidence: round(confidenceForPlayer(context), 3),
    simulationRuns: runs,
    propHitProbabilities: {
      points: buildPropProb("points", pointsOutcomes, projectedPoints, context.marketLines),
      rebounds: buildPropProb("rebounds", reboundsOutcomes, projectedRebounds, context.marketLines),
      assists: buildPropProb("assists", assistsOutcomes, projectedAssists, context.marketLines),
      threes: buildPropProb("threes", threesOutcomes, projectedThrees, context.marketLines)
    },
    whyLikely: reasons.likely.length ? reasons.likely : ["Role, usage, and possession context support this median projection."],
    whyNotLikely: reasons.unlikely.length ? reasons.unlikely : ["No major downside flags from current context stack."],
    source: context.player.source
  };
}

function deriveCoachFallback(teamName: string, aggressionEdge: number, tempoEdge: number, rotationEdge: number): CoachStyle {
  return {
    teamName,
    tempoControl: clamp(50 + tempoEdge * 8, 18, 90),
    aggression: clamp(50 + aggressionEdge * 8, 18, 92),
    rotationTightness: clamp(52 + rotationEdge * 10, 18, 90),
    adaptability: clamp(50 + aggressionEdge * 4 + tempoEdge * 3, 18, 90),
    source: "derived_context"
  };
}

function playerSignalScore(player: NbaPlayerProfile) {
  return player.projectedMinutes * 0.75 + player.usageRate * 0.65 + player.offensiveEpm * 4 + player.assistRate * 0.15;
}

export async function simulateNbaPlayerGameProjections(input: SimInput): Promise<NbaPlayerStatProjection[]> {
  const [linesByPlayer, historyByPlayerOpponent, coachByTeam, ratingsByPlayer, teamComparison, decision, synergy] = await Promise.all([
    getPropLinesByPlayer(),
    getMatchupHistoryByPlayerOpponent(),
    getCoachStyleByTeam(),
    getRatingsByPlayer(),
    compareNbaProfilesReal(input.awaySummary.teamName, input.homeSummary.teamName),
    getNbaDecisionContext(input.awaySummary.teamName, input.homeSummary.teamName),
    getNbaSynergyContext(input.awaySummary.teamName, input.homeSummary.teamName)
  ]);

  const homeCoach =
    coachByTeam?.[normalizeName(input.homeSummary.teamName)] ??
    deriveCoachFallback(input.homeSummary.teamName, synergy.coachAdjustmentEdge + synergy.starCreationEdge * 0.25, decision.refereePaceBias + synergy.transitionEdge * 0.35, synergy.rotationStabilityEdge + synergy.lineupContinuityEdge * 0.4);
  const awayCoach =
    coachByTeam?.[normalizeName(input.awaySummary.teamName)] ??
    deriveCoachFallback(input.awaySummary.teamName, -synergy.coachAdjustmentEdge - synergy.starCreationEdge * 0.25, decision.refereePaceBias - synergy.transitionEdge * 0.35, -synergy.rotationStabilityEdge - synergy.lineupContinuityEdge * 0.4);

  const runs = input.simulationRuns ?? getSimRunDepth("detail");

  const homeCandidates = input.homeSummary.players
    .filter((player) => player.role !== "bench" || player.projectedMinutes >= 18)
    .sort((left, right) => playerSignalScore(right) - playerSignalScore(left))
    .slice(0, 7);
  const awayCandidates = input.awaySummary.players
    .filter((player) => player.role !== "bench" || player.projectedMinutes >= 18)
    .sort((left, right) => playerSignalScore(right) - playerSignalScore(left))
    .slice(0, 7);

  const homeTeammateUsageSupport = input.homeSummary.players.reduce((sum, player) => sum + player.usageRate, 0) / Math.max(1, input.homeSummary.players.length);
  const awayTeammateUsageSupport = input.awaySummary.players.reduce((sum, player) => sum + player.usageRate, 0) / Math.max(1, input.awaySummary.players.length);

  const homeSim = homeCandidates.map((player) => {
    const historyKey = `${normalizeName(player.playerName)}:${normalizeName(input.awaySummary.teamName)}`;
    return simulatePlayer({
      player,
      teamSummary: input.homeSummary,
      opponentSummary: input.awaySummary,
      teamSide: "home",
      projectedTotal: input.projectedTotal,
      volatilityIndex: input.volatilityIndex,
      modelConfidence: input.confidence,
      teamDefenseRating: teamComparison.home.defensiveRating,
      opponentDefenseRating: teamComparison.away.defensiveRating,
      paceAverage: teamComparison.paceAverage,
      decisionPaceBias: decision.refereePaceBias * 0.25 + decision.recentShotQualityEdge * 0.08,
      synergyPaceBias: synergy.transitionEdge * 0.22 + synergy.spotUpEdge * 0.12,
      opponentPointOfAttackEdge: -synergy.opponentPointOfAttackEdge,
      opponentSwitchabilityEdge: -synergy.opponentSwitchabilityEdge,
      opponentRimDeterrenceEdge: -synergy.opponentRimDeterrenceEdge,
      teammateUsageSupport: homeTeammateUsageSupport,
      coach: homeCoach,
      matchupHistory: historyByPlayerOpponent?.[historyKey] ?? null,
      rating: ratingsByPlayer?.[normalizeName(player.playerName)] ?? null,
      seedKey: input.seedKey,
      marketLines: linesByPlayer?.[normalizeName(player.playerName)]
    }, runs);
  });

  const awaySim = awayCandidates.map((player) => {
    const historyKey = `${normalizeName(player.playerName)}:${normalizeName(input.homeSummary.teamName)}`;
    return simulatePlayer({
      player,
      teamSummary: input.awaySummary,
      opponentSummary: input.homeSummary,
      teamSide: "away",
      projectedTotal: input.projectedTotal,
      volatilityIndex: input.volatilityIndex,
      modelConfidence: input.confidence,
      teamDefenseRating: teamComparison.away.defensiveRating,
      opponentDefenseRating: teamComparison.home.defensiveRating,
      paceAverage: teamComparison.paceAverage,
      decisionPaceBias: decision.refereePaceBias * 0.25 + decision.recentShotQualityEdge * 0.08,
      synergyPaceBias: -synergy.transitionEdge * 0.22 - synergy.spotUpEdge * 0.12,
      opponentPointOfAttackEdge: synergy.opponentPointOfAttackEdge,
      opponentSwitchabilityEdge: synergy.opponentSwitchabilityEdge,
      opponentRimDeterrenceEdge: synergy.opponentRimDeterrenceEdge,
      teammateUsageSupport: awayTeammateUsageSupport,
      coach: awayCoach,
      matchupHistory: historyByPlayerOpponent?.[historyKey] ?? null,
      rating: ratingsByPlayer?.[normalizeName(player.playerName)] ?? null,
      seedKey: input.seedKey,
      marketLines: linesByPlayer?.[normalizeName(player.playerName)]
    }, runs);
  });

  const sortScore = (row: NbaPlayerStatProjection) =>
    row.projectedPoints + row.projectedAssists * 1.05 + row.projectedRebounds * 0.8 + row.confidence * 5;
  return [...homeSim, ...awaySim].sort((left, right) => sortScore(right) - sortScore(left)).slice(0, 12);
}

