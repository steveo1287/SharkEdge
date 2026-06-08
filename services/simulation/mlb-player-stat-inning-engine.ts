import { deriveMlbBatterAdvancedMatchup, type MlbBatterAdvancedMatchup } from "@/services/simulation/mlb-batter-advanced-matchup";
import { deriveMlbBatterStatProfile, type MlbBatterStatProfile } from "@/services/simulation/mlb-batter-stat-profile";

export type MlbProjectionRating = {
  id: string;
  name: string;
  team?: string | null;
  role_tier?: string | null;
  contact?: number | null;
  power?: number | null;
  discipline?: number | null;
  vs_lhp?: number | null;
  vs_rhp?: number | null;
  baserunning?: number | null;
  fielding?: number | null;
  current_form?: number | null;
  xera_quality?: number | null;
  fip_quality?: number | null;
  k_bb?: number | null;
  hr_risk?: number | null;
  groundball_rate?: number | null;
  platoon_split?: number | null;
  stamina?: number | null;
  recent_workload?: number | null;
  arsenal_quality?: number | null;
  overall?: number | null;
  metrics_json?: Record<string, unknown> | null;
};

export type MlbProjectionLineup = {
  confirmed?: boolean | null;
  batting_order_json?: unknown;
  bench_json?: unknown;
  starting_pitcher_id?: string | null;
  starting_pitcher_name?: string | null;
  available_relievers_json?: unknown;
  unavailable_relievers_json?: unknown;
  injuries_json?: unknown;
  source?: string | null;
  captured_at?: Date | string | null;
};

export type MlbProjectionTeamContext = {
  team: string;
  lineup?: MlbProjectionLineup | null;
  hitters: MlbProjectionRating[];
  pitchers: MlbProjectionRating[];
};

export type MlbHitterPerGameProjection = {
  playerId: string;
  playerName: string;
  team: string;
  battingOrder: number;
  expectedPlateAppearances: number;
  hitProbability: number;
  expectedHits: number;
  expectedTotalBases: number;
  expectedHomeRuns: number;
  expectedRuns: number;
  expectedRbi: number;
  expectedWalks: number;
  expectedStrikeouts: number;
  stealAttemptProbability: number;
  stolenBaseProbability: number;
  confidence: number;
  batterStatProfile: MlbBatterStatProfile;
  advancedMatchup: MlbBatterAdvancedMatchup;
  reasons: string[];
};

export type MlbStarterPerGameProjection = {
  pitcherId: string;
  pitcherName: string;
  team: string;
  expectedInningsPitched: number;
  expectedOuts: number;
  expectedStrikeouts: number;
  expectedEarnedRuns: number;
  expectedHitsAllowed: number;
  expectedWalksAllowed: number;
  expectedHomeRunsAllowed: number;
  qualityStartProbability: number;
  over17_5OutsProbability: number;
  over4_5StrikeoutsProbability: number;
  firstFiveRunsAllowed: number;
  confidence: number;
  reasons: string[];
};

export type MlbPlayerStatProjectionGame = {
  modelVersion: "mlb-player-stat-projection-v1";
  awayTeam: string;
  homeTeam: string;
  awayHitters: MlbHitterPerGameProjection[];
  homeHitters: MlbHitterPerGameProjection[];
  awayStarter: MlbStarterPerGameProjection | null;
  homeStarter: MlbStarterPerGameProjection | null;
  warnings: string[];
};

export type MlbInningProjection = {
  inning: number;
  awayExpectedRuns: number;
  homeExpectedRuns: number;
  expectedRuns: number;
  noRunProbability: number;
};

export type MlbInningMarketProjection = {
  modelVersion: "mlb-inning-market-projection-v1";
  awayTeam: string;
  homeTeam: string;
  innings: MlbInningProjection[];
  nrfiProbability: number;
  yrfiProbability: number;
  firstFiveAwayRuns: number;
  firstFiveHomeRuns: number;
  firstFiveTotalRuns: number;
  firstFiveHomeWinProbability: number;
  firstFiveAwayWinProbability: number;
  firstFiveTieProbability: number;
  firstFiveOver4_5Probability: number;
  fullGameExpectedRuns: number;
  warnings: string[];
};

const DEFAULT_SKILL = 70;
const LINEUP_PA = [4.78, 4.68, 4.58, 4.5, 4.32, 4.16, 4.02, 3.88, 3.74];
const LINEUP_RUN_SHARE = [0.128, 0.122, 0.13, 0.134, 0.119, 0.105, 0.095, 0.086, 0.081];
const LINEUP_RBI_SHARE = [0.091, 0.101, 0.125, 0.145, 0.132, 0.116, 0.103, 0.095, 0.092];
const INNING_WEIGHTS = [0.122, 0.116, 0.114, 0.112, 0.109, 0.108, 0.107, 0.106, 0.106];
const STARTER_ROLES = new Set(["ACE", "TOP_ROTATION", "MID_ROTATION", "BACK_END", "OPENER_BULK"]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function safeNumber(value: unknown, fallback = DEFAULT_SKILL) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function metric(row: MlbProjectionRating | null | undefined, key: string, fallback: number) {
  const value = row?.metrics_json?.[key];
  return safeNumber(value, fallback);
}

function normalizeJsonArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  return [];
}

function playerKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function lineupPlayerId(entry: Record<string, unknown>) {
  return playerKey(entry.playerId ?? entry.player_id ?? entry.id ?? entry.mlbId ?? entry.mlb_id);
}

function lineupPlayerName(entry: Record<string, unknown>) {
  return playerKey(entry.playerName ?? entry.player_name ?? entry.name ?? entry.fullName ?? entry.full_name);
}

function findRatingForLineupEntry(entry: Record<string, unknown>, ratings: MlbProjectionRating[]) {
  const id = lineupPlayerId(entry);
  const name = lineupPlayerName(entry);
  return ratings.find((rating) => (id && playerKey(rating.id) === id) || (name && playerKey(rating.name) === name)) ?? null;
}

function pitcherThrows(row: MlbProjectionRating | null): "L" | "R" {
  const throwsValue = String(row?.metrics_json?.throws ?? row?.metrics_json?.handedness ?? "R").toUpperCase();
  return throwsValue.startsWith("L") ? "L" : "R";
}

function hitterSkill(row: MlbProjectionRating, pitcherHand: "L" | "R") {
  const split = pitcherHand === "L" ? safeNumber(row.vs_lhp) : safeNumber(row.vs_rhp);
  return clamp(
    safeNumber(row.contact) * 0.2 +
    safeNumber(row.power) * 0.22 +
    safeNumber(row.discipline) * 0.18 +
    split * 0.2 +
    safeNumber(row.current_form) * 0.12 +
    safeNumber(row.baserunning) * 0.05 +
    safeNumber(row.fielding) * 0.03,
    35,
    95
  );
}

function pitcherSkill(row: MlbProjectionRating | null) {
  if (!row) return DEFAULT_SKILL;
  return clamp(
    safeNumber(row.xera_quality) * 0.24 +
    safeNumber(row.fip_quality) * 0.2 +
    safeNumber(row.k_bb) * 0.16 +
    (100 - safeNumber(row.hr_risk, 30)) * 0.1 +
    safeNumber(row.groundball_rate) * 0.06 +
    safeNumber(row.platoon_split) * 0.08 +
    safeNumber(row.stamina) * 0.06 +
    (100 - safeNumber(row.recent_workload, 30)) * 0.04 +
    safeNumber(row.arsenal_quality) * 0.06,
    35,
    95
  );
}

function selectStarter(team: MlbProjectionTeamContext | null | undefined) {
  if (!team) return null;
  const starterId = playerKey(team.lineup?.starting_pitcher_id);
  const starterName = playerKey(team.lineup?.starting_pitcher_name);
  const explicit = team.pitchers.find((pitcher) =>
    (starterId && playerKey(pitcher.id) === starterId) || (starterName && playerKey(pitcher.name) === starterName)
  );
  if (explicit) return explicit;
  const starters = team.pitchers.filter((pitcher) => STARTER_ROLES.has(String(pitcher.role_tier ?? "")));
  return starters.sort((a, b) => safeNumber(b.overall) - safeNumber(a.overall))[0] ?? team.pitchers[0] ?? null;
}

function lineupHitters(team: MlbProjectionTeamContext, opponentStarter: MlbProjectionRating | null) {
  const order = normalizeJsonArray(team.lineup?.batting_order_json);
  const throws = pitcherThrows(opponentStarter);
  const selected = order.slice(0, 9).map((entry) => findRatingForLineupEntry(entry, team.hitters));
  if (selected.filter(Boolean).length >= 5) return selected.slice(0, 9);
  return team.hitters.slice().sort((a, b) => hitterSkill(b, throws) - hitterSkill(a, throws)).slice(0, 9);
}

function normalOver(mean: number, line: number, sd: number) {
  const z = (mean - line) / Math.max(0.001, sd);
  return clamp(1 / (1 + Math.exp(-1.7 * z)), 0.03, 0.97);
}

function projectHitter(args: {
  row: MlbProjectionRating;
  team: string;
  battingOrder: number;
  opponentStarter: MlbProjectionRating | null;
  teamRuns: number;
  confirmedLineup: boolean;
}): MlbHitterPerGameProjection {
  const orderIndex = clamp(args.battingOrder - 1, 0, 8);
  const pitcherHand = pitcherThrows(args.opponentStarter);
  const skill = hitterSkill(args.row, pitcherHand);
  const opponentPitch = pitcherSkill(args.opponentStarter);
  const runEnvironment = clamp(args.teamRuns / 4.45, 0.58, 1.65);
  const contact = safeNumber(args.row.contact);
  const power = safeNumber(args.row.power);
  const discipline = safeNumber(args.row.discipline);
  const baserunning = safeNumber(args.row.baserunning);
  const split = pitcherHand === "L" ? safeNumber(args.row.vs_lhp) : safeNumber(args.row.vs_rhp);
  const pitcherPressure = opponentPitch - DEFAULT_SKILL;
  const batterStats = deriveMlbBatterStatProfile(args.row, pitcherHand);
  const advancedMatchup = deriveMlbBatterAdvancedMatchup({
    batter: args.row,
    opponentStarter: args.opponentStarter,
    pitcherHand,
    battingOrder: args.battingOrder,
    teamRuns: args.teamRuns
  });
  const statWeight = clamp(batterStats.confidence, 0.22, 0.88);
  const pa = clamp((LINEUP_PA[orderIndex] ?? 4.0) * (0.92 + runEnvironment * 0.08) * advancedMatchup.paMultiplier, 2.5, 5.45);

  const skillHitRate = clamp(0.225 + (contact - 70) * 0.0018 + (split - 70) * 0.001 + (skill - 70) * 0.0008 - pitcherPressure * 0.0011, 0.13, 0.36);
  const skillWalkRate = clamp(0.083 + (discipline - 70) * 0.0011 - pitcherPressure * 0.0004, 0.035, 0.18);
  const skillStrikeoutRate = clamp(0.225 - (contact - 70) * 0.0017 + pitcherPressure * 0.0014, 0.09, 0.38);
  const skillHrRate = clamp(0.031 + (power - 70) * 0.00105 - pitcherPressure * 0.0005, 0.004, 0.095);
  const skillTbPerHit = clamp(1.52 + (power - 70) * 0.007, 1.08, 2.35);

  const baseHitRate = batterStats.hitRate * statWeight + skillHitRate * (1 - statWeight);
  const baseWalkRate = batterStats.walkRate * statWeight + skillWalkRate * (1 - statWeight);
  const baseStrikeoutRate = batterStats.strikeoutRate * statWeight + skillStrikeoutRate * (1 - statWeight);
  const baseHrRate = batterStats.hrRate * statWeight + skillHrRate * (1 - statWeight);
  const baseTotalBasePerHit = batterStats.tbPerHit * statWeight + skillTbPerHit * (1 - statWeight);
  const hitRate = clamp(baseHitRate * advancedMatchup.contactMultiplier, 0.11, 0.39);
  const walkRate = clamp(baseWalkRate * advancedMatchup.walkMultiplier, 0.03, 0.2);
  const strikeoutRate = clamp(baseStrikeoutRate * advancedMatchup.strikeoutMultiplier, 0.065, 0.42);
  const hrRate = clamp(baseHrRate * advancedMatchup.powerMultiplier, 0.0025, 0.115);
  const totalBasePerHit = clamp(baseTotalBasePerHit * clamp(advancedMatchup.powerMultiplier, 0.84, 1.22), 1.03, 2.65);
  const stealAttemptRate = clamp(metric(args.row, "stealAttemptRate", 0.035) + (baserunning - 70) * 0.0017 + (orderIndex <= 1 ? 0.012 : 0), 0.002, 0.16);
  const stealSuccessRate = clamp(metric(args.row, "stealSuccessRate", 0.72) + (baserunning - 70) * 0.002, 0.42, 0.9);
  const onBase = clamp(hitRate + walkRate, 0.18, 0.5);
  const runShare = LINEUP_RUN_SHARE[orderIndex] ?? 0.1;
  const rbiShare = LINEUP_RBI_SHARE[orderIndex] ?? 0.1;
  const expectedHits = pa * hitRate;
  const expectedWalks = pa * walkRate;
  const expectedHr = pa * hrRate;
  const expectedTotalBases = expectedHits * totalBasePerHit + expectedHr * 0.65;
  const expectedRuns = args.teamRuns * runShare * clamp(onBase / 0.31, 0.72, 1.32);
  const expectedRbi = args.teamRuns * rbiShare * clamp((hitRate * totalBasePerHit) / 0.34, 0.72, 1.38);
  const confidence = clamp((args.confirmedLineup ? 0.18 : 0) + batterStats.confidence * 0.22 + advancedMatchup.confidence * 0.16 + (args.opponentStarter ? 0.18 : 0) + 0.28, 0.35, 0.95);

  return {
    playerId: args.row.id,
    playerName: args.row.name,
    team: args.team,
    battingOrder: args.battingOrder,
    expectedPlateAppearances: round(pa, 2),
    hitProbability: round(1 - Math.exp(-expectedHits), 4),
    expectedHits: round(expectedHits, 3),
    expectedTotalBases: round(expectedTotalBases, 3),
    expectedHomeRuns: round(expectedHr, 3),
    expectedRuns: round(expectedRuns, 3),
    expectedRbi: round(expectedRbi, 3),
    expectedWalks: round(expectedWalks, 3),
    expectedStrikeouts: round(pa * strikeoutRate, 3),
    stealAttemptProbability: round(1 - Math.exp(-pa * onBase * stealAttemptRate), 4),
    stolenBaseProbability: round((1 - Math.exp(-pa * onBase * stealAttemptRate)) * stealSuccessRate, 4),
    confidence: round(confidence, 3),
    batterStatProfile: batterStats,
    advancedMatchup,
    reasons: [
      `Projected ${pa.toFixed(1)} PA from batting slot ${args.battingOrder}.`,
      `Batter stats blended at ${(statWeight * 100).toFixed(0)}% confidence: xAVG ${batterStats.xAvg.toFixed(3)}, xSLG ${batterStats.xSlug.toFixed(3)}, xwOBA ${batterStats.xWoba.toFixed(3)}.`,
      `Advanced matchup multipliers: contact ${advancedMatchup.contactMultiplier.toFixed(3)}, power ${advancedMatchup.powerMultiplier.toFixed(3)}, K ${advancedMatchup.strikeoutMultiplier.toFixed(3)}, BB ${advancedMatchup.walkMultiplier.toFixed(3)}.`,
      `Stat-driven rates: H/PA ${hitRate.toFixed(3)}, BB/PA ${walkRate.toFixed(3)}, K/PA ${strikeoutRate.toFixed(3)}, HR/PA ${hrRate.toFixed(3)}, TB/H ${totalBasePerHit.toFixed(2)}.`,
      `Split-adjusted hitter skill ${skill.toFixed(1)} vs ${pitcherHand}HP and opposing starter skill ${opponentPitch.toFixed(1)}.`,
      `Batter drivers: ${batterStats.drivers.join(", ")}; advanced drivers: ${advancedMatchup.drivers.join(", ")}.`
    ]
  };
}

function projectStarter(args: {
  row: MlbProjectionRating | null;
  team: string;
  opponentTeam: string;
  opponentRuns: number;
  opponentOffenseScore: number;
  ownWinProbability: number;
  confirmedStarter: boolean;
}): MlbStarterPerGameProjection | null {
  if (!args.row) return null;
  const skill = pitcherSkill(args.row);
  const stamina = safeNumber(args.row.stamina);
  const workload = safeNumber(args.row.recent_workload, 30);
  const arsenal = safeNumber(args.row.arsenal_quality);
  const kQuality = safeNumber(args.row.k_bb);
  const hrRisk = safeNumber(args.row.hr_risk, 30);
  const opponentPressure = args.opponentOffenseScore - DEFAULT_SKILL;
  const ip = clamp(metric(args.row, "inningsPerStart", 5.35) + (stamina - 70) * 0.025 - workload * 0.006 - opponentPressure * 0.025, 3.1, 7.25);
  const kPer9 = clamp(metric(args.row, "strikeoutsPer9", 7.9) + (kQuality - 70) * 0.055 + (arsenal - 70) * 0.035 - opponentPressure * 0.025, 3.6, 13.8);
  const bbPer9 = clamp(metric(args.row, "walksPer9", 3.0) - (kQuality - 70) * 0.018 + opponentPressure * 0.01, 1.1, 5.7);
  const hPer9 = clamp(metric(args.row, "hitsPer9", 8.4) - (skill - 70) * 0.035 + opponentPressure * 0.035, 5.0, 12.5);
  const hrPer9 = clamp(metric(args.row, "homeRunsPer9", 1.05) + (hrRisk - 30) * 0.012 + opponentPressure * 0.012, 0.25, 2.4);
  const er = clamp(args.opponentRuns * (ip / 8.8) * clamp(1 - (skill - 70) * 0.004, 0.68, 1.28), 0.35, 5.75);
  const qualityStartProbability = normalOver(ip, 5.95, 0.82) * normalOver(3.15, er, 1.2);
  const overOuts = normalOver(ip * 3, 17.5, 2.65);
  const strikeouts = ip * kPer9 / 9;
  const confidence = clamp((args.confirmedStarter ? 0.2 : 0) + (args.row.metrics_json ? 0.22 : 0) + 0.44 + (stamina >= 60 ? 0.08 : 0), 0.38, 0.94);

  return {
    pitcherId: args.row.id,
    pitcherName: args.row.name,
    team: args.team,
    expectedInningsPitched: round(ip, 2),
    expectedOuts: round(ip * 3, 1),
    expectedStrikeouts: round(strikeouts, 2),
    expectedEarnedRuns: round(er, 2),
    expectedHitsAllowed: round(ip * hPer9 / 9, 2),
    expectedWalksAllowed: round(ip * bbPer9 / 9, 2),
    expectedHomeRunsAllowed: round(ip * hrPer9 / 9, 2),
    qualityStartProbability: round(qualityStartProbability, 4),
    over17_5OutsProbability: round(overOuts, 4),
    over4_5StrikeoutsProbability: round(normalOver(strikeouts, 4.5, 1.8), 4),
    firstFiveRunsAllowed: round(er * clamp(5 / Math.max(3.1, ip + 1.1), 0.62, 1.05), 2),
    confidence: round(confidence, 3),
    reasons: [
      `Starter skill ${skill.toFixed(1)} with stamina ${stamina.toFixed(1)} and workload ${workload.toFixed(1)}.`,
      `Opponent ${args.opponentTeam} run pressure ${args.opponentRuns.toFixed(2)} and offense score ${args.opponentOffenseScore.toFixed(1)}.`,
      `K projection uses ${kPer9.toFixed(1)} K/9 over ${ip.toFixed(2)} IP.`
    ]
  };
}

export function projectMlbPlayerStatsForGame(args: {
  away: MlbProjectionTeamContext;
  home: MlbProjectionTeamContext;
  awayRuns: number;
  homeRuns: number;
  awayOffenseScore?: number | null;
  homeOffenseScore?: number | null;
  awayWinProbability?: number | null;
  homeWinProbability?: number | null;
}): MlbPlayerStatProjectionGame {
  const awayStarter = selectStarter(args.away);
  const homeStarter = selectStarter(args.home);
  const awayLineup = lineupHitters(args.away, homeStarter);
  const homeLineup = lineupHitters(args.home, awayStarter);
  const warnings: string[] = [];
  if (!args.away.lineup?.confirmed) warnings.push(`${args.away.team} lineup is not confirmed; hitter PA/order projections are probable.`);
  if (!args.home.lineup?.confirmed) warnings.push(`${args.home.team} lineup is not confirmed; hitter PA/order projections are probable.`);
  if (!awayStarter) warnings.push(`${args.away.team} starting pitcher is unavailable.`);
  if (!homeStarter) warnings.push(`${args.home.team} starting pitcher is unavailable.`);

  return {
    modelVersion: "mlb-player-stat-projection-v1",
    awayTeam: args.away.team,
    homeTeam: args.home.team,
    awayHitters: awayLineup.flatMap((row, index) => row ? [projectHitter({ row, team: args.away.team, battingOrder: index + 1, opponentStarter: homeStarter, teamRuns: args.awayRuns, confirmedLineup: Boolean(args.away.lineup?.confirmed) })] : []),
    homeHitters: homeLineup.flatMap((row, index) => row ? [projectHitter({ row, team: args.home.team, battingOrder: index + 1, opponentStarter: awayStarter, teamRuns: args.homeRuns, confirmedLineup: Boolean(args.home.lineup?.confirmed) })] : []),
    awayStarter: projectStarter({ row: awayStarter, team: args.away.team, opponentTeam: args.home.team, opponentRuns: args.homeRuns, opponentOffenseScore: args.homeOffenseScore ?? DEFAULT_SKILL, ownWinProbability: args.awayWinProbability ?? 0.5, confirmedStarter: Boolean(args.away.lineup?.starting_pitcher_id || args.away.lineup?.starting_pitcher_name) }),
    homeStarter: projectStarter({ row: homeStarter, team: args.home.team, opponentTeam: args.away.team, opponentRuns: args.awayRuns, opponentOffenseScore: args.awayOffenseScore ?? DEFAULT_SKILL, ownWinProbability: args.homeWinProbability ?? 0.5, confirmedStarter: Boolean(args.home.lineup?.starting_pitcher_id || args.home.lineup?.starting_pitcher_name) }),
    warnings
  };
}

function inningFactor(args: { inning: number; offense: number; starter: number; bullpen: number; isHome: boolean }) {
  const pitcherScore = args.inning <= 5 ? args.starter : args.bullpen;
  const homeBonus = args.isHome && args.inning <= 5 ? 0.015 : 0;
  return clamp(1 + (args.offense - DEFAULT_SKILL) * 0.005 - (pitcherScore - DEFAULT_SKILL) * 0.006 + homeBonus, 0.62, 1.42);
}

function poissonCdf(k: number, lambda: number) {
  let sum = 0;
  let term = Math.exp(-lambda);
  for (let i = 0; i <= k; i += 1) {
    if (i > 0) term *= lambda / i;
    sum += term;
  }
  return clamp(sum, 0, 1);
}

function poissonPmf(maxRuns: number, lambda: number) {
  const probs: number[] = [];
  let total = 0;
  for (let k = 0; k < maxRuns; k += 1) {
    const prob = k === 0 ? Math.exp(-lambda) : probs[k - 1] * lambda / k;
    probs.push(prob);
    total += prob;
  }
  probs.push(Math.max(0, 1 - total));
  return probs;
}

function compareRunDistributions(awayMean: number, homeMean: number) {
  const away = poissonPmf(12, awayMean);
  const home = poissonPmf(12, homeMean);
  let awayWin = 0;
  let homeWin = 0;
  let tie = 0;
  for (let a = 0; a < away.length; a += 1) {
    for (let h = 0; h < home.length; h += 1) {
      const p = away[a] * home[h];
      if (a > h) awayWin += p;
      else if (h > a) homeWin += p;
      else tie += p;
    }
  }
  return { awayWin, homeWin, tie };
}

export function projectMlbInningMarkets(args: {
  awayTeam: string;
  homeTeam: string;
  awayRuns: number;
  homeRuns: number;
  awayOffenseScore?: number | null;
  homeOffenseScore?: number | null;
  awayStarterScore?: number | null;
  homeStarterScore?: number | null;
  awayBullpenScore?: number | null;
  homeBullpenScore?: number | null;
}): MlbInningMarketProjection {
  const awayOffense = args.awayOffenseScore ?? DEFAULT_SKILL;
  const homeOffense = args.homeOffenseScore ?? DEFAULT_SKILL;
  const awayStarter = args.awayStarterScore ?? DEFAULT_SKILL;
  const homeStarter = args.homeStarterScore ?? DEFAULT_SKILL;
  const awayBullpen = args.awayBullpenScore ?? DEFAULT_SKILL;
  const homeBullpen = args.homeBullpenScore ?? DEFAULT_SKILL;
  const rawAway = INNING_WEIGHTS.map((weight, index) => args.awayRuns * weight * inningFactor({ inning: index + 1, offense: awayOffense, starter: homeStarter, bullpen: homeBullpen, isHome: false }));
  const rawHome = INNING_WEIGHTS.map((weight, index) => args.homeRuns * weight * inningFactor({ inning: index + 1, offense: homeOffense, starter: awayStarter, bullpen: awayBullpen, isHome: true }));
  const awayScale = args.awayRuns / Math.max(0.001, rawAway.reduce((sum, value) => sum + value, 0));
  const homeScale = args.homeRuns / Math.max(0.001, rawHome.reduce((sum, value) => sum + value, 0));
  const innings = rawAway.map((awayValue, index) => {
    const awayExpectedRuns = awayValue * awayScale;
    const homeExpectedRuns = rawHome[index] * homeScale;
    const expectedRuns = awayExpectedRuns + homeExpectedRuns;
    return {
      inning: index + 1,
      awayExpectedRuns: round(awayExpectedRuns, 3),
      homeExpectedRuns: round(homeExpectedRuns, 3),
      expectedRuns: round(expectedRuns, 3),
      noRunProbability: round(Math.exp(-expectedRuns), 4)
    };
  });
  const first = innings[0];
  const firstFiveAway = innings.slice(0, 5).reduce((sum, inning) => sum + inning.awayExpectedRuns, 0);
  const firstFiveHome = innings.slice(0, 5).reduce((sum, inning) => sum + inning.homeExpectedRuns, 0);
  const f5 = compareRunDistributions(firstFiveAway, firstFiveHome);
  const firstFiveTotal = firstFiveAway + firstFiveHome;

  return {
    modelVersion: "mlb-inning-market-projection-v1",
    awayTeam: args.awayTeam,
    homeTeam: args.homeTeam,
    innings,
    nrfiProbability: first ? first.noRunProbability : 0,
    yrfiProbability: first ? round(1 - first.noRunProbability, 4) : 0,
    firstFiveAwayRuns: round(firstFiveAway, 3),
    firstFiveHomeRuns: round(firstFiveHome, 3),
    firstFiveTotalRuns: round(firstFiveTotal, 3),
    firstFiveHomeWinProbability: round(f5.homeWin, 4),
    firstFiveAwayWinProbability: round(f5.awayWin, 4),
    firstFiveTieProbability: round(f5.tie, 4),
    firstFiveOver4_5Probability: round(1 - poissonCdf(4, firstFiveTotal), 4),
    fullGameExpectedRuns: round(args.awayRuns + args.homeRuns, 3),
    warnings: [
      "Inning allocation is deterministic and should be calibrated against saved inning/result ledgers before being promoted to betting-grade.",
      "NRFI/F5 outputs use projected run intensity, not live umpire/weather/lineup-confirmation adjustments yet."
    ]
  };
}
