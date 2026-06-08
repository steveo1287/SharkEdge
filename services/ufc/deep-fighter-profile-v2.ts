import { buildUfcFighterSkillProfile, type UfcFighterSkillProfile, type UfcModelFeatureSnapshot, type UfcSkillProfileInput } from "@/services/ufc/fighter-skill-profile";
import { buildUfcFighterStyleGenome, type UfcFighterStyleGenome, type UfcStyleArchetype } from "@/services/ufc/fighter-style-genome";
import { buildIndividualUfcFighterProfile, type UfcIndividualFighterProfile, type UfcIndividualProfileSource } from "@/services/ufc/individual-fighter-profile";

export type UfcDeepProfileRatingSource = UfcIndividualProfileSource | "skillProfile" | "styleGenome" | "blended";
export type UfcDeepProfileGrade = "A_PLUS" | "A" | "B" | "C" | "D";
export type UfcDeepProfileRiskFlag = "COLD_START" | "GENERIC_PROFILE" | "LOW_SOURCE_TRUST" | "CARDIO_FADE" | "CHIN_CONCERN" | "WRESTLING_DEFENSE_GAP" | "SUBMISSION_DEFENSE_GAP" | "LOW_OUTPUT" | "SHORT_NOTICE" | "LAYOFF";
export type UfcDeepProfileWinCondition = "KO_TKO" | "SUBMISSION" | "DECISION_VOLUME" | "DECISION_CONTROL" | "SCRAMBLE_CHAOS";

export type UfcDeepRating = {
  value: number;
  source: UfcDeepProfileRatingSource;
  confidence: number;
  sampleSize: number;
  usedInSim: boolean;
  drivers: string[];
};

export type UfcDeepFighterProfileV2 = {
  modelVersion: "ufc-deep-fighter-profile-v2";
  fighterId: string;
  fighterName: string | null;
  generatedAt: string;
  identity: {
    stance: string | null;
    weightClass: string | null;
    age: number | null;
    heightInches: number | null;
    reachInches: number | null;
    primaryArchetype: UfcStyleArchetype;
    secondaryArchetypes: UfcStyleArchetype[];
  };
  sourceTrust: {
    readinessGrade: UfcIndividualFighterProfile["readinessGrade"];
    readinessScore: number;
    skillSampleQuality: UfcFighterSkillProfile["sampleQuality"];
    skillSampleReliability: number;
    genomeSourceQuality: UfcFighterStyleGenome["evidence"]["sourceQuality"];
    trustedStatCount: number;
    estimatedStatCount: number;
    sourceCounts: Record<UfcIndividualProfileSource, number>;
    noGenericEdge: boolean;
    maxConfidence: number;
  };
  ratings: {
    overall: UfcDeepRating;
    striking: UfcDeepRating;
    wrestling: UfcDeepRating;
    grappling: UfcDeepRating;
    cardio: UfcDeepRating;
    durability: UfcDeepRating;
    fightIq: UfcDeepRating;
    power: UfcDeepRating;
    pressure: UfcDeepRating;
    pace: UfcDeepRating;
    control: UfcDeepRating;
    finishThreat: UfcDeepRating;
    decisionFloor: UfcDeepRating;
    defensiveReliability: UfcDeepRating;
  };
  tendencies: {
    standing: Record<string, number>;
    wrestling: Record<string, number>;
    grappling: Record<string, number>;
    fightFlow: Record<string, number>;
    labels: string[];
  };
  phaseStrengths: {
    standing: number;
    clinch: number;
    wrestling: number;
    grappling: number;
    cardioLate: number;
    finish: number;
    decision: number;
  };
  winConditionMap: Record<UfcDeepProfileWinCondition, number>;
  riskProfile: {
    flags: UfcDeepProfileRiskFlag[];
    volatility: number;
    dataRisk: number;
    finishRiskAgainst: number;
    paceCrashRisk: number;
    warnings: string[];
    blockers: string[];
  };
  simModifiers: {
    exchangeVolume: number;
    strikingAccuracy: number;
    powerSpike: number;
    takedownPressure: number;
    takedownDefense: number;
    controlTime: number;
    submissionVolatility: number;
    getUpUrgency: number;
    lateRoundDropoff: number;
    decisionControl: number;
    finishUrgency: number;
    confidenceCap: number;
  };
  explainers: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    matchupHooks: string[];
    simNotes: string[];
  };
  raw: {
    skillProfile: UfcFighterSkillProfile;
    styleGenome: UfcFighterStyleGenome;
    individualProfile: UfcIndividualFighterProfile;
  };
};

type BuildArgs = {
  fighterId?: string;
  fighterName?: string | null;
  skillProfile: UfcFighterSkillProfile;
  styleGenome: UfcFighterStyleGenome;
  individualProfile: UfcIndividualFighterProfile;
  generatedAt?: string;
};

function round(value: number, digits = 3) { return Number(value.toFixed(digits)); }
function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
function avg(...values: number[]) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function weighted(items: Array<[number, number]>) {
  const clean = items.filter(([value, weight]) => Number.isFinite(value) && weight > 0);
  const total = clean.reduce((sum, [value, weight]) => sum + value * weight, 0);
  const weightTotal = clean.reduce((sum, [, weight]) => sum + weight, 0);
  return weightTotal ? total / weightTotal : 50;
}
function fromSkill(value: number, floor = 20, ceiling = 85) { return clamp(((value - floor) / Math.max(1, ceiling - floor)) * 100); }
function statNumber(profile: UfcIndividualFighterProfile, key: string) {
  const value = profile.stats.find((item) => item.key === key)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function ratingSource(profile: UfcIndividualFighterProfile): UfcDeepProfileRatingSource {
  if (profile.sourceCounts.official > 0) return "official";
  if (profile.sourceCounts.historyDerived > 0) return "historyDerived";
  if (profile.sourceCounts.derived > 0) return "derived";
  if (profile.sourceCounts.featureColumn > 0) return "featureColumn";
  if (profile.sourceCounts.estimated > 0) return "estimated";
  return "blended";
}
function confidenceCap(skill: UfcFighterSkillProfile, genome: UfcFighterStyleGenome, individual: UfcIndividualFighterProfile) {
  const raw = skill.prospect.confidenceCap != null ? skill.prospect.confidenceCap / 100 : 0.96;
  const genericCap = individual.noGenericEdge ? 0.62 : 0.96;
  const genomeCap = genome.evidence.fallbackUsed ? 0.72 : 0.94;
  const sourceCap = individual.readinessScore >= 85 ? 0.96 : individual.readinessScore >= 72 ? 0.84 : individual.readinessScore >= 55 ? 0.72 : 0.58;
  return round(clamp(Math.min(raw, genericCap, genomeCap, sourceCap), 0.18, 0.96), 3);
}
function baseConfidence(skill: UfcFighterSkillProfile, genome: UfcFighterStyleGenome, individual: UfcIndividualFighterProfile, cap: number) {
  const readiness = individual.readinessScore / 100;
  const reliability = skill.sampleReliability;
  const genomeConf = genome.archetype.confidence;
  return round(clamp(readiness * 0.42 + reliability * 0.38 + genomeConf * 0.2, 0.12, cap), 3);
}
function makeRating(value: number, source: UfcDeepProfileRatingSource, confidence: number, sampleSize: number, drivers: string[], usedOverride?: boolean): UfcDeepRating {
  const clean = round(clamp(value), 2);
  const usedInSim = usedOverride ?? confidence >= 0.38;
  return { value: clean, source, confidence, sampleSize, usedInSim, drivers: [...new Set(drivers)].slice(0, 6) };
}
function grade(score: number): UfcDeepProfileGrade {
  if (score >= 88) return "A_PLUS";
  if (score >= 78) return "A";
  if (score >= 66) return "B";
  if (score >= 52) return "C";
  return "D";
}
function topLabels(entries: Record<string, number>, high = 66) {
  return Object.entries(entries).filter(([, value]) => value >= high).sort((a, b) => b[1] - a[1]).map(([key]) => key).slice(0, 10);
}
function riskFlags(args: { skill: UfcFighterSkillProfile; genome: UfcFighterStyleGenome; individual: UfcIndividualFighterProfile; ratings: UfcDeepFighterProfileV2["ratings"] }): UfcDeepProfileRiskFlag[] {
  const out: UfcDeepProfileRiskFlag[] = [];
  if (args.skill.prospect.coldStartActive) out.push("COLD_START");
  if (args.individual.noGenericEdge) out.push("GENERIC_PROFILE");
  if (args.individual.readinessScore < 60 || args.skill.sampleQuality === "D") out.push("LOW_SOURCE_TRUST");
  if (args.genome.tendencies.paceCrashRisk >= 62 || args.skill.cardio.stamina < 48) out.push("CARDIO_FADE");
  if (args.skill.durability.chin < 48 || args.ratings.durability.value < 46) out.push("CHIN_CONCERN");
  if (args.skill.wrestling.takedownDefense < 48) out.push("WRESTLING_DEFENSE_GAP");
  if (args.skill.grappling.submissionDefense < 48) out.push("SUBMISSION_DEFENSE_GAP");
  if (args.genome.tendencies.volume < 35 && args.skill.wrestling.control < 50) out.push("LOW_OUTPUT");
  if (args.skill.intangibles.shortNoticeRisk >= 12) out.push("SHORT_NOTICE");
  if (args.skill.intangibles.layoffRisk >= 12) out.push("LAYOFF");
  return [...new Set(out)];
}
function strengths(profile: UfcDeepFighterProfileV2["ratings"], genome: UfcFighterStyleGenome) {
  const items = [
    profile.striking.value >= 66 ? "striking edge" : null,
    profile.wrestling.value >= 66 ? "wrestling edge" : null,
    profile.grappling.value >= 66 ? "grappling edge" : null,
    profile.cardio.value >= 66 ? "cardio trust" : null,
    profile.durability.value >= 66 ? "durability/recovery" : null,
    profile.finishThreat.value >= 66 ? "finish threat" : null,
    profile.decisionFloor.value >= 66 ? "decision floor" : null,
    genome.archetype.primary
  ].filter((item): item is string => Boolean(item));
  return [...new Set(items)].slice(0, 8);
}
function weaknesses(skill: UfcFighterSkillProfile, genome: UfcFighterStyleGenome, individual: UfcIndividualFighterProfile) {
  const items = [
    skill.striking.defense < 48 ? "striking defense concern" : null,
    skill.wrestling.takedownDefense < 48 ? "takedown defense concern" : null,
    skill.grappling.submissionDefense < 48 ? "submission defense concern" : null,
    skill.cardio.stamina < 48 || genome.tendencies.paceCrashRisk >= 62 ? "late cardio risk" : null,
    skill.durability.chin < 48 ? "chin durability concern" : null,
    individual.noGenericEdge ? "profile source trust gate" : null
  ].filter((item): item is string => Boolean(item));
  return [...new Set(items)].slice(0, 8);
}

export function buildUfcDeepFighterProfileV2(args: BuildArgs): UfcDeepFighterProfileV2 {
  const skill = args.skillProfile;
  const genome = args.styleGenome;
  const individual = args.individualProfile;
  const source = ratingSource(individual);
  const cap = confidenceCap(skill, genome, individual);
  const confidence = baseConfidence(skill, genome, individual, cap);
  const sampleSize = Math.round((statNumber(individual, "ufcFights") ?? 0) * 3 + (statNumber(individual, "roundsFought") ?? 0));
  const striking = weighted([[skill.striking.offense, 0.24], [skill.striking.defense, 0.2], [skill.striking.power, 0.16], [skill.striking.volume, 0.14], [skill.striking.accuracy, 0.12], [skill.kicking.offense, 0.08], [skill.striking.clinchStriking, 0.06]]);
  const wrestling = weighted([[skill.wrestling.takedownOffense, 0.25], [skill.wrestling.takedownDefense, 0.24], [skill.wrestling.control, 0.2], [skill.wrestling.getUps, 0.14], [skill.wrestling.scramble, 0.1], [skill.wrestling.clinchControl, 0.07]]);
  const grappling = weighted([[skill.grappling.submissionThreat, 0.2], [skill.grappling.submissionDefense, 0.2], [skill.grappling.grapplingOffense, 0.18], [skill.grappling.grapplingDefense, 0.18], [skill.grappling.topGame, 0.14], [skill.grappling.bottomSurvival, 0.1]]);
  const cardio = weighted([[skill.cardio.earlyPace, 0.16], [skill.cardio.latePace, 0.2], [skill.cardio.round3, 0.2], [skill.cardio.stamina, 0.22], [skill.cardio.paceSustain, 0.22]]);
  const durability = weighted([[skill.durability.koResistance, 0.24], [skill.durability.submissionResistance, 0.18], [skill.durability.damageTrend, 0.16], [skill.durability.chin, 0.18], [skill.durability.recovery, 0.14], [skill.durability.heart, 0.1]]);
  const fightIq = weighted([[skill.intangibles.fightIq, 0.34], [skill.intangibles.gamePlan, 0.28], [skill.intangibles.experience, 0.16], [skill.intangibles.recentForm, 0.16], [100 - skill.intangibles.layoffRisk, 0.03], [100 - skill.intangibles.shortNoticeRisk, 0.03]]);
  const power = weighted([[skill.striking.power, 0.48], [skill.kicking.headKicks, 0.16], [genome.tendencies.powerHunting, 0.22], [skill.durability.heart, 0.06], [skill.intangibles.recentForm, 0.08]]);
  const pressure = weighted([[genome.tendencies.pressure, 0.38], [skill.striking.pressure, 0.22], [skill.cardio.earlyPace, 0.16], [skill.striking.volume, 0.14], [skill.wrestling.clinchControl, 0.1]]);
  const pace = weighted([[genome.tendencies.volume, 0.25], [skill.cardio.earlyPace, 0.2], [skill.cardio.paceSustain, 0.22], [skill.striking.volume, 0.18], [skill.intangibles.recentForm, 0.15]]);
  const control = weighted([[skill.wrestling.control, 0.32], [skill.grappling.topGame, 0.24], [skill.wrestling.clinchControl, 0.18], [genome.tendencies.topControlPreference, 0.16], [skill.intangibles.gamePlan, 0.1]]);
  const finishThreat = weighted([[power, 0.3], [skill.grappling.submissionThreat, 0.24], [genome.tendencies.powerHunting, 0.16], [genome.tendencies.submissionHunting, 0.16], [skill.intangibles.recentForm, 0.08], [100 - genome.tendencies.safeLeadManagement, 0.06]]);
  const decisionFloor = weighted([[fightIq, 0.24], [cardio, 0.2], [skill.striking.defense, 0.15], [control, 0.15], [genome.tendencies.safeLeadManagement, 0.16], [durability, 0.1]]);
  const defensiveReliability = weighted([[skill.striking.defense, 0.24], [skill.wrestling.takedownDefense, 0.22], [skill.grappling.submissionDefense, 0.2], [durability, 0.18], [genome.tendencies.getUpUrgency, 0.08], [genome.tendencies.safeLeadManagement, 0.08]]);
  const overall = weighted([[striking, 0.17], [wrestling, 0.15], [grappling, 0.14], [cardio, 0.13], [durability, 0.13], [fightIq, 0.13], [finishThreat, 0.08], [decisionFloor, 0.07]]);
  const ratings: UfcDeepFighterProfileV2["ratings"] = {
    overall: makeRating(overall, "blended", confidence, sampleSize, ["all-phase blended rating"], !individual.noGenericEdge),
    striking: makeRating(striking, source, confidence, sampleSize, ["striking offense", "defense", "power", "volume"]),
    wrestling: makeRating(wrestling, source, confidence, sampleSize, ["takedown offense", "defense", "control", "scramble"]),
    grappling: makeRating(grappling, source, confidence, sampleSize, ["submission threat", "submission defense", "top/bottom game"]),
    cardio: makeRating(cardio, source, confidence, sampleSize, ["early pace", "late pace", "stamina", "round-three trust"]),
    durability: makeRating(durability, source, confidence, sampleSize, ["chin", "recovery", "damage trend", "heart"]),
    fightIq: makeRating(fightIq, source, confidence, sampleSize, ["fight IQ", "game plan", "experience", "recent form"]),
    power: makeRating(power, "blended", confidence, sampleSize, ["power rating", "head kick threat", "power-hunting tendency"]),
    pressure: makeRating(pressure, "styleGenome", confidence, sampleSize, ["pressure tendency", "pace", "volume", "clinch control"]),
    pace: makeRating(pace, "styleGenome", confidence, sampleSize, ["volume tendency", "early pace", "pace sustain"]),
    control: makeRating(control, "blended", confidence, sampleSize, ["wrestling control", "top game", "clinch control"]),
    finishThreat: makeRating(finishThreat, "blended", confidence, sampleSize, ["KO/TKO and submission finish lanes"]),
    decisionFloor: makeRating(decisionFloor, "blended", confidence, sampleSize, ["safe lead management", "cardio", "defense", "control"]),
    defensiveReliability: makeRating(defensiveReliability, "blended", confidence, sampleSize, ["striking defense", "takedown defense", "submission defense"])
  };
  const standing = {
    pressure: round(genome.tendencies.pressure, 2),
    counterStriking: round(genome.tendencies.counterStriking, 2),
    volume: round(genome.tendencies.volume, 2),
    powerHunting: round(genome.tendencies.powerHunting, 2),
    legKickUsage: round(genome.tendencies.legKickUsage, 2),
    bodyWork: round(genome.tendencies.bodyWork, 2),
    headKickThreat: round(genome.tendencies.headKickThreat, 2),
    distanceManagement: round(fromSkill(skill.striking.distanceManagement), 2)
  };
  const wrestlingTendencies = {
    takedownInitiation: round(genome.tendencies.takedownInitiation, 2),
    chainWrestling: round(genome.tendencies.chainWrestling, 2),
    clinchEngagement: round(genome.tendencies.clinchEngagement, 2),
    cageControl: round(genome.tendencies.cageControl, 2),
    topControlPreference: round(genome.tendencies.topControlPreference, 2)
  };
  const grapplingTendencies = {
    groundAndPound: round(genome.tendencies.groundAndPound, 2),
    submissionHunting: round(genome.tendencies.submissionHunting, 2),
    backTakeHunting: round(genome.tendencies.backTakeHunting, 2),
    getUpUrgency: round(genome.tendencies.getUpUrgency, 2),
    scrambleChaos: round(genome.tendencies.scrambleChaos, 2)
  };
  const fightFlow = {
    earlyRoundUrgency: round(genome.tendencies.earlyRoundUrgency, 2),
    roundThreeDurability: round(genome.tendencies.roundThreeDurability, 2),
    championshipRoundTrust: round(genome.tendencies.championshipRoundTrust, 2),
    comebackRiskTaking: round(genome.tendencies.comebackRiskTaking, 2),
    safeLeadManagement: round(genome.tendencies.safeLeadManagement, 2),
    paceCrashRisk: round(genome.tendencies.paceCrashRisk, 2)
  };
  const labels = [...new Set([...topLabels(standing), ...topLabels(wrestlingTendencies), ...topLabels(grapplingTendencies), ...topLabels(fightFlow), ...individual.tendencies])].slice(0, 14);
  const phaseStrengths = {
    standing: round(weighted([[ratings.striking.value, 0.5], [ratings.power.value, 0.18], [ratings.pressure.value, 0.14], [skill.kicking.offense, 0.1], [skill.striking.distanceManagement, 0.08]]), 2),
    clinch: round(weighted([[skill.wrestling.clinchControl, 0.38], [skill.striking.clinchStriking, 0.28], [ratings.control.value, 0.18], [genome.tendencies.clinchEngagement, 0.16]]), 2),
    wrestling: round(weighted([[ratings.wrestling.value, 0.62], [genome.tendencies.chainWrestling, 0.2], [ratings.control.value, 0.18]]), 2),
    grappling: round(weighted([[ratings.grappling.value, 0.62], [genome.tendencies.submissionHunting, 0.2], [skill.grappling.topGame, 0.18]]), 2),
    cardioLate: round(weighted([[ratings.cardio.value, 0.55], [genome.tendencies.roundThreeDurability, 0.25], [genome.tendencies.championshipRoundTrust, 0.2]]), 2),
    finish: ratings.finishThreat.value,
    decision: ratings.decisionFloor.value
  };
  const winConditionMap: Record<UfcDeepProfileWinCondition, number> = {
    KO_TKO: round(clamp(weighted([[ratings.power.value, 0.38], [genome.tendencies.powerHunting, 0.22], [skill.striking.offense, 0.18], [skill.kicking.headKicks, 0.1], [skill.durability.heart, 0.12]])), 2),
    SUBMISSION: round(clamp(weighted([[skill.grappling.submissionThreat, 0.36], [genome.tendencies.submissionHunting, 0.28], [skill.grappling.topGame, 0.16], [skill.wrestling.control, 0.12], [genome.tendencies.backTakeHunting, 0.08]])), 2),
    DECISION_VOLUME: round(clamp(weighted([[ratings.pace.value, 0.3], [skill.striking.volume, 0.24], [skill.striking.defense, 0.18], [genome.tendencies.safeLeadManagement, 0.16], [ratings.cardio.value, 0.12]])), 2),
    DECISION_CONTROL: round(clamp(weighted([[ratings.control.value, 0.38], [skill.wrestling.control, 0.2], [skill.grappling.topGame, 0.18], [genome.tendencies.safeLeadManagement, 0.14], [ratings.fightIq.value, 0.1]])), 2),
    SCRAMBLE_CHAOS: round(clamp(weighted([[genome.tendencies.scrambleChaos, 0.4], [skill.wrestling.scramble, 0.22], [skill.grappling.reversals, 0.16], [genome.tendencies.comebackRiskTaking, 0.14], [ratings.finishThreat.value, 0.08]])), 2)
  };
  const risks = riskFlags({ skill, genome, individual, ratings });
  const dataRisk = round(clamp(100 - individual.readinessScore + (individual.noGenericEdge ? 18 : 0) + (genome.evidence.fallbackUsed ? 10 : 0)), 2);
  const paceCrashRisk = round(clamp(genome.tendencies.paceCrashRisk), 2);
  const finishRiskAgainst = round(clamp(100 - ratings.defensiveReliability.value + Math.max(0, 55 - skill.durability.chin) * 0.4 + Math.max(0, 55 - skill.grappling.submissionDefense) * 0.35), 2);
  const volatility = round(clamp(avg(ratings.finishThreat.value, winConditionMap.SCRAMBLE_CHAOS, genome.tendencies.comebackRiskTaking) - ratings.decisionFloor.value * 0.22 + risks.length * 3), 2);
  const warnings = [...new Set([...individual.warnings, ...genome.evidence.missingSignals.map((signal) => `missing signal: ${signal}`), ...risks.map((risk) => `risk:${risk}`)])].slice(0, 12);
  const blockers = [...new Set([...individual.blockers, ...(ratings.overall.usedInSim ? [] : ["DEEP_PROFILE_NOT_SIM_TRUSTED"])])];
  const simModifiers = {
    exchangeVolume: round((ratings.pace.value - 50) / 100, 4),
    strikingAccuracy: round((skill.striking.accuracy - 50) / 100, 4),
    powerSpike: round((ratings.power.value - 50) / 90, 4),
    takedownPressure: round((genome.tendencies.takedownInitiation - 50) / 100, 4),
    takedownDefense: round((skill.wrestling.takedownDefense - 50) / 100, 4),
    controlTime: round((ratings.control.value - 50) / 100, 4),
    submissionVolatility: round((genome.tendencies.submissionHunting - 50) / 100, 4),
    getUpUrgency: round((genome.tendencies.getUpUrgency - 50) / 100, 4),
    lateRoundDropoff: round((paceCrashRisk - 50) / 100, 4),
    decisionControl: round((ratings.decisionFloor.value - 50) / 100, 4),
    finishUrgency: round((ratings.finishThreat.value - 50) / 100, 4),
    confidenceCap: cap
  };
  const profile: UfcDeepFighterProfileV2 = {
    modelVersion: "ufc-deep-fighter-profile-v2",
    fighterId: args.fighterId ?? skill.fighterId,
    fighterName: args.fighterName ?? individual.fighterName ?? null,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    identity: {
      stance: individual.identity.stance ?? skill.stance,
      weightClass: individual.identity.weightClass ?? skill.weightClass,
      age: individual.identity.age,
      heightInches: individual.identity.heightInches,
      reachInches: individual.identity.reachInches,
      primaryArchetype: genome.archetype.primary,
      secondaryArchetypes: genome.archetype.secondary
    },
    sourceTrust: {
      readinessGrade: individual.readinessGrade,
      readinessScore: individual.readinessScore,
      skillSampleQuality: skill.sampleQuality,
      skillSampleReliability: skill.sampleReliability,
      genomeSourceQuality: genome.evidence.sourceQuality,
      trustedStatCount: individual.trustedStatCount,
      estimatedStatCount: individual.estimatedStatCount,
      sourceCounts: individual.sourceCounts,
      noGenericEdge: individual.noGenericEdge,
      maxConfidence: cap
    },
    ratings,
    tendencies: { standing, wrestling: wrestlingTendencies, grappling: grapplingTendencies, fightFlow, labels },
    phaseStrengths,
    winConditionMap,
    riskProfile: { flags: risks, volatility, dataRisk, finishRiskAgainst, paceCrashRisk, warnings, blockers },
    simModifiers,
    explainers: {
      summary: `${args.fighterName ?? individual.fighterName ?? skill.fighterId}: ${grade(ratings.overall.value)} deep profile, ${genome.archetype.primary}, overall ${ratings.overall.value.toFixed(1)}, confidence ${(ratings.overall.confidence * 100).toFixed(0)}%.`,
      strengths: strengths(ratings, genome),
      weaknesses: weaknesses(skill, genome, individual),
      matchupHooks: [...new Set([...individual.matchupHooks, ...genome.tacticalRules.opponentTriggers])].slice(0, 10),
      simNotes: [...new Set([...genome.tacticalRules.dangerZones, ...ratings.overall.drivers, ...labels.slice(0, 5)])].slice(0, 10)
    },
    raw: { skillProfile: skill, styleGenome: genome, individualProfile: individual }
  };
  return profile;
}

export function buildUfcDeepFighterProfileV2FromFeature(args: {
  fighterName?: string | null;
  payload?: unknown;
  feature: UfcModelFeatureSnapshot;
  featureHistory?: UfcModelFeatureSnapshot[];
  divisionBaseline?: UfcSkillProfileInput["divisionBaseline"];
  generatedAt?: string;
}) {
  const skillProfile = buildUfcFighterSkillProfile({ feature: args.feature, featureHistory: args.featureHistory, divisionBaseline: args.divisionBaseline });
  const individualProfile = buildIndividualUfcFighterProfile({ fighterId: args.feature.fighterId, fighterName: args.fighterName, payload: args.payload, feature: args.feature });
  const featureRoot = args.feature.feature && typeof args.feature.feature === "object" ? args.feature.feature : {};
  const styleGenome = buildUfcFighterStyleGenome({
    fighterId: args.feature.fighterId,
    skillProfile,
    profileIntelligence: typeof featureRoot.profileIntelligence === "object" && featureRoot.profileIntelligence !== null ? featureRoot.profileIntelligence as Record<string, unknown> : null,
    completeProfile: typeof featureRoot.completeProfile === "object" && featureRoot.completeProfile !== null ? featureRoot.completeProfile as Record<string, unknown> : null,
    feature: args.feature,
    generatedAt: args.generatedAt
  });
  return buildUfcDeepFighterProfileV2({ fighterId: args.feature.fighterId, fighterName: args.fighterName, skillProfile, styleGenome, individualProfile, generatedAt: args.generatedAt });
}
