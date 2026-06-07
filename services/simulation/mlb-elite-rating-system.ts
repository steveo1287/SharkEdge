import type {
  MlbProjectionRating,
  MlbProjectionTeamContext
} from "@/services/simulation/mlb-player-stat-inning-engine";
import {
  buildMlbRealPlayerRatings,
  buildMlbTeamContextFromRealRatings,
  type MlbRawHitterStatRow,
  type MlbRawPitcherStatRow,
  type MlbRealPlayerRatingBuild,
  type MlbTheShowRatingRow
} from "@/services/simulation/mlb-real-player-ratings";

export type MlbRatingHand = "L" | "R";

type Numberish = number | string | null | undefined;

type MlbEliteEntityKey = {
  mlbId: string | number;
  name: string;
  team: string;
};

export type MlbEliteHitterTendencyRow = MlbEliteEntityKey & {
  position?: string | null;
  bats?: string | null;
  plateAppearances?: Numberish;
  xba?: Numberish;
  xslg?: Numberish;
  xwoba?: Numberish;
  expectedOps?: Numberish;
  barrelRate?: Numberish;
  hardHitRate?: Numberish;
  averageExitVelocity?: Numberish;
  maxExitVelocity?: Numberish;
  launchAngle?: Numberish;
  sweetSpotRate?: Numberish;
  pullAirRate?: Numberish;
  groundballRate?: Numberish;
  lineDriveRate?: Numberish;
  flyballRate?: Numberish;
  chaseRate?: Numberish;
  whiffRate?: Numberish;
  zoneContactRate?: Numberish;
  firstPitchSwingRate?: Numberish;
  walkRate?: Numberish;
  strikeoutRate?: Numberish;
  rolling7Xwoba?: Numberish;
  rolling14Xwoba?: Numberish;
  rolling30Xwoba?: Numberish;
  rolling14Ops?: Numberish;
  vsLhpWoba?: Numberish;
  vsRhpWoba?: Numberish;
  vsLhpIso?: Numberish;
  vsRhpIso?: Numberish;
  sprintSpeed?: Numberish;
  baserunningRuns?: Numberish;
  outsAboveAverage?: Numberish;
  defensiveRunsSaved?: Numberish;
};

export type MlbElitePitcherTendencyRow = MlbEliteEntityKey & {
  role?: "starter" | "reliever" | string | null;
  throws?: string | null;
  battersFaced?: Numberish;
  inningsPitched?: Numberish;
  gamesStarted?: Numberish;
  xera?: Numberish;
  xwobaAllowed?: Numberish;
  xbaAllowed?: Numberish;
  xslgAllowed?: Numberish;
  barrelRateAllowed?: Numberish;
  hardHitRateAllowed?: Numberish;
  averageExitVelocityAllowed?: Numberish;
  groundballRate?: Numberish;
  chaseRate?: Numberish;
  whiffRate?: Numberish;
  cswRate?: Numberish;
  zoneRate?: Numberish;
  firstPitchStrikeRate?: Numberish;
  strikeoutRate?: Numberish;
  walkRate?: Numberish;
  kMinusBbRate?: Numberish;
  averageFastballVelocity?: Numberish;
  velocityTrend30d?: Numberish;
  pitchModelStuff?: Numberish;
  pitchModelLocation?: Numberish;
  pitchModelPitching?: Numberish;
  extension?: Numberish;
  releaseConsistency?: Numberish;
  inningsPerStart?: Numberish;
  pitchesPerStart?: Numberish;
  pitchCountLast7d?: Numberish;
  pitchCountLast3d?: Numberish;
  daysRest?: Numberish;
  vsLhbWoba?: Numberish;
  vsRhbWoba?: Numberish;
  catcherFramingRuns?: Numberish;
};

export type MlbEliteTeamContextRow = {
  team: string;
  parkFactorRuns?: Numberish;
  parkFactorHr?: Numberish;
  defensiveRunsSaved?: Numberish;
  outsAboveAverage?: Numberish;
  catcherFramingRuns?: Numberish;
  bullpenFatigueIndex?: Numberish;
  unavailableRelievers?: Array<{ playerId?: string | number | null; playerName?: string | null; leverage?: Numberish }>;
};

export type MlbEliteMarketCalibrationRow = {
  scope: "TEAM" | "HITTER" | "PITCHER" | "GAME";
  team?: string | null;
  mlbId?: string | number | null;
  market: "moneyline" | "total" | "f5_moneyline" | "f5_total" | "nrfi" | "yrfi" | "hitter_hit" | "pitcher_outs" | "pitcher_strikeouts" | string;
  modelProbability?: Numberish;
  closingNoVigProbability?: Numberish;
  result?: "WIN" | "LOSS" | "PUSH" | "VOID" | null;
  sampleSize?: Numberish;
  ratingAdjustment?: Numberish;
};

export type MlbEliteRatingOptions = {
  minHitterPlateAppearances?: number;
  minPitcherBattersFaced?: number;
  theShowPriorWeight?: number;
  statcastOverlayWeight?: number;
  recentFormWeight?: number;
  platoonSplitWeight?: number;
  defenseContextWeight?: number;
  marketCalibrationWeight?: number;
  missingDataPenalty?: number;
};

export type MlbEliteRatingBuildInput = {
  season?: number | string | null;
  hitterStats: MlbRawHitterStatRow[];
  pitcherStats: MlbRawPitcherStatRow[];
  hitterSplits?: MlbRawHitterStatRow[];
  pitcherSplits?: MlbRawPitcherStatRow[];
  theShowRatings?: MlbTheShowRatingRow[];
  hitterTendencies?: MlbEliteHitterTendencyRow[];
  pitcherTendencies?: MlbElitePitcherTendencyRow[];
  teamContexts?: MlbEliteTeamContextRow[];
  marketCalibration?: MlbEliteMarketCalibrationRow[];
  options?: MlbEliteRatingOptions;
};

export type MlbEliteRatingBuild = {
  modelVersion: "mlb-elite-rating-system-v1";
  baseModelVersion: MlbRealPlayerRatingBuild["modelVersion"];
  season: number | string | null;
  generatedAt: string;
  hitters: MlbProjectionRating[];
  pitchers: MlbProjectionRating[];
  warnings: string[];
  diagnostics: {
    hitterCount: number;
    pitcherCount: number;
    hitterTendencyCoverage: number;
    pitcherTendencyCoverage: number;
    averageHitterReliability: number;
    averagePitcherReliability: number;
    averageHitterUncertainty: number;
    averagePitcherUncertainty: number;
    marketCalibrationRows: number;
    dataQuality: number;
  };
  sourceSummary: MlbRealPlayerRatingBuild["sourceSummary"] & {
    hitterTendencyRows: number;
    pitcherTendencyRows: number;
    teamContextRows: number;
    marketCalibrationRows: number;
  };
};

export type MlbEliteTeamRating = {
  team: string;
  context: MlbProjectionTeamContext;
  offenseScore: number;
  contactScore: number;
  powerScore: number;
  disciplineScore: number;
  platoonScore: number;
  speedScore: number;
  defenseScore: number;
  starterScore: number;
  bullpenScore: number;
  bullpenFatiguePenalty: number;
  confirmedLineup: boolean;
  reliability: number;
  uncertainty: number;
  warnings: string[];
};

export type MlbEliteGameSimulationInputs = {
  awayTeam: string;
  homeTeam: string;
  awayOffenseScore: number;
  homeOffenseScore: number;
  awayStarterScore: number;
  homeStarterScore: number;
  awayBullpenScore: number;
  homeBullpenScore: number;
  awayDefenseScore: number;
  homeDefenseScore: number;
  dataQuality: number;
  warnings: string[];
};

const DEFAULT_OPTIONS: Required<MlbEliteRatingOptions> = {
  minHitterPlateAppearances: 1,
  minPitcherBattersFaced: 1,
  theShowPriorWeight: 0.08,
  statcastOverlayWeight: 0.42,
  recentFormWeight: 0.16,
  platoonSplitWeight: 0.14,
  defenseContextWeight: 0.1,
  marketCalibrationWeight: 0.08,
  missingDataPenalty: 0.055
};

const BASE = {
  xwoba: 0.32,
  xba: 0.245,
  xslg: 0.41,
  ops: 0.725,
  iso: 0.165,
  barrel: 0.075,
  hardHit: 0.39,
  exitVelocity: 88.5,
  maxExitVelocity: 109,
  sweetSpot: 0.335,
  pullAir: 0.205,
  groundball: 0.43,
  lineDrive: 0.245,
  flyball: 0.37,
  chase: 0.285,
  whiff: 0.245,
  zoneContact: 0.825,
  walkRate: 0.085,
  strikeoutRate: 0.225,
  sprintSpeed: 27,
  xera: 4.1,
  xwobaAllowed: 0.32,
  xbaAllowed: 0.245,
  xslgAllowed: 0.41,
  barrelAllowed: 0.075,
  hardHitAllowed: 0.39,
  exitVelocityAllowed: 88.5,
  pitcherGroundball: 0.43,
  pitcherChase: 0.285,
  pitcherWhiff: 0.245,
  csw: 0.285,
  zone: 0.49,
  firstPitchStrike: 0.61,
  kRate: 0.225,
  bbRate: 0.085,
  kMinusBb: 0.14,
  velocity: 93.5,
  inningsPerStart: 5.25,
  pitchesPerStart: 88,
  daysRest: 5
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function asNumber(value: Numberish): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.trim().replace("%", "");
    if (cleaned && Number.isFinite(Number(cleaned))) return Number(cleaned);
  }
  return null;
}

function percentRate(value: Numberish): number | null {
  const parsed = asNumber(value);
  if (parsed == null) return null;
  return parsed > 1.5 ? parsed / 100 : parsed;
}

function numberOr(value: Numberish, fallback: number) {
  return asNumber(value) ?? fallback;
}

function jsonNumber(row: MlbProjectionRating, key: string): number | null {
  const value = row.metrics_json?.[key];
  return asNumber(value as Numberish);
}

function sampleNumber(row: MlbProjectionRating, key: string): number | null {
  const sample = row.metrics_json?.sample;
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) return null;
  return asNumber((sample as Record<string, unknown>)[key] as Numberish);
}

function nameKey(name: unknown) {
  return String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function playerKey(value: unknown) {
  return String(value ?? "").trim();
}

function lookupKey(row: { mlbId?: string | number | null; id?: string | number | null; name: string }) {
  const id = playerKey(row.mlbId ?? row.id);
  return id || `name:${nameKey(row.name)}`;
}

function buildLookup<T extends { mlbId: string | number; name: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(lookupKey(row), row);
    map.set(`name:${nameKey(row.name)}`, row);
  }
  return map;
}

function findByRating<T extends { mlbId: string | number; name: string }>(rating: MlbProjectionRating, map: Map<string, T>) {
  return map.get(lookupKey({ id: rating.id, name: rating.name })) ?? map.get(`name:${nameKey(rating.name)}`) ?? null;
}

function scoreHigher(value: number | null, baseline: number, tenPointDelta: number) {
  if (value == null || !Number.isFinite(value)) return null;
  return clamp(70 + ((value - baseline) / tenPointDelta) * 10, 35, 98);
}

function scoreLower(value: number | null, baseline: number, tenPointDelta: number) {
  if (value == null || !Number.isFinite(value)) return null;
  return clamp(70 + ((baseline - value) / tenPointDelta) * 10, 35, 98);
}

function mean(values: Array<number | null | undefined>, fallback = 70) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : fallback;
}

function weightedMean(rows: Array<{ value: number | null | undefined; weight: number }>, fallback = 70) {
  let numerator = 0;
  let denominator = 0;
  for (const row of rows) {
    if (typeof row.value === "number" && Number.isFinite(row.value) && row.weight > 0) {
      numerator += row.value * row.weight;
      denominator += row.weight;
    }
  }
  return denominator > 0 ? numerator / denominator : fallback;
}

function completeness(values: Array<number | null | undefined>) {
  if (!values.length) return 0;
  return values.filter((value) => typeof value === "number" && Number.isFinite(value)).length / values.length;
}

function blend(base: number, overlay: number, weight: number, reliability: number) {
  const w = clamp(weight * reliability, 0, 0.82);
  return clamp(base * (1 - w) + overlay * w, 35, 98);
}

function marketAdjustment(rows: MlbEliteMarketCalibrationRow[], scope: MlbEliteMarketCalibrationRow["scope"], key?: string | number | null, team?: string | null) {
  const scoped = rows.filter((row) => {
    if (row.scope !== scope) return false;
    if (key != null && row.mlbId != null && playerKey(row.mlbId) !== playerKey(key)) return false;
    if (team && row.team && row.team.trim().toUpperCase() !== team.trim().toUpperCase()) return false;
    return true;
  });
  if (!scoped.length) return 0;
  const direct = mean(scoped.map((row) => asNumber(row.ratingAdjustment)), 0);
  if (direct !== 0) return clamp(direct, -4, 4);
  const deltas = scoped.map((row) => {
    const closing = asNumber(row.closingNoVigProbability);
    const model = asNumber(row.modelProbability);
    const sample = clamp(numberOr(row.sampleSize, 1), 1, 500);
    if (closing == null || model == null) return null;
    return clamp((closing - model) * 18 * Math.sqrt(sample / 500), -3, 3);
  });
  return clamp(mean(deltas, 0), -4, 4);
}

function hitterReliability(base: MlbProjectionRating, tendency: MlbEliteHitterTendencyRow | null, missingPenalty: number) {
  const pa = sampleNumber(base, "plateAppearances") ?? numberOr(tendency?.plateAppearances, 0);
  const sampleReliability = clamp((pa - 50) / 500, 0.2, 0.94);
  const traitValues = tendency ? [
    asNumber(tendency.xba), asNumber(tendency.xslg), asNumber(tendency.xwoba), percentRate(tendency.barrelRate),
    percentRate(tendency.hardHitRate), asNumber(tendency.averageExitVelocity), percentRate(tendency.chaseRate),
    percentRate(tendency.whiffRate), percentRate(tendency.zoneContactRate), asNumber(tendency.rolling14Xwoba),
    asNumber(tendency.vsLhpWoba), asNumber(tendency.vsRhpWoba), asNumber(tendency.sprintSpeed)
  ] : [];
  const c = completeness(traitValues);
  const reliability = clamp(sampleReliability * 0.72 + c * 0.23 + 0.05, 0.18, 0.96);
  const uncertainty = clamp(1 - reliability + (1 - c) * missingPenalty, 0.04, 0.82);
  return { reliability, uncertainty, completeness: c, plateAppearances: pa };
}

function pitcherReliability(base: MlbProjectionRating, tendency: MlbElitePitcherTendencyRow | null, missingPenalty: number) {
  const bf = sampleNumber(base, "battersFaced") ?? numberOr(tendency?.battersFaced, numberOr(tendency?.inningsPitched, 0) * 4.25);
  const starts = numberOr(tendency?.gamesStarted, 0);
  const starterBonus = starts >= 8 ? 0.04 : 0;
  const sampleReliability = clamp((bf - 80) / 620, 0.2, 0.94);
  const traitValues = tendency ? [
    asNumber(tendency.xera), asNumber(tendency.xwobaAllowed), asNumber(tendency.xbaAllowed), asNumber(tendency.xslgAllowed),
    percentRate(tendency.barrelRateAllowed), percentRate(tendency.hardHitRateAllowed), percentRate(tendency.chaseRate),
    percentRate(tendency.whiffRate), percentRate(tendency.cswRate), percentRate(tendency.firstPitchStrikeRate),
    percentRate(tendency.kMinusBbRate), asNumber(tendency.averageFastballVelocity), asNumber(tendency.pitchModelStuff),
    asNumber(tendency.inningsPerStart), asNumber(tendency.daysRest)
  ] : [];
  const c = completeness(traitValues);
  const reliability = clamp(sampleReliability * 0.7 + c * 0.23 + starterBonus + 0.05, 0.18, 0.96);
  const uncertainty = clamp(1 - reliability + (1 - c) * missingPenalty, 0.04, 0.84);
  return { reliability, uncertainty, completeness: c, battersFaced: bf };
}

function enhanceHitter(args: {
  base: MlbProjectionRating;
  tendency: MlbEliteHitterTendencyRow | null;
  options: Required<MlbEliteRatingOptions>;
  calibration: MlbEliteMarketCalibrationRow[];
}): MlbProjectionRating {
  const base = args.base;
  const t = args.tendency;
  const reliability = hitterReliability(base, t, args.options.missingDataPenalty);
  const contactBase = numberOr(base.contact, 70);
  const powerBase = numberOr(base.power, 70);
  const disciplineBase = numberOr(base.discipline, 70);
  const speedBase = numberOr(base.baserunning, 70);
  const fieldingBase = numberOr(base.fielding, 70);
  const currentBase = numberOr(base.current_form, 70);

  const xContact = weightedMean([
    { value: scoreHigher(asNumber(t?.xba), BASE.xba, 0.035), weight: 1.25 },
    { value: scoreLower(percentRate(t?.whiffRate), BASE.whiff, 0.055), weight: 1.1 },
    { value: scoreHigher(percentRate(t?.zoneContactRate), BASE.zoneContact, 0.045), weight: 0.95 },
    { value: scoreLower(percentRate(t?.strikeoutRate), BASE.strikeoutRate, 0.055), weight: 0.8 },
    { value: scoreHigher(percentRate(t?.lineDriveRate), BASE.lineDrive, 0.055), weight: 0.45 }
  ], contactBase);

  const xPower = weightedMean([
    { value: scoreHigher(asNumber(t?.xslg), BASE.xslg, 0.09), weight: 1.25 },
    { value: scoreHigher(asNumber(t?.expectedOps), BASE.ops, 0.12), weight: 0.65 },
    { value: scoreHigher(percentRate(t?.barrelRate), BASE.barrel, 0.038), weight: 1.2 },
    { value: scoreHigher(percentRate(t?.hardHitRate), BASE.hardHit, 0.075), weight: 0.9 },
    { value: scoreHigher(asNumber(t?.averageExitVelocity), BASE.exitVelocity, 2.2), weight: 0.65 },
    { value: scoreHigher(asNumber(t?.maxExitVelocity), BASE.maxExitVelocity, 4.5), weight: 0.35 },
    { value: scoreHigher(percentRate(t?.pullAirRate), BASE.pullAir, 0.06), weight: 0.4 }
  ], powerBase);

  const xDiscipline = weightedMean([
    { value: scoreHigher(asNumber(t?.xwoba), BASE.xwoba, 0.045), weight: 1.25 },
    { value: scoreLower(percentRate(t?.chaseRate), BASE.chase, 0.055), weight: 1.0 },
    { value: scoreHigher(percentRate(t?.walkRate), BASE.walkRate, 0.035), weight: 0.85 },
    { value: scoreLower(percentRate(t?.whiffRate), BASE.whiff, 0.06), weight: 0.7 },
    { value: scoreHigher(percentRate(t?.zoneContactRate), BASE.zoneContact, 0.05), weight: 0.55 }
  ], disciplineBase);

  const battedBallShape = weightedMean([
    { value: scoreHigher(percentRate(t?.sweetSpotRate), BASE.sweetSpot, 0.065), weight: 0.75 },
    { value: scoreHigher(percentRate(t?.lineDriveRate), BASE.lineDrive, 0.055), weight: 0.55 },
    { value: scoreLower(percentRate(t?.groundballRate), BASE.groundball, 0.085), weight: 0.35 },
    { value: scoreHigher(percentRate(t?.flyballRate), BASE.flyball, 0.08), weight: 0.25 }
  ], mean([xContact, xPower, xDiscipline]));

  const rolling = weightedMean([
    { value: scoreHigher(asNumber(t?.rolling7Xwoba), BASE.xwoba, 0.06), weight: 0.55 },
    { value: scoreHigher(asNumber(t?.rolling14Xwoba), BASE.xwoba, 0.055), weight: 0.9 },
    { value: scoreHigher(asNumber(t?.rolling30Xwoba), BASE.xwoba, 0.05), weight: 0.75 },
    { value: scoreHigher(asNumber(t?.rolling14Ops), BASE.ops, 0.13), weight: 0.6 }
  ], currentBase);

  const vsLhpOverlay = weightedMean([
    { value: scoreHigher(asNumber(t?.vsLhpWoba), BASE.xwoba, 0.05), weight: 0.8 },
    { value: scoreHigher(asNumber(t?.vsLhpIso), BASE.iso, 0.07), weight: 0.45 },
    { value: mean([xContact, xPower, xDiscipline]), weight: 0.25 }
  ], numberOr(base.vs_lhp, mean([xContact, xPower, xDiscipline])));
  const vsRhpOverlay = weightedMean([
    { value: scoreHigher(asNumber(t?.vsRhpWoba), BASE.xwoba, 0.05), weight: 0.8 },
    { value: scoreHigher(asNumber(t?.vsRhpIso), BASE.iso, 0.07), weight: 0.45 },
    { value: mean([xContact, xPower, xDiscipline]), weight: 0.25 }
  ], numberOr(base.vs_rhp, mean([xContact, xPower, xDiscipline])));

  const speedOverlay = weightedMean([
    { value: scoreHigher(asNumber(t?.sprintSpeed), BASE.sprintSpeed, 1.25), weight: 0.85 },
    { value: scoreHigher(asNumber(t?.baserunningRuns), 0, 3.0), weight: 0.45 }
  ], speedBase);
  const defenseOverlay = weightedMean([
    { value: scoreHigher(asNumber(t?.outsAboveAverage), 0, 5), weight: 0.7 },
    { value: scoreHigher(asNumber(t?.defensiveRunsSaved), 0, 6), weight: 0.55 }
  ], fieldingBase);

  const market = marketAdjustment(args.calibration, "HITTER", base.id, base.team);
  const contact = blend(contactBase, xContact, args.options.statcastOverlayWeight, reliability.reliability);
  const power = blend(powerBase, weightedMean([{ value: xPower, weight: 0.8 }, { value: battedBallShape, weight: 0.2 }], xPower), args.options.statcastOverlayWeight, reliability.reliability);
  const discipline = blend(disciplineBase, xDiscipline, args.options.statcastOverlayWeight, reliability.reliability);
  const currentForm = blend(currentBase, rolling, args.options.recentFormWeight, reliability.reliability);
  const vsLhp = blend(numberOr(base.vs_lhp, 70), vsLhpOverlay, args.options.platoonSplitWeight, reliability.reliability);
  const vsRhp = blend(numberOr(base.vs_rhp, 70), vsRhpOverlay, args.options.platoonSplitWeight, reliability.reliability);
  const baserunning = blend(speedBase, speedOverlay, 0.18, reliability.reliability);
  const fielding = blend(fieldingBase, defenseOverlay, args.options.defenseContextWeight, reliability.reliability);
  const rawOverall = contact * 0.2 + power * 0.24 + discipline * 0.18 + vsLhp * 0.08 + vsRhp * 0.1 + baserunning * 0.05 + fielding * 0.03 + currentForm * 0.12;
  const overall = clamp(rawOverall + market * args.options.marketCalibrationWeight, 35, 98);

  return {
    ...base,
    role_tier: overall >= 88 ? "SUPERSTAR" : overall >= 82 ? "STAR" : overall >= 73 ? "STARTER" : "ROLE_PLAYER",
    contact: round(contact, 2),
    power: round(power, 2),
    discipline: round(discipline, 2),
    vs_lhp: round(vsLhp, 2),
    vs_rhp: round(vsRhp, 2),
    baserunning: round(baserunning, 2),
    fielding: round(fielding, 2),
    current_form: round(currentForm, 2),
    overall: round(overall, 2),
    metrics_json: {
      ...base.metrics_json,
      ratingSystem: "mlb-elite-rating-system-v1",
      sourceKind: "REAL_STATS",
      eliteReliability: round(reliability.reliability, 4),
      eliteUncertainty: round(reliability.uncertainty, 4),
      eliteCompleteness: round(reliability.completeness, 4),
      marketCalibrationAdjustment: round(market, 4),
      statcastOverlay: {
        contact: round(xContact, 2),
        power: round(xPower, 2),
        discipline: round(xDiscipline, 2),
        battedBallShape: round(battedBallShape, 2),
        currentForm: round(rolling, 2),
        vsLhp: round(vsLhpOverlay, 2),
        vsRhp: round(vsRhpOverlay, 2)
      }
    }
  };
}

function enhancePitcher(args: {
  base: MlbProjectionRating;
  tendency: MlbElitePitcherTendencyRow | null;
  teamContext: MlbEliteTeamContextRow | null;
  options: Required<MlbEliteRatingOptions>;
  calibration: MlbEliteMarketCalibrationRow[];
}): MlbProjectionRating {
  const base = args.base;
  const t = args.tendency;
  const reliability = pitcherReliability(base, t, args.options.missingDataPenalty);
  const xeraBase = numberOr(base.xera_quality, 70);
  const fipBase = numberOr(base.fip_quality, 70);
  const kbbBase = numberOr(base.k_bb, 70);
  const hrRiskBase = numberOr(base.hr_risk, 30);
  const gbBase = numberOr(base.groundball_rate, 70);
  const platoonBase = numberOr(base.platoon_split, 70);
  const staminaBase = numberOr(base.stamina, 70);
  const arsenalBase = numberOr(base.arsenal_quality, 70);

  const runPrevention = weightedMean([
    { value: scoreLower(asNumber(t?.xera), BASE.xera, 0.75), weight: 1.15 },
    { value: scoreLower(asNumber(t?.xwobaAllowed), BASE.xwobaAllowed, 0.045), weight: 1.1 },
    { value: scoreLower(asNumber(t?.xbaAllowed), BASE.xbaAllowed, 0.035), weight: 0.65 },
    { value: scoreLower(asNumber(t?.xslgAllowed), BASE.xslgAllowed, 0.085), weight: 0.7 },
    { value: scoreLower(percentRate(t?.hardHitRateAllowed), BASE.hardHitAllowed, 0.075), weight: 0.5 }
  ], xeraBase);

  const contactSuppression = weightedMean([
    { value: scoreLower(asNumber(t?.xslgAllowed), BASE.xslgAllowed, 0.085), weight: 0.8 },
    { value: scoreLower(percentRate(t?.barrelRateAllowed), BASE.barrelAllowed, 0.035), weight: 1.0 },
    { value: scoreLower(percentRate(t?.hardHitRateAllowed), BASE.hardHitAllowed, 0.075), weight: 0.75 },
    { value: scoreLower(asNumber(t?.averageExitVelocityAllowed), BASE.exitVelocityAllowed, 2.0), weight: 0.55 },
    { value: scoreHigher(percentRate(t?.groundballRate), BASE.pitcherGroundball, 0.07), weight: 0.45 }
  ], fipBase);

  const strikeCommand = weightedMean([
    { value: scoreHigher(percentRate(t?.strikeoutRate), BASE.kRate, 0.055), weight: 0.8 },
    { value: scoreHigher(percentRate(t?.kMinusBbRate), BASE.kMinusBb, 0.06), weight: 1.15 },
    { value: scoreLower(percentRate(t?.walkRate), BASE.bbRate, 0.028), weight: 0.85 },
    { value: scoreHigher(percentRate(t?.firstPitchStrikeRate), BASE.firstPitchStrike, 0.045), weight: 0.45 },
    { value: scoreHigher(percentRate(t?.zoneRate), BASE.zone, 0.06), weight: 0.35 }
  ], kbbBase);

  const arsenal = weightedMean([
    { value: scoreHigher(percentRate(t?.whiffRate), BASE.pitcherWhiff, 0.05), weight: 0.9 },
    { value: scoreHigher(percentRate(t?.cswRate), BASE.csw, 0.035), weight: 0.9 },
    { value: scoreHigher(percentRate(t?.chaseRate), BASE.pitcherChase, 0.055), weight: 0.55 },
    { value: scoreHigher(asNumber(t?.averageFastballVelocity), BASE.velocity, 1.8), weight: 0.45 },
    { value: scoreHigher(asNumber(t?.velocityTrend30d), 0, 0.8), weight: 0.25 },
    { value: scoreHigher(asNumber(t?.pitchModelStuff), 100, 12), weight: 0.65 },
    { value: scoreHigher(asNumber(t?.pitchModelLocation), 100, 12), weight: 0.45 },
    { value: scoreHigher(asNumber(t?.pitchModelPitching), 100, 12), weight: 0.6 },
    { value: scoreHigher(asNumber(t?.extension), 6.3, 0.45), weight: 0.2 },
    { value: scoreHigher(asNumber(t?.releaseConsistency), 0, 1.5), weight: 0.2 }
  ], arsenalBase);

  const hrRiskOverlay = 100 - weightedMean([
    { value: scoreLower(percentRate(t?.barrelRateAllowed), BASE.barrelAllowed, 0.035), weight: 1.0 },
    { value: scoreLower(asNumber(t?.xslgAllowed), BASE.xslgAllowed, 0.085), weight: 0.8 },
    { value: scoreLower(percentRate(t?.hardHitRateAllowed), BASE.hardHitAllowed, 0.075), weight: 0.55 },
    { value: scoreHigher(percentRate(t?.groundballRate), BASE.pitcherGroundball, 0.07), weight: 0.35 }
  ], 100 - hrRiskBase);

  const groundball = weightedMean([
    { value: scoreHigher(percentRate(t?.groundballRate), BASE.pitcherGroundball, 0.07), weight: 1.0 },
    { value: scoreLower(percentRate(t?.barrelRateAllowed), BASE.barrelAllowed, 0.035), weight: 0.25 }
  ], gbBase);

  const splitScore = weightedMean([
    { value: scoreLower(asNumber(t?.vsLhbWoba), BASE.xwobaAllowed, 0.05), weight: 0.7 },
    { value: scoreLower(asNumber(t?.vsRhbWoba), BASE.xwobaAllowed, 0.05), weight: 0.7 }
  ], platoonBase);
  const lhb = asNumber(t?.vsLhbWoba);
  const rhb = asNumber(t?.vsRhbWoba);
  const platoonStability = lhb != null && rhb != null ? clamp(92 - Math.abs(lhb - rhb) * 260, 35, 98) : splitScore;

  const workloadPenalty = weightedMean([
    { value: scoreLower(asNumber(t?.pitchCountLast7d), 90, 32), weight: 0.65 },
    { value: scoreLower(asNumber(t?.pitchCountLast3d), 28, 20), weight: 0.45 },
    { value: scoreHigher(asNumber(t?.daysRest), BASE.daysRest, 1.1), weight: 0.3 }
  ], 70);
  const staminaOverlay = weightedMean([
    { value: scoreHigher(asNumber(t?.inningsPerStart), BASE.inningsPerStart, 0.75), weight: 0.8 },
    { value: scoreHigher(asNumber(t?.pitchesPerStart), BASE.pitchesPerStart, 11), weight: 0.45 },
    { value: workloadPenalty, weight: 0.25 }
  ], staminaBase);

  const teamDefense = weightedMean([
    { value: scoreHigher(asNumber(args.teamContext?.outsAboveAverage), 0, 9), weight: 0.55 },
    { value: scoreHigher(asNumber(args.teamContext?.defensiveRunsSaved), 0, 12), weight: 0.45 },
    { value: scoreHigher(asNumber(args.teamContext?.catcherFramingRuns), 0, 4), weight: 0.3 },
    { value: scoreHigher(asNumber(t?.catcherFramingRuns), 0, 4), weight: 0.25 }
  ], 70);

  const market = marketAdjustment(args.calibration, "PITCHER", base.id, base.team);
  const xeraQuality = blend(xeraBase, weightedMean([{ value: runPrevention, weight: 0.78 }, { value: teamDefense, weight: 0.22 }], runPrevention), args.options.statcastOverlayWeight, reliability.reliability);
  const fipQuality = blend(fipBase, contactSuppression, args.options.statcastOverlayWeight, reliability.reliability);
  const kbb = blend(kbbBase, strikeCommand, args.options.statcastOverlayWeight, reliability.reliability);
  const hrRisk = clamp(blend(hrRiskBase, hrRiskOverlay, args.options.statcastOverlayWeight, reliability.reliability), 2, 72);
  const gb = blend(gbBase, groundball, 0.26, reliability.reliability);
  const platoon = blend(platoonBase, platoonStability, args.options.platoonSplitWeight, reliability.reliability);
  const stamina = blend(staminaBase, staminaOverlay, 0.24, reliability.reliability);
  const recentWorkload = clamp(100 - workloadPenalty, 4, 90);
  const arsenalQuality = blend(arsenalBase, arsenal, args.options.statcastOverlayWeight, reliability.reliability);
  const rawOverall = xeraQuality * 0.23 + fipQuality * 0.19 + kbb * 0.17 + (100 - hrRisk) * 0.09 + gb * 0.06 + platoon * 0.08 + stamina * 0.06 + (100 - recentWorkload) * 0.04 + arsenalQuality * 0.08;
  const overall = clamp(rawOverall + market * args.options.marketCalibrationWeight, 35, 98);
  const role = String(base.role_tier ?? t?.role ?? "").toUpperCase();
  const isStarter = role.includes("ACE") || role.includes("ROTATION") || role.includes("BACK_END") || role.includes("START") || numberOr(t?.gamesStarted, 0) > 0;

  return {
    ...base,
    role_tier: isStarter ? (overall >= 88 ? "ACE" : overall >= 80 ? "TOP_ROTATION" : overall >= 70 ? "MID_ROTATION" : "BACK_END") : (overall >= 82 ? "HIGH_LEVERAGE_RELIEVER" : "RELIEVER"),
    xera_quality: round(xeraQuality, 2),
    fip_quality: round(fipQuality, 2),
    k_bb: round(kbb, 2),
    hr_risk: round(hrRisk, 2),
    groundball_rate: round(gb, 2),
    platoon_split: round(platoon, 2),
    stamina: round(stamina, 2),
    recent_workload: round(recentWorkload, 2),
    arsenal_quality: round(arsenalQuality, 2),
    overall: round(overall, 2),
    metrics_json: {
      ...base.metrics_json,
      ratingSystem: "mlb-elite-rating-system-v1",
      sourceKind: "REAL_STATS",
      eliteReliability: round(reliability.reliability, 4),
      eliteUncertainty: round(reliability.uncertainty, 4),
      eliteCompleteness: round(reliability.completeness, 4),
      teamDefenseSupport: round(teamDefense, 2),
      marketCalibrationAdjustment: round(market, 4),
      statcastOverlay: {
        runPrevention: round(runPrevention, 2),
        contactSuppression: round(contactSuppression, 2),
        strikeCommand: round(strikeCommand, 2),
        arsenal: round(arsenal, 2),
        hrRisk: round(hrRiskOverlay, 2),
        platoonStability: round(platoonStability, 2),
        workloadPenalty: round(workloadPenalty, 2)
      }
    }
  };
}

function teamContextMap(rows: MlbEliteTeamContextRow[]) {
  const map = new Map<string, MlbEliteTeamContextRow>();
  for (const row of rows) map.set(row.team.trim().toUpperCase(), row);
  return map;
}

export function buildMlbEliteRatingSystem(input: MlbEliteRatingBuildInput): MlbEliteRatingBuild {
  const options = { ...DEFAULT_OPTIONS, ...(input.options ?? {}) };
  const base = buildMlbRealPlayerRatings({
    season: input.season,
    hitterStats: input.hitterStats,
    pitcherStats: input.pitcherStats,
    hitterSplits: input.hitterSplits,
    pitcherSplits: input.pitcherSplits,
    theShowRatings: input.theShowRatings,
    theShowPriorWeight: options.theShowPriorWeight,
    minHitterPlateAppearances: options.minHitterPlateAppearances,
    minPitcherBattersFaced: options.minPitcherBattersFaced
  });

  const hitterMap = buildLookup(input.hitterTendencies ?? []);
  const pitcherMap = buildLookup(input.pitcherTendencies ?? []);
  const teams = teamContextMap(input.teamContexts ?? []);
  const calibration = input.marketCalibration ?? [];
  const hitters = base.hitters.map((row) => enhanceHitter({
    base: row,
    tendency: findByRating(row, hitterMap),
    options,
    calibration
  }));
  const pitchers = base.pitchers.map((row) => enhancePitcher({
    base: row,
    tendency: findByRating(row, pitcherMap),
    teamContext: teams.get(String(row.team ?? "").trim().toUpperCase()) ?? null,
    options,
    calibration
  }));

  const hitterCoverage = hitters.length ? hitters.filter((row) => Boolean(row.metrics_json?.statcastOverlay)).length / hitters.length : 0;
  const pitcherCoverage = pitchers.length ? pitchers.filter((row) => Boolean(row.metrics_json?.statcastOverlay)).length / pitchers.length : 0;
  const averageHitterReliability = mean(hitters.map((row) => jsonNumber(row, "eliteReliability")), 0);
  const averagePitcherReliability = mean(pitchers.map((row) => jsonNumber(row, "eliteReliability")), 0);
  const averageHitterUncertainty = mean(hitters.map((row) => jsonNumber(row, "eliteUncertainty")), 0.5);
  const averagePitcherUncertainty = mean(pitchers.map((row) => jsonNumber(row, "eliteUncertainty")), 0.5);
  const dataQuality = clamp(
    100 * (0.26 * hitterCoverage + 0.24 * pitcherCoverage + 0.22 * averageHitterReliability + 0.22 * averagePitcherReliability + 0.06 * clamp(calibration.length / 200, 0, 1)),
    0,
    100
  );
  const warnings = [...base.warnings];
  if (hitterCoverage < 0.8) warnings.push("Elite hitter tendency coverage is below 80%; some hitters are relying mostly on season-level stat ratings.");
  if (pitcherCoverage < 0.8) warnings.push("Elite pitcher tendency coverage is below 80%; some pitchers are relying mostly on season-level stat ratings.");
  if (!calibration.length) warnings.push("No market/outcome calibration rows supplied; output is skill-rated but not yet closing-market calibrated.");

  return {
    modelVersion: "mlb-elite-rating-system-v1",
    baseModelVersion: base.modelVersion,
    season: input.season ?? null,
    generatedAt: new Date().toISOString(),
    hitters,
    pitchers,
    warnings,
    diagnostics: {
      hitterCount: hitters.length,
      pitcherCount: pitchers.length,
      hitterTendencyCoverage: round(hitterCoverage, 4),
      pitcherTendencyCoverage: round(pitcherCoverage, 4),
      averageHitterReliability: round(averageHitterReliability, 4),
      averagePitcherReliability: round(averagePitcherReliability, 4),
      averageHitterUncertainty: round(averageHitterUncertainty, 4),
      averagePitcherUncertainty: round(averagePitcherUncertainty, 4),
      marketCalibrationRows: calibration.length,
      dataQuality: round(dataQuality, 1)
    },
    sourceSummary: {
      ...base.sourceSummary,
      hitterTendencyRows: input.hitterTendencies?.length ?? 0,
      pitcherTendencyRows: input.pitcherTendencies?.length ?? 0,
      teamContextRows: input.teamContexts?.length ?? 0,
      marketCalibrationRows: calibration.length
    }
  };
}

function ratingByIdOrName(ratings: MlbProjectionRating[], id?: string | number | null, name?: string | null) {
  const idKey = playerKey(id);
  const nKey = nameKey(name);
  return ratings.find((row) => (idKey && playerKey(row.id) === idKey) || (nKey && nameKey(row.name) === nKey)) ?? null;
}

function lineupRatings(context: MlbProjectionTeamContext) {
  const order = Array.isArray(context.lineup?.batting_order_json) ? context.lineup?.batting_order_json : [];
  const selected = order.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const rating = ratingByIdOrName(context.hitters, row.playerId as string | number | null, row.playerName as string | null ?? row.name as string | null);
    return rating ? [rating] : [];
  });
  if (selected.length >= 7) return selected.slice(0, 9);
  return context.hitters.slice().sort((a, b) => numberOr(b.overall, 0) - numberOr(a.overall, 0)).slice(0, 9);
}

function selectStarter(context: MlbProjectionTeamContext) {
  const id = context.lineup?.starting_pitcher_id;
  const name = context.lineup?.starting_pitcher_name;
  const explicit = ratingByIdOrName(context.pitchers, id, name);
  if (explicit) return explicit;
  const starterRoles = new Set(["ACE", "TOP_ROTATION", "MID_ROTATION", "BACK_END", "OPENER_BULK"]);
  return context.pitchers
    .filter((row) => starterRoles.has(String(row.role_tier ?? "")))
    .sort((a, b) => numberOr(b.overall, 0) - numberOr(a.overall, 0))[0] ?? context.pitchers[0] ?? null;
}

function topRelievers(context: MlbProjectionTeamContext, starter: MlbProjectionRating | null) {
  return context.pitchers
    .filter((row) => row.id !== starter?.id)
    .filter((row) => !String(row.role_tier ?? "").includes("ROTATION") && String(row.role_tier ?? "") !== "ACE")
    .sort((a, b) => numberOr(b.overall, 0) - numberOr(a.overall, 0))
    .slice(0, 7);
}

function orderedWeightedScore(players: MlbProjectionRating[], score: (row: MlbProjectionRating) => number) {
  const weights = [1.15, 1.1, 1.08, 1.06, 0.98, 0.92, 0.86, 0.8, 0.75];
  return weightedMean(players.map((row, index) => ({ value: score(row), weight: weights[index] ?? 0.75 })), 70);
}

export function buildMlbEliteTeamRating(args: {
  team: string;
  ratings: MlbEliteRatingBuild | { hitters: MlbProjectionRating[]; pitchers: MlbProjectionRating[] };
  battingOrder?: Array<{ playerId?: string | number | null; playerName?: string | null; name?: string | null }>;
  confirmedLineup?: boolean;
  startingPitcherId?: string | number | null;
  startingPitcherName?: string | null;
  teamContext?: MlbEliteTeamContextRow | null;
  source?: string;
  capturedAt?: Date | string | null;
}): MlbEliteTeamRating {
  const context = buildMlbTeamContextFromRealRatings({
    team: args.team,
    ratings: args.ratings,
    battingOrder: args.battingOrder,
    confirmedLineup: args.confirmedLineup,
    startingPitcherId: args.startingPitcherId,
    startingPitcherName: args.startingPitcherName,
    availableRelievers: [],
    unavailableRelievers: args.teamContext?.unavailableRelievers ?? [],
    source: args.source ?? "mlb-elite-rating-system-v1",
    capturedAt: args.capturedAt
  });
  const lineup = lineupRatings(context);
  const starter = selectStarter(context);
  const relievers = topRelievers(context, starter);
  const warnings: string[] = [];
  if (lineup.length < 9) warnings.push(`${args.team} has only ${lineup.length}/9 projected lineup hitters matched.`);
  if (!starter) warnings.push(`${args.team} has no matched starting pitcher.`);
  if (relievers.length < 4) warnings.push(`${args.team} bullpen depth is thin in rating feed.`);

  const contactScore = orderedWeightedScore(lineup, (row) => numberOr(row.contact, 70));
  const powerScore = orderedWeightedScore(lineup, (row) => numberOr(row.power, 70));
  const disciplineScore = orderedWeightedScore(lineup, (row) => numberOr(row.discipline, 70));
  const platoonScore = orderedWeightedScore(lineup, (row) => mean([numberOr(row.vs_lhp, 70), numberOr(row.vs_rhp, 70)]));
  const speedScore = orderedWeightedScore(lineup, (row) => numberOr(row.baserunning, 70));
  const defensePlayerScore = orderedWeightedScore(lineup, (row) => numberOr(row.fielding, 70));
  const contextDefense = weightedMean([
    { value: scoreHigher(asNumber(args.teamContext?.outsAboveAverage), 0, 9), weight: 0.55 },
    { value: scoreHigher(asNumber(args.teamContext?.defensiveRunsSaved), 0, 12), weight: 0.45 },
    { value: scoreHigher(asNumber(args.teamContext?.catcherFramingRuns), 0, 4), weight: 0.25 }
  ], defensePlayerScore);
  const defenseScore = weightedMean([{ value: defensePlayerScore, weight: 0.72 }, { value: contextDefense, weight: 0.28 }], defensePlayerScore);
  const offenseScore = weightedMean([
    { value: contactScore, weight: 0.24 },
    { value: powerScore, weight: 0.29 },
    { value: disciplineScore, weight: 0.21 },
    { value: platoonScore, weight: 0.12 },
    { value: speedScore, weight: 0.06 },
    { value: defenseScore, weight: 0.03 },
    { value: orderedWeightedScore(lineup, (row) => numberOr(row.current_form, 70)), weight: 0.05 }
  ], 70);
  const starterScore = starter ? numberOr(starter.overall, 70) : 70;
  const bullpenBase = weightedMean(relievers.map((row, index) => ({ value: numberOr(row.overall, 70), weight: Math.max(0.35, 1 - index * 0.095) })), 70);
  const unavailablePenalty = (args.teamContext?.unavailableRelievers ?? []).reduce((sum, reliever) => sum + clamp(numberOr(reliever.leverage, 1), 0.4, 2.4), 0);
  const fatiguePenalty = clamp(numberOr(args.teamContext?.bullpenFatigueIndex, 0) * 0.08 + unavailablePenalty, 0, 8.5);
  const bullpenScore = clamp(bullpenBase - fatiguePenalty, 35, 98);
  const reliability = mean([
    ...lineup.map((row) => jsonNumber(row, "eliteReliability")),
    starter ? jsonNumber(starter, "eliteReliability") : null,
    ...relievers.slice(0, 4).map((row) => jsonNumber(row, "eliteReliability"))
  ], 0.5);
  const uncertainty = mean([
    ...lineup.map((row) => jsonNumber(row, "eliteUncertainty")),
    starter ? jsonNumber(starter, "eliteUncertainty") : null,
    ...relievers.slice(0, 4).map((row) => jsonNumber(row, "eliteUncertainty"))
  ], 0.5);

  return {
    team: args.team.trim().toUpperCase(),
    context,
    offenseScore: round(offenseScore, 2),
    contactScore: round(contactScore, 2),
    powerScore: round(powerScore, 2),
    disciplineScore: round(disciplineScore, 2),
    platoonScore: round(platoonScore, 2),
    speedScore: round(speedScore, 2),
    defenseScore: round(defenseScore, 2),
    starterScore: round(starterScore, 2),
    bullpenScore: round(bullpenScore, 2),
    bullpenFatiguePenalty: round(fatiguePenalty, 2),
    confirmedLineup: Boolean(args.confirmedLineup),
    reliability: round(reliability, 4),
    uncertainty: round(uncertainty, 4),
    warnings
  };
}

export function deriveMlbEliteGameSimulationInputs(args: {
  away: MlbEliteTeamRating;
  home: MlbEliteTeamRating;
}): MlbEliteGameSimulationInputs {
  const warnings = [...args.away.warnings, ...args.home.warnings];
  if (!args.away.confirmedLineup) warnings.push(`${args.away.team} lineup is not confirmed.`);
  if (!args.home.confirmedLineup) warnings.push(`${args.home.team} lineup is not confirmed.`);
  const quality = clamp(100 * mean([
    args.away.reliability,
    args.home.reliability,
    1 - args.away.uncertainty,
    1 - args.home.uncertainty,
    args.away.confirmedLineup ? 0.96 : 0.72,
    args.home.confirmedLineup ? 0.96 : 0.72
  ], 0.5), 0, 100);

  return {
    awayTeam: args.away.team,
    homeTeam: args.home.team,
    awayOffenseScore: args.away.offenseScore,
    homeOffenseScore: args.home.offenseScore,
    awayStarterScore: args.away.starterScore,
    homeStarterScore: args.home.starterScore,
    awayBullpenScore: args.away.bullpenScore,
    homeBullpenScore: args.home.bullpenScore,
    awayDefenseScore: args.away.defenseScore,
    homeDefenseScore: args.home.defenseScore,
    dataQuality: round(quality, 1),
    warnings
  };
}
