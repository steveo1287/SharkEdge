import { auditUfcFighterProfileCompleteness, reliabilityFromCompleteness, type UfcFighterProfileCompleteness } from "@/services/ufc/fighter-profile-completeness";

export type UfcSampleQuality = "A" | "B" | "C" | "D";

export type UfcModelFeatureSnapshot = {
  fightId: string;
  fightDate: string;
  fighterId: string;
  opponentFighterId: string;
  snapshotAt: string;
  modelVersion: string;
  age?: number | null;
  reachInches?: number | null;
  heightInches?: number | null;
  stance?: string | null;
  weightClass?: string | null;
  daysSinceLastFight?: number | null;
  proFights?: number | null;
  ufcFights?: number | null;
  roundsFought?: number | null;
  sigStrikesLandedPerMin?: number | null;
  sigStrikesAbsorbedPerMin?: number | null;
  strikingDifferential?: number | null;
  sigStrikeAccuracyPct?: number | null;
  sigStrikeDefensePct?: number | null;
  knockdownsPer15?: number | null;
  takedownsPer15?: number | null;
  takedownAccuracyPct?: number | null;
  takedownDefensePct?: number | null;
  submissionAttemptsPer15?: number | null;
  submissionDefensePct?: number | null;
  controlTimePct?: number | null;
  controlEscapePct?: number | null;
  getUpRate?: number | null;
  reversalsPer15?: number | null;
  sweepRate?: number | null;
  legKicksLandedPer15?: number | null;
  bodyKicksLandedPer15?: number | null;
  headKicksLandedPer15?: number | null;
  kickingAccuracyPct?: number | null;
  kickingDefensePct?: number | null;
  clinchStrikingScore?: number | null;
  pressureScore?: number | null;
  distanceManagementScore?: number | null;
  recentFormScore?: number | null;
  finishRate?: number | null;
  lateRoundPerformance?: number | null;
  heartScore?: number | null;
  staminaScore?: number | null;
  paceScore?: number | null;
  chinScore?: number | null;
  recoveryScore?: number | null;
  fightIqScore?: number | null;
  gamePlanScore?: number | null;
  shortNoticePenalty?: number | null;
  injuryLayoffRisk?: number | null;
  opponentAdjustedStrength?: number | null;
  coldStartActive?: boolean | null;
  feature?: Record<string, unknown> | null;
};

export type UfcFighterSkillProfile = {
  fighterId: string;
  fightId: string;
  asOf: string;
  fightDate: string;
  modelVersion: string;
  weightClass: string | null;
  stance: string | null;
  sampleQuality: UfcSampleQuality;
  sampleReliability: number;
  profileCompleteness?: UfcFighterProfileCompleteness;
  leakageSafe: true;
  striking: { offense: number; defense: number; power: number; volume: number; accuracy: number; damageAbsorption: number; pressure: number; distanceManagement: number; clinchStriking: number };
  kicking: { offense: number; defense: number; legKicks: number; bodyKicks: number; headKicks: number; accuracy: number; kickingVolume: number };
  wrestling: { takedownOffense: number; takedownDefense: number; control: number; getUps: number; scramble: number; clinchControl: number };
  grappling: { submissionThreat: number; submissionDefense: number; grapplingOffense: number; grapplingDefense: number; topGame: number; bottomSurvival: number; reversals: number; guardGame: number };
  durability: { koResistance: number; submissionResistance: number; damageTrend: number; chin: number; recovery: number; heart: number };
  cardio: { earlyPace: number; latePace: number; round3: number; championshipRounds: number; stamina: number; paceSustain: number };
  intangibles: { fightIq: number; gamePlan: number; experience: number; recentForm: number; layoffRisk: number; shortNoticeRisk: number };
  physical: { ageCurve: number; reach: number; height: number; reachAdvantagePotential: number };
  prospect: { coldStartActive: boolean; amateurSignal: number; promotionTierSignal: number; opponentStrengthSignal: number; confidenceCap: number | null };
};

export type UfcDivisionSkillBaseline = {
  skill: number;
  sigStrikesLandedPerMin: number;
  sigStrikesAbsorbedPerMin: number;
  strikingDifferential: number;
  sigStrikeAccuracyPct: number;
  sigStrikeDefensePct: number;
  knockdownsPer15: number;
  takedownsPer15: number;
  takedownAccuracyPct: number;
  takedownDefensePct: number;
  submissionAttemptsPer15: number;
  submissionDefensePct: number;
  controlTimePct: number;
  controlEscapePct: number;
  getUpRate: number;
  reversalsPer15: number;
  sweepRate: number;
  legKicksLandedPer15: number;
  bodyKicksLandedPer15: number;
  headKicksLandedPer15: number;
  kickingAccuracyPct: number;
  kickingDefensePct: number;
  clinchStrikingScore: number;
  pressureScore: number;
  distanceManagementScore: number;
  finishRate: number;
  lateRoundPerformance: number;
  heartScore: number;
  staminaScore: number;
  paceScore: number;
  chinScore: number;
  recoveryScore: number;
  fightIqScore: number;
  gamePlanScore: number;
  shortNoticePenalty: number;
  injuryLayoffRisk: number;
  opponentAdjustedStrength: number;
};

export type UfcSkillProfileInput = {
  feature: UfcModelFeatureSnapshot;
  featureHistory?: UfcModelFeatureSnapshot[];
  divisionBaseline?: Partial<UfcDivisionSkillBaseline>;
};

const BASE: UfcDivisionSkillBaseline = {
  skill: 50,
  sigStrikesLandedPerMin: 3.3,
  sigStrikesAbsorbedPerMin: 3.3,
  strikingDifferential: 0,
  sigStrikeAccuracyPct: 44,
  sigStrikeDefensePct: 54,
  knockdownsPer15: 0.25,
  takedownsPer15: 1.2,
  takedownAccuracyPct: 35,
  takedownDefensePct: 62,
  submissionAttemptsPer15: 0.45,
  submissionDefensePct: 62,
  controlTimePct: 18,
  controlEscapePct: 50,
  getUpRate: 50,
  reversalsPer15: 0.18,
  sweepRate: 0.15,
  legKicksLandedPer15: 6,
  bodyKicksLandedPer15: 3,
  headKicksLandedPer15: 0.6,
  kickingAccuracyPct: 43,
  kickingDefensePct: 55,
  clinchStrikingScore: 50,
  pressureScore: 50,
  distanceManagementScore: 50,
  finishRate: 0.52,
  lateRoundPerformance: 50,
  heartScore: 50,
  staminaScore: 50,
  paceScore: 50,
  chinScore: 50,
  recoveryScore: 50,
  fightIqScore: 50,
  gamePlanScore: 50,
  shortNoticePenalty: 0,
  injuryLayoffRisk: 0,
  opponentAdjustedStrength: 50
};

const NUMERIC_KEYS: Array<keyof UfcModelFeatureSnapshot> = [
  "age", "reachInches", "heightInches", "daysSinceLastFight", "proFights", "ufcFights", "roundsFought",
  "sigStrikesLandedPerMin", "sigStrikesAbsorbedPerMin", "strikingDifferential", "sigStrikeAccuracyPct", "sigStrikeDefensePct",
  "knockdownsPer15", "takedownsPer15", "takedownAccuracyPct", "takedownDefensePct", "submissionAttemptsPer15", "submissionDefensePct",
  "controlTimePct", "controlEscapePct", "getUpRate", "reversalsPer15", "sweepRate", "legKicksLandedPer15", "bodyKicksLandedPer15",
  "headKicksLandedPer15", "kickingAccuracyPct", "kickingDefensePct", "clinchStrikingScore", "pressureScore", "distanceManagementScore",
  "recentFormScore", "finishRate", "lateRoundPerformance", "heartScore", "staminaScore", "paceScore", "chinScore", "recoveryScore",
  "fightIqScore", "gamePlanScore", "shortNoticePenalty", "injuryLayoffRisk", "opponentAdjustedStrength"
];

const FEATURE_ALIASES: Partial<Record<keyof UfcModelFeatureSnapshot, string[]>> = {
  sigStrikesLandedPerMin: ["slpm", "sigStrikesLandedPerMin", "sig_strikes_landed_per_min"],
  sigStrikesAbsorbedPerMin: ["sapm", "sigStrikesAbsorbedPerMin", "sig_strikes_absorbed_per_min"],
  sigStrikeAccuracyPct: ["sigStrikeAccuracyPct", "strikeAccuracyPct", "sig_strike_accuracy_pct"],
  sigStrikeDefensePct: ["sigStrikeDefensePct", "strikeDefensePct", "sig_strike_defense_pct"],
  takedownsPer15: ["takedownsPer15", "takedowns_per_15", "tdAvg", "takedownAverage"],
  takedownAccuracyPct: ["takedownAccuracyPct", "takedown_accuracy_pct", "tdAccuracy"],
  takedownDefensePct: ["takedownDefensePct", "takedown_defense_pct", "tdDefense"],
  submissionAttemptsPer15: ["submissionAttemptsPer15", "submission_attempts_per_15", "submissionAverage", "subAvg"],
  submissionDefensePct: ["submissionDefensePct", "submission_defense_pct", "subDefense", "submissionDefense"],
  controlEscapePct: ["controlEscapePct", "control_escape_pct", "escapePct", "matReturnDefensePct"],
  getUpRate: ["getUpRate", "get_up_rate", "getUpsPer15", "standupRate"],
  reversalsPer15: ["reversalsPer15", "reversals_per_15", "reversalRate"],
  sweepRate: ["sweepRate", "sweepsPer15", "sweep_rate"],
  legKicksLandedPer15: ["legKicksLandedPer15", "leg_kicks_landed_per_15", "lowKicksPer15", "calfKicksPer15"],
  bodyKicksLandedPer15: ["bodyKicksLandedPer15", "body_kicks_landed_per_15", "bodyKicksPer15"],
  headKicksLandedPer15: ["headKicksLandedPer15", "head_kicks_landed_per_15", "headKicksPer15"],
  kickingAccuracyPct: ["kickingAccuracyPct", "kickAccuracyPct", "kick_accuracy_pct"],
  kickingDefensePct: ["kickingDefensePct", "kickDefensePct", "kick_defense_pct"],
  clinchStrikingScore: ["clinchStrikingScore", "clinch_striking_score", "clinchSigStrikeScore"],
  pressureScore: ["pressureScore", "pressure_score", "forwardPressureScore"],
  distanceManagementScore: ["distanceManagementScore", "distance_management_score", "rangeControlScore"],
  heartScore: ["heartScore", "heart_score", "dogScore", "adversityScore"],
  staminaScore: ["staminaScore", "stamina_score", "cardioScore"],
  paceScore: ["paceScore", "pace_score", "outputScore"],
  chinScore: ["chinScore", "chin_score", "koResistance", "durability"],
  recoveryScore: ["recoveryScore", "recovery_score", "recoverabilityScore"],
  fightIqScore: ["fightIqScore", "fight_iq_score", "fightIQ", "fightIq"],
  gamePlanScore: ["gamePlanScore", "game_plan_score", "coachabilityScore"],
  shortNoticePenalty: ["shortNoticePenalty", "short_notice_penalty", "shortNoticeRisk"],
  injuryLayoffRisk: ["injuryLayoffRisk", "injury_layoff_risk", "layoffRisk"]
};

function num(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%$/, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function featureNumber(feature: UfcModelFeatureSnapshot, key: keyof UfcModelFeatureSnapshot, fallback: number) {
  const direct = feature[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const source = record(feature.feature);
  const rawFeature = record(source.rawFeature);
  const rawPayload = record(source.rawPayload);
  const stats = record(source.stats);
  const aliases = FEATURE_ALIASES[key] ?? [String(key)];
  for (const alias of aliases) {
    const value = numeric(source[alias]) ?? numeric(rawFeature[alias]) ?? numeric(rawPayload[alias]) ?? numeric(stats[alias]);
    if (value != null) return value;
  }
  return fallback;
}

export function clampSkill(value: number) {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function normalize(value: number, min: number, max: number) {
  return max <= min ? 50 : clampSkill(((value - min) / (max - min)) * 100);
}

function avg(...values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function toTime(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) throw new Error(`Invalid UFC skill timestamp: ${value}`);
  return time;
}

function assertPreFight(feature: UfcModelFeatureSnapshot) {
  if (toTime(feature.snapshotAt) > toTime(feature.fightDate)) {
    throw new Error(`UFC skill profile future-data leakage: snapshotAt must be at or before fightDate for ${feature.fightId}:${feature.fighterId}.`);
  }
}

function rawSampleReliability(feature: UfcModelFeatureSnapshot) {
  const raw = num(feature.ufcFights, 0) * 0.11 + num(feature.proFights, 0) * 0.025 + num(feature.roundsFought, 0) / 55;
  return Math.max(0.03, Math.min(1, Number(raw.toFixed(3))));
}

function sampleQuality(reliability: number, completeness: UfcFighterProfileCompleteness): UfcSampleQuality {
  if (completeness.isGenericAvatar || reliability < 0.22) return "D";
  if (reliability >= 0.85 && completeness.grade === "A") return "A";
  if (reliability >= 0.62 && (completeness.grade === "A" || completeness.grade === "B")) return "B";
  if (reliability >= 0.38 && completeness.grade !== "D") return "C";
  return "D";
}

function coldStartCap(feature: UfcModelFeatureSnapshot, completeness: UfcFighterProfileCompleteness) {
  if (completeness.isGenericAvatar) return 50;
  const ufc = num(feature.ufcFights, 0);
  const pro = num(feature.proFights, 0);
  if (completeness.credentialPriorApplied && completeness.score >= 55) return 66;
  if (ufc === 0) return 58;
  if (ufc < 3) return 62;
  if (pro < 8) return 64;
  return null;
}

function weightedFeature(current: UfcModelFeatureSnapshot, history: UfcModelFeatureSnapshot[]) {
  const safe = [current, ...history]
    .filter((item) => item.fighterId === current.fighterId)
    .filter((item) => toTime(item.snapshotAt) <= toTime(current.fightDate))
    .sort((a, b) => toTime(b.snapshotAt) - toTime(a.snapshotAt))
    .slice(0, 8);
  const out: UfcModelFeatureSnapshot = { ...current, feature: { ...record(current.feature) } };
  for (const key of NUMERIC_KEYS) {
    let sum = 0;
    let weightTotal = 0;
    for (let i = 0; i < safe.length; i += 1) {
      const value = safe[i][key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const weight = Math.pow(0.72, i);
      sum += value * weight;
      weightTotal += weight;
    }
    if (weightTotal > 0) (out as Record<string, unknown>)[key] = sum / weightTotal;
  }
  return out;
}

function prospectSignal(feature: UfcModelFeatureSnapshot, key: string, completeness: UfcFighterProfileCompleteness) {
  const value = feature.feature?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return clampSkill(value);
  return completeness.credentialPriorApplied ? 62 : 50;
}

function opponentSignal(feature: UfcModelFeatureSnapshot, baseline: UfcDivisionSkillBaseline) {
  const raw = num(feature.opponentAdjustedStrength, baseline.opponentAdjustedStrength);
  return clampSkill(raw <= 1 ? raw * 100 : raw);
}

function adjustedSkill(raw: number, feature: UfcModelFeatureSnapshot, reliability: number, baseline: UfcDivisionSkillBaseline) {
  const opponentAdjusted = clampSkill(raw + (opponentSignal(feature, baseline) - 50) * 0.18);
  return clampSkill(baseline.skill + (opponentAdjusted - baseline.skill) * reliability);
}

function riskPenalty(value: number) {
  return Math.max(0, Math.min(25, value <= 1 ? value * 25 : value));
}

function ageCurveScore(age: number) {
  if (age <= 22) return 52;
  if (age <= 29) return 70;
  if (age <= 33) return 64;
  if (age <= 36) return 55;
  return Math.max(35, 55 - (age - 36) * 4);
}

export function buildUfcFighterSkillProfile(input: UfcSkillProfileInput): UfcFighterSkillProfile {
  assertPreFight(input.feature);
  for (const item of input.featureHistory ?? []) assertPreFight(item);
  const baseline = { ...BASE, ...(input.divisionBaseline ?? {}) };
  const feature = weightedFeature(input.feature, input.featureHistory ?? []);
  const completeness = auditUfcFighterProfileCompleteness(feature);
  const reliability = reliabilityFromCompleteness({ baseReliability: rawSampleReliability(feature), completeness });
  const finalSkill = (raw: number) => adjustedSkill(raw, feature, reliability, baseline);

  const slpm = featureNumber(feature, "sigStrikesLandedPerMin", baseline.sigStrikesLandedPerMin);
  const sapm = featureNumber(feature, "sigStrikesAbsorbedPerMin", baseline.sigStrikesAbsorbedPerMin);
  const strikeDiff = featureNumber(feature, "strikingDifferential", slpm - sapm);
  const strikeAcc = featureNumber(feature, "sigStrikeAccuracyPct", baseline.sigStrikeAccuracyPct);
  const strikeDef = featureNumber(feature, "sigStrikeDefensePct", baseline.sigStrikeDefensePct);
  const kd15 = featureNumber(feature, "knockdownsPer15", baseline.knockdownsPer15);
  const td15 = featureNumber(feature, "takedownsPer15", baseline.takedownsPer15);
  const tdAcc = featureNumber(feature, "takedownAccuracyPct", baseline.takedownAccuracyPct);
  const tdDef = featureNumber(feature, "takedownDefensePct", baseline.takedownDefensePct);
  const sub15 = featureNumber(feature, "submissionAttemptsPer15", baseline.submissionAttemptsPer15);
  const subDef = featureNumber(feature, "submissionDefensePct", baseline.submissionDefensePct);
  const controlPct = featureNumber(feature, "controlTimePct", baseline.controlTimePct);
  const escapePct = featureNumber(feature, "controlEscapePct", baseline.controlEscapePct);
  const getUpRaw = featureNumber(feature, "getUpRate", baseline.getUpRate);
  const reversals = featureNumber(feature, "reversalsPer15", baseline.reversalsPer15);
  const sweepRate = featureNumber(feature, "sweepRate", baseline.sweepRate);
  const legKicks = featureNumber(feature, "legKicksLandedPer15", baseline.legKicksLandedPer15);
  const bodyKicks = featureNumber(feature, "bodyKicksLandedPer15", baseline.bodyKicksLandedPer15);
  const headKicks = featureNumber(feature, "headKicksLandedPer15", baseline.headKicksLandedPer15);
  const kickAcc = featureNumber(feature, "kickingAccuracyPct", baseline.kickingAccuracyPct);
  const kickDef = featureNumber(feature, "kickingDefensePct", baseline.kickingDefensePct);
  const clinchRaw = featureNumber(feature, "clinchStrikingScore", baseline.clinchStrikingScore);
  const pressureRaw = featureNumber(feature, "pressureScore", baseline.pressureScore);
  const distanceRaw = featureNumber(feature, "distanceManagementScore", baseline.distanceManagementScore);
  const recentForm = featureNumber(feature, "recentFormScore", 50);
  const finishRate = featureNumber(feature, "finishRate", baseline.finishRate);
  const lateRound = featureNumber(feature, "lateRoundPerformance", baseline.lateRoundPerformance);
  const heartRaw = featureNumber(feature, "heartScore", baseline.heartScore);
  const staminaRaw = featureNumber(feature, "staminaScore", baseline.staminaScore);
  const paceRaw = featureNumber(feature, "paceScore", baseline.paceScore);
  const chinRaw = featureNumber(feature, "chinScore", baseline.chinScore);
  const recoveryRaw = featureNumber(feature, "recoveryScore", baseline.recoveryScore);
  const fightIqRaw = featureNumber(feature, "fightIqScore", baseline.fightIqScore);
  const gamePlanRaw = featureNumber(feature, "gamePlanScore", baseline.gamePlanScore);
  const shortNotice = featureNumber(feature, "shortNoticePenalty", baseline.shortNoticePenalty);
  const layoffRisk = featureNumber(feature, "injuryLayoffRisk", baseline.injuryLayoffRisk);
  const age = featureNumber(feature, "age", 29);
  const reach = featureNumber(feature, "reachInches", 72);
  const height = featureNumber(feature, "heightInches", 70);

  const offense = normalize(slpm, 1.2, 6.8) * 0.34 + normalize(strikeDiff, -2.5, 2.8) * 0.3 + normalize(strikeAcc, 30, 62) * 0.18 + normalize(pressureRaw, 25, 80) * 0.18;
  const defense = normalize(strikeDef, 38, 72) * 0.42 + (100 - normalize(sapm, 1.2, 6.5)) * 0.36 + normalize(distanceRaw, 25, 85) * 0.22;
  const power = normalize(kd15, 0, 1.8) * 0.5 + normalize(finishRate, 0.2, 0.95) * 0.28 + normalize(headKicks, 0, 3.2) * 0.22;
  const volume = normalize(slpm + td15 * 0.55 + (legKicks + bodyKicks + headKicks) * 0.025, 1.5, 8.4);
  const accuracy = normalize(strikeAcc, 30, 62) * 0.78 + normalize(kickAcc, 25, 65) * 0.22;
  const damageAbsorption = 100 - normalize(sapm, 1.1, 6.5);
  const pressure = normalize(pressureRaw, 20, 85) * 0.58 + volume * 0.28 + normalize(paceRaw, 25, 85) * 0.14;
  const distanceManagement = normalize(distanceRaw, 20, 88) * 0.6 + defense * 0.25 + normalize(reach, 62, 82) * 0.15;
  const clinchStriking = normalize(clinchRaw, 20, 85) * 0.58 + offense * 0.22 + normalize(controlPct, 0, 55) * 0.2;
  const kickingVolume = normalize(legKicks + bodyKicks + headKicks * 1.4, 0, 26);
  const kickingAccuracy = normalize(kickAcc, 25, 66);
  const kickingDefense = normalize(kickDef, 30, 78) * 0.72 + distanceManagement * 0.28;
  const legKickScore = normalize(legKicks, 0, 22);
  const bodyKickScore = normalize(bodyKicks, 0, 13);
  const headKickScore = normalize(headKicks, 0, 3.2) * 0.72 + power * 0.28;
  const kickingOffense = avg(kickingVolume, kickingAccuracy, legKickScore, bodyKickScore, headKickScore);
  const takedownOffense = normalize(td15, 0, 5) * 0.5 + normalize(tdAcc, 15, 65) * 0.36 + normalize(clinchRaw, 20, 85) * 0.14;
  const takedownDefense = normalize(tdDef, 30, 92);
  const control = normalize(controlPct, 0, 55);
  const getUps = normalize(getUpRaw, 15, 90) * 0.45 + takedownDefense * 0.28 + normalize(escapePct, 20, 90) * 0.27;
  const scramble = avg(takedownDefense, getUps, normalize(reversals, 0, 1.6), normalize(sweepRate, 0, 1.2));
  const clinchControl = control * 0.38 + takedownOffense * 0.28 + normalize(clinchRaw, 20, 85) * 0.34;
  const submissionThreat = normalize(sub15, 0, 2.6) * 0.52 + control * 0.2 + takedownOffense * 0.12 + normalize(sweepRate, 0, 1.2) * 0.16;
  const submissionDefense = normalize(subDef, 30, 92) * 0.44 + takedownDefense * 0.2 + getUps * 0.2 + normalize(featureNumber(feature, "roundsFought", 8), 0, 55) * 0.16;
  const grapplingOffense = submissionThreat * 0.36 + control * 0.3 + takedownOffense * 0.22 + normalize(reversals, 0, 1.6) * 0.12;
  const grapplingDefense = submissionDefense * 0.42 + getUps * 0.28 + takedownDefense * 0.2 + scramble * 0.1;
  const topGame = control * 0.48 + takedownOffense * 0.24 + submissionThreat * 0.18 + clinchControl * 0.1;
  const bottomSurvival = getUps * 0.36 + submissionDefense * 0.34 + scramble * 0.18 + normalize(sweepRate, 0, 1.2) * 0.12;
  const reversalsScore = normalize(reversals, 0, 1.6) * 0.58 + scramble * 0.42;
  const guardGame = submissionDefense * 0.26 + submissionThreat * 0.24 + bottomSurvival * 0.28 + normalize(sweepRate, 0, 1.2) * 0.22;
  const agePenalty = Math.max(0, age - 34) * 2.2;
  const chin = normalize(chinRaw, 20, 85) * 0.6 + damageAbsorption * 0.25 + defense * 0.15;
  const recovery = normalize(recoveryRaw, 20, 85) * 0.54 + normalize(heartRaw, 20, 90) * 0.28 + normalize(staminaRaw, 20, 90) * 0.18;
  const heart = normalize(heartRaw, 20, 92) * 0.55 + recovery * 0.25 + normalize(recentForm, 0, 100) * 0.2;
  const koResistance = damageAbsorption * 0.46 + defense * 0.2 + chin * 0.22 + recovery * 0.12 - agePenalty;
  const submissionResistance = submissionDefense * 0.48 + bottomSurvival * 0.28 + heart * 0.12 + recovery * 0.12;
  const damageTrend = 100 - normalize(sapm - strikeDiff, 0, 7);
  const stamina = normalize(staminaRaw, 20, 90) * 0.5 + normalize(lateRound, 25, 78) * 0.28 + normalize(featureNumber(feature, "roundsFought", 8), 0, 70) * 0.22;
  const earlyPace = volume * 0.42 + normalize(paceRaw, 20, 88) * 0.34 + normalize(recentForm, 0, 100) * 0.24;
  const latePace = normalize(lateRound, 25, 78) * 0.42 + stamina * 0.38 + normalize(heartRaw, 20, 92) * 0.2;
  const round3 = latePace * 0.52 + stamina * 0.26 + damageTrend * 0.22;
  const championshipRounds = normalize(featureNumber(feature, "roundsFought", 8), 0, 80) * 0.3 + latePace * 0.42 + stamina * 0.28;
  const paceSustain = earlyPace * 0.28 + latePace * 0.44 + stamina * 0.28;
  const experience = normalize(featureNumber(feature, "ufcFights", 0) * 1.8 + featureNumber(feature, "proFights", 0) * 0.6 + featureNumber(feature, "roundsFought", 0) * 0.18, 0, 70);
  const layoffPenalty = riskPenalty(layoffRisk) + Math.max(0, featureNumber(feature, "daysSinceLastFight", 180) - 420) / 18;
  const shortNoticeRisk = riskPenalty(shortNotice);
  const fightIq = normalize(fightIqRaw, 20, 90) * 0.5 + normalize(gamePlanRaw, 20, 90) * 0.25 + experience * 0.25;
  const gamePlan = normalize(gamePlanRaw, 20, 90) * 0.52 + fightIq * 0.28 + normalize(opponentSignal(feature, baseline), 25, 85) * 0.2;
  const form = normalize(recentForm, 0, 100) - layoffPenalty * 0.35 - shortNoticeRisk * 0.25;
  const ageCurve = ageCurveScore(age);
  const reachScore = normalize(reach, 62, 82);
  const heightScore = normalize(height, 62, 80);
  const reachAdvantagePotential = reachScore * 0.55 + distanceManagement * 0.3 + kickingDefense * 0.15;
  const coldStartActive = completeness.isGenericAvatar || Boolean(feature.coldStartActive) || (num(feature.ufcFights, 0) < 3 || num(feature.proFights, 0) < 8) && !completeness.credentialPriorApplied;

  return {
    fighterId: feature.fighterId,
    fightId: feature.fightId,
    asOf: feature.snapshotAt,
    fightDate: feature.fightDate,
    modelVersion: feature.modelVersion,
    weightClass: feature.weightClass ?? null,
    stance: feature.stance ?? null,
    sampleQuality: sampleQuality(reliability, completeness),
    sampleReliability: reliability,
    profileCompleteness: completeness,
    leakageSafe: true,
    striking: { offense: finalSkill(offense), defense: finalSkill(defense), power: finalSkill(power), volume: finalSkill(volume), accuracy: finalSkill(accuracy), damageAbsorption: finalSkill(damageAbsorption), pressure: finalSkill(pressure), distanceManagement: finalSkill(distanceManagement), clinchStriking: finalSkill(clinchStriking) },
    kicking: { offense: finalSkill(kickingOffense), defense: finalSkill(kickingDefense), legKicks: finalSkill(legKickScore), bodyKicks: finalSkill(bodyKickScore), headKicks: finalSkill(headKickScore), accuracy: finalSkill(kickingAccuracy), kickingVolume: finalSkill(kickingVolume) },
    wrestling: { takedownOffense: finalSkill(takedownOffense), takedownDefense: finalSkill(takedownDefense), control: finalSkill(control), getUps: finalSkill(getUps), scramble: finalSkill(scramble), clinchControl: finalSkill(clinchControl) },
    grappling: { submissionThreat: finalSkill(submissionThreat), submissionDefense: finalSkill(submissionDefense), grapplingOffense: finalSkill(grapplingOffense), grapplingDefense: finalSkill(grapplingDefense), topGame: finalSkill(topGame), bottomSurvival: finalSkill(bottomSurvival), reversals: finalSkill(reversalsScore), guardGame: finalSkill(guardGame) },
    durability: { koResistance: finalSkill(koResistance), submissionResistance: finalSkill(submissionResistance), damageTrend: finalSkill(damageTrend), chin: finalSkill(chin), recovery: finalSkill(recovery), heart: finalSkill(heart) },
    cardio: { earlyPace: finalSkill(earlyPace), latePace: finalSkill(latePace), round3: finalSkill(round3), championshipRounds: finalSkill(championshipRounds), stamina: finalSkill(stamina), paceSustain: finalSkill(paceSustain) },
    intangibles: { fightIq: finalSkill(fightIq), gamePlan: finalSkill(gamePlan), experience: finalSkill(experience), recentForm: finalSkill(form), layoffRisk: clampSkill(layoffPenalty), shortNoticeRisk: clampSkill(shortNoticeRisk) },
    physical: { ageCurve: finalSkill(ageCurve), reach: finalSkill(reachScore), height: finalSkill(heightScore), reachAdvantagePotential: finalSkill(reachAdvantagePotential) },
    prospect: {
      coldStartActive,
      amateurSignal: prospectSignal(feature, "amateurSignal", completeness),
      promotionTierSignal: prospectSignal(feature, "promotionTierSignal", completeness),
      opponentStrengthSignal: opponentSignal(feature, baseline),
      confidenceCap: coldStartCap(feature, completeness)
    }
  };
}

export function allSkillValues(profile: UfcFighterSkillProfile) {
  return [
    ...Object.values(profile.striking),
    ...Object.values(profile.kicking),
    ...Object.values(profile.wrestling),
    ...Object.values(profile.grappling),
    ...Object.values(profile.durability),
    ...Object.values(profile.cardio),
    ...Object.values(profile.intangibles),
    ...Object.values(profile.physical),
    profile.prospect.amateurSignal,
    profile.prospect.promotionTierSignal,
    profile.prospect.opponentStrengthSignal
  ];
}
