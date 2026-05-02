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
  striking: {
    offense: number;
    defense: number;
    power: number;
    volume: number;
    accuracy: number;
    damageAbsorption: number;
  };
  wrestling: {
    takedownOffense: number;
    takedownDefense: number;
    control: number;
    getUps: number;
    scramble: number;
  };
  grappling: {
    submissionThreat: number;
    submissionDefense: number;
    topGame: number;
    bottomSurvival: number;
  };
  durability: {
    koResistance: number;
    submissionResistance: number;
    damageTrend: number;
  };
  cardio: {
    earlyPace: number;
    latePace: number;
    round3: number;
    championshipRounds: number;
  };
  prospect: {
    coldStartActive: boolean;
    amateurSignal: number;
    promotionTierSignal: number;
    opponentStrengthSignal: number;
    confidenceCap: number | null;
  };
};

export type UfcSkillProfileInput = {
  feature: UfcModelFeatureSnapshot;
  featureHistory?: UfcModelFeatureSnapshot[];
  divisionBaseline?: Partial<UfcDivisionSkillBaseline>;
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

const DEFAULT_BASELINE: UfcDivisionSkillBaseline = {
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

function num(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clampSkill(value: number) {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function normalize(value: number, min: number, max: number) {
  if (max <= min) return 50;
  return clampSkill(((value - min) / (max - min)) * 100);
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
  const ufc = num(feature.ufcFights, 0);
  const pro = num(feature.proFights, 0);
  const rounds = num(feature.roundsFought, 0);
  const raw = ufc * 0.11 + pro * 0.025 + rounds / 55;
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

function opponentSignal(feature: UfcModelFeatureSnapshot, baseline: UfcDivisionSkillBaseline) {
  const raw = num(feature.opponentAdjustedStrength, baseline.opponentAdjustedStrength);
  const normalized = raw <= 1 ? raw * 100 : raw;
  return clampSkill(normalized);
}

function applyOpponentAdjustment(rawSkill: number, feature: UfcModelFeatureSnapshot, baseline: UfcDivisionSkillBaseline) {
  const strength = opponentSignal(feature, baseline);
  return clampSkill(rawSkill + (strength - 50) * 0.18);
}

function shrink(rawSkill: number, reliability: number, baseline = DEFAULT_BASELINE.skill) {
  return clampSkill(baseline + (rawSkill - baseline) * reliability);
}

const NUMERIC_KEYS: Array<keyof UfcModelFeatureSnapshot> = [
  "age",
  "reachInches",
  "heightInches",
  "daysSinceLastFight",
  "proFights",
  "ufcFights",
  "roundsFought",
  "sigStrikesLandedPerMin",
  "sigStrikesAbsorbedPerMin",
  "strikingDifferential",
  "sigStrikeAccuracyPct",
  "sigStrikeDefensePct",
  "knockdownsPer15",
  "takedownsPer15",
  "takedownAccuracyPct",
  "takedownDefensePct",
  "submissionAttemptsPer15",
  "controlTimePct",
  "recentFormScore",
  "finishRate",
  "lateRoundPerformance",
  "opponentAdjustedStrength"
];

function weightedFeature(current: UfcModelFeatureSnapshot, history: UfcModelFeatureSnapshot[]) {
  const safeHistory = [current, ...history]
    .filter((item) => item.fighterId === current.fighterId)
    .filter((item) => toTime(item.snapshotAt) <= toTime(current.fightDate))
    .sort((left, right) => toTime(right.snapshotAt) - toTime(left.snapshotAt))
    .slice(0, 8);

  const output: UfcModelFeatureSnapshot = { ...current };
  for (const key of NUMERIC_KEYS) {
    let weighted = 0;
    let weightTotal = 0;
    for (let index = 0; index < safeHistory.length; index += 1) {
      const value = safeHistory[index][key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const weight = Math.pow(0.72, index);
      weighted += value * weight;
      weightTotal += weight;
    }
    if (weightTotal > 0) {
      (output as Record<string, unknown>)[key] = weighted / weightTotal;
    }
  }
  return output;
}

function prospectSignal(feature: UfcModelFeatureSnapshot, key: string) {
  const value = feature.feature?.[key];
  return typeof value === "number" && Number.isFinite(value) ? clampSkill(value) : 50;
}

export function buildUfcFighterSkillProfile(input: UfcSkillProfileInput): UfcFighterSkillProfile {
  assertPreFight(input.feature);
  for (const item of input.featureHistory ?? []) assertPreFight(item);

  const baseline = { ...DEFAULT_BASELINE, ...(input.divisionBaseline ?? {}) };
  const feature = weightedFeature(input.feature, input.featureHistory ?? []);
  const reliability = sampleReliability(feature);
  const quality = sampleQuality(reliability);

  const offenseRaw = normalize(num(feature.sigStrikesLandedPerMin, baseline.sigStrikesLandedPerMin), 1.2, 6.8) * 0.42 + normalize(num(feature.strikingDifferential, baseline.strikingDifferential), -2.5, 2.8) * 0.38 + normalize(num(feature.sigStrikeAccuracyPct, baseline.sigStrikeAccuracyPct), 30, 62) * 0.2;
  const defenseRaw = normalize(num(feature.sigStrikeDefensePct, baseline.sigStrikeDefensePct), 38, 72) * 0.52 + (100 - normalize(num(feature.sigStrikesAbsorbedPerMin, baseline.sigStrikesAbsorbedPerMin), 1.2, 6.5)) * 0.48;
  const powerRaw = normalize(num(feature.knockdownsPer15, baseline.knockdownsPer15), 0, 1.8) * 0.64 + normalize(num(feature.finishRate, baseline.finishRate), 0.2, 0.95) * 0.36;
  const volumeRaw = normalize(num(feature.sigStrikesLandedPerMin, baseline.sigStrikesLandedPerMin) + num(feature.takedownsPer15, baseline.takedownsPer15) * 0.55, 1.5, 7.5);
  const accuracyRaw = normalize(num(feature.sigStrikeAccuracyPct, baseline.sigStrikeAccuracyPct), 30, 62);
  const damageAbsorptionRaw = 100 - normalize(num(feature.sigStrikesAbsorbedPerMin, baseline.sigStrikesAbsorbedPerMin), 1.1, 6.5);

  const takedownOffenseRaw = normalize(num(feature.takedownsPer15, baseline.takedownsPer15), 0, 5) * 0.55 + normalize(num(feature.takedownAccuracyPct, baseline.takedownAccuracyPct), 15, 65) * 0.45;
  const takedownDefenseRaw = normalize(num(feature.takedownDefensePct, baseline.takedownDefensePct), 30, 92);
  const controlRaw = normalize(num(feature.controlTimePct, baseline.controlTimePct), 0, 55);
  const getUpsRaw = takedownDefenseRaw * 0.58 + (100 - controlRaw) * 0.42;
  const scrambleRaw = takedownDefenseRaw * 0.45 + getUpsRaw * 0.35 + normalize(num(feature.lateRoundPerformance, baseline.lateRoundPerformance), 30, 75) * 0.2;

  const submissionThreatRaw = normalize(num(feature.submissionAttemptsPer15, baseline.submissionAttemptsPer15), 0, 2.6) * 0.62 + controlRaw * 0.24 + takedownOffenseRaw * 0.14;
  const submissionDefenseRaw = takedownDefenseRaw * 0.44 + getUpsRaw * 0.36 + normalize(num(feature.roundsFought, 8), 0, 45) * 0.2;
  const topGameRaw = controlRaw * 0.58 + takedownOffenseRaw * 0.27 + submissionThreatRaw * 0.15;
  const bottomSurvivalRaw = getUpsRaw * 0.52 + submissionDefenseRaw * 0.48;

  const age = num(feature.age, 29);
  const ageDurabilityPenalty = age > 34 ? (age - 34) * 2.2 : 0;
  const koResistanceRaw = damageAbsorptionRaw * 0.72 + defenseRaw * 0.28 - ageDurabilityPenalty;
  const submissionResistanceRaw = submissionDefenseRaw * 0.7 + bottomSurvivalRaw * 0.3;
  const damageTrendRaw = 100 - normalize(num(feature.sigStrikesAbsorbedPerMin, baseline.sigStrikesAbsorbedPerMin) - num(feature.strikingDifferential, baseline.strikingDifferential), 0, 7);

  const earlyPaceRaw = volumeRaw * 0.68 + normalize(num(feature.recentFormScore, 50), 0, 1) * 0.32;
  const lateRoundRaw = normalize(num(feature.lateRoundPerformance, baseline.lateRoundPerformance), 25, 78) * 0.58 + normalize(num(feature.roundsFought, 8), 0, 55) * 0.42;
  const round3Raw = lateRoundRaw * 0.72 + damageTrendRaw * 0.28;
  const championshipRaw = normalize(num(feature.roundsFought, 8), 0, 80) * 0.45 + lateRoundRaw * 0.55;

  function finalSkill(raw: number) {
    return shrink(applyOpponentAdjustment(raw, feature, baseline), reliability, baseline.skill);
  }

  const coldStart = Boolean(feature.coldStartActive) || num(feature.ufcFights, 0) < 3 || num(feature.proFights, 0) < 8;

  return {
    fighterId: feature.fighterId,
    fightId: feature.fightId,
    asOf: feature.snapshotAt,
    fightDate: feature.fightDate,
    modelVersion: feature.modelVersion,
    weightClass: feature.weightClass ?? null,
    sampleQuality: quality,
    sampleReliability: reliability,
    leakageSafe: true,
    striking: {
      offense: finalSkill(offenseRaw),
      defense: finalSkill(defenseRaw),
      power: finalSkill(powerRaw),
      volume: finalSkill(volumeRaw),
      accuracy: finalSkill(accuracyRaw),
      damageAbsorption: finalSkill(damageAbsorptionRaw)
    },
    wrestling: {
      takedownOffense: finalSkill(takedownOffenseRaw),
      takedownDefense: finalSkill(takedownDefenseRaw),
      control: finalSkill(controlRaw),
      getUps: finalSkill(getUpsRaw),
      scramble: finalSkill(scrambleRaw)
    },
    grappling: {
      submissionThreat: finalSkill(submissionThreatRaw),
      submissionDefense: finalSkill(submissionDefenseRaw),
      topGame: finalSkill(topGameRaw),
      bottomSurvival: finalSkill(bottomSurvivalRaw)
    },
    durability: {
      koResistance: finalSkill(koResistanceRaw),
      submissionResistance: finalSkill(submissionResistanceRaw),
      damageTrend: finalSkill(damageTrendRaw)
    },
    cardio: {
      earlyPace: finalSkill(earlyPaceRaw),
      latePace: finalSkill(lateRoundRaw),
      round3: finalSkill(round3Raw),
      championshipRounds: finalSkill(championshipRaw)
    },
    prospect: {
      coldStartActive: coldStart,
      amateurSignal: prospectSignal(feature, "amateurSignal"),
      promotionTierSignal: prospectSignal(feature, "promotionTierSignal"),
      opponentStrengthSignal: opponentSignal(feature, baseline),
      confidenceCap: coldStartCap(feature)
    }
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
