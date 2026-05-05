import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbRosterIntelligenceTables } from "@/services/simulation/mlb-roster-intelligence";
import {
  DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE,
  getActiveMlbV8PlayerImpactProfile,
  type MlbV8PlayerImpactProfile,
  type MlbV8PlayerImpactWeights
} from "@/services/simulation/mlb-v8-player-impact-profile";

type ProjectionLike = {
  matchup?: { away: string; home: string };
  distribution: {
    avgAway: number;
    avgHome: number;
    homeWinPct: number;
    awayWinPct: number;
    [key: string]: unknown;
  };
  mlbIntel?: Record<string, unknown> | null;
};

type RatingRow = {
  id: string;
  name: string;
  team: string;
  role_tier: string | null;
  contact: number | null;
  power: number | null;
  discipline: number | null;
  vs_lhp: number | null;
  vs_rhp: number | null;
  baserunning: number | null;
  fielding: number | null;
  current_form: number | null;
  xera_quality: number | null;
  fip_quality: number | null;
  k_bb: number | null;
  hr_risk: number | null;
  groundball_rate: number | null;
  platoon_split: number | null;
  stamina: number | null;
  recent_workload: number | null;
  arsenal_quality: number | null;
  overall: number | null;
  metrics_json: Record<string, unknown> | null;
};

type LineupRow = {
  confirmed: boolean;
  batting_order_json: unknown;
  bench_json: unknown;
  starting_pitcher_id: string | null;
  starting_pitcher_name: string | null;
  available_relievers_json: unknown;
  unavailable_relievers_json: unknown;
  injuries_json: unknown;
  source: string | null;
  captured_at: Date | string;
};

type TeamContext = {
  team: string;
  lineup: LineupRow | null;
  hitters: RatingRow[];
  pitchers: RatingRow[];
};

export type MlbV8PlayerImpactContext = {
  gameId: string;
  awayTeam: string;
  homeTeam: string;
  available: boolean;
  away: TeamContext | null;
  home: TeamContext | null;
  reason?: string | null;
};

export type MlbV8PlayerImpactResult = {
  modelVersion: "mlb-intel-v8-player-impact";
  applied: boolean;
  confidence: number;
  profileStatus: MlbV8PlayerImpactProfile["status"];
  profileSampleSize: number;
  profileTrainedAt: string | null;
  profileMetrics: Record<string, unknown>;
  awayRunsBase: number;
  homeRunsBase: number;
  awayRunsAdjusted: number;
  homeRunsAdjusted: number;
  rawHomeWinPct: number;
  adjustedHomeWinPct: number;
  adjustedAwayWinPct: number;
  awayOffenseScore: number;
  homeOffenseScore: number;
  awayStarterScore: number;
  homeStarterScore: number;
  awayBullpenScore: number;
  homeBullpenScore: number;
  awayRunDelta: number;
  homeRunDelta: number;
  reasons: string[];
};

const DEFAULT_SKILL = 70;
const LINEUP_WEIGHTS = [1.08, 1.03, 1.15, 1.16, 1.08, 1, 0.94, 0.89, 0.84];
const STARTER_ROLES = new Set(["ACE", "TOP_ROTATION", "MID_ROTATION", "BACK_END", "OPENER_BULK"]);
const RELIEF_ROLES = new Set(["CLOSER", "SETUP", "MIDDLE_RELIEF", "LONG_RELIEF", "MOP_UP"]);

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

function logistic(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function logit(probability: number) {
  const p = clamp(probability, 0.001, 0.999);
  return Math.log(p / (1 - p));
}

function invLogit(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function bayesianShrink(raw: number, reliability: number, prior = DEFAULT_SKILL) {
  return clamp(prior + clamp(reliability, 0, 1) * (raw - prior), 35, 95);
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

function findRatingForLineupEntry(entry: Record<string, unknown>, ratings: RatingRow[]) {
  const id = lineupPlayerId(entry);
  const name = lineupPlayerName(entry);
  return ratings.find((rating) => (id && playerKey(rating.id) === id) || (name && playerKey(rating.name) === name)) ?? null;
}

function hitterSkill(row: RatingRow | null, pitcherThrows: "L" | "R", weights: MlbV8PlayerImpactWeights) {
  if (!row) return DEFAULT_SKILL;
  const split = pitcherThrows === "L" ? safeNumber(row.vs_lhp) : safeNumber(row.vs_rhp);
  const w = weights.hitterWeights;
  return clamp(
    safeNumber(row.contact) * w.contact +
    safeNumber(row.power) * w.power +
    safeNumber(row.discipline) * w.discipline +
    split * w.split +
    safeNumber(row.current_form) * w.currentForm +
    safeNumber(row.baserunning) * w.baserunning +
    safeNumber(row.fielding) * w.fielding,
    35,
    95
  );
}

function pitcherSkill(row: RatingRow | null, weights: MlbV8PlayerImpactWeights) {
  if (!row) return DEFAULT_SKILL;
  const w = weights.pitcherWeights;
  return clamp(
    safeNumber(row.xera_quality) * w.xeraQuality +
    safeNumber(row.fip_quality) * w.fipQuality +
    safeNumber(row.k_bb) * w.kBb +
    (100 - safeNumber(row.hr_risk, 30)) * w.hrRiskAvoidance +
    safeNumber(row.groundball_rate) * w.groundballRate +
    safeNumber(row.platoon_split) * w.platoonSplit +
    safeNumber(row.stamina) * w.stamina +
    (100 - safeNumber(row.recent_workload, 30)) * w.workloadFreshness +
    safeNumber(row.arsenal_quality) * w.arsenalQuality,
    35,
    95
  );
}

function pitcherThrows(row: RatingRow | null): "L" | "R" {
  const throwsValue = String(row?.metrics_json?.throws ?? row?.metrics_json?.handedness ?? "R").toUpperCase();
  return throwsValue.startsWith("L") ? "L" : "R";
}

function selectStarter(team: TeamContext | null) {
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

function bullpenScore(team: TeamContext | null, weights: MlbV8PlayerImpactWeights) {
  if (!team || !team.pitchers.length) return DEFAULT_SKILL;
  const relievers = team.pitchers.filter((pitcher) => RELIEF_ROLES.has(String(pitcher.role_tier ?? "")));
  const source = relievers.length ? relievers : team.pitchers.slice(0, 8);
  const scores = source.map((pitcher) => pitcherSkill(pitcher, weights));
  const unavailable = normalizeJsonArray(team.lineup?.unavailable_relievers_json).length;
  const fatiguePenalty = clamp(unavailable * weights.unavailableRelieverPenalty, 0, 8);
  return bayesianShrink(scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length) - fatiguePenalty, Math.min(1, source.length / 7));
}

function offenseScore(team: TeamContext | null, opponentStarter: RatingRow | null, weights: MlbV8PlayerImpactWeights) {
  if (!team || !team.hitters.length) return DEFAULT_SKILL;
  const order = normalizeJsonArray(team.lineup?.batting_order_json);
  const throws = pitcherThrows(opponentStarter);
  let selected: Array<RatingRow | null> = [];

  if (order.length) {
    selected = order.slice(0, 9).map((entry) => findRatingForLineupEntry(entry, team.hitters));
  }

  if (!selected.length || selected.filter(Boolean).length < 5) {
    selected = team.hitters
      .slice()
      .sort((a, b) => hitterSkill(b, throws, weights) - hitterSkill(a, throws, weights))
      .slice(0, 9);
  }

  const weighted = selected.slice(0, 9).map((rating, index) => hitterSkill(rating, throws, weights) * (LINEUP_WEIGHTS[index] ?? 1));
  const lineupWeights = selected.slice(0, 9).map((_, index) => LINEUP_WEIGHTS[index] ?? 1);
  const raw = weighted.reduce((sum, score) => sum + score, 0) / Math.max(1, lineupWeights.reduce((sum, weight) => sum + weight, 0));
  const confirmedBonus = team.lineup?.confirmed ? weights.confirmedLineupBonus : 0;
  const injuryPenalty = clamp(normalizeJsonArray(team.lineup?.injuries_json).length * weights.injuryPenaltyPerPlayer, 0, 6);
  return bayesianShrink(raw + confirmedBonus - injuryPenalty, Math.min(1, selected.filter(Boolean).length / 9));
}

function runDeltaFor(offense: number, opponentStarter: number, opponentBullpen: number, weights: MlbV8PlayerImpactWeights) {
  const starterComponent = (offense - opponentStarter) * weights.starterRunWeight;
  const bullpenComponent = (offense - opponentBullpen) * weights.bullpenRunWeight;
  return clamp(starterComponent + bullpenComponent, -weights.runDeltaCap, weights.runDeltaCap);
}

function blendProbability(rawHomeWinPct: number, adjustedAwayRuns: number, adjustedHomeRuns: number, confidence: number, weights: MlbV8PlayerImpactWeights) {
  const runDerived = logistic((adjustedHomeRuns - adjustedAwayRuns) * weights.runProbabilityScale);
  const blend = clamp(confidence, weights.probabilityBlendMin, weights.probabilityBlendMax);
  return clamp(invLogit(logit(rawHomeWinPct) * (1 - blend) + logit(runDerived) * blend), 0.05, 0.95);
}

async function latestHitters(team: string) {
  return prisma.$queryRawUnsafe<RatingRow[]>(`
    SELECT DISTINCT ON (player_id)
      player_id AS id, player_name AS name, team, role_tier,
      contact, power, discipline, vs_lhp, vs_rhp, baserunning, fielding, current_form,
      NULL::double precision AS xera_quality, NULL::double precision AS fip_quality, NULL::double precision AS k_bb,
      NULL::double precision AS hr_risk, NULL::double precision AS groundball_rate, NULL::double precision AS platoon_split,
      NULL::double precision AS stamina, NULL::double precision AS recent_workload, NULL::double precision AS arsenal_quality,
      overall, metrics_json
    FROM mlb_player_ratings
    WHERE team = $1
    ORDER BY player_id, snapshot_at DESC;
  `, team);
}

async function latestPitchers(team: string) {
  return prisma.$queryRawUnsafe<RatingRow[]>(`
    SELECT DISTINCT ON (pitcher_id)
      pitcher_id AS id, pitcher_name AS name, team, role_tier,
      NULL::double precision AS contact, NULL::double precision AS power, NULL::double precision AS discipline,
      NULL::double precision AS vs_lhp, NULL::double precision AS vs_rhp, NULL::double precision AS baserunning,
      NULL::double precision AS fielding, NULL::double precision AS current_form,
      xera_quality, fip_quality, k_bb, hr_risk, groundball_rate, platoon_split, stamina, recent_workload, arsenal_quality,
      overall, metrics_json
    FROM mlb_pitcher_ratings
    WHERE team = $1
    ORDER BY pitcher_id, snapshot_at DESC;
  `, team);
}

async function latestLineup(gameId: string, team: string) {
  const rows = await prisma.$queryRaw<LineupRow[]>`
    SELECT confirmed, batting_order_json, bench_json, starting_pitcher_id, starting_pitcher_name,
      available_relievers_json, unavailable_relievers_json, injuries_json, source, captured_at
    FROM mlb_lineup_snapshots
    WHERE game_id = ${gameId} AND team = ${team}
    ORDER BY captured_at DESC
    LIMIT 1;
  `;
  return rows[0] ?? null;
}

async function teamContext(gameId: string, team: string): Promise<TeamContext> {
  const [lineup, hitters, pitchers] = await Promise.all([
    latestLineup(gameId, team),
    latestHitters(team),
    latestPitchers(team)
  ]);
  return { team, lineup, hitters, pitchers };
}

export async function buildMlbV8PlayerImpactContext(args: { gameId: string; awayTeam: string; homeTeam: string }): Promise<MlbV8PlayerImpactContext> {
  if (!hasUsableServerDatabaseUrl()) {
    return { gameId: args.gameId, awayTeam: args.awayTeam, homeTeam: args.homeTeam, available: false, away: null, home: null, reason: "database unavailable" };
  }

  try {
    await ensureMlbRosterIntelligenceTables();
    const [away, home] = await Promise.all([
      teamContext(args.gameId, args.awayTeam),
      teamContext(args.gameId, args.homeTeam)
    ]);
    const available = Boolean(away.hitters.length || away.pitchers.length || away.lineup || home.hitters.length || home.pitchers.length || home.lineup);
    return { gameId: args.gameId, awayTeam: args.awayTeam, homeTeam: args.homeTeam, available, away, home, reason: available ? null : "no roster intelligence rows for either team" };
  } catch (error) {
    return { gameId: args.gameId, awayTeam: args.awayTeam, homeTeam: args.homeTeam, available: false, away: null, home: null, reason: error instanceof Error ? error.message : "unknown player impact context error" };
  }
}

export function calculateMlbV8PlayerImpact(args: {
  projection: ProjectionLike;
  context: MlbV8PlayerImpactContext;
  profile?: MlbV8PlayerImpactProfile;
}): MlbV8PlayerImpactResult {
  const profile = args.profile ?? DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE;
  const weights = profile.weights;
  const baseAway = safeNumber(args.projection.distribution.avgAway, 4.3);
  const baseHome = safeNumber(args.projection.distribution.avgHome, 4.5);
  const rawHomeWinPct = clamp(safeNumber(args.projection.distribution.homeWinPct, 0.5), 0.05, 0.95);

  if (!args.context.available || !args.context.away || !args.context.home) {
    return {
      modelVersion: "mlb-intel-v8-player-impact",
      applied: false,
      confidence: 0,
      profileStatus: profile.status,
      profileSampleSize: profile.sampleSize,
      profileTrainedAt: profile.trainedAt,
      profileMetrics: profile.metrics,
      awayRunsBase: round(baseAway, 2),
      homeRunsBase: round(baseHome, 2),
      awayRunsAdjusted: round(baseAway, 2),
      homeRunsAdjusted: round(baseHome, 2),
      rawHomeWinPct: round(rawHomeWinPct),
      adjustedHomeWinPct: round(rawHomeWinPct),
      adjustedAwayWinPct: round(1 - rawHomeWinPct),
      awayOffenseScore: DEFAULT_SKILL,
      homeOffenseScore: DEFAULT_SKILL,
      awayStarterScore: DEFAULT_SKILL,
      homeStarterScore: DEFAULT_SKILL,
      awayBullpenScore: DEFAULT_SKILL,
      homeBullpenScore: DEFAULT_SKILL,
      awayRunDelta: 0,
      homeRunDelta: 0,
      reasons: [`MLB v8 player-impact skipped: ${args.context.reason ?? "roster intelligence unavailable"}.`]
    };
  }

  const awayStarter = selectStarter(args.context.away);
  const homeStarter = selectStarter(args.context.home);
  const awayOffense = offenseScore(args.context.away, homeStarter, weights);
  const homeOffense = offenseScore(args.context.home, awayStarter, weights);
  const awayStarterScore = bayesianShrink(pitcherSkill(awayStarter, weights), awayStarter ? 0.85 : 0);
  const homeStarterScore = bayesianShrink(pitcherSkill(homeStarter, weights), homeStarter ? 0.85 : 0);
  const awayPen = bullpenScore(args.context.away, weights);
  const homePen = bullpenScore(args.context.home, weights);
  const awayDelta = runDeltaFor(awayOffense, homeStarterScore, homePen, weights);
  const homeDelta = runDeltaFor(homeOffense, awayStarterScore, awayPen, weights);
  const adjustedAwayRuns = clamp(baseAway + awayDelta, 1.5, 9.5);
  const adjustedHomeRuns = clamp(baseHome + homeDelta, 1.5, 9.5);
  const dataPieces = [args.context.away.hitters.length >= 9, args.context.home.hitters.length >= 9, Boolean(awayStarter), Boolean(homeStarter), Boolean(args.context.away.lineup), Boolean(args.context.home.lineup)].filter(Boolean).length;
  const confidence = clamp(dataPieces / 6, 0.2, 0.85);
  const adjustedHomeWinPct = blendProbability(rawHomeWinPct, adjustedAwayRuns, adjustedHomeRuns, confidence, weights);

  return {
    modelVersion: "mlb-intel-v8-player-impact",
    applied: true,
    confidence: round(confidence, 3),
    profileStatus: profile.status,
    profileSampleSize: profile.sampleSize,
    profileTrainedAt: profile.trainedAt,
    profileMetrics: profile.metrics,
    awayRunsBase: round(baseAway, 2),
    homeRunsBase: round(baseHome, 2),
    awayRunsAdjusted: round(adjustedAwayRuns, 2),
    homeRunsAdjusted: round(adjustedHomeRuns, 2),
    rawHomeWinPct: round(rawHomeWinPct),
    adjustedHomeWinPct: round(adjustedHomeWinPct),
    adjustedAwayWinPct: round(1 - adjustedHomeWinPct),
    awayOffenseScore: round(awayOffense, 2),
    homeOffenseScore: round(homeOffense, 2),
    awayStarterScore: round(awayStarterScore, 2),
    homeStarterScore: round(homeStarterScore, 2),
    awayBullpenScore: round(awayPen, 2),
    homeBullpenScore: round(homePen, 2),
    awayRunDelta: round(awayDelta, 3),
    homeRunDelta: round(homeDelta, 3),
    reasons: [
      `MLB v8 player-impact applied with ${(confidence * 100).toFixed(1)}% data confidence using ${profile.status} profile (${profile.sampleSize} samples).`,
      `Away offense ${awayOffense.toFixed(1)} vs home starter ${homeStarterScore.toFixed(1)} and bullpen ${homePen.toFixed(1)} moved away runs ${awayDelta >= 0 ? "+" : ""}${awayDelta.toFixed(2)}.`,
      `Home offense ${homeOffense.toFixed(1)} vs away starter ${awayStarterScore.toFixed(1)} and bullpen ${awayPen.toFixed(1)} moved home runs ${homeDelta >= 0 ? "+" : ""}${homeDelta.toFixed(2)}.`,
      `Run-derived probability was blended with raw home probability ${rawHomeWinPct.toFixed(3)} to produce ${adjustedHomeWinPct.toFixed(3)} before v7 market calibration.`
    ]
  };
}

export function applyMlbV8PlayerImpactToProjection<TProjection extends ProjectionLike>(projection: TProjection, impact: MlbV8PlayerImpactResult): TProjection {
  if (!impact.applied) {
    return {
      ...projection,
      mlbIntel: {
        ...(projection.mlbIntel ?? {}),
        playerImpact: impact
      }
    };
  }

  return {
    ...projection,
    distribution: {
      ...projection.distribution,
      avgAway: impact.awayRunsAdjusted,
      avgHome: impact.homeRunsAdjusted,
      homeWinPct: impact.adjustedHomeWinPct,
      awayWinPct: impact.adjustedAwayWinPct
    },
    mlbIntel: {
      ...(projection.mlbIntel ?? {}),
      playerImpact: impact
    }
  };
}

export async function applyMlbV8PlayerImpactModel<TProjection extends ProjectionLike>(args: {
  gameId: string;
  awayTeam: string;
  homeTeam: string;
  projection: TProjection;
}) {
  const [context, profile] = await Promise.all([
    buildMlbV8PlayerImpactContext({ gameId: args.gameId, awayTeam: args.awayTeam, homeTeam: args.homeTeam }),
    getActiveMlbV8PlayerImpactProfile()
  ]);
  const impact = calculateMlbV8PlayerImpact({ projection: args.projection, context, profile });
  return applyMlbV8PlayerImpactToProjection(args.projection, impact);
}
