import type { UfcDeepFighterProfileV2, UfcDeepProfileWinCondition } from "@/services/ufc/deep-fighter-profile-v2";

export type UfcDeepMatchupPhase = "standing" | "clinch" | "wrestling" | "grappling" | "cardio" | "durability" | "finish" | "decision";
export type UfcDeepMatchupLeader = "A" | "B" | "EVEN";
export type UfcDeepDangerType = "EARLY_POWER" | "TAKEDOWN_CHAIN" | "SUBMISSION_WINDOW" | "CARDIO_FADE" | "CHIN_EXPOSURE" | "LOW_TRUST_PROFILE" | "CONTROL_TRAP" | "SCRAMBLE_VOLATILITY";
export type UfcRoundLeverage = "A_FAST_START" | "B_FAST_START" | "A_LATE_EDGE" | "B_LATE_EDGE" | "VOLATILE" | "EVEN";

export type UfcDeepPhaseEdge = {
  phase: UfcDeepMatchupPhase;
  fighterA: number;
  fighterB: number;
  edge: number;
  leader: UfcDeepMatchupLeader;
  confidence: number;
  drivers: string[];
  summary: string;
};

export type UfcDeepDangerZone = {
  type: UfcDeepDangerType;
  target: "A" | "B" | "BOTH";
  severity: number;
  confidence: number;
  drivers: string[];
  summary: string;
};

export type UfcDeepWinConditionPath = {
  fighter: "A" | "B";
  fighterId: string;
  fighterName: string | null;
  condition: UfcDeepProfileWinCondition;
  score: number;
  confidence: number;
  phaseLink: UfcDeepMatchupPhase;
  drivers: string[];
  summary: string;
};

export type UfcDeepRoundLeverageRow = {
  round: 1 | 2 | 3 | 4 | 5;
  leverage: UfcRoundLeverage;
  fighterA: number;
  fighterB: number;
  volatility: number;
  drivers: string[];
  summary: string;
};

export type UfcDeepProfileMatchup = {
  modelVersion: "ufc-deep-profile-matchup-engine-v1";
  generatedAt: string;
  fightId: string | null;
  fighterA: {
    fighterId: string;
    fighterName: string | null;
    archetype: string;
    overall: number;
    confidence: number;
  };
  fighterB: {
    fighterId: string;
    fighterName: string | null;
    archetype: string;
    overall: number;
    confidence: number;
  };
  overallEdge: {
    leader: UfcDeepMatchupLeader;
    edge: number;
    confidence: number;
    summary: string;
  };
  phaseEdges: Record<UfcDeepMatchupPhase, UfcDeepPhaseEdge>;
  topPhaseEdges: UfcDeepPhaseEdge[];
  dangerZones: UfcDeepDangerZone[];
  winConditionPaths: UfcDeepWinConditionPath[];
  roundLeverage: UfcDeepRoundLeverageRow[];
  simModifiers: {
    fighterA: Record<string, number>;
    fighterB: Record<string, number>;
    matchup: Record<string, number>;
  };
  warnings: string[];
  summary: string;
};

type BuildArgs = {
  fighterA: UfcDeepFighterProfileV2;
  fighterB: UfcDeepFighterProfileV2;
  fightId?: string | null;
  generatedAt?: string;
};

type Side = "A" | "B";

const PHASES: UfcDeepMatchupPhase[] = ["standing", "clinch", "wrestling", "grappling", "cardio", "durability", "finish", "decision"];

function round(value: number, digits = 3) { return Number(value.toFixed(digits)); }
function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
function avg(...values: number[]) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function leaderFromEdge(edge: number): UfcDeepMatchupLeader { return Math.abs(edge) < 3.5 ? "EVEN" : edge > 0 ? "A" : "B"; }
function sideName(side: Side, a: UfcDeepFighterProfileV2, b: UfcDeepFighterProfileV2) { return side === "A" ? a.fighterName ?? a.fighterId : b.fighterName ?? b.fighterId; }
function confidence(a: UfcDeepFighterProfileV2, b: UfcDeepFighterProfileV2, edge: number) {
  const base = avg(a.ratings.overall.confidence, b.ratings.overall.confidence);
  const edgeBoost = Math.min(0.12, Math.abs(edge) / 180);
  const dataPenalty = Math.max(a.riskProfile.dataRisk, b.riskProfile.dataRisk) / 650;
  return round(clamp(base + edgeBoost - dataPenalty, 0.12, Math.min(a.sourceTrust.maxConfidence, b.sourceTrust.maxConfidence)), 3);
}
function edge(a: number, b: number) { return round(a - b, 2); }
function drivers(...items: Array<string | null | undefined | string[]>) {
  return [...new Set(items.flatMap((item) => Array.isArray(item) ? item : item ? [item] : []))].slice(0, 8);
}
function tendency(profile: UfcDeepFighterProfileV2, group: keyof UfcDeepFighterProfileV2["tendencies"], key: string) {
  if (group === "labels") return 0;
  const value = profile.tendencies[group][key];
  return typeof value === "number" && Number.isFinite(value) ? value : 50;
}
function phaseScore(phase: UfcDeepMatchupPhase, p: UfcDeepFighterProfileV2, opp: UfcDeepFighterProfileV2) {
  switch (phase) {
    case "standing":
      return clamp(p.phaseStrengths.standing * 0.5 + p.ratings.power.value * 0.13 + p.ratings.pace.value * 0.1 + p.ratings.defensiveReliability.value * 0.12 + (100 - opp.ratings.defensiveReliability.value) * 0.08 + tendency(p, "standing", "distanceManagement") * 0.07);
    case "clinch":
      return clamp(p.phaseStrengths.clinch * 0.52 + p.ratings.control.value * 0.2 + tendency(p, "wrestling", "clinchEngagement") * 0.16 + (100 - opp.phaseStrengths.clinch) * 0.12);
    case "wrestling":
      return clamp(p.phaseStrengths.wrestling * 0.48 + p.ratings.control.value * 0.18 + tendency(p, "wrestling", "chainWrestling") * 0.14 + (100 - opp.ratings.wrestling.value) * 0.12 + (100 - opp.simModifiers.takedownDefense * 100 - 50) * 0.08);
    case "grappling":
      return clamp(p.phaseStrengths.grappling * 0.48 + p.ratings.finishThreat.value * 0.14 + tendency(p, "grappling", "submissionHunting") * 0.18 + (100 - opp.ratings.grappling.value) * 0.12 + (100 - opp.ratings.defensiveReliability.value) * 0.08);
    case "cardio":
      return clamp(p.phaseStrengths.cardioLate * 0.55 + p.ratings.cardio.value * 0.25 + (100 - p.riskProfile.paceCrashRisk) * 0.12 + (100 - opp.phaseStrengths.cardioLate) * 0.08);
    case "durability":
      return clamp(p.ratings.durability.value * 0.44 + p.ratings.defensiveReliability.value * 0.24 + (100 - p.riskProfile.finishRiskAgainst) * 0.18 + (100 - opp.ratings.finishThreat.value) * 0.14);
    case "finish":
      return clamp(p.phaseStrengths.finish * 0.42 + p.ratings.finishThreat.value * 0.26 + p.winConditionMap.KO_TKO * 0.12 + p.winConditionMap.SUBMISSION * 0.12 + (100 - opp.ratings.durability.value) * 0.08);
    case "decision":
      return clamp(p.phaseStrengths.decision * 0.44 + p.ratings.decisionFloor.value * 0.26 + p.ratings.fightIq.value * 0.14 + (100 - p.riskProfile.volatility) * 0.08 + (100 - opp.ratings.decisionFloor.value) * 0.08);
  }
}
function phaseSummary(phase: UfcDeepMatchupPhase, leader: UfcDeepMatchupLeader, edgeValue: number, a: UfcDeepFighterProfileV2, b: UfcDeepFighterProfileV2) {
  const name = leader === "A" ? sideName("A", a, b) : leader === "B" ? sideName("B", a, b) : "Neither fighter";
  return `${phase}: ${name} ${leader === "EVEN" ? "has no clear edge" : `leads by ${Math.abs(edgeValue).toFixed(1)}`}.`;
}
function buildPhaseEdge(phase: UfcDeepMatchupPhase, a: UfcDeepFighterProfileV2, b: UfcDeepFighterProfileV2): UfcDeepPhaseEdge {
  const fighterA = round(phaseScore(phase, a, b), 2);
  const fighterB = round(phaseScore(phase, b, a), 2);
  const edgeValue = edge(fighterA, fighterB);
  const leader = leaderFromEdge(edgeValue);
  const phaseDrivers = drivers(
    `${phase}_profile_delta`,
    leader === "A" ? a.identity.primaryArchetype : leader === "B" ? b.identity.primaryArchetype : "balanced_phase",
    leader === "A" ? a.explainers.strengths.slice(0, 2) : leader === "B" ? b.explainers.strengths.slice(0, 2) : []
  );
  return { phase, fighterA, fighterB, edge: edgeValue, leader, confidence: confidence(a, b, edgeValue), drivers: phaseDrivers, summary: phaseSummary(phase, leader, edgeValue, a, b) };
}
function danger(type: UfcDeepDangerType, target: "A" | "B" | "BOTH", severity: number, conf: number, summary: string, driverList: string[]): UfcDeepDangerZone {
  return { type, target, severity: round(clamp(severity), 2), confidence: round(clamp(conf, 0.1, 0.96), 3), drivers: [...new Set(driverList)].slice(0, 8), summary };
}
function buildDangerZones(a: UfcDeepFighterProfileV2, b: UfcDeepFighterProfileV2, phases: Record<UfcDeepMatchupPhase, UfcDeepPhaseEdge>): UfcDeepDangerZone[] {
  const out: UfcDeepDangerZone[] = [];
  const aPowerOnB = a.ratings.power.value - b.ratings.defensiveReliability.value;
  const bPowerOnA = b.ratings.power.value - a.ratings.defensiveReliability.value;
  if (aPowerOnB > 10) out.push(danger("EARLY_POWER", "B", 52 + aPowerOnB, confidence(a, b, aPowerOnB), `${sideName("B", a, b)} has early power exposure against ${sideName("A", a, b)}.`, ["power_vs_defense", ...a.ratings.power.drivers]));
  if (bPowerOnA > 10) out.push(danger("EARLY_POWER", "A", 52 + bPowerOnA, confidence(a, b, bPowerOnA), `${sideName("A", a, b)} has early power exposure against ${sideName("B", a, b)}.`, ["power_vs_defense", ...b.ratings.power.drivers]));
  const aTd = tendency(a, "wrestling", "chainWrestling") - b.ratings.wrestling.value;
  const bTd = tendency(b, "wrestling", "chainWrestling") - a.ratings.wrestling.value;
  if (aTd > 8) out.push(danger("TAKEDOWN_CHAIN", "B", 50 + aTd, confidence(a, b, aTd), `${sideName("B", a, b)} can be put into takedown chains by ${sideName("A", a, b)}.`, ["chain_wrestling_gap", ...a.ratings.control.drivers]));
  if (bTd > 8) out.push(danger("TAKEDOWN_CHAIN", "A", 50 + bTd, confidence(a, b, bTd), `${sideName("A", a, b)} can be put into takedown chains by ${sideName("B", a, b)}.`, ["chain_wrestling_gap", ...b.ratings.control.drivers]));
  const aSub = a.winConditionMap.SUBMISSION - b.ratings.grappling.value;
  const bSub = b.winConditionMap.SUBMISSION - a.ratings.grappling.value;
  if (aSub > 8) out.push(danger("SUBMISSION_WINDOW", "B", 48 + aSub, confidence(a, b, aSub), `${sideName("A", a, b)} has a submission window if grappling exchanges develop.`, ["submission_vs_grappling_defense", ...a.ratings.grappling.drivers]));
  if (bSub > 8) out.push(danger("SUBMISSION_WINDOW", "A", 48 + bSub, confidence(a, b, bSub), `${sideName("B", a, b)} has a submission window if grappling exchanges develop.`, ["submission_vs_grappling_defense", ...b.ratings.grappling.drivers]));
  if (a.riskProfile.paceCrashRisk >= 62 || phases.cardio.edge < -8) out.push(danger("CARDIO_FADE", "A", Math.max(a.riskProfile.paceCrashRisk, 55 - phases.cardio.edge), a.ratings.cardio.confidence, `${sideName("A", a, b)} has late-round cardio fade risk.`, ["pace_crash", ...a.riskProfile.flags]));
  if (b.riskProfile.paceCrashRisk >= 62 || phases.cardio.edge > 8) out.push(danger("CARDIO_FADE", "B", Math.max(b.riskProfile.paceCrashRisk, 55 + phases.cardio.edge), b.ratings.cardio.confidence, `${sideName("B", a, b)} has late-round cardio fade risk.`, ["pace_crash", ...b.riskProfile.flags]));
  if (a.riskProfile.finishRiskAgainst >= 62) out.push(danger("CHIN_EXPOSURE", "A", a.riskProfile.finishRiskAgainst, a.ratings.durability.confidence, `${sideName("A", a, b)} carries elevated finish-risk-against.`, ["finish_risk_against", ...a.riskProfile.flags]));
  if (b.riskProfile.finishRiskAgainst >= 62) out.push(danger("CHIN_EXPOSURE", "B", b.riskProfile.finishRiskAgainst, b.ratings.durability.confidence, `${sideName("B", a, b)} carries elevated finish-risk-against.`, ["finish_risk_against", ...b.riskProfile.flags]));
  if (a.sourceTrust.noGenericEdge || a.sourceTrust.readinessScore < 58) out.push(danger("LOW_TRUST_PROFILE", "A", 100 - a.sourceTrust.readinessScore, a.ratings.overall.confidence, `${sideName("A", a, b)} has low source-trust profile risk.`, ["source_trust", ...a.riskProfile.warnings]));
  if (b.sourceTrust.noGenericEdge || b.sourceTrust.readinessScore < 58) out.push(danger("LOW_TRUST_PROFILE", "B", 100 - b.sourceTrust.readinessScore, b.ratings.overall.confidence, `${sideName("B", a, b)} has low source-trust profile risk.`, ["source_trust", ...b.riskProfile.warnings]));
  const controlGap = Math.abs(phases.wrestling.edge) + Math.abs(phases.grappling.edge);
  if (controlGap >= 22) out.push(danger("CONTROL_TRAP", phases.wrestling.leader === "A" || phases.grappling.leader === "A" ? "B" : "A", clamp(46 + controlGap), Math.max(phases.wrestling.confidence, phases.grappling.confidence), "Large grappling/wrestling gap creates a control-trap path.", ["wrestling_grappling_gap"]));
  const scrambleVol = avg(a.winConditionMap.SCRAMBLE_CHAOS, b.winConditionMap.SCRAMBLE_CHAOS, a.riskProfile.volatility, b.riskProfile.volatility);
  if (scrambleVol >= 66) out.push(danger("SCRAMBLE_VOLATILITY", "BOTH", scrambleVol, avg(a.ratings.overall.confidence, b.ratings.overall.confidence), "Both profiles create scramble volatility and unstable finishing/control swings.", ["scramble_chaos", a.identity.primaryArchetype, b.identity.primaryArchetype]));
  return out.sort((left, right) => right.severity - left.severity).slice(0, 10);
}
function conditionPhase(condition: UfcDeepProfileWinCondition): UfcDeepMatchupPhase {
  if (condition === "KO_TKO") return "finish";
  if (condition === "SUBMISSION" || condition === "SCRAMBLE_CHAOS") return "grappling";
  if (condition === "DECISION_CONTROL") return "wrestling";
  return "decision";
}
function pathScore(condition: UfcDeepProfileWinCondition, p: UfcDeepFighterProfileV2, opp: UfcDeepFighterProfileV2, phases: Record<UfcDeepMatchupPhase, UfcDeepPhaseEdge>, side: Side) {
  const phase = conditionPhase(condition);
  const phaseEdge = phases[phase].leader === side ? Math.abs(phases[phase].edge) : phases[phase].leader === "EVEN" ? 0 : -Math.abs(phases[phase].edge);
  const defensiveGap = condition === "KO_TKO" ? 100 - opp.ratings.durability.value : condition === "SUBMISSION" ? 100 - opp.ratings.grappling.value : condition === "DECISION_CONTROL" ? 100 - opp.ratings.wrestling.value : condition === "SCRAMBLE_CHAOS" ? p.riskProfile.volatility : 100 - opp.ratings.decisionFloor.value;
  return clamp(p.winConditionMap[condition] * 0.62 + (50 + phaseEdge) * 0.18 + defensiveGap * 0.12 + p.ratings.overall.value * 0.08);
}
function buildWinPaths(side: Side, p: UfcDeepFighterProfileV2, opp: UfcDeepFighterProfileV2, phases: Record<UfcDeepMatchupPhase, UfcDeepPhaseEdge>, a: UfcDeepFighterProfileV2, b: UfcDeepFighterProfileV2): UfcDeepWinConditionPath[] {
  return (Object.keys(p.winConditionMap) as UfcDeepProfileWinCondition[]).map((condition) => {
    const phaseLink = conditionPhase(condition);
    const score = round(pathScore(condition, p, opp, phases, side), 2);
    return {
      fighter: side,
      fighterId: p.fighterId,
      fighterName: p.fighterName,
      condition,
      score,
      confidence: confidence(a, b, score - 50),
      phaseLink,
      drivers: drivers(condition, p.identity.primaryArchetype, p.explainers.strengths.slice(0, 3), phases[phaseLink].drivers.slice(0, 2)),
      summary: `${sideName(side, a, b)} ${condition.toLowerCase().replace(/_/g, " ")} path grades ${score.toFixed(1)}.`
    };
  }).sort((left, right) => right.score - left.score).slice(0, 3);
}
function roundScore(round: 1 | 2 | 3 | 4 | 5, p: UfcDeepFighterProfileV2, opp: UfcDeepFighterProfileV2) {
  const early = tendency(p, "fightFlow", "earlyRoundUrgency");
  const late = round >= 4 ? tendency(p, "fightFlow", "championshipRoundTrust") : round === 3 ? tendency(p, "fightFlow", "roundThreeDurability") : p.ratings.cardio.value;
  const pressure = p.ratings.pressure.value;
  const control = p.ratings.control.value;
  const decision = p.ratings.decisionFloor.value;
  const fade = p.riskProfile.paceCrashRisk;
  const oppFinish = opp.ratings.finishThreat.value;
  if (round === 1) return clamp(early * 0.34 + pressure * 0.2 + p.ratings.finishThreat.value * 0.16 + p.ratings.overall.value * 0.2 + (100 - oppFinish) * 0.1);
  if (round === 2) return clamp(p.ratings.overall.value * 0.32 + pressure * 0.18 + control * 0.18 + decision * 0.16 + late * 0.16);
  if (round === 3) return clamp(late * 0.34 + p.ratings.cardio.value * 0.2 + decision * 0.18 + control * 0.14 + (100 - fade) * 0.14);
  return clamp(late * 0.38 + p.ratings.cardio.value * 0.2 + decision * 0.18 + p.ratings.fightIq.value * 0.14 + (100 - fade) * 0.1);
}
function leverageLabel(round: 1 | 2 | 3 | 4 | 5, edgeValue: number, volatility: number): UfcRoundLeverage {
  if (volatility >= 72) return "VOLATILE";
  if (Math.abs(edgeValue) < 3.5) return "EVEN";
  if (round <= 2) return edgeValue > 0 ? "A_FAST_START" : "B_FAST_START";
  return edgeValue > 0 ? "A_LATE_EDGE" : "B_LATE_EDGE";
}
function buildRoundLeverage(a: UfcDeepFighterProfileV2, b: UfcDeepFighterProfileV2): UfcDeepRoundLeverageRow[] {
  const rounds: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];
  return rounds.map((roundNo) => {
    const fighterA = round(roundScore(roundNo, a, b), 2);
    const fighterB = round(roundScore(roundNo, b, a), 2);
    const edgeValue = fighterA - fighterB;
    const volatility = round(clamp(avg(a.riskProfile.volatility, b.riskProfile.volatility, Math.abs(edgeValue) * 2)), 2);
    const leverage = leverageLabel(roundNo, edgeValue, volatility);
    const leader = edgeValue > 0 ? sideName("A", a, b) : edgeValue < 0 ? sideName("B", a, b) : "Neither fighter";
    return {
      round: roundNo,
      leverage,
      fighterA,
      fighterB,
      volatility,
      drivers: drivers(leverage, roundNo <= 2 ? "early_phase" : "late_phase", Math.abs(edgeValue) >= 6 ? "clear_round_edge" : "thin_round_edge"),
      summary: `Round ${roundNo}: ${leader} ${Math.abs(edgeValue) < 3.5 ? "is near even" : `projects +${Math.abs(edgeValue).toFixed(1)}`}; volatility ${volatility.toFixed(1)}.`
    };
  });
}
function simSide(profile: UfcDeepFighterProfileV2) {
  return {
    exchangeVolume: profile.simModifiers.exchangeVolume,
    strikingAccuracy: profile.simModifiers.strikingAccuracy,
    powerSpike: profile.simModifiers.powerSpike,
    takedownPressure: profile.simModifiers.takedownPressure,
    takedownDefense: profile.simModifiers.takedownDefense,
    controlTime: profile.simModifiers.controlTime,
    submissionVolatility: profile.simModifiers.submissionVolatility,
    getUpUrgency: profile.simModifiers.getUpUrgency,
    lateRoundDropoff: profile.simModifiers.lateRoundDropoff,
    decisionControl: profile.simModifiers.decisionControl,
    finishUrgency: profile.simModifiers.finishUrgency,
    confidenceCap: profile.simModifiers.confidenceCap
  };
}
function diffModifiers(a: UfcDeepFighterProfileV2, b: UfcDeepFighterProfileV2) {
  return {
    standingDelta: round((a.phaseStrengths.standing - b.phaseStrengths.standing) / 100, 4),
    wrestlingDelta: round((a.phaseStrengths.wrestling - b.phaseStrengths.wrestling) / 100, 4),
    grapplingDelta: round((a.phaseStrengths.grappling - b.phaseStrengths.grappling) / 100, 4),
    finishDelta: round((a.ratings.finishThreat.value - b.ratings.finishThreat.value) / 100, 4),
    decisionDelta: round((a.ratings.decisionFloor.value - b.ratings.decisionFloor.value) / 100, 4),
    volatility: round(avg(a.riskProfile.volatility, b.riskProfile.volatility) / 100, 4),
    trustPenalty: round(Math.max(a.riskProfile.dataRisk, b.riskProfile.dataRisk) / 100, 4)
  };
}

export function buildUfcDeepProfileMatchupEngine(args: BuildArgs): UfcDeepProfileMatchup {
  const a = args.fighterA;
  const b = args.fighterB;
  const phaseEntries = PHASES.map((phase) => [phase, buildPhaseEdge(phase, a, b)] as const);
  const phaseEdges = Object.fromEntries(phaseEntries) as Record<UfcDeepMatchupPhase, UfcDeepPhaseEdge>;
  const topPhaseEdges = [...Object.values(phaseEdges)].sort((left, right) => Math.abs(right.edge) - Math.abs(left.edge)).slice(0, 5);
  const overallRaw = weightedOverallEdge(phaseEdges, a, b);
  const overallLeader = leaderFromEdge(overallRaw);
  const overallConfidence = confidence(a, b, overallRaw);
  const dangerZones = buildDangerZones(a, b, phaseEdges);
  const winConditionPaths = [...buildWinPaths("A", a, b, phaseEdges, a, b), ...buildWinPaths("B", b, a, phaseEdges, a, b)].sort((left, right) => right.score - left.score).slice(0, 8);
  const roundLeverage = buildRoundLeverage(a, b);
  const warnings = [...new Set([...a.riskProfile.warnings.map((item) => `A:${item}`), ...b.riskProfile.warnings.map((item) => `B:${item}`), ...dangerZones.filter((zone) => zone.type === "LOW_TRUST_PROFILE").map((zone) => `${zone.target}:low_trust`)])].slice(0, 14);
  const leaderName = overallLeader === "A" ? sideName("A", a, b) : overallLeader === "B" ? sideName("B", a, b) : "No clear side";
  return {
    modelVersion: "ufc-deep-profile-matchup-engine-v1",
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    fightId: args.fightId ?? null,
    fighterA: { fighterId: a.fighterId, fighterName: a.fighterName, archetype: a.identity.primaryArchetype, overall: a.ratings.overall.value, confidence: a.ratings.overall.confidence },
    fighterB: { fighterId: b.fighterId, fighterName: b.fighterName, archetype: b.identity.primaryArchetype, overall: b.ratings.overall.value, confidence: b.ratings.overall.confidence },
    overallEdge: { leader: overallLeader, edge: round(overallRaw, 2), confidence: overallConfidence, summary: `${leaderName} ${overallLeader === "EVEN" ? "has no clear deep-profile edge" : `leads the deep-profile matchup by ${Math.abs(overallRaw).toFixed(1)}`}.` },
    phaseEdges,
    topPhaseEdges,
    dangerZones,
    winConditionPaths,
    roundLeverage,
    simModifiers: { fighterA: simSide(a), fighterB: simSide(b), matchup: diffModifiers(a, b) },
    warnings,
    summary: `${leaderName} ${overallLeader === "EVEN" ? "profiles near even" : "owns the top profile edge"}; top phase ${topPhaseEdges[0]?.phase ?? "none"}; ${dangerZones.length} danger zones; best path ${winConditionPaths[0]?.condition ?? "unavailable"}.`
  };
}

function weightedOverallEdge(phases: Record<UfcDeepMatchupPhase, UfcDeepPhaseEdge>, a: UfcDeepFighterProfileV2, b: UfcDeepFighterProfileV2) {
  const phaseEdge = phases.standing.edge * 0.16 + phases.clinch.edge * 0.08 + phases.wrestling.edge * 0.14 + phases.grappling.edge * 0.14 + phases.cardio.edge * 0.12 + phases.durability.edge * 0.1 + phases.finish.edge * 0.14 + phases.decision.edge * 0.12;
  const overall = (a.ratings.overall.value - b.ratings.overall.value) * 0.34;
  const trust = (a.sourceTrust.readinessScore - b.sourceTrust.readinessScore) * 0.04;
  return round(phaseEdge * 0.62 + overall + trust, 3);
}
