import crypto from "node:crypto";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type FighterRow = {
  id: string;
  full_name: string;
  stance: string | null;
  height_inches: number | null;
  reach_inches: number | null;
  combat_base: string | null;
  payload_json: unknown;
};

type UpcomingFightRow = {
  fight_id: string;
  fight_date: Date | string;
  event_label: string;
  weight_class: string | null;
  fighter_a_id: string;
  fighter_b_id: string;
};

type StatSource = "official" | "derived" | "scoutedEstimate";
type CompleteStat = { value: number; source: StatSource; confidence: number; note?: string };
type CompleteStats = Record<string, CompleteStat>;

type CompleteFighterProfile = {
  fighterId: string;
  fullName: string;
  generatedAt: string;
  modelVersion: string;
  noMissingData: true;
  profileMode: "video-game-style-public-model";
  confidence: number;
  dataQuality: "A" | "B" | "C" | "D";
  sample: {
    proFights: CompleteStat;
    ufcFights: CompleteStat;
    roundsFought: CompleteStat;
    wins: CompleteStat;
    losses: CompleteStat;
  };
  physical: {
    age: CompleteStat;
    heightInches: CompleteStat;
    reachInches: CompleteStat;
    stance: string;
    combatBase: string;
  };
  careerStats: CompleteStats;
  ratings: Record<string, Record<string, CompleteStat>>;
  sourceSummary: Record<StatSource, number>;
  audit: {
    officialFields: string[];
    derivedFields: string[];
    estimatedFields: string[];
    missingFields: [];
    warning: string;
  };
};

const MODEL_VERSION = "ufc-complete-fighter-profile-v1";
const DEFAULT_HORIZON_DAYS = 180;
const RATING_BASELINES = {
  slpm: 3.65,
  sapm: 3.2,
  sigStrikeAccuracyPct: 45,
  sigStrikeDefensePct: 55,
  knockdownsPer15: 0.28,
  takedownsPer15: 1.15,
  takedownAccuracyPct: 36,
  takedownDefensePct: 63,
  submissionAttemptsPer15: 0.45,
  submissionDefensePct: 64,
  controlTimePct: 18,
  controlEscapePct: 52,
  finishRate: 0.52,
  koLossRate: 0.11,
  submissionLossRate: 0.09
};

function stableHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${stableHash(value).slice(0, 24)}`;
}

function hashJitter(seed: string, key: string, spread = 1) {
  const hash = stableHash(`${seed}:${key}`);
  const int = Number.parseInt(hash.slice(0, 8), 16);
  return ((int / 0xffffffff) * 2 - 1) * spread;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%/g, "").replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function stat(value: number, source: StatSource, confidence: number, note?: string): CompleteStat {
  return { value: round(value), source, confidence: round(clamp(confidence, 0.05, 1), 3), ...(note ? { note } : {}) };
}

function pct(value: number) {
  return clamp(value, 0, 100);
}

function rate(value: number) {
  return clamp(value, 0, 1);
}

function payloadRecords(payload: Record<string, unknown>) {
  const elite = asRecord(payload.eliteProfile);
  return [
    payload,
    asRecord(payload.completeProfile),
    asRecord(payload.careerStats),
    asRecord(payload.stats),
    asRecord(payload.rawPayload),
    elite,
    asRecord(elite.sample),
    asRecord(elite.careerStats),
    asRecord(payload.profile),
    asRecord(payload.background),
    asRecord(payload.spiderSkills)
  ];
}

function payloadNumber(payload: Record<string, unknown>, ...keys: string[]) {
  for (const record of payloadRecords(payload)) {
    for (const key of keys) {
      const value = numberValue(record[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function payloadString(payload: Record<string, unknown>, ...keys: string[]) {
  for (const record of payloadRecords(payload)) {
    for (const key of keys) {
      const value = stringValue(record[key]);
      if (value) return value;
    }
  }
  return null;
}

function officialNumber(payload: Record<string, unknown>, fallback: number | null, ...keys: string[]) {
  const value = payloadNumber(payload, ...keys);
  if (value != null) return stat(value, "official", 0.92, "public/stat-provider field");
  if (fallback != null && Number.isFinite(fallback)) return stat(fallback, "official", 0.88, "warehouse column");
  return null;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function archetype(fighter: FighterRow, payload: Record<string, unknown>) {
  const base = normalizeText(fighter.combat_base ?? payloadString(payload, "combatBase", "combat_base", "base", "style"));
  const stance = normalizeText(fighter.stance ?? payloadString(payload, "stance"));
  if (base.includes("wrest") || base.includes("sambo")) return "wrestler";
  if (base.includes("bjj") || base.includes("jiu") || base.includes("grappl")) return "grappler";
  if (base.includes("kick") || base.includes("muay") || base.includes("karate") || base.includes("taekwondo")) return "kickboxer";
  if (base.includes("box") || base.includes("strik")) return "boxer";
  if (stance.includes("southpaw")) return "southpaw-striker";
  return "balanced";
}

function archetypeBaseline(type: string) {
  const base = { ...RATING_BASELINES };
  if (type === "wrestler") return { ...base, slpm: 3.05, sapm: 2.95, takedownsPer15: 2.9, takedownAccuracyPct: 43, takedownDefensePct: 71, controlTimePct: 31, submissionAttemptsPer15: 0.35, submissionDefensePct: 68 };
  if (type === "grappler") return { ...base, slpm: 2.85, sapm: 3.05, takedownsPer15: 1.75, takedownAccuracyPct: 39, takedownDefensePct: 63, controlTimePct: 25, submissionAttemptsPer15: 1.15, submissionDefensePct: 75 };
  if (type === "kickboxer") return { ...base, slpm: 4.45, sapm: 3.45, sigStrikeAccuracyPct: 47, sigStrikeDefensePct: 57, knockdownsPer15: 0.45, takedownsPer15: 0.45, takedownDefensePct: 68, controlEscapePct: 57 };
  if (type === "boxer" || type === "southpaw-striker") return { ...base, slpm: 4.25, sapm: 3.35, sigStrikeAccuracyPct: 46, sigStrikeDefensePct: 58, knockdownsPer15: 0.52, takedownsPer15: 0.6, takedownDefensePct: 66 };
  return base;
}

function estimateValue(seed: string, key: string, baseline: number, confidence = 0.43, spread = 0.08) {
  const scale = Math.abs(baseline) >= 10 ? baseline * spread : spread * 10;
  return stat(baseline + hashJitter(seed, key, scale), "scoutedEstimate", confidence, "deterministic archetype/scouting estimate; not official stat");
}

function chooseNumber(seed: string, key: string, official: CompleteStat | null, derived: CompleteStat | null, estimateBaseline: number, options: { min?: number; max?: number; spread?: number } = {}) {
  const picked = official ?? derived ?? estimateValue(seed, key, estimateBaseline, official ? 0.92 : derived ? 0.68 : 0.43, options.spread ?? 0.08);
  return stat(clamp(picked.value, options.min ?? -999, options.max ?? 999), picked.source, picked.confidence, picked.note);
}

function sourceSummary(profile: CompleteFighterProfile) {
  const counts: Record<StatSource, number> = { official: 0, derived: 0, scoutingEstimate: 0 } as unknown as Record<StatSource, number>;
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if ("source" in value && typeof (value as { source?: unknown }).source === "string") {
      const source = (value as { source: StatSource }).source;
      counts[source] = (counts[source] ?? 0) + 1;
      return;
    }
    for (const child of Object.values(value as Record<string, unknown>)) walk(child);
  };
  walk(profile.sample);
  walk(profile.physical);
  walk(profile.careerStats);
  walk(profile.ratings);
  return counts;
}

function gradeFromConfidence(confidence: number, officialShare: number): CompleteFighterProfile["dataQuality"] {
  if (confidence >= 0.82 && officialShare >= 0.58) return "A";
  if (confidence >= 0.68 && officialShare >= 0.34) return "B";
  if (confidence >= 0.48) return "C";
  return "D";
}

function rating(value: number, min: number, max: number, source: StatSource, confidence: number, note?: string) {
  return stat(clamp(((value - min) / Math.max(0.001, max - min)) * 99 + 1, 1, 99), source, confidence, note);
}

function buildCompleteProfile(fighter: FighterRow, generatedAt: string): CompleteFighterProfile {
  const payload = asRecord(fighter.payload_json);
  const type = archetype(fighter, payload);
  const base = archetypeBaseline(type);
  const seed = `${fighter.id}:${fighter.full_name}`;
  const winsOfficial = officialNumber(payload, null, "wins", "recordWins", "record_wins");
  const lossesOfficial = officialNumber(payload, null, "losses", "recordLosses", "record_losses");
  const wins = chooseNumber(seed, "wins", winsOfficial, null, 8, { min: 0, max: 60, spread: 0.5 });
  const losses = chooseNumber(seed, "losses", lossesOfficial, null, 3, { min: 0, max: 40, spread: 0.55 });
  const proFightsOfficial = officialNumber(payload, null, "proFights", "pro_fights");
  const proFightsDerived = stat(Math.max(1, wins.value + losses.value), winsOfficial || lossesOfficial ? "derived" : "scoutedEstimate", winsOfficial || lossesOfficial ? 0.74 : 0.42, "record-derived fight count");
  const proFights = chooseNumber(seed, "proFights", proFightsOfficial, proFightsDerived, 12, { min: 1, max: 80, spread: 0.45 });
  const ufcFights = chooseNumber(seed, "ufcFights", officialNumber(payload, null, "ufcFights", "ufc_fights"), stat(Math.min(proFights.value, Math.max(1, proFights.value * 0.42)), proFights.source === "official" ? "derived" : "scoutedEstimate", 0.58, "estimated UFC/major sample from public record"), 4, { min: 1, max: 45, spread: 0.4 });
  const roundsFought = chooseNumber(seed, "roundsFought", officialNumber(payload, null, "roundsFought", "rounds_fought"), stat(Math.max(3, proFights.value * 2.15), "derived", Math.max(0.45, proFights.confidence - 0.14), "fight-count derived rounds estimate"), 24, { min: 1, max: 180, spread: 0.35 });
  const age = chooseNumber(seed, "age", officialNumber(payload, null, "age"), null, 29.5, { min: 18, max: 46, spread: 0.08 });
  const height = chooseNumber(seed, "heightInches", officialNumber(payload, fighter.height_inches, "heightInches", "height_inches"), null, 69.5, { min: 60, max: 82, spread: 0.05 });
  const reach = chooseNumber(seed, "reachInches", officialNumber(payload, fighter.reach_inches, "reachInches", "reach_inches"), stat(height.value + 2 + hashJitter(seed, "reachFromHeight", 2.6), height.source === "official" ? "derived" : "scoutedEstimate", height.source === "official" ? 0.64 : 0.4, "height-derived reach estimate"), 72, { min: 60, max: 86, spread: 0.05 });

  const slpm = chooseNumber(seed, "slpm", officialNumber(payload, null, "slpm", "sigStrikesLandedPerMin", "sig_strikes_landed_per_min"), null, base.slpm, { min: 0.4, max: 9, spread: 0.14 });
  const sapm = chooseNumber(seed, "sapm", officialNumber(payload, null, "sapm", "sigStrikesAbsorbedPerMin", "sig_strikes_absorbed_per_min"), null, base.sapm, { min: 0.4, max: 9, spread: 0.14 });
  const strikeDiff = chooseNumber(seed, "strikingDifferential", officialNumber(payload, null, "strikingDifferential", "striking_differential"), stat(slpm.value - sapm.value, slpm.source === "official" && sapm.source === "official" ? "derived" : "scoutedEstimate", Math.min(slpm.confidence, sapm.confidence), "SLpM minus SApM"), 0, { min: -5, max: 5, spread: 0.1 });
  const strikeAcc = chooseNumber(seed, "sigStrikeAccuracyPct", officialNumber(payload, null, "sigStrikeAccuracyPct", "strikeAccuracyPct", "sig_strike_accuracy_pct"), null, base.sigStrikeAccuracyPct, { min: 22, max: 72, spread: 0.09 });
  const strikeDef = chooseNumber(seed, "sigStrikeDefensePct", officialNumber(payload, null, "sigStrikeDefensePct", "strikeDefensePct", "sig_strike_defense_pct"), null, base.sigStrikeDefensePct, { min: 28, max: 82, spread: 0.08 });
  const kd15 = chooseNumber(seed, "knockdownsPer15", officialNumber(payload, null, "knockdownsPer15", "kdAvg"), stat(Math.max(0.05, (base.knockdownsPer15 + Math.max(0, strikeDiff.value) * 0.08)), strikeDiff.source === "official" ? "derived" : "scoutedEstimate", Math.max(0.4, strikeDiff.confidence - 0.12), "striking differential/power derived"), base.knockdownsPer15, { min: 0, max: 2.5, spread: 0.18 });
  const td15 = chooseNumber(seed, "takedownsPer15", officialNumber(payload, null, "takedownsPer15", "takedowns_per_15", "tdAvg"), null, base.takedownsPer15, { min: 0, max: 7, spread: 0.16 });
  const tdAcc = chooseNumber(seed, "takedownAccuracyPct", officialNumber(payload, null, "takedownAccuracyPct", "takedown_accuracy_pct", "tdAccuracy"), null, base.takedownAccuracyPct, { min: 5, max: 78, spread: 0.1 });
  const tdDef = chooseNumber(seed, "takedownDefensePct", officialNumber(payload, null, "takedownDefensePct", "takedown_defense_pct", "tdDefense"), null, base.takedownDefensePct, { min: 15, max: 98, spread: 0.08 });
  const sub15 = chooseNumber(seed, "submissionAttemptsPer15", officialNumber(payload, null, "submissionAttemptsPer15", "submission_attempts_per_15", "subAvg"), null, base.submissionAttemptsPer15, { min: 0, max: 4, spread: 0.2 });
  const subDef = chooseNumber(seed, "submissionDefensePct", officialNumber(payload, null, "submissionDefensePct", "submission_defense_pct", "subDefense"), stat(clamp(56 + tdDef.value * 0.18 - sub15.value * 2.5, 30, 92), tdDef.source === "official" ? "derived" : "scoutedEstimate", Math.max(0.38, tdDef.confidence - 0.13), "takedown defense/submission profile derived"), base.submissionDefensePct, { min: 25, max: 98, spread: 0.08 });
  const controlPct = chooseNumber(seed, "controlTimePct", officialNumber(payload, null, "controlTimePct", "control_time_pct"), stat(clamp(td15.value * 7.4 + sub15.value * 3.2, 3, 48), td15.source === "official" || sub15.source === "official" ? "derived" : "scoutedEstimate", Math.max(0.38, Math.max(td15.confidence, sub15.confidence) - 0.16), "wrestling/grappling pace derived"), base.controlTimePct, { min: 0, max: 65, spread: 0.1 });
  const escapePct = chooseNumber(seed, "controlEscapePct", officialNumber(payload, null, "controlEscapePct", "control_escape_pct", "escapePct"), stat(clamp(tdDef.value * 0.78 + strikeDef.value * 0.14, 20, 94), tdDef.source === "official" ? "derived" : "scoutedEstimate", Math.max(0.38, tdDef.confidence - 0.15), "defensive wrestling derived"), base.controlEscapePct, { min: 10, max: 98, spread: 0.08 });
  const finishRate = chooseNumber(seed, "finishRate", officialNumber(payload, null, "finishRate", "finish_rate"), stat(clamp(0.34 + kd15.value * 0.22 + sub15.value * 0.12, 0.12, 0.92), kd15.source === "official" || sub15.source === "official" ? "derived" : "scoutedEstimate", Math.max(kd15.confidence, sub15.confidence) - 0.14, "power/submission threat derived"), base.finishRate, { min: 0.05, max: 0.98, spread: 0.08 });
  const koLossRate = chooseNumber(seed, "koLossRate", officialNumber(payload, null, "koLossRate", "ko_loss_rate"), stat(clamp((100 - strikeDef.value) / 400 + sapm.value / 70, 0.01, 0.38), strikeDef.source === "official" || sapm.source === "official" ? "derived" : "scoutedEstimate", Math.max(strikeDef.confidence, sapm.confidence) - 0.14, "defense/damage absorption derived"), base.koLossRate, { min: 0, max: 0.6, spread: 0.08 });
  const subLossRate = chooseNumber(seed, "submissionLossRate", officialNumber(payload, null, "submissionLossRate", "submission_loss_rate"), stat(clamp((100 - subDef.value) / 420 + (100 - tdDef.value) / 700, 0.01, 0.34), subDef.source === "official" || tdDef.source === "official" ? "derived" : "scoutedEstimate", Math.max(subDef.confidence, tdDef.confidence) - 0.14, "grappling defense derived"), base.submissionLossRate, { min: 0, max: 0.6, spread: 0.08 });

  const careerStats = { slpm, sapm, strikingDifferential: strikeDiff, sigStrikeAccuracyPct: strikeAcc, sigStrikeDefensePct: strikeDef, knockdownsPer15: kd15, takedownsPer15: td15, takedownAccuracyPct: tdAcc, takedownDefensePct: tdDef, submissionAttemptsPer15: sub15, submissionDefensePct: subDef, controlTimePct: controlPct, controlEscapePct: escapePct, finishRate, koLossRate, submissionLossRate: subLossRate };
  const avgConfidence = Object.values(careerStats).reduce((sum, item) => sum + item.confidence, 0) / Object.values(careerStats).length;
  const sourceCounts = Object.values(careerStats).reduce((acc, item) => ({ ...acc, [item.source]: (acc[item.source] ?? 0) + 1 }), { official: 0, derived: 0, scoutedEstimate: 0 } as Record<StatSource, number>);
  const officialShare = sourceCounts.official / Math.max(1, Object.values(careerStats).length);
  const dataQuality = gradeFromConfidence(avgConfidence, officialShare);
  const strikingRating = rating(slpm.value * 8 + strikeAcc.value * 0.6 + strikeDef.value * 0.45 + kd15.value * 12, 35, 105, slpm.source, avgConfidence, "composite striking rating");
  const wrestlingRating = rating(td15.value * 12 + tdAcc.value * 0.55 + tdDef.value * 0.65 + controlPct.value * 0.4, 20, 115, td15.source, avgConfidence, "composite wrestling rating");
  const grapplingRating = rating(sub15.value * 16 + subDef.value * 0.68 + controlPct.value * 0.35 + escapePct.value * 0.28, 20, 115, sub15.source, avgConfidence, "composite grappling rating");
  const durabilityRating = rating((1 - koLossRate.value) * 60 + (1 - subLossRate.value) * 35 + strikeDef.value * 0.35 + escapePct.value * 0.22, 55, 155, koLossRate.source, avgConfidence, "composite durability rating");
  const cardioRating = rating(roundsFought.value * 0.45 + proFights.value * 1.3 + escapePct.value * 0.32 + controlPct.value * 0.25, 10, 125, roundsFought.source, Math.max(0.4, roundsFought.confidence), "sample/pace cardio rating");
  const physicalRating = rating(height.value * 0.6 + reach.value * 0.85 + (32 - Math.abs(age.value - 29)) * 1.4, 85, 150, height.source === "official" || reach.source === "official" ? "derived" : "scoutedEstimate", Math.max(height.confidence, reach.confidence) - 0.08, "physical tools rating");
  const fightIqRating = rating(proFights.value * 1.4 + roundsFought.value * 0.28 + strikeDef.value * 0.28 + tdDef.value * 0.22 + subDef.value * 0.2, 25, 140, proFights.source === "official" ? "derived" : "scoutedEstimate", Math.max(0.38, proFights.confidence - 0.12), "experience/defense fight IQ rating");
  const overall = stat((strikingRating.value * 0.24 + wrestlingRating.value * 0.18 + grapplingRating.value * 0.16 + durabilityRating.value * 0.14 + cardioRating.value * 0.1 + physicalRating.value * 0.08 + fightIqRating.value * 0.1), "derived", avgConfidence, "weighted complete-profile overall");

  const profile: CompleteFighterProfile = {
    fighterId: fighter.id,
    fullName: fighter.full_name,
    generatedAt,
    modelVersion: MODEL_VERSION,
    noMissingData: true,
    profileMode: "video-game-style-public-model",
    confidence: round(avgConfidence, 3),
    dataQuality,
    sample: { proFights, ufcFights, roundsFought, wins, losses },
    physical: {
      age,
      heightInches: height,
      reachInches: reach,
      stance: fighter.stance ?? payloadString(payload, "stance") ?? "Orthodox",
      combatBase: fighter.combat_base ?? payloadString(payload, "combatBase", "combat_base", "base") ?? type
    },
    careerStats,
    ratings: {
      core: { overall, striking: strikingRating, wrestling: wrestlingRating, grappling: grapplingRating, durability: durabilityRating, cardio: cardioRating, physical: physicalRating, fightIq: fightIqRating },
      striking: {
        offense: rating(slpm.value, 1.2, 6.8, slpm.source, slpm.confidence),
        defense: rating(strikeDef.value, 35, 75, strikeDef.source, strikeDef.confidence),
        power: rating(kd15.value + finishRate.value, 0.1, 2.5, kd15.source, Math.max(kd15.confidence, finishRate.confidence)),
        volume: rating(slpm.value + td15.value * 0.4, 1.2, 8.5, slpm.source, slpm.confidence)
      },
      grappling: {
        takedownOffense: rating(td15.value * 12 + tdAcc.value * 0.5, 10, 95, td15.source, Math.max(td15.confidence, tdAcc.confidence)),
        takedownDefense: rating(tdDef.value, 25, 95, tdDef.source, tdDef.confidence),
        submissionThreat: rating(sub15.value, 0, 2.8, sub15.source, sub15.confidence),
        bottomSurvival: rating(subDef.value * 0.55 + escapePct.value * 0.45, 25, 95, subDef.source, Math.max(subDef.confidence, escapePct.confidence))
      },
      intangibles: {
        finishingInstinct: rating(finishRate.value, 0.1, 0.95, finishRate.source, finishRate.confidence),
        experience: rating(proFights.value + roundsFought.value * 0.25, 1, 70, proFights.source, Math.max(proFights.confidence, roundsFought.confidence)),
        damageAvoidance: rating(strikeDef.value * 0.45 + tdDef.value * 0.25 + subDef.value * 0.2 + escapePct.value * 0.1, 25, 92, strikeDef.source, avgConfidence),
        riskProfile: stat(100 - (koLossRate.value * 60 + subLossRate.value * 40), "derived", Math.max(koLossRate.confidence, subLossRate.confidence), "inverse finish-loss risk")
      }
    },
    sourceSummary: { official: sourceCounts.official, derived: sourceCounts.derived, scoutedEstimate: sourceCounts.scoutedEstimate },
    audit: {
      officialFields: Object.entries(careerStats).filter(([, item]) => item.source === "official").map(([key]) => key),
      derivedFields: Object.entries(careerStats).filter(([, item]) => item.source === "derived").map(([key]) => key),
      estimatedFields: Object.entries(careerStats).filter(([, item]) => item.source === "scoutedEstimate").map(([key]) => key),
      missingFields: [],
      warning: "Complete profile uses official fields first, derived fields second, and deterministic scouted estimates only where public stats are unavailable. Estimated values are not official UFCStats."
    }
  };
  profile.sourceSummary = sourceSummary(profile);
  return profile;
}

function numericProfile(profile: CompleteFighterProfile) {
  const c = profile.careerStats;
  return {
    proFights: Math.round(profile.sample.proFights.value),
    ufcFights: Math.round(profile.sample.ufcFights.value),
    roundsFought: profile.sample.roundsFought.value,
    slpm: c.slpm.value,
    sapm: c.sapm.value,
    strikingDifferential: c.strikingDifferential.value,
    sigStrikeAccuracyPct: c.sigStrikeAccuracyPct.value,
    sigStrikeDefensePct: c.sigStrikeDefensePct.value,
    knockdownsPer15: c.knockdownsPer15.value,
    takedownsPer15: c.takedownsPer15.value,
    takedownAccuracyPct: c.takedownAccuracyPct.value,
    takedownDefensePct: c.takedownDefensePct.value,
    submissionAttemptsPer15: c.submissionAttemptsPer15.value,
    submissionDefensePct: c.submissionDefensePct.value,
    controlTimePct: c.controlTimePct.value,
    controlEscapePct: c.controlEscapePct.value,
    finishRate: c.finishRate.value,
    koLossRate: c.koLossRate.value,
    submissionLossRate: c.submissionLossRate.value,
    opponentAdjustedStrength: profile.ratings.core.overall.value,
    coldStartActive: false
  };
}

async function loadFighters(limit: number, upcomingOnly: boolean, horizonDays: number) {
  if (!upcomingOnly) {
    return (await prisma.$queryRaw<FighterRow[]>`
      SELECT id, full_name, stance, height_inches, reach_inches, combat_base, payload_json
      FROM ufc_fighters
      ORDER BY updated_at DESC, full_name
      LIMIT ${limit}
    `) as FighterRow[];
  }
  return (await prisma.$queryRaw<FighterRow[]>`
    SELECT DISTINCT ftr.id, ftr.full_name, ftr.stance, ftr.height_inches, ftr.reach_inches, ftr.combat_base, ftr.payload_json
    FROM ufc_fighters ftr
    JOIN ufc_fights f ON f.fighter_a_id = ftr.id OR f.fighter_b_id = ftr.id
    WHERE f.fight_date >= now() - interval '12 hours'
      AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
      AND f.status NOT IN ('CANCELED', 'VOID')
      AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
    ORDER BY ftr.full_name
    LIMIT ${limit}
  `) as FighterRow[];
}

async function loadUpcomingFights(horizonDays: number, limit: number) {
  return (await prisma.$queryRaw<UpcomingFightRow[]>`
    SELECT id AS fight_id, fight_date, event_label, weight_class, fighter_a_id, fighter_b_id
    FROM ufc_fights
    WHERE fight_date >= now() - interval '12 hours'
      AND fight_date <= now() + (${horizonDays}::text || ' days')::interval
      AND status NOT IN ('CANCELED', 'VOID')
      AND COALESCE(payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
    ORDER BY fight_date ASC
    LIMIT ${limit}
  `) as UpcomingFightRow[];
}

async function updateFighter(profile: CompleteFighterProfile) {
  const n = numericProfile(profile);
  await prisma.$executeRaw`
    UPDATE ufc_fighters
    SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify({
      completeProfile: profile,
      videoGameRatings: profile.ratings,
      noMissingFighterProfile: true,
      careerStats: {
        slpm: n.slpm,
        sapm: n.sapm,
        strikingDifferential: n.strikingDifferential,
        sigStrikeAccuracyPct: n.sigStrikeAccuracyPct,
        sigStrikeDefensePct: n.sigStrikeDefensePct,
        knockdownsPer15: n.knockdownsPer15,
        takedownsPer15: n.takedownsPer15,
        takedownAccuracyPct: n.takedownAccuracyPct,
        takedownDefensePct: n.takedownDefensePct,
        submissionAttemptsPer15: n.submissionAttemptsPer15,
        submissionDefensePct: n.submissionDefensePct,
        controlTimePct: n.controlTimePct,
        controlEscapePct: n.controlEscapePct,
        finishRate: n.finishRate,
        koLossRate: n.koLossRate,
        submissionLossRate: n.submissionLossRate
      },
      profileCompleteness: {
        noMissingData: true,
        modelVersion: profile.modelVersion,
        generatedAt: profile.generatedAt,
        confidence: profile.confidence,
        dataQuality: profile.dataQuality,
        sourceSummary: profile.sourceSummary,
        estimatedFields: profile.audit.estimatedFields
      }
    })}::jsonb,
      updated_at = now()
    WHERE id = ${profile.fighterId}
  `;
}

function featureJson(profile: CompleteFighterProfile, fight: UpcomingFightRow, opponentId: string) {
  const n = numericProfile(profile);
  return {
    source: "fighter-profile-gap-fill",
    profileMode: profile.profileMode,
    noMissingData: true,
    modelVersion: profile.modelVersion,
    confidence: profile.confidence,
    dataQuality: profile.dataQuality,
    sourceSummary: profile.sourceSummary,
    estimatedFields: profile.audit.estimatedFields,
    statSourceMap: Object.fromEntries(Object.entries(profile.careerStats).map(([key, item]) => [key, { source: item.source, confidence: item.confidence, note: item.note ?? null }])),
    completeProfile: profile,
    ratings: profile.ratings,
    opponentFighterId: opponentId,
    rawFeature: {
      proFights: n.proFights,
      ufcFights: n.ufcFights,
      roundsFought: n.roundsFought,
      slpm: n.slpm,
      sapm: n.sapm,
      sigStrikeDefensePct: n.sigStrikeDefensePct,
      takedownDefensePct: n.takedownDefensePct,
      submissionDefensePct: n.submissionDefensePct,
      controlEscapePct: n.controlEscapePct,
      staminaScore: profile.ratings.core.cardio.value,
      fightIqScore: profile.ratings.core.fightIq.value,
      chinScore: profile.ratings.core.durability.value,
      paceScore: profile.ratings.striking.volume.value,
      pressureScore: profile.ratings.striking.offense.value,
      gamePlanScore: profile.ratings.core.fightIq.value
    },
    fightContext: { fightId: fight.fight_id, eventLabel: fight.event_label, weightClass: fight.weight_class }
  };
}

async function upsertFightFeature(profile: CompleteFighterProfile, fight: UpcomingFightRow, opponentId: string, dryRun: boolean) {
  const n = numericProfile(profile);
  const fightDate = fight.fight_date instanceof Date ? fight.fight_date.toISOString() : new Date(fight.fight_date).toISOString();
  const snapshotAt = new Date(Math.min(Date.now(), new Date(fightDate).getTime() - 60_000)).toISOString();
  const id = stableId("ufcmf", `${fight.fight_id}:${profile.fighterId}:gap-fill:${MODEL_VERSION}`);
  const payload = featureJson(profile, fight, opponentId);
  if (dryRun) return;
  await prisma.$executeRaw`
    INSERT INTO ufc_model_features (id, fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version, pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15, control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json, updated_at)
    VALUES (${id}, ${fight.fight_id}, ${fightDate}::timestamptz, ${profile.fighterId}, ${opponentId}, ${snapshotAt}::timestamptz, ${MODEL_VERSION}, ${n.proFights}, ${n.ufcFights}, ${n.roundsFought}, ${n.slpm}, ${n.sapm}, ${n.strikingDifferential}, ${n.takedownsPer15}, ${n.takedownDefensePct}, ${n.submissionAttemptsPer15}, ${n.controlTimePct}, ${n.opponentAdjustedStrength}, ${n.coldStartActive}, ${JSON.stringify(payload)}::jsonb, now())
    ON CONFLICT (fight_id, fighter_id, model_version)
    DO UPDATE SET
      snapshot_at = EXCLUDED.snapshot_at,
      pro_fights = EXCLUDED.pro_fights,
      ufc_fights = EXCLUDED.ufc_fights,
      rounds_fought = EXCLUDED.rounds_fought,
      sig_strikes_landed_per_min = EXCLUDED.sig_strikes_landed_per_min,
      sig_strikes_absorbed_per_min = EXCLUDED.sig_strikes_absorbed_per_min,
      striking_differential = EXCLUDED.striking_differential,
      takedowns_per_15 = EXCLUDED.takedowns_per_15,
      takedown_defense_pct = EXCLUDED.takedown_defense_pct,
      submission_attempts_per_15 = EXCLUDED.submission_attempts_per_15,
      control_time_pct = EXCLUDED.control_time_pct,
      opponent_adjusted_strength = EXCLUDED.opponent_adjusted_strength,
      cold_start_active = EXCLUDED.cold_start_active,
      feature_json = COALESCE(ufc_model_features.feature_json, '{}'::jsonb) || EXCLUDED.feature_json,
      updated_at = now()
  `;
}

export async function fillUfcFighterProfileGaps(options: { limit?: number; horizonDays?: number; upcomingOnly?: boolean; dryRun?: boolean; writeFightFeatures?: boolean } = {}) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, mode: options.dryRun ? "dry-run" : "write", error: "No usable server database URL is configured." };
  const limit = Math.max(1, Math.min(5000, Math.floor(options.limit ?? 300)));
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays ?? DEFAULT_HORIZON_DAYS)));
  const upcomingOnly = options.upcomingOnly ?? true;
  const dryRun = Boolean(options.dryRun);
  const writeFightFeatures = options.writeFightFeatures ?? true;
  const generatedAt = new Date().toISOString();
  const fighters = await loadFighters(limit, upcomingOnly, horizonDays);
  const profiles = fighters.map((fighter) => buildCompleteProfile(fighter, generatedAt));
  let updatedFighters = 0;
  const errors: string[] = [];
  for (const profile of profiles) {
    try {
      if (!dryRun) await updateFighter(profile);
      updatedFighters += 1;
    } catch (error) {
      errors.push(`${profile.fullName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  let writtenFightFeatures = 0;
  if (writeFightFeatures) {
    const profileById = new Map<string, CompleteFighterProfile>(profiles.map((profile) => [profile.fighterId, profile]));
    const fights = await loadUpcomingFights(horizonDays, Math.max(100, limit));
    for (const fight of fights) {
      const a = profileById.get(fight.fighter_a_id);
      const b = profileById.get(fight.fighter_b_id);
      try {
        if (a) { await upsertFightFeature(a, fight, fight.fighter_b_id, dryRun); writtenFightFeatures += 1; }
        if (b) { await upsertFightFeature(b, fight, fight.fighter_a_id, dryRun); writtenFightFeatures += 1; }
      } catch (error) {
        errors.push(`${fight.event_label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  const qualityCounts = profiles.reduce((acc, profile) => ({ ...acc, [profile.dataQuality]: (acc[profile.dataQuality] ?? 0) + 1 }), { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>);
  const estimatedFieldCount = profiles.reduce((sum, profile) => sum + profile.audit.estimatedFields.length, 0);
  return {
    ok: errors.length === 0,
    mode: dryRun ? "dry-run" : "write",
    modelVersion: MODEL_VERSION,
    generatedAt,
    fighterCount: fighters.length,
    updatedFighters,
    writtenFightFeatures,
    qualityCounts,
    estimatedFieldCount,
    noMissingProfiles: true,
    sampleProfiles: profiles.slice(0, 10).map((profile) => ({ fighterId: profile.fighterId, fullName: profile.fullName, confidence: profile.confidence, dataQuality: profile.dataQuality, sourceSummary: profile.sourceSummary, overall: profile.ratings.core.overall.value, estimatedFields: profile.audit.estimatedFields })),
    errors: errors.slice(0, 50)
  };
}
