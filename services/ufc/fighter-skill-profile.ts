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
  controlTimePct?: number | null;
  recentFormScore?: number | null;
  finishRate?: number | null;
  lateRoundPerformance?: number | null;
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
  sampleQuality: UfcSampleQuality;
  sampleReliability: number;
  leakageSafe: true;
  striking: { offense: number; defense: number; power: number; volume: number; accuracy: number; damageAbsorption: number };
  wrestling: { takedownOffense: number; takedownDefense: number; control: number; getUps: number; scramble: number };
  grappling: { submissionThreat: number; submissionDefense: number; topGame: number; bottomSurvival: number };
  durability: { koResistance: number; submissionResistance: number; damageTrend: number };
  cardio: { earlyPace: number; latePace: number; round3: number; championshipRounds: number };
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
  controlTimePct: number;
  finishRate: number;
  lateRoundPerformance: number;
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
  controlTimePct: 18,
  finishRate: 0.52,
  lateRoundPerformance: 50,
  opponentAdjustedStrength: 50
};

const NUMERIC_KEYS: Array<keyof UfcModelFeatureSnapshot> = [
  "age", "reachInches", "heightInches", "daysSinceLastFight", "proFights", "ufcFights", "roundsFought",
  "sigStrikesLandedPerMin", "sigStrikesAbsorbedPerMin", "strikingDifferential", "sigStrikeAccuracyPct",
  "sigStrikeDefensePct", "knockdownsPer15", "takedownsPer15", "takedownAccuracyPct", "takedownDefensePct",
  "submissionAttemptsPer15", "controlTimePct", "recentFormScore", "finishRate", "lateRoundPerformance", "opponentAdjustedStrength"
];

function num(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clampSkill(value: number) {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function normalize(value: number, min: number, max: number) {
  return max <= min ? 50 : clampSkill(((value - min) / (max - min)) * 100);
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

function sampleReliability(feature: UfcModelFeatureSnapshot) {
  const raw = num(feature.ufcFights, 0) * 0.11 + num(feature.proFights, 0) * 0.025 + num(feature.roundsFought, 0) / 55;
  return Math.max(0.22, Math.min(1, Number(raw.toFixed(3))));
}

function sampleQuality(reliability: number): UfcSampleQuality {
  if (reliability >= 0.85) return "A";
  if (reliability >= 0.62) return "B";
  if (reliability >= 0.38) return "C";
  return "D";
}

function coldStartCap(feature: UfcModelFeatureSnapshot) {
  const ufc = num(feature.ufcFights, 0);
  const pro = num(feature.proFights, 0);
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
  const out: UfcModelFeatureSnapshot = { ...current };
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

function prospectSignal(feature: UfcModelFeatureSnapshot, key: string) {
  const value = feature.feature?.[key];
  return typeof value === "number" && Number.isFinite(value) ? clampSkill(value) : 50;
}

function opponentSignal(feature: UfcModelFeatureSnapshot, baseline: UfcDivisionSkillBaseline) {
  const raw = num(feature.opponentAdjustedStrength, baseline.opponentAdjustedStrength);
  return clampSkill(raw <= 1 ? raw * 100 : raw);
}

function adjustedSkill(raw: number, feature: UfcModelFeatureSnapshot, reliability: number, baseline: UfcDivisionSkillBaseline) {
  const opponentAdjusted = clampSkill(raw + (opponentSignal(feature, baseline) - 50) * 0.18);
  return clampSkill(baseline.skill + (opponentAdjusted - baseline.skill) * reliability);
}

export function buildUfcFighterSkillProfile(input: UfcSkillProfileInput): UfcFighterSkillProfile {
  assertPreFight(input.feature);
  for (const item of input.featureHistory ?? []) assertPreFight(item);
  const baseline = { ...BASE, ...(input.divisionBaseline ?? {}) };
  const feature = weightedFeature(input.feature, input.featureHistory ?? []);
  const reliability = sampleReliability(feature);
  const finalSkill = (raw: number) => adjustedSkill(raw, feature, reliability, baseline);

  const offense = normalize(num(feature.sigStrikesLandedPerMin, baseline.sigStrikesLandedPerMin), 1.2, 6.8) * 0.42 + normalize(num(feature.strikingDifferential, baseline.strikingDifferential), -2.5, 2.8) * 0.38 + normalize(num(feature.sigStrikeAccuracyPct, baseline.sigStrikeAccuracyPct), 30, 62) * 0.2;
  const defense = normalize(num(feature.sigStrikeDefensePct, baseline.sigStrikeDefensePct), 38, 72) * 0.52 + (100 - normalize(num(feature.sigStrikesAbsorbedPerMin, baseline.sigStrikesAbsorbedPerMin), 1.2, 6.5)) * 0.48;
  const power = normalize(num(feature.knockdownsPer15, baseline.knockdownsPer15), 0, 1.8) * 0.64 + normalize(num(feature.finishRate, baseline.finishRate), 0.2, 0.95) * 0.36;
  const volume = normalize(num(feature.sigStrikesLandedPerMin, baseline.sigStrikesLandedPerMin) + num(feature.takedownsPer15, baseline.takedownsPer15) * 0.55, 1.5, 7.5);
  const accuracy = normalize(num(feature.sigStrikeAccuracyPct, baseline.sigStrikeAccuracyPct), 30, 62);
  const damageAbsorption = 100 - normalize(num(feature.sigStrikesAbsorbedPerMin, baseline.sigStrikesAbsorbedPerMin), 1.1, 6.5);
  const takedownOffense = normalize(num(feature.takedownsPer15, baseline.takedownsPer15), 0, 5) * 0.55 + normalize(num(feature.takedownAccuracyPct, baseline.takedownAccuracyPct), 15, 65) * 0.45;
  const takedownDefense = normalize(num(feature.takedownDefensePct, baseline.takedownDefensePct), 30, 92);
  const control = normalize(num(feature.controlTimePct, baseline.controlTimePct), 0, 55);
  const getUps = takedownDefense * 0.58 + (100 - control) * 0.42;
  const scramble = takedownDefense * 0.45 + getUps * 0.35 + normalize(num(feature.lateRoundPerformance, baseline.lateRoundPerformance), 30, 75) * 0.2;
  const submissionThreat = normalize(num(feature.submissionAttemptsPer15, baseline.submissionAttemptsPer15), 0, 2.6) * 0.62 + control * 0.24 + takedownOffense * 0.14;
  const submissionDefense = takedownDefense * 0.44 + getUps * 0.36 + normalize(num(feature.roundsFought, 8), 0, 45) * 0.2;
  const topGame = control * 0.58 + takedownOffense * 0.27 + submissionThreat * 0.15;
  const bottomSurvival = getUps * 0.52 + submissionDefense * 0.48;
  const agePenalty = Math.max(0, num(feature.age, 29) - 34) * 2.2;
  const koResistance = damageAbsorption * 0.72 + defense * 0.28 - agePenalty;
  const submissionResistance = submissionDefense * 0.7 + bottomSurvival * 0.3;
  const damageTrend = 100 - normalize(num(feature.sigStrikesAbsorbedPerMin, baseline.sigStrikesAbsorbedPerMin) - num(feature.strikingDifferential, baseline.strikingDifferential), 0, 7);
  const earlyPace = volume * 0.68 + normalize(num(feature.recentFormScore, 0.5), 0, 1) * 0.32;
  const latePace = normalize(num(feature.lateRoundPerformance, baseline.lateRoundPerformance), 25, 78) * 0.58 + normalize(num(feature.roundsFought, 8), 0, 55) * 0.42;
  const round3 = latePace * 0.72 + damageTrend * 0.28;
  const championshipRounds = normalize(num(feature.roundsFought, 8), 0, 80) * 0.45 + latePace * 0.55;
  const coldStartActive = Boolean(feature.coldStartActive) || num(feature.ufcFights, 0) < 3 || num(feature.proFights, 0) < 8;

  return {
    fighterId: feature.fighterId,
    fightId: feature.fightId,
    asOf: feature.snapshotAt,
    fightDate: feature.fightDate,
    modelVersion: feature.modelVersion,
    weightClass: feature.weightClass ?? null,
    sampleQuality: sampleQuality(reliability),
    sampleReliability: reliability,
    leakageSafe: true,
    striking: { offense: finalSkill(offense), defense: finalSkill(defense), power: finalSkill(power), volume: finalSkill(volume), accuracy: finalSkill(accuracy), damageAbsorption: finalSkill(damageAbsorption) },
    wrestling: { takedownOffense: finalSkill(takedownOffense), takedownDefense: finalSkill(takedownDefense), control: finalSkill(control), getUps: finalSkill(getUps), scramble: finalSkill(scramble) },
    grappling: { submissionThreat: finalSkill(submissionThreat), submissionDefense: finalSkill(submissionDefense), topGame: finalSkill(topGame), bottomSurvival: finalSkill(bottomSurvival) },
    durability: { koResistance: finalSkill(koResistance), submissionResistance: finalSkill(submissionResistance), damageTrend: finalSkill(damageTrend) },
    cardio: { earlyPace: finalSkill(earlyPace), latePace: finalSkill(latePace), round3: finalSkill(round3), championshipRounds: finalSkill(championshipRounds) },
    prospect: { coldStartActive, amateurSignal: prospectSignal(feature, "amateurSignal"), promotionTierSignal: prospectSignal(feature, "promotionTierSignal"), opponentStrengthSignal: opponentSignal(feature, baseline), confidenceCap: coldStartCap(feature) }
  };
}

export function allSkillValues(profile: UfcFighterSkillProfile) {
  return [
    ...Object.values(profile.striking),
    ...Object.values(profile.wrestling),
    ...Object.values(profile.grappling),
    ...Object.values(profile.durability),
    ...Object.values(profile.cardio),
    profile.prospect.amateurSignal,
    profile.prospect.promotionTierSignal,
    profile.prospect.opponentStrengthSignal
  ];
}
