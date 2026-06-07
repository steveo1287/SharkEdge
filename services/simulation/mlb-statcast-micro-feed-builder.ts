import type {
  MlbBaseStateKey,
  MlbBatterArchetype,
  MlbBatterMicroTendency,
  MlbCountKey,
  MlbMicroOutcomeRates,
  MlbPitcherMicroTendency,
  MlbPitchMix,
  MlbPitchType,
  MlbSprayProfile
} from "@/services/simulation/mlb-micro-tendency-model";

export type MlbStatcastPitchRow = Record<string, string | number | null | undefined>;

export type MlbStatcastMicroFeedBuildOptions = {
  minBatterPitches?: number;
  minPitcherPitches?: number;
  minTerminalEvents?: number;
  generatedAt?: string;
  sourceLabel?: string;
};

export type MlbStatcastMicroFeedBuild = {
  modelVersion: "mlb-statcast-micro-feed-builder-v1";
  sourceLabel: string;
  generatedAt: string;
  batters: MlbBatterMicroTendency[];
  pitchers: MlbPitcherMicroTendency[];
  diagnostics: {
    rawRows: number;
    usableRows: number;
    batterCount: number;
    pitcherCount: number;
    terminalPitchRows: number;
    battedBallRows: number;
    skippedRows: number;
  };
  warnings: string[];
};

type MutableOutcome = {
  pa: number;
  walks: number;
  strikeouts: number;
  hbp: number;
  bip: number;
  hr: number;
  xbh: number;
  groundball: number;
  lineDrive: number;
  flyball: number;
  hardHit: number;
  xwobaSum: number;
  xwobaCount: number;
  xslgSum: number;
  xslgCount: number;
};

type MutableSpray = {
  battedBalls: number;
  pull: number;
  center: number;
  opposite: number;
  groundball: number;
  lineDrive: number;
  flyball: number;
  popup: number;
};

type PitchValueBucket = {
  count: number;
  sum: number;
};

type BatterAgg = {
  id: string;
  name: string;
  team: string;
  bats: "L" | "R" | "S";
  pitches: number;
  terminalEvents: number;
  pitchTypeRunValue: Record<MlbPitchType, PitchValueBucket>;
  pitchTypeWhiff: Record<MlbPitchType, { whiffs: number; swings: number }>;
  pitchTypeHardHit: Record<MlbPitchType, { hardHit: number; battedBalls: number }>;
  swingByCount: Record<MlbCountKey, { swings: number; pitches: number }>;
  contactByCount: Record<MlbCountKey, { contact: number; swings: number }>;
  chaseByCount: Record<MlbCountKey, { chases: number; pitches: number }>;
  outcomeByCount: Record<MlbCountKey, MutableOutcome>;
  outcomeByBaseState: Record<MlbBaseStateKey, MutableOutcome>;
  outcomeByPitcherHand: Record<"L" | "R", MutableOutcome>;
  sprayOverall: MutableSpray;
  sprayByPitchType: Record<MlbPitchType, MutableSpray>;
  sprayByPitcherHand: Record<"L" | "R", MutableSpray>;
  runnersOnBase: Record<"any" | "risp" | "runnerOnFirst" | "runnerOnSecond" | "runnerOnThird" | "basesLoaded", MutableOutcome>;
};

type PitcherAgg = {
  id: string;
  name: string;
  team: string;
  throws: "L" | "R";
  pitches: number;
  terminalEvents: number;
  pitchMixOverall: Record<MlbPitchType, number>;
  pitchMixByCount: Record<MlbCountKey, Record<MlbPitchType, number>>;
  pitchMixByBatterHand: Record<"L" | "R", Record<MlbPitchType, number>>;
  pitchMixByBaseState: Record<MlbBaseStateKey, Record<MlbPitchType, number>>;
  pitchRunValueAllowed: Record<MlbPitchType, PitchValueBucket>;
  whiffByPitch: Record<MlbPitchType, { whiffs: number; swings: number }>;
  calledStrikeByPitch: Record<MlbPitchType, { called: number; pitches: number }>;
  groundballByPitch: Record<MlbPitchType, { groundballs: number; battedBalls: number }>;
  hardHitByPitch: Record<MlbPitchType, { hardHit: number; battedBalls: number }>;
  outcomeByCount: Record<MlbCountKey, MutableOutcome>;
  outcomeByBaseState: Record<MlbBaseStateKey, MutableOutcome>;
  outcomeByBatterHand: Record<"L" | "R", MutableOutcome>;
};

const PITCH_TYPES: MlbPitchType[] = ["FF", "SI", "FC", "SL", "ST", "CU", "KC", "CH", "FS", "SPL", "KN", "OTHER"];
const COUNTS: MlbCountKey[] = ["0-0", "0-1", "0-2", "1-0", "1-1", "1-2", "2-0", "2-1", "2-2", "3-0", "3-1", "3-2"];
const BASES: MlbBaseStateKey[] = ["empty", "1--", "-2-", "--3", "12-", "1-3", "-23", "123"];

function emptyOutcome(): MutableOutcome {
  return { pa: 0, walks: 0, strikeouts: 0, hbp: 0, bip: 0, hr: 0, xbh: 0, groundball: 0, lineDrive: 0, flyball: 0, hardHit: 0, xwobaSum: 0, xwobaCount: 0, xslgSum: 0, xslgCount: 0 };
}

function emptySpray(): MutableSpray {
  return { battedBalls: 0, pull: 0, center: 0, opposite: 0, groundball: 0, lineDrive: 0, flyball: 0, popup: 0 };
}

function pitchValueBuckets(): Record<MlbPitchType, PitchValueBucket> {
  return Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, { count: 0, sum: 0 }])) as Record<MlbPitchType, PitchValueBucket>;
}

function pitchCounter(): Record<MlbPitchType, number> {
  return Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, 0])) as Record<MlbPitchType, number>;
}

function countPitchCounters(): Record<MlbCountKey, Record<MlbPitchType, number>> {
  return Object.fromEntries(COUNTS.map((count) => [count, pitchCounter()])) as Record<MlbCountKey, Record<MlbPitchType, number>>;
}

function basePitchCounters(): Record<MlbBaseStateKey, Record<MlbPitchType, number>> {
  return Object.fromEntries(BASES.map((base) => [base, pitchCounter()])) as Record<MlbBaseStateKey, Record<MlbPitchType, number>>;
}

function outcomeByCount(): Record<MlbCountKey, MutableOutcome> {
  return Object.fromEntries(COUNTS.map((count) => [count, emptyOutcome()])) as Record<MlbCountKey, MutableOutcome>;
}

function outcomeByBase(): Record<MlbBaseStateKey, MutableOutcome> {
  return Object.fromEntries(BASES.map((base) => [base, emptyOutcome()])) as Record<MlbBaseStateKey, MutableOutcome>;
}

function sprayByPitch(): Record<MlbPitchType, MutableSpray> {
  return Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, emptySpray()])) as Record<MlbPitchType, MutableSpray>;
}

function countRateBuckets() {
  return Object.fromEntries(COUNTS.map((count) => [count, { swings: 0, pitches: 0, contact: 0, chases: 0 }])) as Record<MlbCountKey, { swings: number; pitches: number; contact: number; chases: number }>;
}

function asString(row: MlbStatcastPitchRow, key: string) {
  const value = row[key];
  return value == null ? "" : String(value).trim();
}

function asNumber(row: MlbStatcastPitchRow, key: string): number | null {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  return null;
}

function normalizePitchType(value: string): MlbPitchType {
  const pitch = value.trim().toUpperCase();
  if (pitch === "FT") return "SI";
  if (pitch === "SV") return "ST";
  if (pitch === "CS") return "KC";
  if (pitch === "FO") return "SPL";
  return PITCH_TYPES.includes(pitch as MlbPitchType) ? pitch as MlbPitchType : "OTHER";
}

function hand(value: string, fallback: "L" | "R" = "R"): "L" | "R" {
  const clean = value.trim().toUpperCase();
  return clean === "L" ? "L" : clean === "R" ? "R" : fallback;
}

function batterHand(value: string): "L" | "R" | "S" {
  const clean = value.trim().toUpperCase();
  return clean === "L" ? "L" : clean === "S" ? "S" : "R";
}

function countKey(row: MlbStatcastPitchRow): MlbCountKey | null {
  const balls = asNumber(row, "balls");
  const strikes = asNumber(row, "strikes");
  const key = `${Math.max(0, Math.min(3, balls ?? 0))}-${Math.max(0, Math.min(2, strikes ?? 0))}`;
  return COUNTS.includes(key as MlbCountKey) ? key as MlbCountKey : null;
}

function hasRunner(row: MlbStatcastPitchRow, base: "on_1b" | "on_2b" | "on_3b") {
  const value = asString(row, base);
  return Boolean(value && value !== "0" && value.toLowerCase() !== "null" && value.toLowerCase() !== "none");
}

function baseState(row: MlbStatcastPitchRow): MlbBaseStateKey {
  const first = hasRunner(row, "on_1b");
  const second = hasRunner(row, "on_2b");
  const third = hasRunner(row, "on_3b");
  if (first && second && third) return "123";
  if (first && second) return "12-";
  if (first && third) return "1-3";
  if (second && third) return "-23";
  if (first) return "1--";
  if (second) return "-2-";
  if (third) return "--3";
  return "empty";
}

function runnerSituation(base: MlbBaseStateKey): keyof BatterAgg["runnersOnBase"] | null {
  if (base === "123") return "basesLoaded";
  if (base.includes("2") || base.includes("3")) return "risp";
  if (base === "1--") return "runnerOnFirst";
  if (base === "-2-") return "runnerOnSecond";
  if (base === "--3") return "runnerOnThird";
  if (base !== "empty") return "any";
  return null;
}

function eventName(row: MlbStatcastPitchRow) {
  return asString(row, "events").toLowerCase();
}

function description(row: MlbStatcastPitchRow) {
  return asString(row, "description").toLowerCase();
}

function isTerminal(row: MlbStatcastPitchRow) {
  return Boolean(eventName(row));
}

function isSwing(row: MlbStatcastPitchRow) {
  const desc = description(row);
  const type = asString(row, "type").toUpperCase();
  return type === "X" || desc.includes("swing") || desc.includes("foul") || desc.includes("hit_into_play");
}

function isWhiff(row: MlbStatcastPitchRow) {
  const desc = description(row);
  return desc.includes("swinging_strike") || desc === "foul_tip";
}

function isContact(row: MlbStatcastPitchRow) {
  const desc = description(row);
  const type = asString(row, "type").toUpperCase();
  return type === "X" || desc.includes("foul") || desc.includes("hit_into_play");
}

function isCalledStrike(row: MlbStatcastPitchRow) {
  return description(row) === "called_strike";
}

function isChase(row: MlbStatcastPitchRow) {
  const zone = asNumber(row, "zone");
  return isSwing(row) && zone != null && zone > 9;
}

function battedBallType(row: MlbStatcastPitchRow) {
  return asString(row, "bb_type").toLowerCase();
}

function isBattedBall(row: MlbStatcastPitchRow) {
  return asString(row, "type").toUpperCase() === "X" || Boolean(battedBallType(row));
}

function isHardHit(row: MlbStatcastPitchRow) {
  return (asNumber(row, "launch_speed") ?? 0) >= 95;
}

function isExtraBaseHit(event: string) {
  return event === "double" || event === "triple" || event === "home_run";
}

function plateAppearanceOutcome(row: MlbStatcastPitchRow, target: MutableOutcome) {
  const event = eventName(row);
  if (!event) return;
  target.pa += 1;
  if (event === "walk" || event === "intent_walk" || event === "intentional_walk") target.walks += 1;
  if (event === "strikeout" || event === "strikeout_double_play") target.strikeouts += 1;
  if (event === "hit_by_pitch") target.hbp += 1;
  if (event === "home_run") target.hr += 1;
  if (isExtraBaseHit(event)) target.xbh += 1;
  if (isBattedBall(row)) target.bip += 1;
  if (battedBallType(row) === "ground_ball") target.groundball += 1;
  if (battedBallType(row) === "line_drive") target.lineDrive += 1;
  if (battedBallType(row) === "fly_ball") target.flyball += 1;
  if (isHardHit(row)) target.hardHit += 1;
  const xwoba = asNumber(row, "estimated_woba_using_speedangle") ?? asNumber(row, "woba_value");
  if (xwoba != null) {
    target.xwobaSum += xwoba;
    target.xwobaCount += 1;
  }
  const xslg = asNumber(row, "estimated_slg_using_speedangle") ?? asNumber(row, "iso_value");
  if (xslg != null) {
    target.xslgSum += xslg;
    target.xslgCount += 1;
  }
}

function addSpray(row: MlbStatcastPitchRow, spray: MutableSpray) {
  if (!isBattedBall(row)) return;
  spray.battedBalls += 1;
  const hcX = asNumber(row, "hc_x");
  if (hcX != null) {
    if (hcX < 115) spray.pull += 1;
    else if (hcX > 170) spray.opposite += 1;
    else spray.center += 1;
  } else {
    spray.center += 1;
  }
  const bb = battedBallType(row);
  if (bb === "ground_ball") spray.groundball += 1;
  else if (bb === "line_drive") spray.lineDrive += 1;
  else if (bb === "fly_ball") spray.flyball += 1;
  else if (bb === "popup") spray.popup += 1;
}

function rate(numerator: number, denominator: number, fallback: number) {
  return denominator > 0 ? numerator / denominator : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function finalizeOutcome(out: MutableOutcome): Partial<MlbMicroOutcomeRates> {
  if (out.pa <= 0) return {};
  const bipDenom = Math.max(1, out.bip);
  return {
    walkRate: round(rate(out.walks, out.pa, 0.085), 5),
    strikeoutRate: round(rate(out.strikeouts, out.pa, 0.225), 5),
    hitByPitchRate: round(rate(out.hbp, out.pa, 0.011), 5),
    ballInPlayRate: round(rate(out.bip, out.pa, 0.679), 5),
    homeRunRate: round(rate(out.hr, out.pa, 0.03), 5),
    extraBaseHitRate: round(rate(out.xbh, out.pa, 0.078), 5),
    groundballRate: round(rate(out.groundball, bipDenom, 0.43), 5),
    lineDriveRate: round(rate(out.lineDrive, bipDenom, 0.24), 5),
    flyballRate: round(rate(out.flyball, bipDenom, 0.28), 5),
    hardHitRate: round(rate(out.hardHit, bipDenom, 0.39), 5),
    expectedWoba: round(rate(out.xwobaSum, out.xwobaCount, 0.32), 5),
    expectedSlug: round(rate(out.xslgSum, out.xslgCount, 0.41), 5)
  };
}

function finalizeSpray(spray: MutableSpray): Partial<MlbSprayProfile> {
  if (spray.battedBalls <= 0) return {};
  return {
    pull: round(rate(spray.pull, spray.battedBalls, 0.39), 5),
    center: round(rate(spray.center, spray.battedBalls, 0.35), 5),
    opposite: round(rate(spray.opposite, spray.battedBalls, 0.26), 5),
    groundball: round(rate(spray.groundball, spray.battedBalls, 0.43), 5),
    lineDrive: round(rate(spray.lineDrive, spray.battedBalls, 0.24), 5),
    flyball: round(rate(spray.flyball, spray.battedBalls, 0.28), 5),
    popup: round(rate(spray.popup, spray.battedBalls, 0.05), 5)
  };
}

function finalizePitchValue(bucket: Record<MlbPitchType, PitchValueBucket>) {
  return Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, round(rate(bucket[pitch].sum, bucket[pitch].count, 0) * 100, 4)])) as Partial<Record<MlbPitchType, number>>;
}

function finalizePitchRate(bucket: Record<MlbPitchType, { whiffs?: number; swings?: number; hardHit?: number; battedBalls?: number; called?: number; pitches?: number; groundballs?: number }>, numerator: "whiffs" | "hardHit" | "called" | "groundballs", denominator: "swings" | "battedBalls" | "pitches") {
  return Object.fromEntries(PITCH_TYPES.map((pitch) => {
    const row = bucket[pitch] ?? {};
    return [pitch, round(rate(row[numerator] ?? 0, row[denominator] ?? 0, numerator === "called" ? 0.17 : numerator === "groundballs" ? 0.43 : numerator === "hardHit" ? 0.39 : 0.225), 5)];
  })) as Partial<Record<MlbPitchType, number>>;
}

function finalizePitchMix(counter: Record<MlbPitchType, number>): MlbPitchMix {
  const total = PITCH_TYPES.reduce((sum, pitch) => sum + counter[pitch], 0);
  if (total <= 0) return {};
  return Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, round(counter[pitch] / total, 5)])) as MlbPitchMix;
}

function finalizeCountOutcomes(rows: Record<MlbCountKey, MutableOutcome>) {
  return Object.fromEntries(COUNTS.map((count) => [count, finalizeOutcome(rows[count])]).filter(([, value]) => Object.keys(value as object).length > 0));
}

function finalizeBaseOutcomes(rows: Record<MlbBaseStateKey, MutableOutcome>) {
  return Object.fromEntries(BASES.map((base) => [base, finalizeOutcome(rows[base])]).filter(([, value]) => Object.keys(value as object).length > 0));
}

function getBatterAgg(map: Map<string, BatterAgg>, row: MlbStatcastPitchRow): BatterAgg | null {
  const id = asString(row, "batter");
  if (!id) return null;
  const existing = map.get(id);
  if (existing) return existing;
  const agg: BatterAgg = {
    id,
    name: asString(row, "batter_name") || asString(row, "player_name") || id,
    team: asString(row, "bat_team") || asString(row, "home_team") || "UNK",
    bats: batterHand(asString(row, "stand")),
    pitches: 0,
    terminalEvents: 0,
    pitchTypeRunValue: pitchValueBuckets(),
    pitchTypeWhiff: Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, { whiffs: 0, swings: 0 }])) as Record<MlbPitchType, { whiffs: number; swings: number }>,
    pitchTypeHardHit: Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, { hardHit: 0, battedBalls: 0 }])) as Record<MlbPitchType, { hardHit: number; battedBalls: number }>,
    swingByCount: Object.fromEntries(COUNTS.map((count) => [count, { swings: 0, pitches: 0 }])) as Record<MlbCountKey, { swings: number; pitches: number }>,
    contactByCount: Object.fromEntries(COUNTS.map((count) => [count, { contact: 0, swings: 0 }])) as Record<MlbCountKey, { contact: number; swings: number }>,
    chaseByCount: Object.fromEntries(COUNTS.map((count) => [count, { chases: 0, pitches: 0 }])) as Record<MlbCountKey, { chases: number; pitches: number }>,
    outcomeByCount: outcomeByCount(),
    outcomeByBaseState: outcomeByBase(),
    outcomeByPitcherHand: { L: emptyOutcome(), R: emptyOutcome() },
    sprayOverall: emptySpray(),
    sprayByPitchType: sprayByPitch(),
    sprayByPitcherHand: { L: emptySpray(), R: emptySpray() },
    runnersOnBase: { any: emptyOutcome(), risp: emptyOutcome(), runnerOnFirst: emptyOutcome(), runnerOnSecond: emptyOutcome(), runnerOnThird: emptyOutcome(), basesLoaded: emptyOutcome() }
  };
  map.set(id, agg);
  return agg;
}

function getPitcherAgg(map: Map<string, PitcherAgg>, row: MlbStatcastPitchRow): PitcherAgg | null {
  const id = asString(row, "pitcher");
  if (!id) return null;
  const existing = map.get(id);
  if (existing) return existing;
  const agg: PitcherAgg = {
    id,
    name: asString(row, "pitcher_name") || asString(row, "player_name") || id,
    team: asString(row, "fld_team") || asString(row, "away_team") || "UNK",
    throws: hand(asString(row, "p_throws")),
    pitches: 0,
    terminalEvents: 0,
    pitchMixOverall: pitchCounter(),
    pitchMixByCount: countPitchCounters(),
    pitchMixByBatterHand: { L: pitchCounter(), R: pitchCounter() },
    pitchMixByBaseState: basePitchCounters(),
    pitchRunValueAllowed: pitchValueBuckets(),
    whiffByPitch: Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, { whiffs: 0, swings: 0 }])) as Record<MlbPitchType, { whiffs: number; swings: number }>,
    calledStrikeByPitch: Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, { called: 0, pitches: 0 }])) as Record<MlbPitchType, { called: number; pitches: number }>,
    groundballByPitch: Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, { groundballs: 0, battedBalls: 0 }])) as Record<MlbPitchType, { groundballs: number; battedBalls: number }>,
    hardHitByPitch: Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, { hardHit: 0, battedBalls: 0 }])) as Record<MlbPitchType, { hardHit: number; battedBalls: number }>,
    outcomeByCount: outcomeByCount(),
    outcomeByBaseState: outcomeByBase(),
    outcomeByBatterHand: { L: emptyOutcome(), R: emptyOutcome() }
  };
  map.set(id, agg);
  return agg;
}

function archetypeFromBatter(agg: BatterAgg): MlbBatterArchetype {
  const overall = finalizeOutcome(Object.values(agg.outcomeByCount).reduce((sum, row) => {
    sum.pa += row.pa;
    sum.walks += row.walks;
    sum.strikeouts += row.strikeouts;
    sum.hbp += row.hbp;
    sum.bip += row.bip;
    sum.hr += row.hr;
    sum.xbh += row.xbh;
    sum.groundball += row.groundball;
    sum.lineDrive += row.lineDrive;
    sum.flyball += row.flyball;
    sum.hardHit += row.hardHit;
    sum.xwobaSum += row.xwobaSum;
    sum.xwobaCount += row.xwobaCount;
    sum.xslgSum += row.xslgSum;
    sum.xslgCount += row.xslgCount;
    return sum;
  }, emptyOutcome())) as MlbMicroOutcomeRates;
  if ((overall.homeRunRate ?? 0) >= 0.045 || (overall.expectedSlug ?? 0) >= 0.49) return "POWER";
  if ((overall.walkRate ?? 0) >= 0.105) return "PATIENT";
  if ((overall.strikeoutRate ?? 0) <= 0.17) return "CONTACT";
  return "BALANCED";
}

function reliability(pitches: number, terminalEvents: number, battedBalls = terminalEvents) {
  return round(clamp((pitches / 900) * 0.45 + (terminalEvents / 280) * 0.35 + (battedBalls / 180) * 0.2, 0.12, 0.94), 4);
}

function finalizeBatter(agg: BatterAgg): MlbBatterMicroTendency {
  const sprayByPitchType = Object.fromEntries(PITCH_TYPES.map((pitch) => [pitch, finalizeSpray(agg.sprayByPitchType[pitch])]).filter(([, value]) => Object.keys(value as object).length > 0));
  return {
    mlbId: agg.id,
    name: agg.name,
    team: agg.team,
    bats: agg.bats,
    archetype: archetypeFromBatter(agg),
    reliability: reliability(agg.pitches, agg.terminalEvents, agg.sprayOverall.battedBalls),
    plateAppearances: agg.terminalEvents,
    pitchTypeRunValue: finalizePitchValue(agg.pitchTypeRunValue),
    pitchTypeWhiffRate: finalizePitchRate(agg.pitchTypeWhiff, "whiffs", "swings"),
    pitchTypeHardHitRate: finalizePitchRate(agg.pitchTypeHardHit, "hardHit", "battedBalls"),
    swingRateByCount: Object.fromEntries(COUNTS.map((count) => [count, round(rate(agg.swingByCount[count].swings, agg.swingByCount[count].pitches, 0.47), 5)])),
    contactRateByCount: Object.fromEntries(COUNTS.map((count) => [count, round(rate(agg.contactByCount[count].contact, agg.contactByCount[count].swings, 0.76), 5)])),
    chaseRateByCount: Object.fromEntries(COUNTS.map((count) => [count, round(rate(agg.chaseByCount[count].chases, agg.chaseByCount[count].pitches, 0.28), 5)])),
    outcomeByCount: finalizeCountOutcomes(agg.outcomeByCount),
    outcomeByBaseState: finalizeBaseOutcomes(agg.outcomeByBaseState),
    outcomeByPitcherHand: { L: finalizeOutcome(agg.outcomeByPitcherHand.L), R: finalizeOutcome(agg.outcomeByPitcherHand.R) },
    sprayOverall: finalizeSpray(agg.sprayOverall),
    sprayByPitchType,
    sprayByPitcherHand: { L: finalizeSpray(agg.sprayByPitcherHand.L), R: finalizeSpray(agg.sprayByPitcherHand.R) },
    runnersOnBase: Object.fromEntries(Object.entries(agg.runnersOnBase).map(([key, value]) => [key, finalizeOutcome(value)])),
    clutchIndex: round(clamp(rate(agg.runnersOnBase.risp.xwobaSum, agg.runnersOnBase.risp.xwobaCount, 0.32) / 0.32, 0.72, 1.32), 4)
  };
}

function finalizePitcher(agg: PitcherAgg): MlbPitcherMicroTendency {
  return {
    mlbId: agg.id,
    name: agg.name,
    team: agg.team,
    throws: agg.throws,
    role: agg.terminalEvents >= 350 ? "starter" : "reliever",
    reliability: reliability(agg.pitches, agg.terminalEvents),
    battersFaced: agg.terminalEvents,
    pitchMixOverall: finalizePitchMix(agg.pitchMixOverall),
    pitchMixByCount: Object.fromEntries(COUNTS.map((count) => [count, finalizePitchMix(agg.pitchMixByCount[count])]).filter(([, value]) => Object.keys(value as object).length > 0)),
    pitchMixByBatterHand: { L: finalizePitchMix(agg.pitchMixByBatterHand.L), R: finalizePitchMix(agg.pitchMixByBatterHand.R) },
    pitchMixByBaseState: Object.fromEntries(BASES.map((base) => [base, finalizePitchMix(agg.pitchMixByBaseState[base])]).filter(([, value]) => Object.keys(value as object).length > 0)),
    pitchRunValueAllowed: finalizePitchValue(agg.pitchRunValueAllowed),
    whiffRateByPitch: finalizePitchRate(agg.whiffByPitch, "whiffs", "swings"),
    calledStrikeRateByPitch: finalizePitchRate(agg.calledStrikeByPitch, "called", "pitches"),
    groundballRateByPitch: finalizePitchRate(agg.groundballByPitch, "groundballs", "battedBalls"),
    hardHitRateAllowedByPitch: finalizePitchRate(agg.hardHitByPitch, "hardHit", "battedBalls"),
    outcomeByCount: finalizeCountOutcomes(agg.outcomeByCount),
    outcomeByBaseState: finalizeBaseOutcomes(agg.outcomeByBaseState),
    outcomeByBatterHand: { L: finalizeOutcome(agg.outcomeByBatterHand.L), R: finalizeOutcome(agg.outcomeByBatterHand.R) },
    fatigueIndex: 0
  };
}

export function parseMlbStatcastCsv(csv: string): MlbStatcastPitchRow[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      current.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      current.push(field);
      field = "";
      if (current.some((value) => value.trim())) rows.push(current);
      current = [];
    } else {
      field += char;
    }
  }
  current.push(field);
  if (current.some((value) => value.trim())) rows.push(current);
  const header = rows.shift()?.map((key) => key.trim()) ?? [];
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])));
}

export function buildMlbMicroTendencyFeedsFromStatcast(rows: MlbStatcastPitchRow[], options: MlbStatcastMicroFeedBuildOptions = {}): MlbStatcastMicroFeedBuild {
  const batterAggs = new Map<string, BatterAgg>();
  const pitcherAggs = new Map<string, PitcherAgg>();
  let usableRows = 0;
  let terminalPitchRows = 0;
  let battedBallRows = 0;
  let skippedRows = 0;

  for (const row of rows) {
    const pitch = normalizePitchType(asString(row, "pitch_type"));
    const count = countKey(row);
    const base = baseState(row);
    const batter = getBatterAgg(batterAggs, row);
    const pitcher = getPitcherAgg(pitcherAggs, row);
    if (!count || !batter || !pitcher) {
      skippedRows += 1;
      continue;
    }
    usableRows += 1;
    const batterSide = batter.bats === "L" ? "L" : "R";
    const pitcherSide = pitcher.throws;
    const deltaRun = asNumber(row, "delta_run_exp") ?? 0;

    batter.pitches += 1;
    pitcher.pitches += 1;
    pitcher.pitchMixOverall[pitch] += 1;
    pitcher.pitchMixByCount[count][pitch] += 1;
    pitcher.pitchMixByBatterHand[batterSide][pitch] += 1;
    pitcher.pitchMixByBaseState[base][pitch] += 1;

    batter.pitchTypeRunValue[pitch].count += 1;
    batter.pitchTypeRunValue[pitch].sum += deltaRun;
    pitcher.pitchRunValueAllowed[pitch].count += 1;
    pitcher.pitchRunValueAllowed[pitch].sum += deltaRun;

    batter.swingByCount[count].pitches += 1;
    batter.chaseByCount[count].pitches += 1;
    pitcher.calledStrikeByPitch[pitch].pitches += 1;
    if (isSwing(row)) {
      batter.swingByCount[count].swings += 1;
      batter.contactByCount[count].swings += 1;
      batter.pitchTypeWhiff[pitch].swings += 1;
      pitcher.whiffByPitch[pitch].swings += 1;
    }
    if (isContact(row)) batter.contactByCount[count].contact += 1;
    if (isWhiff(row)) {
      batter.pitchTypeWhiff[pitch].whiffs += 1;
      pitcher.whiffByPitch[pitch].whiffs += 1;
    }
    if (isChase(row)) batter.chaseByCount[count].chases += 1;
    if (isCalledStrike(row)) pitcher.calledStrikeByPitch[pitch].called += 1;

    if (isBattedBall(row)) {
      battedBallRows += 1;
      batter.pitchTypeHardHit[pitch].battedBalls += 1;
      pitcher.hardHitByPitch[pitch].battedBalls += 1;
      pitcher.groundballByPitch[pitch].battedBalls += 1;
      if (isHardHit(row)) {
        batter.pitchTypeHardHit[pitch].hardHit += 1;
        pitcher.hardHitByPitch[pitch].hardHit += 1;
      }
      if (battedBallType(row) === "ground_ball") pitcher.groundballByPitch[pitch].groundballs += 1;
      addSpray(row, batter.sprayOverall);
      addSpray(row, batter.sprayByPitchType[pitch]);
      addSpray(row, batter.sprayByPitcherHand[pitcherSide]);
    }

    if (isTerminal(row)) {
      terminalPitchRows += 1;
      batter.terminalEvents += 1;
      pitcher.terminalEvents += 1;
      plateAppearanceOutcome(row, batter.outcomeByCount[count]);
      plateAppearanceOutcome(row, pitcher.outcomeByCount[count]);
      plateAppearanceOutcome(row, batter.outcomeByBaseState[base]);
      plateAppearanceOutcome(row, pitcher.outcomeByBaseState[base]);
      plateAppearanceOutcome(row, batter.outcomeByPitcherHand[pitcherSide]);
      plateAppearanceOutcome(row, pitcher.outcomeByBatterHand[batterSide]);
      const runnerKey = runnerSituation(base);
      if (runnerKey) {
        plateAppearanceOutcome(row, batter.runnersOnBase[runnerKey]);
        plateAppearanceOutcome(row, batter.runnersOnBase.any);
      }
    }
  }

  const minBatterPitches = options.minBatterPitches ?? 80;
  const minPitcherPitches = options.minPitcherPitches ?? 80;
  const minTerminalEvents = options.minTerminalEvents ?? 25;
  const batters = Array.from(batterAggs.values())
    .filter((agg) => agg.pitches >= minBatterPitches && agg.terminalEvents >= minTerminalEvents)
    .map(finalizeBatter);
  const pitchers = Array.from(pitcherAggs.values())
    .filter((agg) => agg.pitches >= minPitcherPitches && agg.terminalEvents >= minTerminalEvents)
    .map(finalizePitcher);
  const warnings: string[] = [];
  if (!batters.length) warnings.push("No batters met minimum pitch and terminal-event thresholds.");
  if (!pitchers.length) warnings.push("No pitchers met minimum pitch and terminal-event thresholds.");
  if (usableRows < rows.length * 0.8) warnings.push("More than 20% of rows were skipped due to missing count, batter, or pitcher identifiers.");

  return {
    modelVersion: "mlb-statcast-micro-feed-builder-v1",
    sourceLabel: options.sourceLabel ?? "statcast-csv",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    batters,
    pitchers,
    diagnostics: {
      rawRows: rows.length,
      usableRows,
      batterCount: batters.length,
      pitcherCount: pitchers.length,
      terminalPitchRows,
      battedBallRows,
      skippedRows
    },
    warnings
  };
}
