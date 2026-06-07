import type { MlbEliteTeamRating } from "@/services/simulation/mlb-elite-rating-system";

export type MlbPitchType =
  | "FF"
  | "SI"
  | "FC"
  | "SL"
  | "ST"
  | "CU"
  | "KC"
  | "CH"
  | "FS"
  | "SPL"
  | "KN"
  | "OTHER";

export type MlbCountKey =
  | "0-0"
  | "0-1"
  | "0-2"
  | "1-0"
  | "1-1"
  | "1-2"
  | "2-0"
  | "2-1"
  | "2-2"
  | "3-0"
  | "3-1"
  | "3-2";

export type MlbBaseStateKey = "empty" | "1--" | "-2-" | "--3" | "12-" | "1-3" | "-23" | "123";
export type MlbBatterHand = "L" | "R" | "S";
export type MlbPitcherHand = "L" | "R";
export type MlbBatterArchetype = "POWER" | "CONTACT" | "PATIENT" | "SPEED" | "BALANCED";

export type MlbPitchMix = Partial<Record<MlbPitchType, number>>;
export type MlbCountMap<T> = Partial<Record<MlbCountKey, T>>;
export type MlbBaseStateMap<T> = Partial<Record<MlbBaseStateKey, T>>;
export type MlbHandMap<T> = Partial<Record<"L" | "R", T>>;

export type MlbSprayProfile = {
  pull: number;
  center: number;
  opposite: number;
  groundball: number;
  lineDrive: number;
  flyball: number;
  popup: number;
};

export type MlbMicroOutcomeRates = {
  walkRate: number;
  strikeoutRate: number;
  hitByPitchRate: number;
  ballInPlayRate: number;
  homeRunRate: number;
  extraBaseHitRate: number;
  groundballRate: number;
  lineDriveRate: number;
  flyballRate: number;
  hardHitRate: number;
  expectedWoba: number;
  expectedSlug: number;
};

export type MlbBatterMicroTendency = {
  mlbId: string | number;
  name: string;
  team: string;
  bats: MlbBatterHand;
  archetype?: MlbBatterArchetype;
  reliability?: number;
  plateAppearances?: number;
  pitchTypeRunValue?: Partial<Record<MlbPitchType, number>>;
  pitchTypeWhiffRate?: Partial<Record<MlbPitchType, number>>;
  pitchTypeHardHitRate?: Partial<Record<MlbPitchType, number>>;
  swingRateByCount?: MlbCountMap<number>;
  contactRateByCount?: MlbCountMap<number>;
  chaseRateByCount?: MlbCountMap<number>;
  outcomeByCount?: MlbCountMap<Partial<MlbMicroOutcomeRates>>;
  outcomeByBaseState?: MlbBaseStateMap<Partial<MlbMicroOutcomeRates>>;
  outcomeByPitcherHand?: MlbHandMap<Partial<MlbMicroOutcomeRates>>;
  sprayOverall?: Partial<MlbSprayProfile>;
  sprayByPitchType?: Partial<Record<MlbPitchType, Partial<MlbSprayProfile>>>;
  sprayByPitcherHand?: MlbHandMap<Partial<MlbSprayProfile>>;
  runnersOnBase?: Partial<Record<"any" | "risp" | "runnerOnFirst" | "runnerOnSecond" | "runnerOnThird" | "basesLoaded", Partial<MlbMicroOutcomeRates>>>;
  clutchIndex?: number;
  stolenBasePressure?: number;
};

export type MlbPitcherMicroTendency = {
  mlbId: string | number;
  name: string;
  team: string;
  throws: MlbPitcherHand;
  role?: "starter" | "reliever" | string | null;
  reliability?: number;
  battersFaced?: number;
  pitchMixOverall: MlbPitchMix;
  pitchMixByCount?: MlbCountMap<MlbPitchMix>;
  pitchMixByBatterHand?: MlbHandMap<MlbPitchMix>;
  pitchMixByBaseState?: MlbBaseStateMap<MlbPitchMix>;
  pitchRunValueAllowed?: Partial<Record<MlbPitchType, number>>;
  whiffRateByPitch?: Partial<Record<MlbPitchType, number>>;
  calledStrikeRateByPitch?: Partial<Record<MlbPitchType, number>>;
  groundballRateByPitch?: Partial<Record<MlbPitchType, number>>;
  hardHitRateAllowedByPitch?: Partial<Record<MlbPitchType, number>>;
  outcomeByCount?: MlbCountMap<Partial<MlbMicroOutcomeRates>>;
  outcomeByBaseState?: MlbBaseStateMap<Partial<MlbMicroOutcomeRates>>;
  outcomeByBatterHand?: MlbHandMap<Partial<MlbMicroOutcomeRates>>;
  holdRunnersScore?: number;
  tempoScore?: number;
  fatigueIndex?: number;
};

export type MlbMicroMatchupContext = {
  count: MlbCountKey;
  baseState: MlbBaseStateKey;
  outs?: 0 | 1 | 2;
  inning?: number;
  parkFactorRuns?: number;
  parkFactorHr?: number;
  weatherRunFactor?: number;
  umpireZoneFactor?: number;
};

export type MlbMicroMatchupProjection = {
  modelVersion: "mlb-micro-tendency-model-v1";
  batterId: string;
  batterName: string;
  pitcherId: string;
  pitcherName: string;
  count: MlbCountKey;
  baseState: MlbBaseStateKey;
  pitchMix: Record<MlbPitchType, number>;
  outcome: MlbMicroOutcomeRates;
  spray: MlbSprayProfile;
  runMultiplier: number;
  strikeoutMultiplier: number;
  walkMultiplier: number;
  homeRunMultiplier: number;
  groundballMultiplier: number;
  reliability: number;
  uncertainty: number;
  reasons: string[];
};

export type MlbMicroLineupAdjustment = {
  team: string;
  opponentPitcherId: string;
  opponentPitcherName: string;
  plateAppearanceCount: number;
  firstInningRunMultiplier: number;
  firstFiveRunMultiplier: number;
  strikeoutMultiplier: number;
  homeRunMultiplier: number;
  groundballMultiplier: number;
  pullAirMultiplier: number;
  reliability: number;
  uncertainty: number;
  keyMatchups: MlbMicroMatchupProjection[];
  warnings: string[];
};

export type MlbMicroGameAdjustment = {
  modelVersion: "mlb-micro-game-adjustment-v1";
  awayTeam: string;
  homeTeam: string;
  away: MlbMicroLineupAdjustment;
  home: MlbMicroLineupAdjustment;
  adjustedAwayRuns: number;
  adjustedHomeRuns: number;
  adjustedTotalRuns: number;
  adjustedFirstFiveTotalRuns: number;
  dataQuality: number;
  warnings: string[];
};

const PITCH_TYPES: MlbPitchType[] = ["FF", "SI", "FC", "SL", "ST", "CU", "KC", "CH", "FS", "SPL", "KN", "OTHER"];
const COUNT_KEYS: MlbCountKey[] = ["0-0", "0-1", "0-2", "1-0", "1-1", "1-2", "2-0", "2-1", "2-2", "3-0", "3-1", "3-2"];
const BASE_STATES: MlbBaseStateKey[] = ["empty", "1--", "-2-", "--3", "12-", "1-3", "-23", "123"];

const DEFAULT_SPRAY: MlbSprayProfile = {
  pull: 0.39,
  center: 0.35,
  opposite: 0.26,
  groundball: 0.43,
  lineDrive: 0.24,
  flyball: 0.28,
  popup: 0.05
};

const DEFAULT_OUTCOME: MlbMicroOutcomeRates = {
  walkRate: 0.085,
  strikeoutRate: 0.225,
  hitByPitchRate: 0.011,
  ballInPlayRate: 0.679,
  homeRunRate: 0.03,
  extraBaseHitRate: 0.078,
  groundballRate: 0.43,
  lineDriveRate: 0.24,
  flyballRate: 0.28,
  hardHitRate: 0.39,
  expectedWoba: 0.32,
  expectedSlug: 0.41
};

const COUNT_RUN_FACTOR: Record<MlbCountKey, number> = {
  "0-0": 1,
  "0-1": 0.91,
  "0-2": 0.74,
  "1-0": 1.09,
  "1-1": 0.99,
  "1-2": 0.81,
  "2-0": 1.22,
  "2-1": 1.13,
  "2-2": 0.9,
  "3-0": 1.34,
  "3-1": 1.28,
  "3-2": 1.06
};

const BASE_RUN_PRESSURE: Record<MlbBaseStateKey, number> = {
  empty: 1,
  "1--": 1.05,
  "-2-": 1.12,
  "--3": 1.17,
  "12-": 1.16,
  "1-3": 1.2,
  "-23": 1.24,
  "123": 1.31
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function safeNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function normalizeHand(value: MlbBatterHand): "L" | "R" {
  return value === "L" ? "L" : "R";
}

function normalizeMix(mix: MlbPitchMix | null | undefined): Record<MlbPitchType, number> {
  const raw = Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, Math.max(0, safeNumber(mix?.[pitch], 0))])) as Record<MlbPitchType, number>;
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { FF: 0.48, SI: 0.08, FC: 0.04, SL: 0.16, ST: 0.02, CU: 0.08, KC: 0.01, CH: 0.09, FS: 0.02, SPL: 0.01, KN: 0, OTHER: 0.01 };
  return Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, raw[pitch] / total])) as Record<MlbPitchType, number>;
}

function blendPitchMixes(parts: Array<{ mix?: MlbPitchMix | null; weight: number }>) {
  const out = Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, 0])) as Record<MlbPitchType, number>;
  let totalWeight = 0;
  for (const part of parts) {
    if (!part.mix || part.weight <= 0) continue;
    const normalized = normalizeMix(part.mix);
    totalWeight += part.weight;
    for (const pitch of PITCH_TYPES) out[pitch] += normalized[pitch] * part.weight;
  }
  if (totalWeight <= 0) return normalizeMix(null);
  for (const pitch of PITCH_TYPES) out[pitch] /= totalWeight;
  return normalizeMix(out);
}

function mergeOutcome(...parts: Array<{ outcome?: Partial<MlbMicroOutcomeRates> | null; weight: number }>): MlbMicroOutcomeRates {
  const output: Record<keyof MlbMicroOutcomeRates, number> = { ...DEFAULT_OUTCOME };
  const keys = Object.keys(DEFAULT_OUTCOME) as Array<keyof MlbMicroOutcomeRates>;
  for (const key of keys) {
    let numerator = DEFAULT_OUTCOME[key] * 0.35;
    let denominator = 0.35;
    for (const part of parts) {
      const value = part.outcome?.[key];
      if (typeof value === "number" && Number.isFinite(value) && part.weight > 0) {
        numerator += value * part.weight;
        denominator += part.weight;
      }
    }
    output[key] = numerator / denominator;
  }
  return normalizeOutcome(output as MlbMicroOutcomeRates);
}

function normalizeOutcome(outcome: MlbMicroOutcomeRates): MlbMicroOutcomeRates {
  const walkRate = clamp(outcome.walkRate, 0.025, 0.22);
  const strikeoutRate = clamp(outcome.strikeoutRate, 0.08, 0.42);
  const hitByPitchRate = clamp(outcome.hitByPitchRate, 0.002, 0.035);
  const homeRunRate = clamp(outcome.homeRunRate, 0.003, 0.115);
  const ballInPlayRate = clamp(1 - walkRate - strikeoutRate - hitByPitchRate, 0.42, 0.84);
  return {
    walkRate,
    strikeoutRate,
    hitByPitchRate,
    ballInPlayRate,
    homeRunRate,
    extraBaseHitRate: clamp(outcome.extraBaseHitRate, 0.025, 0.18),
    groundballRate: clamp(outcome.groundballRate, 0.22, 0.64),
    lineDriveRate: clamp(outcome.lineDriveRate, 0.14, 0.34),
    flyballRate: clamp(outcome.flyballRate, 0.13, 0.48),
    hardHitRate: clamp(outcome.hardHitRate, 0.18, 0.64),
    expectedWoba: clamp(outcome.expectedWoba, 0.22, 0.48),
    expectedSlug: clamp(outcome.expectedSlug, 0.26, 0.72)
  };
}

function normalizeSpray(profile: Partial<MlbSprayProfile> | null | undefined): MlbSprayProfile {
  const pull = clamp(safeNumber(profile?.pull, DEFAULT_SPRAY.pull), 0.12, 0.62);
  const center = clamp(safeNumber(profile?.center, DEFAULT_SPRAY.center), 0.12, 0.62);
  const opposite = clamp(safeNumber(profile?.opposite, DEFAULT_SPRAY.opposite), 0.1, 0.56);
  const sprayTotal = Math.max(0.001, pull + center + opposite);
  const groundball = clamp(safeNumber(profile?.groundball, DEFAULT_SPRAY.groundball), 0.18, 0.68);
  const lineDrive = clamp(safeNumber(profile?.lineDrive, DEFAULT_SPRAY.lineDrive), 0.12, 0.38);
  const flyball = clamp(safeNumber(profile?.flyball, DEFAULT_SPRAY.flyball), 0.1, 0.52);
  const popup = clamp(safeNumber(profile?.popup, DEFAULT_SPRAY.popup), 0.01, 0.16);
  const typeTotal = Math.max(0.001, groundball + lineDrive + flyball + popup);
  return {
    pull: pull / sprayTotal,
    center: center / sprayTotal,
    opposite: opposite / sprayTotal,
    groundball: groundball / typeTotal,
    lineDrive: lineDrive / typeTotal,
    flyball: flyball / typeTotal,
    popup: popup / typeTotal
  };
}

function blendSprays(parts: Array<{ profile?: Partial<MlbSprayProfile> | null; weight: number }>): MlbSprayProfile {
  let totalWeight = 0;
  const raw: MlbSprayProfile = { pull: 0, center: 0, opposite: 0, groundball: 0, lineDrive: 0, flyball: 0, popup: 0 };
  for (const part of parts) {
    if (!part.profile || part.weight <= 0) continue;
    const profile = normalizeSpray(part.profile);
    totalWeight += part.weight;
    raw.pull += profile.pull * part.weight;
    raw.center += profile.center * part.weight;
    raw.opposite += profile.opposite * part.weight;
    raw.groundball += profile.groundball * part.weight;
    raw.lineDrive += profile.lineDrive * part.weight;
    raw.flyball += profile.flyball * part.weight;
    raw.popup += profile.popup * part.weight;
  }
  if (totalWeight <= 0) return DEFAULT_SPRAY;
  return normalizeSpray({
    pull: raw.pull / totalWeight,
    center: raw.center / totalWeight,
    opposite: raw.opposite / totalWeight,
    groundball: raw.groundball / totalWeight,
    lineDrive: raw.lineDrive / totalWeight,
    flyball: raw.flyball / totalWeight,
    popup: raw.popup / totalWeight
  });
}

function baseSituationalKey(baseState: MlbBaseStateKey): keyof NonNullable<MlbBatterMicroTendency["runnersOnBase"]> | null {
  if (baseState === "123") return "basesLoaded";
  if (baseState.includes("2") || baseState.includes("3")) return "risp";
  if (baseState === "1--") return "runnerOnFirst";
  if (baseState === "-2-") return "runnerOnSecond";
  if (baseState === "--3") return "runnerOnThird";
  if (baseState !== "empty") return "any";
  return null;
}

function pitchTypeWeightedValue(mix: Record<MlbPitchType, number>, values: Partial<Record<MlbPitchType, number>> | undefined, fallback: number) {
  return PITCH_TYPES.reduce((sum, pitch) => sum + mix[pitch] * safeNumber(values?.[pitch], fallback), 0);
}

function pitchTypeSpray(batter: MlbBatterMicroTendency, mix: Record<MlbPitchType, number>) {
  const parts = PITCH_TYPES.map((pitch) => ({ profile: batter.sprayByPitchType?.[pitch], weight: mix[pitch] }));
  parts.push({ profile: batter.sprayOverall, weight: 0.65 });
  parts.push({ profile: batter.sprayByPitcherHand?.[normalizeHand(batter.bats)], weight: 0.18 });
  return blendSprays(parts);
}

function reliabilityOf(...values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!usable.length) return 0.35;
  return clamp(usable.reduce((sum, value) => sum + value, 0) / usable.length, 0.12, 0.98);
}

export function deriveMlbMicroMatchupProjection(args: {
  batter: MlbBatterMicroTendency;
  pitcher: MlbPitcherMicroTendency;
  context: MlbMicroMatchupContext;
}): MlbMicroMatchupProjection {
  const batterHand = normalizeHand(args.batter.bats);
  const pitchMix = blendPitchMixes([
    { mix: args.pitcher.pitchMixOverall, weight: 0.42 },
    { mix: args.pitcher.pitchMixByCount?.[args.context.count], weight: 0.24 },
    { mix: args.pitcher.pitchMixByBatterHand?.[batterHand], weight: 0.21 },
    { mix: args.pitcher.pitchMixByBaseState?.[args.context.baseState], weight: 0.13 }
  ]);
  const situation = baseSituationalKey(args.context.baseState);
  const batterOutcome = mergeOutcome(
    { outcome: args.batter.outcomeByCount?.[args.context.count], weight: 0.28 },
    { outcome: args.batter.outcomeByBaseState?.[args.context.baseState], weight: 0.22 },
    { outcome: args.batter.outcomeByPitcherHand?.[args.pitcher.throws], weight: 0.22 },
    { outcome: situation ? args.batter.runnersOnBase?.[situation] : null, weight: 0.18 }
  );
  const pitcherOutcome = mergeOutcome(
    { outcome: args.pitcher.outcomeByCount?.[args.context.count], weight: 0.32 },
    { outcome: args.pitcher.outcomeByBaseState?.[args.context.baseState], weight: 0.22 },
    { outcome: args.pitcher.outcomeByBatterHand?.[batterHand], weight: 0.26 }
  );
  const hitterRunValue = pitchTypeWeightedValue(pitchMix, args.batter.pitchTypeRunValue, 0);
  const pitcherRunValueAllowed = pitchTypeWeightedValue(pitchMix, args.pitcher.pitchRunValueAllowed, 0);
  const runValueEdge = clamp((hitterRunValue - pitcherRunValueAllowed) / 6, -0.18, 0.18);
  const pitcherWhiff = pitchTypeWeightedValue(pitchMix, args.pitcher.whiffRateByPitch, DEFAULT_OUTCOME.strikeoutRate);
  const hitterWhiff = pitchTypeWeightedValue(pitchMix, args.batter.pitchTypeWhiffRate, DEFAULT_OUTCOME.strikeoutRate);
  const whiffPressure = clamp((pitcherWhiff + hitterWhiff - DEFAULT_OUTCOME.strikeoutRate * 2) * 0.48, -0.08, 0.1);
  const pitcherHardHit = pitchTypeWeightedValue(pitchMix, args.pitcher.hardHitRateAllowedByPitch, DEFAULT_OUTCOME.hardHitRate);
  const hitterHardHit = pitchTypeWeightedValue(pitchMix, args.batter.pitchTypeHardHitRate, DEFAULT_OUTCOME.hardHitRate);
  const hardHitPressure = clamp((pitcherHardHit + hitterHardHit - DEFAULT_OUTCOME.hardHitRate * 2) * 0.34, -0.08, 0.1);
  const calledStrikePressure = clamp((pitchTypeWeightedValue(pitchMix, args.pitcher.calledStrikeRateByPitch, 0.17) - 0.17) * 0.3, -0.035, 0.035);
  const countFactor = COUNT_RUN_FACTOR[args.context.count] ?? 1;
  const baseFactor = BASE_RUN_PRESSURE[args.context.baseState] ?? 1;
  const parkFactorRuns = clamp(safeNumber(args.context.parkFactorRuns, 1), 0.84, 1.18);
  const parkFactorHr = clamp(safeNumber(args.context.parkFactorHr, 1), 0.78, 1.25);
  const weatherFactor = clamp(safeNumber(args.context.weatherRunFactor, 1), 0.86, 1.16);
  const umpireZone = clamp(safeNumber(args.context.umpireZoneFactor, 1), 0.9, 1.1);
  const archetypePower = args.batter.archetype === "POWER" ? 0.025 : args.batter.archetype === "CONTACT" ? -0.012 : 0;
  const archetypeContact = args.batter.archetype === "CONTACT" ? -0.028 : args.batter.archetype === "POWER" ? 0.018 : 0;
  const clutch = clamp((safeNumber(args.batter.clutchIndex, 1) - 1) * (baseFactor - 1) * 0.12, -0.035, 0.045);

  const outcome = normalizeOutcome({
    walkRate: (batterOutcome.walkRate * 0.52 + pitcherOutcome.walkRate * 0.48) * (args.context.count.startsWith("3-") ? 1.18 : args.context.count.endsWith("2") ? 0.82 : 1) / umpireZone,
    strikeoutRate: clamp((batterOutcome.strikeoutRate * 0.52 + pitcherOutcome.strikeoutRate * 0.48) + whiffPressure + calledStrikePressure + archetypeContact, 0.08, 0.42),
    hitByPitchRate: batterOutcome.hitByPitchRate * 0.45 + pitcherOutcome.hitByPitchRate * 0.55,
    ballInPlayRate: DEFAULT_OUTCOME.ballInPlayRate,
    homeRunRate: clamp((batterOutcome.homeRunRate * 0.55 + pitcherOutcome.homeRunRate * 0.45) * parkFactorHr + hardHitPressure * 0.08 + archetypePower + runValueEdge * 0.08, 0.003, 0.115),
    extraBaseHitRate: clamp((batterOutcome.extraBaseHitRate * 0.58 + pitcherOutcome.extraBaseHitRate * 0.42) * parkFactorRuns + hardHitPressure * 0.12, 0.025, 0.18),
    groundballRate: batterOutcome.groundballRate * 0.5 + pitcherOutcome.groundballRate * 0.5,
    lineDriveRate: batterOutcome.lineDriveRate * 0.55 + pitcherOutcome.lineDriveRate * 0.45,
    flyballRate: batterOutcome.flyballRate * 0.52 + pitcherOutcome.flyballRate * 0.48,
    hardHitRate: clamp((batterOutcome.hardHitRate * 0.55 + pitcherOutcome.hardHitRate * 0.45) + hardHitPressure, 0.18, 0.64),
    expectedWoba: clamp((batterOutcome.expectedWoba * 0.54 + pitcherOutcome.expectedWoba * 0.46) * countFactor * baseFactor * parkFactorRuns * weatherFactor + runValueEdge + clutch, 0.22, 0.48),
    expectedSlug: clamp((batterOutcome.expectedSlug * 0.55 + pitcherOutcome.expectedSlug * 0.45) * countFactor * parkFactorHr * weatherFactor + runValueEdge * 1.8 + clutch, 0.26, 0.72)
  });
  const spray = pitchTypeSpray(args.batter, pitchMix);
  const runMultiplier = clamp((outcome.expectedWoba / DEFAULT_OUTCOME.expectedWoba) * 0.72 + (outcome.expectedSlug / DEFAULT_OUTCOME.expectedSlug) * 0.22 + (1 - outcome.strikeoutRate / DEFAULT_OUTCOME.strikeoutRate) * 0.06, 0.62, 1.46);
  const reliability = reliabilityOf(args.batter.reliability, args.pitcher.reliability) * clamp((safeNumber(args.batter.plateAppearances, 100) / 450) * 0.35 + (safeNumber(args.pitcher.battersFaced, 150) / 600) * 0.35 + 0.3, 0.45, 1);
  const uncertainty = clamp(1 - reliability + (args.batter.pitchTypeRunValue ? 0 : 0.08) + (args.pitcher.pitchMixByCount ? 0 : 0.08), 0.04, 0.78);

  return {
    modelVersion: "mlb-micro-tendency-model-v1",
    batterId: String(args.batter.mlbId),
    batterName: args.batter.name,
    pitcherId: String(args.pitcher.mlbId),
    pitcherName: args.pitcher.name,
    count: args.context.count,
    baseState: args.context.baseState,
    pitchMix: Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, round(pitchMix[pitch], 5)])) as Record<MlbPitchType, number>,
    outcome: Object.fromEntries(Object.entries(outcome).map(([key, value]) => [key, round(value, 5)])) as MlbMicroOutcomeRates,
    spray: Object.fromEntries(Object.entries(spray).map(([key, value]) => [key, round(value, 5)])) as MlbSprayProfile,
    runMultiplier: round(runMultiplier, 4),
    strikeoutMultiplier: round(clamp(outcome.strikeoutRate / DEFAULT_OUTCOME.strikeoutRate, 0.55, 1.65), 4),
    walkMultiplier: round(clamp(outcome.walkRate / DEFAULT_OUTCOME.walkRate, 0.45, 1.85), 4),
    homeRunMultiplier: round(clamp(outcome.homeRunRate / DEFAULT_OUTCOME.homeRunRate, 0.22, 2.35), 4),
    groundballMultiplier: round(clamp(outcome.groundballRate / DEFAULT_OUTCOME.groundballRate, 0.55, 1.55), 4),
    reliability: round(reliability, 4),
    uncertainty: round(uncertainty, 4),
    reasons: [
      `Pitch mix blended from overall, count ${args.context.count}, batter hand ${batterHand}, and base state ${args.context.baseState}.`,
      `Run value edge ${(runValueEdge * 100).toFixed(1)} points after hitter pitch-type strengths and pitcher pitch-type allowed values.`,
      `Expected wOBA ${outcome.expectedWoba.toFixed(3)} and expected SLG ${outcome.expectedSlug.toFixed(3)} drive the micro run multiplier.`
    ]
  };
}

function playerNameKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function findBatter(team: MlbEliteTeamRating, tendencies: MlbBatterMicroTendency[], entry: Record<string, unknown>) {
  const id = String(entry.playerId ?? entry.id ?? entry.mlbId ?? "").trim();
  const name = playerNameKey(entry.playerName ?? entry.name ?? "");
  return tendencies.find((row) => row.team.toUpperCase() === team.team.toUpperCase() && ((id && String(row.mlbId) === id) || (name && playerNameKey(row.name) === name))) ?? null;
}

function lineupEntries(team: MlbEliteTeamRating) {
  const order = team.context.lineup?.batting_order_json;
  return Array.isArray(order) ? order.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry))).slice(0, 9) : [];
}

function findPitcher(team: MlbEliteTeamRating, tendencies: MlbPitcherMicroTendency[]) {
  const id = String(team.context.lineup?.starting_pitcher_id ?? "").trim();
  const name = playerNameKey(team.context.lineup?.starting_pitcher_name ?? "");
  return tendencies.find((row) => row.team.toUpperCase() === team.team.toUpperCase() && ((id && String(row.mlbId) === id) || (name && playerNameKey(row.name) === name)))
    ?? tendencies.filter((row) => row.team.toUpperCase() === team.team.toUpperCase() && String(row.role ?? "").toLowerCase().includes("start"))[0]
    ?? null;
}

function weightedAverage(values: Array<{ value: number; weight: number }>, fallback = 1) {
  const usable = values.filter((row) => Number.isFinite(row.value) && row.weight > 0);
  if (!usable.length) return fallback;
  return usable.reduce((sum, row) => sum + row.value * row.weight, 0) / usable.reduce((sum, row) => sum + row.weight, 0);
}

function lineupContexts(): Array<{ count: MlbCountKey; baseState: MlbBaseStateKey; weight: number; firstInningWeight: number }> {
  return [
    { count: "0-0", baseState: "empty", weight: 0.24, firstInningWeight: 0.58 },
    { count: "1-1", baseState: "empty", weight: 0.18, firstInningWeight: 0.18 },
    { count: "2-1", baseState: "1--", weight: 0.14, firstInningWeight: 0.08 },
    { count: "1-2", baseState: "empty", weight: 0.12, firstInningWeight: 0.08 },
    { count: "2-2", baseState: "1--", weight: 0.1, firstInningWeight: 0.04 },
    { count: "3-2", baseState: "-2-", weight: 0.08, firstInningWeight: 0.02 },
    { count: "1-0", baseState: "12-", weight: 0.06, firstInningWeight: 0.01 },
    { count: "0-1", baseState: "empty", weight: 0.05, firstInningWeight: 0.01 },
    { count: "3-1", baseState: "1-3", weight: 0.03, firstInningWeight: 0 }
  ];
}

export function deriveMlbMicroLineupAdjustment(args: {
  battingTeam: MlbEliteTeamRating;
  pitchingTeam: MlbEliteTeamRating;
  batterTendencies: MlbBatterMicroTendency[];
  pitcherTendencies: MlbPitcherMicroTendency[];
  parkFactorRuns?: number;
  parkFactorHr?: number;
  weatherRunFactor?: number;
  umpireZoneFactor?: number;
}): MlbMicroLineupAdjustment {
  const starter = findPitcher(args.pitchingTeam, args.pitcherTendencies);
  const entries = lineupEntries(args.battingTeam);
  const warnings: string[] = [];
  if (!starter) warnings.push(`${args.pitchingTeam.team} starter missing from pitcher micro tendency feed.`);
  if (entries.length < 9) warnings.push(`${args.battingTeam.team} lineup has only ${entries.length}/9 entries for micro tendency model.`);
  const batters = entries.map((entry) => findBatter(args.battingTeam, args.batterTendencies, entry)).filter((row): row is MlbBatterMicroTendency => Boolean(row));
  if (batters.length < 7) warnings.push(`${args.battingTeam.team} has only ${batters.length}/9 hitters matched in micro tendency feed.`);
  if (!starter || !batters.length) {
    return {
      team: args.battingTeam.team,
      opponentPitcherId: starter ? String(starter.mlbId) : "",
      opponentPitcherName: starter?.name ?? "unknown",
      plateAppearanceCount: batters.length,
      firstInningRunMultiplier: 1,
      firstFiveRunMultiplier: 1,
      strikeoutMultiplier: 1,
      homeRunMultiplier: 1,
      groundballMultiplier: 1,
      pullAirMultiplier: 1,
      reliability: 0.25,
      uncertainty: 0.75,
      keyMatchups: [],
      warnings
    };
  }

  const contexts = lineupContexts();
  const matchupRows: Array<{ row: MlbMicroMatchupProjection; lineupWeight: number; firstInningWeight: number; f5Weight: number }> = [];
  batters.slice(0, 9).forEach((batter, index) => {
    const lineupWeight = Math.max(0.52, 1.12 - index * 0.07);
    for (const context of contexts) {
      const row = deriveMlbMicroMatchupProjection({
        batter,
        pitcher: starter,
        context: {
          count: context.count,
          baseState: context.baseState,
          parkFactorRuns: args.parkFactorRuns,
          parkFactorHr: args.parkFactorHr,
          weatherRunFactor: args.weatherRunFactor,
          umpireZoneFactor: args.umpireZoneFactor
        }
      });
      matchupRows.push({ row, lineupWeight, firstInningWeight: context.firstInningWeight * (index <= 2 ? 1.4 : index <= 4 ? 0.35 : 0.08), f5Weight: context.weight * lineupWeight });
    }
  });

  const firstInningRunMultiplier = weightedAverage(matchupRows.map((item) => ({ value: item.row.runMultiplier, weight: item.firstInningWeight })), 1);
  const firstFiveRunMultiplier = weightedAverage(matchupRows.map((item) => ({ value: item.row.runMultiplier, weight: item.f5Weight })), 1);
  const strikeoutMultiplier = weightedAverage(matchupRows.map((item) => ({ value: item.row.strikeoutMultiplier, weight: item.f5Weight })), 1);
  const homeRunMultiplier = weightedAverage(matchupRows.map((item) => ({ value: item.row.homeRunMultiplier, weight: item.f5Weight })), 1);
  const groundballMultiplier = weightedAverage(matchupRows.map((item) => ({ value: item.row.groundballMultiplier, weight: item.f5Weight })), 1);
  const pullAirMultiplier = weightedAverage(matchupRows.map((item) => ({ value: (item.row.spray.pull * (item.row.spray.flyball + item.row.spray.lineDrive)) / (DEFAULT_SPRAY.pull * (DEFAULT_SPRAY.flyball + DEFAULT_SPRAY.lineDrive)), weight: item.f5Weight })), 1);
  const reliability = weightedAverage(matchupRows.map((item) => ({ value: item.row.reliability, weight: item.f5Weight })), 0.45);
  const uncertainty = weightedAverage(matchupRows.map((item) => ({ value: item.row.uncertainty, weight: item.f5Weight })), 0.5);
  const keyMatchups = matchupRows
    .slice()
    .sort((a, b) => Math.abs(b.row.runMultiplier - 1) - Math.abs(a.row.runMultiplier - 1))
    .slice(0, 6)
    .map((item) => item.row);

  return {
    team: args.battingTeam.team,
    opponentPitcherId: String(starter.mlbId),
    opponentPitcherName: starter.name,
    plateAppearanceCount: batters.length,
    firstInningRunMultiplier: round(clamp(firstInningRunMultiplier, 0.7, 1.34), 4),
    firstFiveRunMultiplier: round(clamp(firstFiveRunMultiplier, 0.72, 1.3), 4),
    strikeoutMultiplier: round(clamp(strikeoutMultiplier, 0.62, 1.48), 4),
    homeRunMultiplier: round(clamp(homeRunMultiplier, 0.45, 1.95), 4),
    groundballMultiplier: round(clamp(groundballMultiplier, 0.65, 1.42), 4),
    pullAirMultiplier: round(clamp(pullAirMultiplier, 0.55, 1.8), 4),
    reliability: round(clamp(reliability, 0.12, 0.98), 4),
    uncertainty: round(clamp(uncertainty, 0.04, 0.82), 4),
    keyMatchups,
    warnings
  };
}

export function deriveMlbMicroGameAdjustment(args: {
  away: MlbEliteTeamRating;
  home: MlbEliteTeamRating;
  batterTendencies: MlbBatterMicroTendency[];
  pitcherTendencies: MlbPitcherMicroTendency[];
  baseAwayRuns: number;
  baseHomeRuns: number;
  parkFactorRuns?: number;
  parkFactorHr?: number;
  weatherRunFactor?: number;
  umpireZoneFactor?: number;
}): MlbMicroGameAdjustment {
  const away = deriveMlbMicroLineupAdjustment({
    battingTeam: args.away,
    pitchingTeam: args.home,
    batterTendencies: args.batterTendencies,
    pitcherTendencies: args.pitcherTendencies,
    parkFactorRuns: args.parkFactorRuns,
    parkFactorHr: args.parkFactorHr,
    weatherRunFactor: args.weatherRunFactor,
    umpireZoneFactor: args.umpireZoneFactor
  });
  const home = deriveMlbMicroLineupAdjustment({
    battingTeam: args.home,
    pitchingTeam: args.away,
    batterTendencies: args.batterTendencies,
    pitcherTendencies: args.pitcherTendencies,
    parkFactorRuns: args.parkFactorRuns,
    parkFactorHr: args.parkFactorHr,
    weatherRunFactor: args.weatherRunFactor,
    umpireZoneFactor: args.umpireZoneFactor
  });
  const adjustedAwayRuns = args.baseAwayRuns * away.firstFiveRunMultiplier * 0.62 + args.baseAwayRuns * away.firstInningRunMultiplier * 0.08 + args.baseAwayRuns * 0.3;
  const adjustedHomeRuns = args.baseHomeRuns * home.firstFiveRunMultiplier * 0.62 + args.baseHomeRuns * home.firstInningRunMultiplier * 0.08 + args.baseHomeRuns * 0.3;
  const reliability = (away.reliability + home.reliability) / 2;
  const uncertainty = (away.uncertainty + home.uncertainty) / 2;
  const dataQuality = clamp(100 * (reliability * 0.72 + (1 - uncertainty) * 0.28), 0, 100);
  const warnings = [...away.warnings, ...home.warnings];
  if (dataQuality < 60) warnings.push("Micro tendency data quality is below betting-grade threshold.");

  return {
    modelVersion: "mlb-micro-game-adjustment-v1",
    awayTeam: args.away.team,
    homeTeam: args.home.team,
    away,
    home,
    adjustedAwayRuns: round(adjustedAwayRuns, 3),
    adjustedHomeRuns: round(adjustedHomeRuns, 3),
    adjustedTotalRuns: round(adjustedAwayRuns + adjustedHomeRuns, 3),
    adjustedFirstFiveTotalRuns: round((args.baseAwayRuns * away.firstFiveRunMultiplier + args.baseHomeRuns * home.firstFiveRunMultiplier) * 5 / 9, 3),
    dataQuality: round(dataQuality, 1),
    warnings
  };
}

export function listMlbMicroRequiredVariables() {
  return {
    pitchContext: {
      counts: COUNT_KEYS,
      baseStates: BASE_STATES,
      pitchTypes: PITCH_TYPES
    },
    hitterVariables: [
      "bats",
      "archetype",
      "pitchTypeRunValue",
      "pitchTypeWhiffRate",
      "pitchTypeHardHitRate",
      "swingRateByCount",
      "contactRateByCount",
      "chaseRateByCount",
      "outcomeByCount",
      "outcomeByBaseState",
      "outcomeByPitcherHand",
      "sprayOverall",
      "sprayByPitchType",
      "sprayByPitcherHand",
      "runnersOnBase",
      "clutchIndex",
      "stolenBasePressure"
    ],
    pitcherVariables: [
      "throws",
      "pitchMixOverall",
      "pitchMixByCount",
      "pitchMixByBatterHand",
      "pitchMixByBaseState",
      "pitchRunValueAllowed",
      "whiffRateByPitch",
      "calledStrikeRateByPitch",
      "groundballRateByPitch",
      "hardHitRateAllowedByPitch",
      "outcomeByCount",
      "outcomeByBaseState",
      "outcomeByBatterHand",
      "holdRunnersScore",
      "tempoScore",
      "fatigueIndex"
    ]
  };
}
