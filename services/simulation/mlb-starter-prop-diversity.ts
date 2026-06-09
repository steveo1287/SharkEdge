import { buildMlbV8PlayerImpactContext } from "@/services/simulation/mlb-v8-player-impact-model";

const STARTER_ROLES = new Set(["ACE", "TOP_ROTATION", "MID_ROTATION", "BACK_END", "OPENER_BULK"]);
const DEFAULT_SKILL = 70;

type RatingLike = {
  id: string;
  name: string;
  team: string;
  role_tier: string | null;
  xera_quality: number | null;
  fip_quality: number | null;
  k_bb: number | null;
  hr_risk: number | null;
  groundball_rate: number | null;
  stamina: number | null;
  recent_workload: number | null;
  arsenal_quality: number | null;
  overall: number | null;
  metrics_json: Record<string, unknown> | null;
};

type StarterProjectionLike = {
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
  [key: string]: unknown;
};

type ProjectionWithMlbIntel = {
  matchup?: { away: string; home: string };
  mlbIntel?: {
    playerImpact?: {
      playerStatProjections?: {
        awayStarter?: StarterProjectionLike | null;
        homeStarter?: StarterProjectionLike | null;
        warnings?: string[];
        [key: string]: unknown;
      } | null;
      reasons?: string[];
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function safeNumber(value: unknown, fallback = DEFAULT_SKILL) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function metric(row: RatingLike | null, keys: string[], fallback: number) {
  if (!row?.metrics_json) return fallback;
  for (const key of keys) {
    const value = row.metrics_json[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function playerKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function selectStarter(team: { lineup: { starting_pitcher_id?: string | null; starting_pitcher_name?: string | null } | null; pitchers: RatingLike[] } | null | undefined) {
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

function normalOver(mean: number, line: number, sd: number) {
  const z = (mean - line) / Math.max(0.001, sd);
  return clamp(1 / (1 + Math.exp(-1.7 * z)), 0.03, 0.97);
}

function pitcherSkill(row: RatingLike | null) {
  if (!row) return DEFAULT_SKILL;
  return clamp(
    safeNumber(row.xera_quality) * 0.24 +
    safeNumber(row.fip_quality) * 0.2 +
    safeNumber(row.k_bb) * 0.19 +
    (100 - safeNumber(row.hr_risk, 30)) * 0.1 +
    safeNumber(row.groundball_rate) * 0.05 +
    safeNumber(row.stamina) * 0.08 +
    (100 - safeNumber(row.recent_workload, 30)) * 0.04 +
    safeNumber(row.arsenal_quality) * 0.1,
    35,
    98
  );
}

function kRateToK9(rate: number | null, fallback: number) {
  if (rate == null) return fallback;
  const pct = rate <= 1 ? rate : rate / 100;
  return clamp(pct * 37.5, 4.2, 14.8);
}

function bbRateToBb9(rate: number | null, fallback: number) {
  if (rate == null) return fallback;
  const pct = rate <= 1 ? rate : rate / 100;
  return clamp(pct * 37.5, 1.0, 6.2);
}

function inningsPerStart(row: RatingLike | null, opponentPressure: number) {
  if (!row) return 5.1;
  const innings = metric(row, ["innings", "ip", "IP"], 0);
  const starts = metric(row, ["starts", "gs", "GS"], 0);
  const fromSeason = innings > 0 && starts > 0 ? innings / starts : null;
  const fromPitchCount = metric(row, ["pitchCountAvg", "avgPitchCount", "pitchesPerStart"], 0) > 0
    ? metric(row, ["pitchCountAvg", "avgPitchCount", "pitchesPerStart"], 0) / 16.4
    : null;
  const base = fromSeason ?? fromPitchCount ?? 5.25;
  const stamina = safeNumber(row.stamina);
  const workload = safeNumber(row.recent_workload, 30);
  const roleBoost = String(row.role_tier ?? "") === "ACE" ? 0.28 : String(row.role_tier ?? "") === "TOP_ROTATION" ? 0.16 : String(row.role_tier ?? "") === "BACK_END" ? -0.22 : 0;
  return clamp(base + roleBoost + (stamina - 70) * 0.028 - workload * 0.004 - opponentPressure * 0.022, 3.3, 7.6);
}

function starterDiversity(row: RatingLike | null, existing: StarterProjectionLike | null | undefined, args: { opponentRuns: number; opponentOffenseScore: number; confirmedStarter: boolean }) {
  if (!existing || !row) return existing ?? null;
  const skill = pitcherSkill(row);
  const stamina = safeNumber(row.stamina);
  const workload = safeNumber(row.recent_workload, 30);
  const arsenal = safeNumber(row.arsenal_quality);
  const kQuality = safeNumber(row.k_bb);
  const hrRisk = safeNumber(row.hr_risk, 30);
  const opponentPressure = args.opponentOffenseScore - DEFAULT_SKILL;
  const ip = inningsPerStart(row, opponentPressure);
  const rawKRate = metric(row, ["kRate", "strikeoutRate", "k_pct", "kPercent"], Number.NaN);
  const rawBbRate = metric(row, ["bbRate", "walkRate", "bb_pct", "bbPercent"], Number.NaN);
  const kPer9Base = metric(row, ["strikeoutsPer9", "kPer9", "k9", "K9"], kRateToK9(Number.isFinite(rawKRate) ? rawKRate : null, 7.6));
  const bbPer9Base = metric(row, ["walksPer9", "bbPer9", "bb9", "BB9"], bbRateToBb9(Number.isFinite(rawBbRate) ? rawBbRate : null, 3.0));
  const kPer9 = clamp(kPer9Base + (kQuality - 70) * 0.074 + (arsenal - 70) * 0.052 - opponentPressure * 0.028, 3.4, 15.2);
  const bbPer9 = clamp(bbPer9Base - (kQuality - 70) * 0.026 + opponentPressure * 0.012, 0.9, 6.4);
  const hPer9Base = metric(row, ["hitsPer9", "hPer9", "h9", "H9"], 8.4);
  const hrPer9Base = metric(row, ["hrPer9", "homeRunsPer9", "hr9", "HR9"], 1.05);
  const hPer9 = clamp(hPer9Base - (skill - 70) * 0.045 + opponentPressure * 0.04, 4.7, 13.2);
  const hrPer9 = clamp(hrPer9Base + (hrRisk - 30) * 0.017 + opponentPressure * 0.014, 0.18, 2.8);
  const er = clamp(args.opponentRuns * (ip / 8.8) * clamp(1 - (skill - 70) * 0.006, 0.58, 1.36), 0.25, 6.4);
  const strikeouts = ip * kPer9 / 9;
  const kSd = clamp(1.1 + Math.sqrt(Math.max(0.25, strikeouts)) * 0.45 + (100 - kQuality) * 0.004, 1.25, 3.1);
  const outSd = clamp(1.45 + (100 - stamina) * 0.026 + workload * 0.012 + Math.max(0, opponentPressure) * 0.012, 1.35, 4.2);
  const erSd = clamp(0.9 + Math.max(0, 70 - skill) * 0.018 + Math.max(0, opponentPressure) * 0.018, 0.8, 2.4);
  const outs = ip * 3;
  const strikeoutLineProbabilities = [2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5].map((line) => ({ line, overProbability: round(normalOver(strikeouts, line, kSd), 4) }));
  const outsLineProbabilities = [11.5, 14.5, 15.5, 17.5, 18.5, 20.5, 21.5].map((line) => ({ line, overProbability: round(normalOver(outs, line, outSd), 4) }));
  const earnedRunLineProbabilities = [1.5, 2.5, 3.5, 4.5].map((line) => ({ line, overProbability: round(normalOver(er, line, erSd), 4) }));
  const confidence = clamp((args.confirmedStarter ? 0.18 : 0) + (row.metrics_json ? 0.24 : 0) + 0.34 + (stamina >= 60 ? 0.08 : 0) + (Number.isFinite(rawKRate) ? 0.06 : 0), 0.34, 0.96);
  const tier = skill >= 88 && kQuality >= 86 ? "ACE_CEILING" : skill >= 80 ? "PLUS_STARTER" : skill >= 70 ? "MID_ROTATION" : "BACK_END_RISK";
  return {
    ...existing,
    expectedInningsPitched: round(ip, 2),
    expectedOuts: round(outs, 1),
    expectedStrikeouts: round(strikeouts, 2),
    expectedEarnedRuns: round(er, 2),
    expectedHitsAllowed: round(ip * hPer9 / 9, 2),
    expectedWalksAllowed: round(ip * bbPer9 / 9, 2),
    expectedHomeRunsAllowed: round(ip * hrPer9 / 9, 2),
    qualityStartProbability: round(normalOver(ip, 5.95, outSd / 3) * normalOver(3.15, er, erSd), 4),
    over17_5OutsProbability: round(normalOver(outs, 17.5, outSd), 4),
    over4_5StrikeoutsProbability: round(normalOver(strikeouts, 4.5, kSd), 4),
    firstFiveRunsAllowed: round(er * clamp(5 / Math.max(3.1, ip + 1.1), 0.58, 1.08), 2),
    confidence: round(confidence, 3),
    strikeoutLineProbabilities,
    outsLineProbabilities,
    earnedRunLineProbabilities,
    diversityProfile: {
      modelVersion: "mlb-starter-prop-diversity-v1",
      tier,
      skill: round(skill, 1),
      stamina: round(stamina, 1),
      workload: round(workload, 1),
      arsenal: round(arsenal, 1),
      kQuality: round(kQuality, 1),
      kPer9: round(kPer9, 2),
      bbPer9: round(bbPer9, 2),
      hPer9: round(hPer9, 2),
      hrPer9: round(hrPer9, 2),
      strikeoutSd: round(kSd, 2),
      outsSd: round(outSd, 2),
      earnedRunsSd: round(erSd, 2)
    },
    reasons: [
      ...existing.reasons,
      `Starter prop diversity ${tier}: skill ${skill.toFixed(1)}, K quality ${kQuality.toFixed(1)}, arsenal ${arsenal.toFixed(1)}, stamina ${stamina.toFixed(1)}.`,
      `Diverse pitcher model uses ${kPer9.toFixed(1)} K/9 over ${ip.toFixed(2)} IP with K SD ${kSd.toFixed(2)} and outs SD ${outSd.toFixed(2)}.`,
      `Line ladders generated for K, outs, and earned-run props so an ace and a back-end starter no longer share the same outlook.`
    ]
  } satisfies StarterProjectionLike;
}

export async function applyMlbStarterPropDiversity<TProjection extends ProjectionWithMlbIntel>(args: {
  gameId: string;
  awayTeam: string;
  homeTeam: string;
  projection: TProjection;
}) {
  const statProjection = args.projection.mlbIntel?.playerImpact?.playerStatProjections;
  if (!statProjection) return args.projection;
  const context = await buildMlbV8PlayerImpactContext({ gameId: args.gameId, awayTeam: args.awayTeam, homeTeam: args.homeTeam });
  const awayStarterRow = selectStarter(context.away as never);
  const homeStarterRow = selectStarter(context.home as never);
  const awayStarter = starterDiversity(awayStarterRow, statProjection.awayStarter, {
    opponentRuns: Number((args.projection.mlbIntel?.playerImpact as { homeRunsAdjusted?: number } | null | undefined)?.homeRunsAdjusted ?? 4.5),
    opponentOffenseScore: Number((args.projection.mlbIntel?.playerImpact as { homeOffenseScore?: number } | null | undefined)?.homeOffenseScore ?? DEFAULT_SKILL),
    confirmedStarter: Boolean(context.away?.lineup?.starting_pitcher_id || context.away?.lineup?.starting_pitcher_name)
  });
  const homeStarter = starterDiversity(homeStarterRow, statProjection.homeStarter, {
    opponentRuns: Number((args.projection.mlbIntel?.playerImpact as { awayRunsAdjusted?: number } | null | undefined)?.awayRunsAdjusted ?? 4.4),
    opponentOffenseScore: Number((args.projection.mlbIntel?.playerImpact as { awayOffenseScore?: number } | null | undefined)?.awayOffenseScore ?? DEFAULT_SKILL),
    confirmedStarter: Boolean(context.home?.lineup?.starting_pitcher_id || context.home?.lineup?.starting_pitcher_name)
  });
  const warnings = [...(statProjection.warnings ?? [])];
  if (!awayStarterRow) warnings.push(`${args.awayTeam} starter diversity skipped: no starter rating row.`);
  if (!homeStarterRow) warnings.push(`${args.homeTeam} starter diversity skipped: no starter rating row.`);
  return {
    ...args.projection,
    mlbIntel: {
      ...(args.projection.mlbIntel ?? {}),
      playerImpact: {
        ...(args.projection.mlbIntel?.playerImpact ?? {}),
        playerStatProjections: {
          ...statProjection,
          awayStarter,
          homeStarter,
          warnings
        },
        reasons: [
          ...((args.projection.mlbIntel?.playerImpact as { reasons?: string[] } | null | undefined)?.reasons ?? []),
          "Starter prop diversity layer applied: pitcher stat projections now use pitcher-specific K quality, arsenal, stamina, workload, raw K/BB/HR rates, and line ladders."
        ]
      }
    }
  } as TProjection;
}
