import type { Prisma } from "@prisma/client";

import {
  blendProbabilitySignal,
  log5FromScoring
} from "@/services/analytics/team-strength/matchup-probability";
import { mlbPregameEloAdjustment } from "@/services/analytics/team-strength/mlb-elo-adjustments";
import { buildMlbRetrosheetModelContext } from "@/services/data/retrosheet/mlb-retrosheet-context";
import { buildMlbSourceNativeContext, type MlbSourceNativeContext } from "@/services/modeling/mlb-source-native-context";
import {
  applyMlbSourceAwareResimulation,
  recalibrateMlbMarketOutputs
} from "@/services/modeling/mlb-source-aware-resimulation";
import {
  getCachedMlbBacktestWeights,
  type MlbModelWeights
} from "@/services/simulation/mlb-backtesting-engine";

type TeamRole = "HOME" | "AWAY";

type TeamStatRow = {
  statsJson: unknown;
  createdAt: Date;
};

type PitcherGameRow = {
  statsJson: unknown;
  starter: boolean;
  createdAt: Date;
};

type PitcherCandidate = {
  playerId: string;
  externalIds: Prisma.JsonValue;
  name: string;
  teamId: string;
  starterLikelihood: number;
  expectedOuts: number;
  inningsPerStart: number;
  strikeoutsPer9: number;
  walksPer9: number;
  runsAllowedPer9: number;
  whip: number;
  sampleSize: number;
};

type TeamRunContext = {
  teamId: string;
  role: TeamRole;
  teamName: string;
  abbreviation: string;
  offensePer9: number;
  offenseFactor: number;
  strikeoutSusceptibility: number;
  starter: PitcherCandidate | null;
  bullpenRunsAllowedPer9: number;
  bullpenStrikeoutsPer9: number;
  bullpenFactor: number;
  restFactor: number;
};

export type MlbSimulationInput = {
  home: {
    teamName: string;
    offenseFactor: number;
    homeFieldEdge: number;
    starter: {
      expectedOuts: number;
      runsAllowedPer9: number;
      strikeoutsPer9: number;
      whip: number;
    };
    bullpen: {
      runsAllowedPer9: number;
      strikeoutsPer9: number;
    };
  };
  away: {
    teamName: string;
    offenseFactor: number;
    homeFieldEdge: number;
    starter: {
      expectedOuts: number;
      runsAllowedPer9: number;
      strikeoutsPer9: number;
      whip: number;
    };
    bullpen: {
      runsAllowedPer9: number;
      strikeoutsPer9: number;
    };
  };
  venue: {
    name: string | null;
    parkFactor: number;
  };
  weather: {
    available: boolean;
    runFactor: number;
    note: string;
  };
  samples?: number;
  seed?: number;
};

export type MlbSimulationSummary = {
  projectedHomeRuns: number;
  projectedAwayRuns: number;
  projectedTotalRuns: number;
  projectedSpreadHome: number;
  winProbHome: number;
  winProbAway: number;
  firstFive: {
    projectedHomeRuns: number;
    projectedAwayRuns: number;
    projectedTotalRuns: number;
    winProbHome: number;
    winProbAway: number;
    totalStdDev: number;
    homeRunsStdDev: number;
    awayRunsStdDev: number;
  };
  distribution: {
    totalStdDev: number;
    homeRunsStdDev: number;
    awayRunsStdDev: number;
    extraInningsRate: number;
  };
  diagnostics: {
    homeStarterOuts: number;
    awayStarterOuts: number;
    venueFactor: number;
    weatherFactor: number;
    deterministicSeed: number;
    samples: number;
  };
};

export type MlbPlayerPropProjection = {
  modelKey: string;
  modelVersion: string;
  eventId: string;
  playerId: string;
  statKey: "player_pitcher_outs" | "player_pitcher_strikeouts";
  meanValue: number;
  medianValue: number;
  stdDev: number;
  metadata: Record<string, unknown>;
};

const MLB_BASELINE_RUNS_PER_TEAM = 4.35;
const MLB_BASELINE_WHIP = 1.3;
const MLB_BASELINE_K9 = 8.7;
const DEFAULT_SAMPLES = 3000;

const HITTER_PARK_FACTORS: Array<{ token: string; factor: number }> = [
  { token: "coors", factor: 1.18 },
  { token: "great american", factor: 1.1 },
  { token: "fenway", factor: 1.05 },
  { token: "yankee", factor: 1.04 },
  { token: "camden", factor: 1.03 },
  { token: "loan depot", factor: 0.94 },
  { token: "tropicana", factor: 0.95 },
  { token: "t-mobile park", factor: 0.96 },
  { token: "oracle park", factor: 0.94 },
  { token: "petco", factor: 0.95 },
  { token: "citi field", factor: 0.97 }
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function getNumber(stats: unknown, keys: string[]) {
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
      const cleaned = value.replace(/[^0-9.+-]/g, "").trim();
      if (!cleaned) continue;
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function parseBaseballInnings(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const whole = Math.trunc(value);
    const remainder = Math.round((value - whole) * 10);
    if (remainder === 1) return whole + 1 / 3;
    if (remainder === 2) return whole + 2 / 3;
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d+)(?:\.(\d))?$/);
    if (match) {
      const whole = Number(match[1]);
      const remainder = Number(match[2] ?? 0);
      if (remainder === 1) return whole + 1 / 3;
      if (remainder === 2) return whole + 2 / 3;
      return whole;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function weightedAverage(values: Array<number | null | undefined>, decay = 0.88) {
  let weighted = 0;
  let weightTotal = 0;
  values.forEach((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return;
    }
    const weight = decay ** index;
    weighted += value * weight;
    weightTotal += weight;
  });
  return weightTotal ? weighted / weightTotal : null;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let value = t;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function poissonSample(lambda: number, rng: () => number) {
  const safeLambda = Math.max(0.01, lambda);
  const limit = Math.exp(-safeLambda);
  let count = 0;
  let product = 1;
  do {
    count += 1;
    product *= rng();
  } while (product > limit);
  return count - 1;
}

function getParkFactor(venue: string | null | undefined) {
  const normalized = normalizeToken(venue);
  const match = HITTER_PARK_FACTORS.find((entry) => normalized.includes(entry.token));
  return match?.factor ?? 1;
}

function isPitcher(position: string | null | undefined) {
  const normalized = normalizeToken(position);
  return normalized.includes("p") || normalized.includes("pitch");
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildOffenseContext(stats: TeamStatRow[]) {
  const runs = stats.map((row) =>
    getNumber(row.statsJson, ["runs", "R", "runs_scored", "runsFor", "runs_per_game"])
  );
  const hits = stats.map((row) => getNumber(row.statsJson, ["hits", "H", "team_hits"]));
  const walks = stats.map((row) => getNumber(row.statsJson, ["walks", "BB", "base_on_balls"]));
  const homeRuns = stats.map((row) => getNumber(row.statsJson, ["homeRuns", "HR", "home_runs"]));
  const strikeouts = stats.map((row) => getNumber(row.statsJson, ["strikeouts", "SO", "K"]));
  const obp = stats.map((row) => getNumber(row.statsJson, ["obp", "onBasePercentage", "on_base_pct"]));
  const slugging = stats.map((row) => getNumber(row.statsJson, ["slg", "sluggingPercentage", "slugging_pct"]));

  const runsPerGame = weightedAverage(runs) ?? MLB_BASELINE_RUNS_PER_TEAM;
  const hitFactor = clamp((weightedAverage(hits) ?? 8) / 8.4, 0.88, 1.14);
  const walkFactor = clamp((weightedAverage(walks) ?? 3.1) / 3.1, 0.9, 1.12);
  const powerFactor = clamp((weightedAverage(homeRuns) ?? 1.1) / 1.1, 0.88, 1.16);
  const obpFactor = clamp((weightedAverage(obp) ?? 0.315) / 0.315, 0.9, 1.12);
  const slugFactor = clamp((weightedAverage(slugging) ?? 0.4) / 0.4, 0.88, 1.15);
  const weightedStrikeouts = weightedAverage(strikeouts) ?? 8.5;
  const strikeoutFactor = clamp(1 - ((weightedStrikeouts - 8.5) * 0.015), 0.92, 1.08);
  const strikeoutSusceptibility = clamp(weightedStrikeouts / 8.5, 0.88, 1.18);

  const offenseFactor = clamp(
    (runsPerGame / MLB_BASELINE_RUNS_PER_TEAM) * 0.5 +
      hitFactor * 0.12 +
      walkFactor * 0.08 +
      powerFactor * 0.12 +
      obpFactor * 0.1 +
      slugFactor * 0.1 +
      strikeoutFactor * 0.08,
    0.72,
    1.38
  );

  return {
    offensePer9: runsPerGame,
    offenseFactor,
    strikeoutSusceptibility
  };
}

function buildPitcherCandidate(player: {
  id: string;
  teamId: string;
  name: string;
  position: string;
  externalIds: Prisma.JsonValue;
  playerGameStats: PitcherGameRow[];
}): PitcherCandidate | null {
  if (!isPitcher(player.position) || player.playerGameStats.length === 0) {
    return null;
  }

  const inningsRows = player.playerGameStats.map((row) =>
    parseBaseballInnings(getNumber(row.statsJson, ["inningsPitched", "innings_pitched", "IP", "fullInningsPartInnings"]))
  );
  const strikeoutsRows = player.playerGameStats.map((row) =>
    getNumber(row.statsJson, ["strikeouts", "SO", "K"])
  );
  const walksRows = player.playerGameStats.map((row) =>
    getNumber(row.statsJson, ["walks", "BB", "baseOnBalls"])
  );
  const earnedRunsRows = player.playerGameStats.map((row) =>
    getNumber(row.statsJson, ["earnedRuns", "ER", "runsAllowed", "runs_allowed"])
  );
  const hitsAllowedRows = player.playerGameStats.map((row) =>
    getNumber(row.statsJson, ["hitsAllowed", "hits_allowed", "H"])
  );
  const pitchCountRows = player.playerGameStats.map((row) =>
    getNumber(row.statsJson, ["pitchCount", "PC", "pitchesThrown", "pitches"])
  );

  const innings = weightedAverage(inningsRows) ?? 0;
  if (innings <= 0.4) {
    return null;
  }

  const strikeouts = weightedAverage(strikeoutsRows) ?? 0;
  const walks = weightedAverage(walksRows) ?? 0;
  const earnedRuns = weightedAverage(earnedRunsRows) ?? 0;
  const hitsAllowed = weightedAverage(hitsAllowedRows) ?? 0;
  const pitchCount = weightedAverage(pitchCountRows) ?? innings * 15;
  const startedGames = player.playerGameStats.filter((row) => row.starter).length;
  const reliefGames = player.playerGameStats.length - startedGames;
  const strikeoutsPer9 = innings > 0 ? (strikeouts / innings) * 9 : MLB_BASELINE_K9;
  const walksPer9 = innings > 0 ? (walks / innings) * 9 : 3.2;
  const runsAllowedPer9 = innings > 0 ? (earnedRuns / innings) * 9 : MLB_BASELINE_RUNS_PER_TEAM;
  const whip = innings > 0 ? (hitsAllowed + walks) / innings : MLB_BASELINE_WHIP;
  const expectedOuts = clamp(Math.round((innings + Math.min(0.6, pitchCount / 120)) * 3), 6, 21);
  const starterLikelihood =
    startedGames * 3 +
    Math.min(12, innings * 1.5) +
    Math.min(6, pitchCount / 18) -
    Math.min(3, reliefGames * 0.25);

  return {
    playerId: player.id,
    externalIds: player.externalIds,
    name: player.name,
    teamId: player.teamId,
    starterLikelihood,
    expectedOuts,
    inningsPerStart: innings,
    strikeoutsPer9: clamp(strikeoutsPer9, 4.5, 14),
    walksPer9: clamp(walksPer9, 1.2, 6.5),
    runsAllowedPer9: clamp(runsAllowedPer9, 1.6, 8),
    whip: clamp(whip, 0.85, 2.1),
    sampleSize: player.playerGameStats.length
  };
}

function buildBullpenContext(candidates: PitcherCandidate[], starter: PitcherCandidate | null) {
  const bullpen = candidates.filter((candidate) => candidate.playerId !== starter?.playerId);
  const source = bullpen.length ? bullpen : starter ? [starter] : [];
  const runsAllowedPer9 =
    weightedAverage(source.map((candidate) => candidate.runsAllowedPer9), 0.94) ??
    MLB_BASELINE_RUNS_PER_TEAM;
  const strikeoutsPer9 =
    weightedAverage(source.map((candidate) => candidate.strikeoutsPer9), 0.94) ?? MLB_BASELINE_K9;

  const bullpenFactor = clamp(
    (runsAllowedPer9 / MLB_BASELINE_RUNS_PER_TEAM) * 0.8 +
      (MLB_BASELINE_K9 / Math.max(5, strikeoutsPer9)) * 0.2,
    0.75,
    1.28
  );

  return {
    runsAllowedPer9: clamp(runsAllowedPer9, 2.4, 7.2),
    strikeoutsPer9: clamp(strikeoutsPer9, 6.2, 12.5),
    bullpenFactor
  };
}

function getRestFactor(context: {
  daysRest: number | null;
  gamesLast7: number | null;
  isBackToBack: boolean | null;
  scheduleDensityScore: number | null;
}) {
  const daysRest = context.daysRest ?? 1;
  const density = context.scheduleDensityScore ?? 0;
  let factor = 1;
  if (daysRest >= 2) factor += 0.01;
  if (context.isBackToBack) factor -= 0.012;
  if ((context.gamesLast7 ?? 0) >= 7) factor -= 0.01;
  factor -= clamp(density, 0, 1.5) * 0.01;
  return clamp(factor, 0.96, 1.03);
}

function applyRetrosheetProbabilityPriors(args: {
  baseHomeProbability: number;
  projectedTotalRuns: number;
  homeContext: Awaited<ReturnType<typeof buildMlbRetrosheetModelContext>>;
  awayContext: Awaited<ReturnType<typeof buildMlbRetrosheetModelContext>>;
}) {
  let winProbHome = args.baseHomeProbability;
  const drivers: string[] = [];
  const teamStrengthPriors: Record<string, unknown> = {
    retrosheet: args.homeContext.requiresRetrosheetAttribution || args.awayContext.requiresRetrosheetAttribution
      ? {
          home: args.homeContext.metadata,
          away: args.awayContext.metadata
        }
      : null,
    log5: null,
    mlbElo: null
  };

  if (args.homeContext.teamStrengthContext && args.awayContext.teamStrengthContext) {
    const log5 = log5FromScoring({
      teamAScored: args.homeContext.teamStrengthContext.scored,
      teamAAllowed: args.homeContext.teamStrengthContext.allowed,
      teamBScored: args.awayContext.teamStrengthContext.scored,
      teamBAllowed: args.awayContext.teamStrengthContext.allowed
    });
    const blended = blendProbabilitySignal({
      baseProbability: winProbHome,
      signalProbability: log5.teamAProbability,
      weight: 0.1,
      maxWeight: 0.25
    });
    winProbHome = blended.adjustedProbability;
    const pointDelta = (blended.adjustedProbability - args.baseHomeProbability) * args.projectedTotalRuns;
    teamStrengthPriors.log5 = {
      homeProbability: log5.teamAProbability,
      homeExpectedWinPct: log5.teamAExpectedWinPct,
      awayExpectedWinPct: log5.teamBExpectedWinPct,
      weight: blended.weight,
      pointDelta
    };
    drivers.push(
      `Log5 Pythagenpat prior ${(log5.teamAProbability * 100).toFixed(1)}% home (${(blended.weight * 100).toFixed(1)}% blend, ${pointDelta >= 0 ? "+" : ""}${pointDelta.toFixed(2)} runs)`
    );
  }

  const homeElo = args.homeContext.mlbPregameEloContext;
  const awayElo = args.awayContext.mlbPregameEloContext;
  if (homeElo?.rating != null && awayElo?.rating != null) {
    const homeAdjustment = mlbPregameEloAdjustment({ ...homeElo, isHome: true });
    const awayAdjustment = mlbPregameEloAdjustment({ ...awayElo, isHome: false });
    const adjustedHome = homeElo.rating + homeAdjustment.totalAdjustment;
    const adjustedAway = awayElo.rating + awayAdjustment.totalAdjustment;
    const eloProbability = 1 / (1 + 10 ** ((adjustedAway - adjustedHome) / 400));
    const blended = blendProbabilitySignal({
      baseProbability: winProbHome,
      signalProbability: eloProbability,
      weight: 0.06,
      maxWeight: 0.15
    });
    const pointDelta = (blended.adjustedProbability - winProbHome) * args.projectedTotalRuns;
    winProbHome = blended.adjustedProbability;
    teamStrengthPriors.mlbElo = {
      homeAdjustment,
      awayAdjustment,
      homeRating: homeElo.rating,
      awayRating: awayElo.rating,
      adjustedHomeRating: adjustedHome,
      adjustedAwayRating: adjustedAway,
      homeProbability: eloProbability,
      weight: blended.weight,
      inputsUsed: {
        ratings: true,
        homePitcher: homeElo.pitcherRollingGameScore != null && homeElo.teamRollingGameScore != null,
        awayPitcher: awayElo.pitcherRollingGameScore != null && awayElo.teamRollingGameScore != null,
        homeRest: homeElo.restDays != null,
        awayRest: awayElo.restDays != null,
        homeTravel: homeElo.milesTraveled != null,
        awayTravel: awayElo.milesTraveled != null
      }
    };
    drivers.push(
      `MLB Elo context prior ${(eloProbability * 100).toFixed(1)}% home (${(blended.weight * 100).toFixed(1)}% blend, ${pointDelta >= 0 ? "+" : ""}${pointDelta.toFixed(2)} runs)`
    );
  }

  return {
    winProbHome: round(winProbHome, 4),
    winProbAway: round(1 - winProbHome, 4),
    drivers,
    teamStrengthPriors,
    requiresRetrosheetAttribution:
      args.homeContext.requiresRetrosheetAttribution || args.awayContext.requiresRetrosheetAttribution
  };
}

function buildBacktestEdgeAdjustments(args: {
  home: TeamRunContext;
  away: TeamRunContext;
  sourceNativeContext: MlbSourceNativeContext;
  parkFactor: number;
  weatherRunFactor: number;
  homeStarterRunsAllowedPer9: number;
  awayStarterRunsAllowedPer9: number;
  homeBullpenRunsAllowedPer9: number;
  awayBullpenRunsAllowedPer9: number;
  weights: MlbModelWeights;
}) {
  const teamEdge = args.home.offenseFactor - args.away.offenseFactor;
  const playerEdge = (args.sourceNativeContext.home.lineupStrength - args.sourceNativeContext.away.lineupStrength) / 100;
  const statcastEdge = (args.sourceNativeContext.home.lineupPowerScore - args.sourceNativeContext.away.lineupPowerScore) / 100;
  const weatherEdge = args.weatherRunFactor - 1;
  const pitcherEdge = (args.awayStarterRunsAllowedPer9 - args.homeStarterRunsAllowedPer9) / 6;
  const bullpenEdge = (args.awayBullpenRunsAllowedPer9 - args.homeBullpenRunsAllowedPer9) / 6;
  const lockEdge = (args.sourceNativeContext.home.starterConfidence - args.sourceNativeContext.away.starterConfidence) / 100;
  const parkEdge = args.parkFactor - 1;
  const formEdge = args.home.restFactor - args.away.restFactor;

  const totalWeatherEdge = weatherEdge;
  const totalStatcastEdge =
    (args.sourceNativeContext.home.lineupPowerScore + args.sourceNativeContext.away.lineupPowerScore - 100) / 100;
  const totalPitchingEdge =
    ((args.homeStarterRunsAllowedPer9 + args.awayStarterRunsAllowedPer9) / 2 - 4.35) / 4.35;
  const totalParkEdge = parkEdge;
  const totalBullpenEdge =
    ((args.homeBullpenRunsAllowedPer9 + args.awayBullpenRunsAllowedPer9) / 2 - 4.35) / 4.35;

  const weightedHomeEdge = clamp(
    teamEdge * args.weights.side.team +
      playerEdge * args.weights.side.player +
      statcastEdge * args.weights.side.statcast +
      weatherEdge * args.weights.side.weather +
      pitcherEdge * args.weights.side.pitcher +
      bullpenEdge * args.weights.side.bullpen +
      lockEdge * args.weights.side.lock +
      parkEdge * args.weights.side.park +
      formEdge * args.weights.side.form,
    -1.25,
    1.25
  );

  const weightedTotalEdge = clamp(
    totalWeatherEdge * args.weights.total.weather +
      totalStatcastEdge * args.weights.total.statcast +
      totalPitchingEdge * args.weights.total.pitching +
      totalParkEdge * args.weights.total.park +
      totalBullpenEdge * args.weights.total.bullpen,
    -1.25,
    1.25
  );

  return {
    weightedHomeEdge,
    weightedTotalEdge,
    raw: {
      teamEdge: round(teamEdge, 4),
      playerEdge: round(playerEdge, 4),
      statcastEdge: round(statcastEdge, 4),
      weatherEdge: round(weatherEdge, 4),
      pitcherEdge: round(pitcherEdge, 4),
      bullpenEdge: round(bullpenEdge, 4),
      lockEdge: round(lockEdge, 4),
      parkEdge: round(parkEdge, 4),
      formEdge: round(formEdge, 4),
      totalWeatherEdge: round(totalWeatherEdge, 4),
      totalStatcastEdge: round(totalStatcastEdge, 4),
      totalPitchingEdge: round(totalPitchingEdge, 4),
      totalParkEdge: round(totalParkEdge, 4),
      totalBullpenEdge: round(totalBullpenEdge, 4)
    }
  };
}

function buildHalfInningRate(args: {
  offenseFactor: number;
  homeFieldEdge: number;
  parkFactor: number;
  weatherFactor: number;
  opposingRunsAllowedPer9: number;
  opposingStrikeoutsPer9: number;
  opposingWhip: number;
  inning: number;
  starterExpectedOuts: number;
}) {
  const starterStillIn = (args.inning - 1) * 3 < args.starterExpectedOuts;
  const timesThroughOrderPenalty = starterStillIn
    ? clamp(1 + Math.max(0, args.inning - 2) * 0.035, 1, 1.12)
    : 1.04;
  const pitchingFactor = clamp(
    (args.opposingRunsAllowedPer9 / MLB_BASELINE_RUNS_PER_TEAM) * 0.72 +
      (args.opposingWhip / MLB_BASELINE_WHIP) * 0.18 +
      (MLB_BASELINE_K9 / Math.max(5, args.opposingStrikeoutsPer9)) * 0.1,
    0.7,
    1.34
  );

  const expectedRunsPer9 =
    MLB_BASELINE_RUNS_PER_TEAM *
    args.offenseFactor *
    args.homeFieldEdge *
    args.parkFactor *
    args.weatherFactor *
    pitchingFactor *
    timesThroughOrderPenalty;

  return clamp(expectedRunsPer9 / 9, 0.12, 1.2);
}

export function simulateMlbGame(input: MlbSimulationInput): MlbSimulationSummary {
  const samples = Math.max(500, Math.trunc(input.samples ?? DEFAULT_SAMPLES));
  const seed = input.seed ?? hashSeed(`${input.home.teamName}:${input.away.teamName}:${input.venue.name ?? "neutral"}`);
  const rng = mulberry32(seed);
  const homeRuns: number[] = [];
  const awayRuns: number[] = [];
  const totals: number[] = [];
  const firstFiveHome: number[] = [];
  const firstFiveAway: number[] = [];
  const firstFiveTotals: number[] = [];
  let homeWins = 0;
  let awayWins = 0;
  let firstFiveHomeWins = 0;
  let firstFiveAwayWins = 0;
  let extras = 0;

  for (let sample = 0; sample < samples; sample += 1) {
    let home = 0;
    let away = 0;
    let homeF5 = 0;
    let awayF5 = 0;

    for (let inning = 1; inning <= 9; inning += 1) {
      const awayRate = buildHalfInningRate({
        offenseFactor: input.away.offenseFactor,
        homeFieldEdge: input.away.homeFieldEdge,
        parkFactor: input.venue.parkFactor,
        weatherFactor: input.weather.runFactor,
        opposingRunsAllowedPer9:
          (inning - 1) * 3 < input.home.starter.expectedOuts
            ? input.home.starter.runsAllowedPer9
            : input.home.bullpen.runsAllowedPer9,
        opposingStrikeoutsPer9:
          (inning - 1) * 3 < input.home.starter.expectedOuts
            ? input.home.starter.strikeoutsPer9
            : input.home.bullpen.strikeoutsPer9,
        opposingWhip:
          (inning - 1) * 3 < input.home.starter.expectedOuts
            ? input.home.starter.whip
            : 1.36,
        inning,
        starterExpectedOuts: input.home.starter.expectedOuts
      });
      away += poissonSample(awayRate, rng);
      if (inning <= 5) awayF5 = away;

      if (!(inning === 9 && home > away)) {
        const homeRate = buildHalfInningRate({
          offenseFactor: input.home.offenseFactor,
          homeFieldEdge: input.home.homeFieldEdge,
          parkFactor: input.venue.parkFactor,
          weatherFactor: input.weather.runFactor,
          opposingRunsAllowedPer9:
            (inning - 1) * 3 < input.away.starter.expectedOuts
              ? input.away.starter.runsAllowedPer9
              : input.away.bullpen.runsAllowedPer9,
          opposingStrikeoutsPer9:
            (inning - 1) * 3 < input.away.starter.expectedOuts
              ? input.away.starter.strikeoutsPer9
              : input.away.bullpen.strikeoutsPer9,
          opposingWhip:
            (inning - 1) * 3 < input.away.starter.expectedOuts
              ? input.away.starter.whip
              : 1.36,
          inning,
          starterExpectedOuts: input.away.starter.expectedOuts
        });
        let homeHalfRuns = poissonSample(homeRate, rng);
        if (inning === 9 && home <= away && home + homeHalfRuns > away) {
          homeHalfRuns = away - home + 1;
        }
        home += homeHalfRuns;
      }
      if (inning <= 5) homeF5 = home;
    }

    if (home === away) {
      extras += 1;
      const homeExtraProb = clamp(
        0.54 + (input.home.bullpen.strikeoutsPer9 - input.away.bullpen.strikeoutsPer9) * 0.01,
        0.42,
        0.66
      );
      if (rng() < homeExtraProb) {
        home += 1;
      } else {
        away += 1;
      }
    }

    if (home > away) homeWins += 1;
    else awayWins += 1;

    if (homeF5 > awayF5) firstFiveHomeWins += 1;
    else if (awayF5 > homeF5) firstFiveAwayWins += 1;

    homeRuns.push(home);
    awayRuns.push(away);
    totals.push(home + away);
    firstFiveHome.push(homeF5);
    firstFiveAway.push(awayF5);
    firstFiveTotals.push(homeF5 + awayF5);
  }

  const projectedHomeRuns = average(homeRuns);
  const projectedAwayRuns = average(awayRuns);
  const projectedTotalRuns = average(totals);
  const projectedHomeF5 = average(firstFiveHome);
  const projectedAwayF5 = average(firstFiveAway);
  const projectedTotalF5 = average(firstFiveTotals);

  return {
    projectedHomeRuns: round(projectedHomeRuns, 3),
    projectedAwayRuns: round(projectedAwayRuns, 3),
    projectedTotalRuns: round(projectedTotalRuns, 3),
    projectedSpreadHome: round(projectedHomeRuns - projectedAwayRuns, 3),
    winProbHome: round(homeWins / samples, 4),
    winProbAway: round(awayWins / samples, 4),
    firstFive: {
      projectedHomeRuns: round(projectedHomeF5, 3),
      projectedAwayRuns: round(projectedAwayF5, 3),
      projectedTotalRuns: round(projectedTotalF5, 3),
      winProbHome: round(firstFiveHomeWins / samples, 4),
      winProbAway: round(firstFiveAwayWins / samples, 4),
      totalStdDev: round(standardDeviation(firstFiveTotals), 3),
      homeRunsStdDev: round(standardDeviation(firstFiveHome), 3),
      awayRunsStdDev: round(standardDeviation(firstFiveAway), 3)
    },
    distribution: {
      totalStdDev: round(standardDeviation(totals), 3),
      homeRunsStdDev: round(standardDeviation(homeRuns), 3),
      awayRunsStdDev: round(standardDeviation(awayRuns), 3),
      extraInningsRate: round(extras / samples, 4)
    },
    diagnostics: {
      homeStarterOuts: input.home.starter.expectedOuts,
      awayStarterOuts: input.away.starter.expectedOuts,
      venueFactor: round(input.venue.parkFactor, 3),
      weatherFactor: round(input.weather.runFactor, 3),
      deterministicSeed: seed,
      samples
    }
  };
}

async function resolveMlbEventContext(eventId: string) {
  const { prisma } = await import("@/lib/db/prisma");
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
                    take: 18
                  }
                }
              }
            }
          }
        }
      },
      participantContexts: true
    }
  });

  if (!event) {
    throw new Error("Event not found for MLB simulation build.");
  }
  if (event.league.key !== "MLB") {
    return null;
  }

  const homeParticipant =
    event.participants.find((participant) => participant.role === "HOME") ?? event.participants[1] ?? null;
  const awayParticipant =
    event.participants.find((participant) => participant.role === "AWAY") ?? event.participants[0] ?? null;

  const homeTeam = homeParticipant?.competitor.team ?? null;
  const awayTeam = awayParticipant?.competitor.team ?? null;
  if (!homeTeam || !awayTeam) {
    return null;
  }

  const teamIds = [homeTeam.id, awayTeam.id];
  const pitchers = await prisma.player.findMany({
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

  return {
    event,
    homeTeam,
    awayTeam,
    pitchers
  };
}

function buildTeamRunContext(args: {
  role: TeamRole;
  team: {
    id: string;
    name: string;
    abbreviation: string;
    teamGameStats: TeamStatRow[];
  };
  allPitchers: Array<{
    id: string;
    teamId: string;
    name: string;
    position: string;
    externalIds: Prisma.JsonValue;
    playerGameStats: PitcherGameRow[];
  }>;
  participantContext: {
    daysRest: number | null;
    gamesLast7: number | null;
    isBackToBack: boolean | null;
    scheduleDensityScore: number | null;
  } | null;
}) {
  const offense = buildOffenseContext(args.team.teamGameStats);
  const candidates = args.allPitchers
    .filter((pitcher) => pitcher.teamId === args.team.id)
    .map(buildPitcherCandidate)
    .filter((candidate): candidate is PitcherCandidate => Boolean(candidate))
    .sort((left, right) => right.starterLikelihood - left.starterLikelihood);
  const starter = candidates[0] ?? null;
  const bullpen = buildBullpenContext(candidates, starter);
  const restFactor = getRestFactor({
    daysRest: args.participantContext?.daysRest ?? null,
    gamesLast7: args.participantContext?.gamesLast7 ?? null,
    isBackToBack: args.participantContext?.isBackToBack ?? null,
    scheduleDensityScore: args.participantContext?.scheduleDensityScore ?? null
  });

  return {
    teamId: args.team.id,
    role: args.role,
    teamName: args.team.name,
    abbreviation: args.team.abbreviation,
    offensePer9: offense.offensePer9,
    offenseFactor: clamp(offense.offenseFactor * restFactor, 0.72, 1.4),
    strikeoutSusceptibility: offense.strikeoutSusceptibility,
    starter,
    bullpenRunsAllowedPer9: bullpen.runsAllowedPer9,
    bullpenStrikeoutsPer9: bullpen.strikeoutsPer9,
    bullpenFactor: bullpen.bullpenFactor,
    restFactor
  } satisfies TeamRunContext;
}

export async function buildMlbPlayerPropProjections(eventId: string): Promise<MlbPlayerPropProjection[]> {
  const resolved = await resolveMlbEventContext(eventId);
  if (!resolved) {
    return [];
  }

  const homeContextRow =
    resolved.event.participantContexts.find((context) => context.role === "HOME") ?? null;
  const awayContextRow =
    resolved.event.participantContexts.find((context) => context.role === "AWAY") ?? null;

  const home = buildTeamRunContext({
    role: "HOME",
    team: resolved.homeTeam,
    allPitchers: resolved.pitchers,
    participantContext: homeContextRow
  });
  const away = buildTeamRunContext({
    role: "AWAY",
    team: resolved.awayTeam,
    allPitchers: resolved.pitchers,
    participantContext: awayContextRow
  });

  const sourceNativeContext = buildMlbSourceNativeContext({
    event: {
      name: resolved.event.name,
      startTime: resolved.event.startTime,
      venue: resolved.event.venue ?? null
    },
    homeTeam: resolved.homeTeam,
    awayTeam: resolved.awayTeam,
    allPlayers: resolved.pitchers,
    homeStarter: home.starter
      ? {
          playerId: home.starter.playerId,
          name: home.starter.name,
          sampleSize: home.starter.sampleSize,
          expectedOuts: home.starter.expectedOuts
        }
      : null,
    awayStarter: away.starter
      ? {
          playerId: away.starter.playerId,
          name: away.starter.name,
          sampleSize: away.starter.sampleSize,
          expectedOuts: away.starter.expectedOuts
        }
      : null,
    parkFactor: getParkFactor(resolved.event.venue ?? null)
  });

  const projections: MlbPlayerPropProjection[] = [];
  for (const [pitchingTeam, opposingTeam, pitchingSource, opposingSource] of [
    [home, away, sourceNativeContext.home, sourceNativeContext.away],
    [away, home, sourceNativeContext.away, sourceNativeContext.home]
  ] as Array<[TeamRunContext, TeamRunContext, typeof sourceNativeContext.home, typeof sourceNativeContext.away]>) {
    if (!pitchingTeam.starter) {
      continue;
    }

    const lineupPressureFactor = clamp(
      1 +
        ((opposingSource.lineupStrength - 50) * -0.0024) +
        ((pitchingSource.starterConfidence - 50) * 0.0016) +
        ((pitchingSource.bullpenFreshness - 50) * 0.0006),
      0.9,
      1.1
    );
    const contactAdjustment = clamp(
      1 + ((50 - opposingSource.lineupContactScore) * 0.0038),
      0.9,
      1.1
    );

    const outsMean = clamp(
      pitchingTeam.starter.expectedOuts *
        clamp(1.02 - (opposingTeam.offenseFactor - 1) * 0.18, 0.88, 1.08) *
        lineupPressureFactor,
      9,
      24
    );
    const inningsMean = outsMean / 3;
    const strikeoutsMean = clamp(
      inningsMean *
        (pitchingTeam.starter.strikeoutsPer9 / 9) *
        opposingTeam.strikeoutSusceptibility *
        contactAdjustment,
      1.8,
      12.5
    );
    const outsStdDev = clamp(2.1 + (1 - Math.min(1, pitchingTeam.starter.sampleSize / 8)) * 0.8, 1.7, 3.4);
    const strikeoutsStdDev = clamp(Math.sqrt(strikeoutsMean) * 0.92, 1.15, 3.8);

    projections.push({
      modelKey: "mlb-game-state-sim",
      modelVersion: "v2-source-native",
      eventId: resolved.event.id,
      playerId: pitchingTeam.starter.playerId,
      statKey: "player_pitcher_outs",
      meanValue: round(outsMean, 3),
      medianValue: round(outsMean, 3),
      stdDev: round(outsStdDev, 3),
      metadata: {
        engine: "mlb-game-state-sim",
        starterName: pitchingTeam.starter.name,
        opponentTeamId: opposingTeam.teamId,
        opponentTeamName: opposingTeam.teamName,
        sampleSize: pitchingTeam.starter.sampleSize,
        sourceCoverageScore: sourceNativeContext.sourceCoverageScore,
        opponentLineupStrength: opposingSource.lineupStrength,
        opponentLineupContactScore: opposingSource.lineupContactScore,
        bullpenFreshness: pitchingSource.bullpenFreshness,
        venueBaselineRunFactor: sourceNativeContext.venue.baselineRunFactor
      }
    });
    projections.push({
      modelKey: "mlb-game-state-sim",
      modelVersion: "v2-source-native",
      eventId: resolved.event.id,
      playerId: pitchingTeam.starter.playerId,
      statKey: "player_pitcher_strikeouts",
      meanValue: round(strikeoutsMean, 3),
      medianValue: round(strikeoutsMean, 3),
      stdDev: round(strikeoutsStdDev, 3),
      metadata: {
        engine: "mlb-game-state-sim",
        starterName: pitchingTeam.starter.name,
        opponentTeamId: opposingTeam.teamId,
        opponentTeamName: opposingTeam.teamName,
        strikeoutSusceptibility: round(opposingTeam.strikeoutSusceptibility, 3),
        projectedOuts: round(outsMean, 3),
        sampleSize: pitchingTeam.starter.sampleSize,
        sourceCoverageScore: sourceNativeContext.sourceCoverageScore,
        opponentLineupStrength: opposingSource.lineupStrength,
        opponentLineupContactScore: opposingSource.lineupContactScore,
        venueBaselineRunFactor: sourceNativeContext.venue.baselineRunFactor
      }
    });
  }

  return projections;
}

export async function buildMlbEventProjection(eventId: string) {
  const resolved = await resolveMlbEventContext(eventId);
  if (!resolved) {
    return null;
  }

  const homeContextRow =
    resolved.event.participantContexts.find((context) => context.role === "HOME") ?? null;
  const awayContextRow =
    resolved.event.participantContexts.find((context) => context.role === "AWAY") ?? null;

  const home = buildTeamRunContext({
    role: "HOME",
    team: resolved.homeTeam,
    allPitchers: resolved.pitchers,
    participantContext: homeContextRow
  });
  const away = buildTeamRunContext({
    role: "AWAY",
    team: resolved.awayTeam,
    allPitchers: resolved.pitchers,
    participantContext: awayContextRow
  });
  const [homeRetrosheetContext, awayRetrosheetContext] = await Promise.all([
    buildMlbRetrosheetModelContext({
      teamExternalIds: resolved.homeTeam.externalIds,
      eventStartTime: resolved.event.startTime,
      isHome: true,
      restDays: homeContextRow?.daysRest ?? null,
      milesTraveled: null,
      probableStarterExternalIds: home.starter?.externalIds ?? null
    }),
    buildMlbRetrosheetModelContext({
      teamExternalIds: resolved.awayTeam.externalIds,
      eventStartTime: resolved.event.startTime,
      isHome: false,
      restDays: awayContextRow?.daysRest ?? null,
      milesTraveled: null,
      probableStarterExternalIds: away.starter?.externalIds ?? null
    })
  ]);

  const venue = resolved.event.venue ?? null;
  const parkFactor = getParkFactor(venue);
  const sourceNativeContext = buildMlbSourceNativeContext({
    event: {
      name: resolved.event.name,
      startTime: resolved.event.startTime,
      venue
    },
    homeTeam: resolved.homeTeam,
    awayTeam: resolved.awayTeam,
    allPlayers: resolved.pitchers,
    homeStarter: home.starter
      ? {
          playerId: home.starter.playerId,
          name: home.starter.name,
          sampleSize: home.starter.sampleSize,
          expectedOuts: home.starter.expectedOuts
        }
      : null,
    awayStarter: away.starter
      ? {
          playerId: away.starter.playerId,
          name: away.starter.name,
          sampleSize: away.starter.sampleSize,
          expectedOuts: away.starter.expectedOuts
        }
      : null,
    parkFactor
  });

  const isOutdoor = sourceNativeContext.venue.weatherExposure !== "INDOOR";
  const weather = {
    // "available" = outdoor venue with a run factor; does NOT mean live game-day forecast is joined
    available: isOutdoor,
    liveWeatherJoined: false, // set to true once game-day station/forecast ingestion is wired
    runFactor: sourceNativeContext.venue.baselineRunFactor,
    note:
      !isOutdoor
        ? "Indoor or protected venue context keeps weather mostly muted."
        : `Venue baseline only — no live game-day weather joined. Run factor ${sourceNativeContext.venue.baselineRunFactor.toFixed(3)} at ${sourceNativeContext.venue.venueName ?? venue ?? "venue"}.`
  };

  const backtestWeights = await getCachedMlbBacktestWeights();
  const backtestEdges = buildBacktestEdgeAdjustments({
    home,
    away,
    sourceNativeContext,
    parkFactor,
    weatherRunFactor: weather.runFactor,
    homeStarterRunsAllowedPer9: home.starter?.runsAllowedPer9 ?? 4.35,
    awayStarterRunsAllowedPer9: away.starter?.runsAllowedPer9 ?? 4.35,
    homeBullpenRunsAllowedPer9: home.bullpenRunsAllowedPer9,
    awayBullpenRunsAllowedPer9: away.bullpenRunsAllowedPer9,
    weights: backtestWeights
  });

  const homeBacktestFactor = clamp(1 + backtestEdges.weightedHomeEdge * 0.06, 0.9, 1.1);
  const awayBacktestFactor = clamp(1 - backtestEdges.weightedHomeEdge * 0.06, 0.9, 1.1);
  const totalBacktestFactor = clamp(1 + backtestEdges.weightedTotalEdge * 0.05, 0.9, 1.1);

  const baseInput: MlbSimulationInput = {
    home: {
      teamName: home.teamName,
      offenseFactor: clamp(
        home.offenseFactor *
          (1 + (sourceNativeContext.home.lineupStrength - 50) * 0.0025) *
          (1 + (sourceNativeContext.away.bullpenFreshness < 45 ? 0.015 : 0)) *
          homeBacktestFactor,
        0.72,
        1.45
      ),
      homeFieldEdge: 1.035,
      starter: {
        expectedOuts: home.starter?.expectedOuts ?? 15,
        runsAllowedPer9: home.starter?.runsAllowedPer9 ?? 4.35,
        strikeoutsPer9: home.starter?.strikeoutsPer9 ?? MLB_BASELINE_K9,
        whip: home.starter?.whip ?? MLB_BASELINE_WHIP
      },
      bullpen: {
        runsAllowedPer9: home.bullpenRunsAllowedPer9,
        strikeoutsPer9: home.bullpenStrikeoutsPer9
      }
    },
    away: {
      teamName: away.teamName,
      offenseFactor: clamp(
        away.offenseFactor *
          (1 + (sourceNativeContext.away.lineupStrength - 50) * 0.0025) *
          (1 + (sourceNativeContext.home.bullpenFreshness < 45 ? 0.015 : 0)) *
          awayBacktestFactor,
        0.72,
        1.45
      ),
      homeFieldEdge: 0.97,
      starter: {
        expectedOuts: away.starter?.expectedOuts ?? 15,
        runsAllowedPer9: away.starter?.runsAllowedPer9 ?? 4.35,
        strikeoutsPer9: away.starter?.strikeoutsPer9 ?? MLB_BASELINE_K9,
        whip: away.starter?.whip ?? MLB_BASELINE_WHIP
      },
      bullpen: {
        runsAllowedPer9: away.bullpenRunsAllowedPer9,
        strikeoutsPer9: away.bullpenStrikeoutsPer9
      }
    },
    venue: {
      name: venue,
      parkFactor
    },
    weather,
    seed: hashSeed(`${resolved.event.id}:${resolved.event.startTime.toISOString()}:${venue ?? "neutral"}`)
  };

  baseInput.weather.runFactor = clamp(baseInput.weather.runFactor * totalBacktestFactor, 0.9, 1.15);

  const resimInput = applyMlbSourceAwareResimulation(baseInput, sourceNativeContext);
  const rawSimulation = simulateMlbGame(resimInput);
  const simulation = recalibrateMlbMarketOutputs(rawSimulation, sourceNativeContext);
  const retrosheetPriors = applyRetrosheetProbabilityPriors({
    baseHomeProbability: simulation.winProbHome,
    projectedTotalRuns: simulation.projectedTotalRuns,
    homeContext: homeRetrosheetContext,
    awayContext: awayRetrosheetContext
  });

  return {
    modelKey: "mlb-game-state-sim",
    modelVersion: "v3-source-aware-resim",
    eventId: resolved.event.id,
    projectedHomeScore: simulation.projectedHomeRuns,
    projectedAwayScore: simulation.projectedAwayRuns,
    projectedTotal: simulation.projectedTotalRuns,
    projectedSpreadHome: simulation.projectedSpreadHome,
    winProbHome: retrosheetPriors.winProbHome,
    winProbAway: retrosheetPriors.winProbAway,
    metadata: {
      sport: resolved.event.league.sport,
      league: resolved.event.league.key,
      engine: "mlb-game-state-sim",
      engineVersion: "v3-source-aware-resim",
      venue,
      runEnvironment: {
        parkFactor: round(parkFactor, 3),
        weatherAvailable: weather.available,
        weatherRunFactor: weather.runFactor,
        weatherNote: weather.note
      },
      homeTeam: {
        id: home.teamId,
        name: home.teamName,
        abbreviation: home.abbreviation,
        offensePer9: round(home.offensePer9, 3),
        offenseFactor: round(home.offenseFactor, 3),
        restFactor: round(home.restFactor, 3),
        starter: home.starter
          ? {
              playerId: home.starter.playerId,
              name: home.starter.name,
              expectedOuts: home.starter.expectedOuts,
              inningsPerStart: round(home.starter.inningsPerStart, 3),
              runsAllowedPer9: round(home.starter.runsAllowedPer9, 3),
              strikeoutsPer9: round(home.starter.strikeoutsPer9, 3),
              whip: round(home.starter.whip, 3),
              sampleSize: home.starter.sampleSize
            }
          : null,
        bullpen: {
          runsAllowedPer9: round(home.bullpenRunsAllowedPer9, 3),
          strikeoutsPer9: round(home.bullpenStrikeoutsPer9, 3),
          factor: round(home.bullpenFactor, 3)
        }
      },
      awayTeam: {
        id: away.teamId,
        name: away.teamName,
        abbreviation: away.abbreviation,
        offensePer9: round(away.offensePer9, 3),
        offenseFactor: round(away.offenseFactor, 3),
        restFactor: round(away.restFactor, 3),
        starter: away.starter
          ? {
              playerId: away.starter.playerId,
              name: away.starter.name,
              expectedOuts: away.starter.expectedOuts,
              inningsPerStart: round(away.starter.inningsPerStart, 3),
              runsAllowedPer9: round(away.starter.runsAllowedPer9, 3),
              strikeoutsPer9: round(away.starter.strikeoutsPer9, 3),
              whip: round(away.starter.whip, 3),
              sampleSize: away.starter.sampleSize
            }
          : null,
        bullpen: {
          runsAllowedPer9: round(away.bullpenRunsAllowedPer9, 3),
          strikeoutsPer9: round(away.bullpenStrikeoutsPer9, 3),
          factor: round(away.bullpenFactor, 3)
        }
      },
      mlbSourceNativeContext: sourceNativeContext,
      drivers: retrosheetPriors.drivers,
      teamStrengthPriors: retrosheetPriors.teamStrengthPriors,
      requiresRetrosheetAttribution: retrosheetPriors.requiresRetrosheetAttribution,
      reSimulation: {
        lineupAware: true,
        // Starter is selected by historical usage pattern (startedGames + innings), NOT confirmed MLB probable pitcher API.
        // Set probablePitcherAware: true only when real probable pitcher ingestion is wired in.
        starterUsageInferred: true,
        probablePitcherAware: false,
        bullpenAvailabilityAware: true,
        inputSeed: resimInput.seed ?? null
      },
      fullGame: {
        projectedHomeRuns: simulation.projectedHomeRuns,
        projectedAwayRuns: simulation.projectedAwayRuns,
        projectedTotalRuns: simulation.projectedTotalRuns,
        projectedSpreadHome: simulation.projectedSpreadHome,
        winProbHome: retrosheetPriors.winProbHome,
        winProbAway: retrosheetPriors.winProbAway,
        rawWinProbHome: simulation.winProbHome,
        rawWinProbAway: simulation.winProbAway,
        totalStdDev: simulation.distribution.totalStdDev,
        homeRunsStdDev: simulation.distribution.homeRunsStdDev,
        awayRunsStdDev: simulation.distribution.awayRunsStdDev,
        extraInningsRate: simulation.distribution.extraInningsRate
      },
      firstFive: simulation.firstFive,
      diagnostics: simulation.diagnostics
      ,
      backtest: {
        weights: backtestWeights,
        weightedHomeEdge: round(backtestEdges.weightedHomeEdge, 4),
        weightedTotalEdge: round(backtestEdges.weightedTotalEdge, 4),
        rawEdges: backtestEdges.raw
      }
    }
  };
}
