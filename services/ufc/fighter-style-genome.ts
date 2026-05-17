import type { UfcFighterSkillProfile, UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

export type UfcStyleArchetype =
  | "Pressure Boxer"
  | "Volume Kickboxer"
  | "Power Counterstriker"
  | "Chain Wrestler"
  | "Control Grappler"
  | "Submission Hunter"
  | "Scramble Fighter"
  | "Clinch Grinder"
  | "Low Output Technician"
  | "Wild Finisher"
  | "Balanced MMA";

export type UfcFighterStyleGenome = {
  version: "ufc-style-genome-v1";
  generatedAt: string;
  fighterId: string;
  archetype: { primary: UfcStyleArchetype; secondary: UfcStyleArchetype[]; confidence: number };
  tendencies: {
    pressure: number;
    counterStriking: number;
    volume: number;
    powerHunting: number;
    legKickUsage: number;
    bodyWork: number;
    headKickThreat: number;
    takedownInitiation: number;
    chainWrestling: number;
    clinchEngagement: number;
    cageControl: number;
    topControlPreference: number;
    groundAndPound: number;
    submissionHunting: number;
    backTakeHunting: number;
    getUpUrgency: number;
    scrambleChaos: number;
    earlyRoundUrgency: number;
    roundThreeDurability: number;
    championshipRoundTrust: number;
    comebackRiskTaking: number;
    safeLeadManagement: number;
    paceCrashRisk: number;
  };
  tacticalRules: {
    preferredWinConditions: Array<"KO_TKO" | "SUBMISSION" | "DECISION_CONTROL" | "DECISION_VOLUME">;
    dangerZones: string[];
    opponentTriggers: string[];
    simModifiers: Record<string, number>;
  };
  evidence: {
    sourceQuality: "A" | "B" | "C" | "D";
    statsUsed: string[];
    missingSignals: string[];
    fallbackUsed: boolean;
  };
};

type GenomeInput = {
  fighterId?: string;
  skillProfile: UfcFighterSkillProfile;
  profileIntelligence?: Record<string, unknown> | null;
  completeProfile?: Record<string, unknown> | null;
  feature?: UfcModelFeatureSnapshot | null;
  generatedAt?: string;
};

type ArchetypeScores = Record<UfcStyleArchetype, number>;

const ARCHETYPES: UfcStyleArchetype[] = ["Pressure Boxer", "Volume Kickboxer", "Power Counterstriker", "Chain Wrestler", "Control Grappler", "Submission Hunter", "Scramble Fighter", "Clinch Grinder", "Low Output Technician", "Wild Finisher", "Balanced MMA"];

function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
function round(value: number, digits = 2) { return Number(value.toFixed(digits)); }
function blend(...items: Array<[number, number]>) {
  let total = 0;
  let weight = 0;
  for (const [value, itemWeight] of items) {
    if (!Number.isFinite(value) || itemWeight <= 0) continue;
    total += value * itemWeight;
    weight += itemWeight;
  }
  return weight > 0 ? total / weight : 50;
}
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%/g, "").replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function fromSkill(value: number, floor = 20, ceiling = 85) { return clamp(((value - floor) / Math.max(1, ceiling - floor)) * 100); }
function featureNumber(feature: UfcModelFeatureSnapshot | null | undefined, key: string) {
  if (!feature) return null;
  const direct = numeric((feature as unknown as Record<string, unknown>)[key]);
  if (direct != null) return direct;
  const root = asRecord(feature.feature);
  const raw = asRecord(root.rawFeature);
  return numeric(root[key]) ?? numeric(raw[key]);
}
function intelligenceNumber(intelligence: Record<string, unknown> | null | undefined, section: string, key: string) {
  const sectionRecord = asRecord(asRecord(intelligence)[section]);
  return numeric(sectionRecord[key]);
}
function intelligenceStringArray(intelligence: Record<string, unknown> | null | undefined, section: string, key: string) {
  const value = asRecord(asRecord(intelligence)[section])[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function qualityFromProfile(profile: UfcFighterSkillProfile, intelligence?: Record<string, unknown> | null) {
  const readiness = asRecord(asRecord(intelligence).readiness);
  const readinessGrade = typeof readiness.grade === "string" ? readiness.grade : null;
  if (profile.sampleQuality === "A" && readinessGrade === "A") return "A" as const;
  if (["A", "B"].includes(profile.sampleQuality) && ["A", "B", null].includes(readinessGrade)) return "B" as const;
  if (profile.sampleQuality === "D" || readinessGrade === "D") return "D" as const;
  return "C" as const;
}
function confidenceFromProfile(profile: UfcFighterSkillProfile, intelligence?: Record<string, unknown> | null) {
  const readinessScore = numeric(asRecord(asRecord(intelligence).readiness).score) ?? 55;
  const coldStartCap = profile.prospect.confidenceCap == null ? 1 : clamp(profile.prospect.confidenceCap, 35, 100) / 100;
  return round(clamp((readinessScore / 100) * 0.55 + clamp(profile.sampleReliability, 0.22, 1) * 0.35 + coldStartCap * 0.1, 0.18, 0.96), 3);
}

function buildTendencies(profile: UfcFighterSkillProfile, intelligence?: Record<string, unknown> | null, feature?: UfcModelFeatureSnapshot | null): UfcFighterStyleGenome["tendencies"] {
  const recentFormScore = intelligenceNumber(intelligence, "recentForm", "formScore") ?? featureNumber(feature, "recentFormScore") ?? profile.intangibles.recentForm;
  const recentSigDiff = intelligenceNumber(intelligence, "recentForm", "recentSigDiffPerMin") ?? featureNumber(feature, "strikingDifferential") ?? 0;
  const recentTd15 = intelligenceNumber(intelligence, "recentForm", "recentTakedownsPer15") ?? featureNumber(feature, "takedownsPer15") ?? 0;
  const recentControl = intelligenceNumber(intelligence, "recentForm", "recentControlPct") ?? featureNumber(feature, "controlTimePct") ?? 0;
  const finishRate = featureNumber(feature, "finishRate") ?? 0.5;
  const kd15 = featureNumber(feature, "knockdownsPer15") ?? 0.25;
  const slpm = featureNumber(feature, "sigStrikesLandedPerMin") ?? 3.4;
  const sub15 = featureNumber(feature, "submissionAttemptsPer15") ?? 0.45;
  const controlPct = featureNumber(feature, "controlTimePct") ?? 18;
  const td15 = featureNumber(feature, "takedownsPer15") ?? 1.2;
  const volume = blend([fromSkill(profile.striking.volume), 0.42], [fromSkill(profile.cardio.earlyPace), 0.22], [clamp(slpm * 12), 0.2], [recentFormScore, 0.16]);
  const pressure = blend([fromSkill(profile.striking.pressure), 0.42], [volume, 0.2], [fromSkill(profile.wrestling.clinchControl), 0.12], [clamp(55 + recentSigDiff * 9), 0.16], [fromSkill(profile.cardio.earlyPace), 0.1]);
  const takedownInitiation = blend([fromSkill(profile.wrestling.takedownOffense), 0.36], [clamp(td15 * 18), 0.24], [clamp(recentTd15 * 18), 0.2], [fromSkill(profile.wrestling.clinchControl), 0.12], [fromSkill(profile.intangibles.gamePlan), 0.08]);
  const submissionHunting = blend([fromSkill(profile.grappling.submissionThreat), 0.42], [clamp(sub15 * 38), 0.28], [fromSkill(profile.grappling.guardGame), 0.15], [fromSkill(profile.grappling.topGame), 0.15]);
  const control = blend([fromSkill(profile.wrestling.control), 0.35], [fromSkill(profile.grappling.topGame), 0.22], [clamp(controlPct * 2), 0.2], [clamp(recentControl * 2), 0.16], [fromSkill(profile.wrestling.clinchControl), 0.07]);
  const paceCrashRisk = clamp(100 - blend([fromSkill(profile.cardio.stamina), 0.38], [fromSkill(profile.cardio.paceSustain), 0.24], [fromSkill(profile.durability.damageTrend), 0.18], [recentFormScore, 0.2]));
  const safeLeadManagement = blend([fromSkill(profile.intangibles.fightIq), 0.28], [fromSkill(profile.intangibles.gamePlan), 0.28], [fromSkill(profile.striking.defense), 0.18], [fromSkill(profile.wrestling.control), 0.14], [100 - paceCrashRisk, 0.12]);
  return {
    pressure: round(pressure),
    counterStriking: round(blend([fromSkill(profile.striking.distanceManagement), 0.32], [fromSkill(profile.striking.power), 0.24], [100 - pressure, 0.14], [fromSkill(profile.striking.defense), 0.18], [clamp(55 + kd15 * 20), 0.12])),
    volume: round(volume),
    powerHunting: round(blend([fromSkill(profile.striking.power), 0.38], [clamp(finishRate * 100), 0.22], [clamp(kd15 * 42), 0.22], [fromSkill(profile.kicking.headKicks), 0.1], [100 - safeLeadManagement, 0.08])),
    legKickUsage: round(blend([fromSkill(profile.kicking.legKicks), 0.5], [fromSkill(profile.kicking.kickingVolume), 0.28], [fromSkill(profile.striking.distanceManagement), 0.12], [fromSkill(profile.intangibles.fightIq), 0.1])),
    bodyWork: round(blend([fromSkill(profile.kicking.bodyKicks), 0.38], [fromSkill(profile.cardio.earlyPace), 0.16], [fromSkill(profile.striking.accuracy), 0.18], [volume, 0.16], [fromSkill(profile.intangibles.gamePlan), 0.12])),
    headKickThreat: round(blend([fromSkill(profile.kicking.headKicks), 0.48], [fromSkill(profile.kicking.offense), 0.22], [fromSkill(profile.striking.power), 0.2], [fromSkill(profile.striking.distanceManagement), 0.1])),
    takedownInitiation: round(takedownInitiation),
    chainWrestling: round(blend([takedownInitiation, 0.32], [fromSkill(profile.wrestling.control), 0.22], [fromSkill(profile.wrestling.clinchControl), 0.18], [fromSkill(profile.intangibles.gamePlan), 0.12], [clamp(recentTd15 * 22), 0.16])),
    clinchEngagement: round(blend([fromSkill(profile.wrestling.clinchControl), 0.28], [fromSkill(profile.striking.clinchStriking), 0.24], [pressure, 0.18], [control, 0.18], [takedownInitiation, 0.12])),
    cageControl: round(control),
    topControlPreference: round(blend([control, 0.42], [fromSkill(profile.grappling.topGame), 0.2], [100 - submissionHunting, 0.08], [fromSkill(profile.intangibles.fightIq), 0.14], [fromSkill(profile.wrestling.control), 0.16])),
    groundAndPound: round(blend([control, 0.24], [fromSkill(profile.striking.power), 0.18], [fromSkill(profile.grappling.topGame), 0.22], [pressure, 0.14], [fromSkill(profile.durability.heart), 0.08], [100 - submissionHunting, 0.14])),
    submissionHunting: round(submissionHunting),
    backTakeHunting: round(blend([submissionHunting, 0.38], [fromSkill(profile.grappling.grapplingOffense), 0.24], [fromSkill(profile.wrestling.scramble), 0.14], [fromSkill(profile.grappling.reversals), 0.1], [control, 0.14])),
    getUpUrgency: round(blend([fromSkill(profile.wrestling.getUps), 0.32], [fromSkill(profile.grappling.bottomSurvival), 0.22], [fromSkill(profile.cardio.stamina), 0.14], [100 - control, 0.18], [fromSkill(profile.durability.heart), 0.14])),
    scrambleChaos: round(blend([fromSkill(profile.wrestling.scramble), 0.32], [fromSkill(profile.grappling.reversals), 0.18], [fromSkill(profile.grappling.guardGame), 0.14], [fromSkill(profile.durability.heart), 0.14], [100 - control, 0.12], [submissionHunting, 0.1])),
    earlyRoundUrgency: round(blend([fromSkill(profile.cardio.earlyPace), 0.34], [pressure, 0.22], [volume, 0.22], [takedownInitiation, 0.1], [fromSkill(profile.intangibles.recentForm), 0.12])),
    roundThreeDurability: round(blend([fromSkill(profile.cardio.round3), 0.32], [fromSkill(profile.cardio.stamina), 0.26], [fromSkill(profile.durability.heart), 0.2], [fromSkill(profile.durability.recovery), 0.12], [100 - paceCrashRisk, 0.1])),
    championshipRoundTrust: round(blend([fromSkill(profile.cardio.championshipRounds), 0.36], [fromSkill(profile.cardio.latePace), 0.24], [fromSkill(profile.intangibles.experience), 0.2], [fromSkill(profile.durability.heart), 0.2])),
    comebackRiskTaking: round(blend([fromSkill(profile.durability.heart), 0.28], [fromSkill(profile.striking.power), 0.18], [submissionHunting, 0.18], [pressure, 0.16], [100 - fromSkill(profile.intangibles.gamePlan), 0.1], [fromSkill(profile.cardio.latePace), 0.1])),
    safeLeadManagement: round(safeLeadManagement),
    paceCrashRisk: round(paceCrashRisk)
  };
}

function archetypeScores(t: UfcFighterStyleGenome["tendencies"], p: UfcFighterSkillProfile): ArchetypeScores {
  return {
    "Pressure Boxer": blend([t.pressure, 0.35], [t.volume, 0.22], [fromSkill(p.striking.offense), 0.22], [100 - t.takedownInitiation, 0.08], [fromSkill(p.striking.clinchStriking), 0.13]),
    "Volume Kickboxer": blend([t.volume, 0.3], [t.legKickUsage, 0.2], [t.bodyWork, 0.12], [t.headKickThreat, 0.1], [fromSkill(p.kicking.offense), 0.18], [100 - t.takedownInitiation, 0.1]),
    "Power Counterstriker": blend([t.counterStriking, 0.32], [t.powerHunting, 0.28], [fromSkill(p.striking.power), 0.22], [100 - t.pressure, 0.1], [fromSkill(p.striking.distanceManagement), 0.08]),
    "Chain Wrestler": blend([t.takedownInitiation, 0.32], [t.chainWrestling, 0.28], [t.cageControl, 0.16], [fromSkill(p.wrestling.takedownOffense), 0.16], [t.submissionHunting < 55 ? 62 : 48, 0.08]),
    "Control Grappler": blend([t.topControlPreference, 0.28], [t.cageControl, 0.24], [fromSkill(p.grappling.topGame), 0.18], [fromSkill(p.wrestling.control), 0.16], [100 - t.scrambleChaos, 0.14]),
    "Submission Hunter": blend([t.submissionHunting, 0.34], [t.backTakeHunting, 0.18], [fromSkill(p.grappling.submissionThreat), 0.24], [fromSkill(p.grappling.guardGame), 0.1], [t.scrambleChaos, 0.14]),
    "Scramble Fighter": blend([t.scrambleChaos, 0.32], [t.getUpUrgency, 0.24], [fromSkill(p.wrestling.scramble), 0.2], [fromSkill(p.grappling.reversals), 0.12], [t.comebackRiskTaking, 0.12]),
    "Clinch Grinder": blend([t.clinchEngagement, 0.28], [t.cageControl, 0.24], [fromSkill(p.wrestling.clinchControl), 0.22], [fromSkill(p.striking.clinchStriking), 0.14], [t.topControlPreference, 0.12]),
    "Low Output Technician": blend([100 - t.volume, 0.26], [t.safeLeadManagement, 0.2], [fromSkill(p.striking.distanceManagement), 0.2], [fromSkill(p.intangibles.fightIq), 0.22], [100 - t.comebackRiskTaking, 0.12]),
    "Wild Finisher": blend([t.powerHunting, 0.22], [t.submissionHunting, 0.18], [t.scrambleChaos, 0.18], [t.comebackRiskTaking, 0.14], [fromSkill(p.striking.power), 0.14], [100 - t.safeLeadManagement, 0.14]),
    "Balanced MMA": blend([100 - Math.abs(t.pressure - 55), 0.13], [100 - Math.abs(t.takedownInitiation - 50), 0.13], [100 - Math.abs(t.submissionHunting - 50), 0.13], [fromSkill(p.intangibles.fightIq), 0.21], [fromSkill(p.wrestling.takedownDefense), 0.13], [fromSkill(p.striking.defense), 0.14], [fromSkill(p.grappling.grapplingDefense), 0.13])
  };
}
function rankArchetypes(scores: ArchetypeScores) { return [...ARCHETYPES].sort((a, b) => scores[b] - scores[a]); }

function tacticalRules(archetype: UfcStyleArchetype, tendencies: UfcFighterStyleGenome["tendencies"], profile: UfcFighterSkillProfile) {
  const preferredWinConditions: UfcFighterStyleGenome["tacticalRules"]["preferredWinConditions"] = [];
  if (tendencies.powerHunting >= 62 || profile.striking.power >= 68) preferredWinConditions.push("KO_TKO");
  if (tendencies.submissionHunting >= 62 || profile.grappling.submissionThreat >= 68) preferredWinConditions.push("SUBMISSION");
  if (tendencies.topControlPreference >= 62 || archetype === "Control Grappler" || archetype === "Chain Wrestler") preferredWinConditions.push("DECISION_CONTROL");
  if (tendencies.volume >= 62 || archetype === "Volume Kickboxer" || archetype === "Pressure Boxer") preferredWinConditions.push("DECISION_VOLUME");
  if (!preferredWinConditions.length) preferredWinConditions.push("DECISION_VOLUME");
  const dangerZones = [
    tendencies.paceCrashRisk >= 62 ? "late-round pace crash risk" : null,
    tendencies.pressure >= 70 && profile.striking.defense < 52 ? "pressure with defensive exposure" : null,
    tendencies.takedownInitiation >= 70 && profile.grappling.submissionDefense < 55 ? "wrestling entries into submission risk" : null,
    tendencies.powerHunting >= 72 && profile.cardio.stamina < 55 ? "power hunting may drain cardio" : null,
    profile.durability.chin < 50 ? "chin durability concern" : null
  ].filter((item): item is string => Boolean(item));
  const opponentTriggers = [
    tendencies.pressure >= 65 ? "opponent low output or weak cage exits" : null,
    tendencies.counterStriking >= 65 ? "opponent reckless pressure or low strike defense" : null,
    tendencies.takedownInitiation >= 65 ? "opponent takedown defense below average" : null,
    tendencies.submissionHunting >= 65 ? "opponent poor scramble/submission defense" : null,
    tendencies.safeLeadManagement >= 66 ? "live lead after round one" : null
  ].filter((item): item is string => Boolean(item));
  return {
    preferredWinConditions: [...new Set(preferredWinConditions)],
    dangerZones,
    opponentTriggers,
    simModifiers: {
      exchangeVolume: round((tendencies.volume - 50) / 100),
      takedownPressure: round((tendencies.takedownInitiation - 50) / 100),
      submissionVolatility: round((tendencies.submissionHunting - 50) / 100),
      koVolatility: round((tendencies.powerHunting + tendencies.counterStriking - 100) / 150),
      lateFade: round((tendencies.paceCrashRisk - 50) / 120),
      decisionControl: round((tendencies.safeLeadManagement + tendencies.topControlPreference - 100) / 150)
    }
  };
}

export function buildUfcFighterStyleGenome(input: GenomeInput): UfcFighterStyleGenome {
  const profile = input.skillProfile;
  const featureRoot = asRecord(input.feature?.feature);
  const intelligence = input.profileIntelligence ?? asRecord(featureRoot.profileIntelligence);
  const tendencies = buildTendencies(profile, intelligence, input.feature);
  const scores = archetypeScores(tendencies, profile);
  const ranked = rankArchetypes(scores);
  const primary = ranked[0] ?? "Balanced MMA";
  const secondary = ranked.slice(1).filter((item) => scores[item] >= Math.max(55, scores[primary] - 12)).slice(0, 3);
  const missingSignals = [input.feature ? null : "feature snapshot", Object.keys(intelligence).length ? null : "profile intelligence", input.completeProfile ? null : "complete profile", profile.sampleQuality === "D" ? "strong sample" : null].filter((item): item is string => Boolean(item));
  const statsUsed = ["skill profile", input.feature ? "feature snapshot" : null, Object.keys(intelligence).length ? "profile intelligence" : null, input.completeProfile ? "complete profile" : null, ...intelligenceStringArray(intelligence, "stanceStyle", "tendencies").slice(0, 6)].filter((item): item is string => Boolean(item));
  return {
    version: "ufc-style-genome-v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    fighterId: input.fighterId ?? profile.fighterId,
    archetype: { primary, secondary, confidence: confidenceFromProfile(profile, intelligence) },
    tendencies,
    tacticalRules: tacticalRules(primary, tendencies, profile),
    evidence: { sourceQuality: qualityFromProfile(profile, intelligence), statsUsed: [...new Set(statsUsed)], missingSignals, fallbackUsed: missingSignals.length > 0 || profile.prospect.coldStartActive }
  };
}
