import type { UfcFighterStyleGenome } from "@/services/ufc/fighter-style-genome";

export type UfcMatchupStyleClash = {
  version: "ufc-style-clash-v1";
  generatedAt: string;
  fighterAId: string;
  fighterBId: string;
  archetypes: {
    fighterA: string;
    fighterB: string;
    fighterASecondary: string[];
    fighterBSecondary: string[];
  };
  paceProjection: number;
  rangeControlEdgeA: number;
  wrestlingInitiativeEdgeA: number;
  groundControlRiskA: number;
  submissionVolatilityA: number;
  chaosIndex: number;
  finishVolatility: number;
  decisionReliability: number;
  styleWarnings: string[];
  pathToVictoryA: string[];
  pathToVictoryB: string[];
  simModifiers: {
    exchangeVolume: number;
    clinchRate: number;
    takedownAttemptRateA: number;
    takedownAttemptRateB: number;
    takedownSuccessA: number;
    takedownSuccessB: number;
    topControlRetentionA: number;
    topControlRetentionB: number;
    submissionThreatA: number;
    submissionThreatB: number;
    knockdownVolatilityA: number;
    knockdownVolatilityB: number;
    latePaceA: number;
    latePaceB: number;
    decisionVariance: number;
  };
};

function clamp(value: number, min = -100, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function edge(a: number, b: number) {
  return clamp(a - b);
}

function avg(...values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 50;
}

function modifier(value: number, divisor = 100) {
  return round(clamp(value, -100, 100) / divisor, 4);
}

function high(value: number, threshold = 68) {
  return value >= threshold;
}

function low(value: number, threshold = 42) {
  return value <= threshold;
}

function archetypeWarning(a: UfcFighterStyleGenome, b: UfcFighterStyleGenome) {
  const warnings: string[] = [];
  const at = a.tendencies;
  const bt = b.tendencies;
  if (high(at.pressure) && high(bt.counterStriking)) warnings.push("Fighter A pressure runs into Fighter B counter-striking volatility.");
  if (high(bt.pressure) && high(at.counterStriking)) warnings.push("Fighter B pressure runs into Fighter A counter-striking volatility.");
  if (high(at.takedownInitiation) && high(bt.submissionHunting)) warnings.push("Fighter A takedown entries may feed Fighter B submission counters.");
  if (high(bt.takedownInitiation) && high(at.submissionHunting)) warnings.push("Fighter B takedown entries may feed Fighter A submission counters.");
  if (high(at.paceCrashRisk) && high(bt.volume)) warnings.push("Fighter A pace-crash risk is amplified by Fighter B volume.");
  if (high(bt.paceCrashRisk) && high(at.volume)) warnings.push("Fighter B pace-crash risk is amplified by Fighter A volume.");
  if (high(at.topControlPreference) && low(bt.getUpUrgency)) warnings.push("Fighter A top-control path is live if takedowns land.");
  if (high(bt.topControlPreference) && low(at.getUpUrgency)) warnings.push("Fighter B top-control path is live if takedowns land.");
  return warnings;
}

function pathFor(label: "A" | "B", fighter: UfcFighterStyleGenome, opponent: UfcFighterStyleGenome) {
  const t = fighter.tendencies;
  const o = opponent.tendencies;
  const paths: string[] = [];
  if (high(t.pressure) && !high(o.counterStriking)) paths.push(`Fighter ${label}: pressure volume can bank minutes and force defensive exchanges.`);
  if (high(t.counterStriking) && high(o.pressure)) paths.push(`Fighter ${label}: counter-striking lane opens when opponent pressures.`);
  if (high(t.takedownInitiation) && !high(o.getUpUrgency)) paths.push(`Fighter ${label}: wrestling initiation can turn into control time.`);
  if (high(t.chainWrestling) && o.topControlPreference < 60) paths.push(`Fighter ${label}: chain wrestling can compound failed first-shot defenses.`);
  if (high(t.submissionHunting) && (high(o.takedownInitiation) || low(o.safeLeadManagement))) paths.push(`Fighter ${label}: submission hunting creates volatility in scrambles and entries.`);
  if (high(t.powerHunting) && low(o.roundThreeDurability)) paths.push(`Fighter ${label}: power threat gets stronger if opponent durability fades.`);
  if (high(t.safeLeadManagement) && high(topControlOrRange(fighter))) paths.push(`Fighter ${label}: safe lead management supports decision equity once ahead.`);
  if (!paths.length) paths.push(`Fighter ${label}: balanced path depends on narrow skill edges and round-to-round variance.`);
  return paths.slice(0, 5);
}

function topControlOrRange(fighter: UfcFighterStyleGenome) {
  return Math.max(fighter.tendencies.topControlPreference, fighter.tendencies.safeLeadManagement, fighter.tendencies.legKickUsage);
}

export function buildUfcMatchupStyleClash(fighterA: UfcFighterStyleGenome, fighterB: UfcFighterStyleGenome, generatedAt = new Date().toISOString()): UfcMatchupStyleClash {
  const a = fighterA.tendencies;
  const b = fighterB.tendencies;
  const paceProjection = round(clamp(avg(a.volume, b.volume, a.pressure, b.pressure, a.earlyRoundUrgency, b.earlyRoundUrgency), 1, 99), 2);
  const rangeControlEdgeA = round(edge(avg(a.legKickUsage, a.bodyWork, a.headKickThreat, a.safeLeadManagement, a.counterStriking), avg(b.legKickUsage, b.bodyWork, b.headKickThreat, b.safeLeadManagement, b.counterStriking)), 2);
  const wrestlingInitiativeEdgeA = round(edge(avg(a.takedownInitiation, a.chainWrestling, a.clinchEngagement), avg(b.takedownInitiation, b.chainWrestling, b.clinchEngagement)), 2);
  const groundControlRiskA = round(edge(avg(b.takedownInitiation, b.chainWrestling, b.topControlPreference, b.cageControl), avg(a.getUpUrgency, a.scrambleChaos, a.safeLeadManagement)), 2);
  const submissionVolatilityA = round(edge(avg(a.submissionHunting, a.backTakeHunting, a.scrambleChaos, b.takedownInitiation), avg(b.submissionHunting, b.backTakeHunting, b.scrambleChaos, a.takedownInitiation)), 2);
  const chaosIndex = round(clamp(avg(a.scrambleChaos, b.scrambleChaos, a.comebackRiskTaking, b.comebackRiskTaking, a.powerHunting, b.powerHunting, 100 - a.safeLeadManagement, 100 - b.safeLeadManagement), 1, 99), 2);
  const finishVolatility = round(clamp(avg(a.powerHunting, b.powerHunting, a.submissionHunting, b.submissionHunting, a.comebackRiskTaking, b.comebackRiskTaking, chaosIndex), 1, 99), 2);
  const decisionReliability = round(clamp(avg(a.safeLeadManagement, b.safeLeadManagement, a.roundThreeDurability, b.roundThreeDurability, 100 - chaosIndex, 100 - finishVolatility), 1, 99), 2);
  const styleWarnings = archetypeWarning(fighterA, fighterB);
  return {
    version: "ufc-style-clash-v1",
    generatedAt,
    fighterAId: fighterA.fighterId,
    fighterBId: fighterB.fighterId,
    archetypes: {
      fighterA: fighterA.archetype.primary,
      fighterB: fighterB.archetype.primary,
      fighterASecondary: fighterA.archetype.secondary,
      fighterBSecondary: fighterB.archetype.secondary
    },
    paceProjection,
    rangeControlEdgeA,
    wrestlingInitiativeEdgeA,
    groundControlRiskA,
    submissionVolatilityA,
    chaosIndex,
    finishVolatility,
    decisionReliability,
    styleWarnings,
    pathToVictoryA: pathFor("A", fighterA, fighterB),
    pathToVictoryB: pathFor("B", fighterB, fighterA),
    simModifiers: {
      exchangeVolume: modifier(paceProjection - 50, 180),
      clinchRate: modifier(avg(a.clinchEngagement, b.clinchEngagement) - 50, 210),
      takedownAttemptRateA: modifier(wrestlingInitiativeEdgeA + a.takedownInitiation - 50, 160),
      takedownAttemptRateB: modifier(-wrestlingInitiativeEdgeA + b.takedownInitiation - 50, 160),
      takedownSuccessA: modifier(wrestlingInitiativeEdgeA - b.getUpUrgency * 0.15 + a.chainWrestling * 0.18, 220),
      takedownSuccessB: modifier(-wrestlingInitiativeEdgeA - a.getUpUrgency * 0.15 + b.chainWrestling * 0.18, 220),
      topControlRetentionA: modifier(a.topControlPreference - b.getUpUrgency + a.cageControl * 0.2, 220),
      topControlRetentionB: modifier(b.topControlPreference - a.getUpUrgency + b.cageControl * 0.2, 220),
      submissionThreatA: modifier(submissionVolatilityA + a.submissionHunting * 0.25, 190),
      submissionThreatB: modifier(-submissionVolatilityA + b.submissionHunting * 0.25, 190),
      knockdownVolatilityA: modifier(a.powerHunting + a.counterStriking - b.safeLeadManagement - 50, 240),
      knockdownVolatilityB: modifier(b.powerHunting + b.counterStriking - a.safeLeadManagement - 50, 240),
      latePaceA: modifier(a.roundThreeDurability - a.paceCrashRisk - (b.volume - 50) * 0.25, 180),
      latePaceB: modifier(b.roundThreeDurability - b.paceCrashRisk - (a.volume - 50) * 0.25, 180),
      decisionVariance: modifier(50 - decisionReliability + chaosIndex * 0.2, 160)
    }
  };
}

export function noStyleClash(fighterAId: string, fighterBId: string): UfcMatchupStyleClash {
  return {
    version: "ufc-style-clash-v1",
    generatedAt: new Date().toISOString(),
    fighterAId,
    fighterBId,
    archetypes: { fighterA: "Unknown", fighterB: "Unknown", fighterASecondary: [], fighterBSecondary: [] },
    paceProjection: 50,
    rangeControlEdgeA: 0,
    wrestlingInitiativeEdgeA: 0,
    groundControlRiskA: 0,
    submissionVolatilityA: 0,
    chaosIndex: 50,
    finishVolatility: 50,
    decisionReliability: 50,
    styleWarnings: [],
    pathToVictoryA: [],
    pathToVictoryB: [],
    simModifiers: { exchangeVolume: 0, clinchRate: 0, takedownAttemptRateA: 0, takedownAttemptRateB: 0, takedownSuccessA: 0, takedownSuccessB: 0, topControlRetentionA: 0, topControlRetentionB: 0, submissionThreatA: 0, submissionThreatB: 0, knockdownVolatilityA: 0, knockdownVolatilityB: 0, latePaceA: 0, latePaceB: 0, decisionVariance: 0 }
  };
}
