import type { UfcFighterSkillProfile } from "@/services/ufc/fighter-skill-profile";
import type { UfcFighterStyleGenome } from "@/services/ufc/fighter-style-genome";
import type { UfcMatchupStyleClash } from "@/services/ufc/matchup-style-clash";
import { buildUfcMatchupSkillDeltas, type UfcMatchupSkillDeltas } from "@/services/ufc/matchup-skill-deltas";

export type UfcSkillMarkovResult = {
  simulations: number;
  seed: number;
  fighterAWinProbability: number;
  fighterBWinProbability: number;
  methodProbabilities: { KO_TKO: number; SUBMISSION: number; DECISION: number };
  roundFinishProbabilities: Record<string, number>;
  transitionProbabilities: {
    standingToClinchA: number;
    standingToTakedownAttemptA: number;
    takedownSuccessA: number;
    groundControlToSubmissionThreatA: number;
    groundControlToStandupA: number;
    strikingExchangeToKnockdownA: number;
    finishAttemptToKoA: number;
    finishAttemptToSubmissionA: number;
  };
  deltas: UfcMatchupSkillDeltas;
  styleGenomeA?: UfcFighterStyleGenome | null;
  styleGenomeB?: UfcFighterStyleGenome | null;
  styleClash?: UfcMatchupStyleClash | null;
  pathSummary: string[];
};

type Options = {
  simulations?: number;
  seed?: number;
  scheduledRounds?: 3 | 5;
  styleGenomeA?: UfcFighterStyleGenome | null;
  styleGenomeB?: UfcFighterStyleGenome | null;
  styleClash?: UfcMatchupStyleClash | null;
};
type SimWinner = "A" | "B";
type Method = "KO_TKO" | "SUBMISSION" | "DECISION";
type Side = "A" | "B";

type StyleContext = {
  side: Side;
  genome?: UfcFighterStyleGenome | null;
  opponentGenome?: UfcFighterStyleGenome | null;
  clash?: UfcMatchupStyleClash | null;
};

const DEFAULT_SIMULATIONS = 25_000;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 4) => Number(value.toFixed(digits));
const skill01 = (value: number) => clamp(value / 100, 0, 1);
const tendency01 = (value: number | undefined) => clamp((value ?? 50) / 100, 0, 1);

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function invertDeltas(d: UfcMatchupSkillDeltas): UfcMatchupSkillDeltas {
  return {
    fighterAId: d.fighterBId,
    fighterBId: d.fighterAId,
    strikingEdgeA: -d.strikingEdgeA,
    kickingEdgeA: -d.kickingEdgeA,
    wrestlingEdgeA: -d.wrestlingEdgeA,
    grapplingEdgeA: -d.grapplingEdgeA,
    cardioEdgeA: -d.cardioEdgeA,
    staminaEdgeA: -d.staminaEdgeA,
    durabilityEdgeA: -d.durabilityEdgeA,
    heartEdgeA: -d.heartEdgeA,
    fightIqEdgeA: -d.fightIqEdgeA,
    finishEdgeA: -d.finishEdgeA,
    decisionEdgeA: -d.decisionEdgeA,
    paceEdgeA: -d.paceEdgeA,
    pressureEdgeA: -d.pressureEdgeA,
    distanceEdgeA: -d.distanceEdgeA,
    groundControlBiasA: -d.groundControlBiasA,
    knockdownBiasA: -d.knockdownBiasA,
    submissionBiasA: -d.submissionBiasA,
    submissionDefenseEdgeA: -d.submissionDefenseEdgeA,
    grapplingDefenseEdgeA: -d.grapplingDefenseEdgeA,
    layoffRiskA: -d.layoffRiskA,
    upsetRisk: d.upsetRisk
  };
}

function clashModifier(ctx: StyleContext, aKey: keyof UfcMatchupStyleClash["simModifiers"], bKey: keyof UfcMatchupStyleClash["simModifiers"]) {
  const modifiers = ctx.clash?.simModifiers;
  if (!modifiers) return 0;
  return ctx.side === "A" ? modifiers[aKey] ?? 0 : modifiers[bKey] ?? 0;
}

function sharedClashModifier(ctx: StyleContext, key: keyof UfcMatchupStyleClash["simModifiers"]) {
  return ctx.clash?.simModifiers?.[key] ?? 0;
}

function confidenceDamp(ctx: StyleContext) {
  const confidence = ctx.genome?.archetype.confidence ?? 0.55;
  return clamp(confidence, 0.25, 0.96);
}

function transitionSet(a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas, ctx: StyleContext = { side: "A" }) {
  const t = ctx.genome?.tendencies;
  const damp = confidenceDamp(ctx);
  const pressure = tendency01(t?.pressure);
  const clinchEngagement = tendency01(t?.clinchEngagement);
  const takedownInitiation = tendency01(t?.takedownInitiation);
  const chainWrestling = tendency01(t?.chainWrestling);
  const topControlPreference = tendency01(t?.topControlPreference);
  const submissionHunting = tendency01(t?.submissionHunting);
  const backTakeHunting = tendency01(t?.backTakeHunting);
  const powerHunting = tendency01(t?.powerHunting);
  const counterStriking = tendency01(t?.counterStriking);
  const standingToClinchA = clamp(
    0.08 +
    skill01(a.wrestling.clinchControl) * 0.1 +
    skill01(a.striking.clinchStriking) * 0.06 +
    skill01(a.grappling.topGame) * 0.04 +
    d.pressureEdgeA * 0.04 -
    skill01(b.wrestling.scramble) * 0.04 +
    (pressure - 0.5) * 0.035 * damp +
    (clinchEngagement - 0.5) * 0.07 * damp +
    sharedClashModifier(ctx, "clinchRate") * 0.045,
    0.025,
    0.39
  );
  const standingToTakedownAttemptA = clamp(
    0.055 +
    skill01(a.wrestling.takedownOffense) * 0.2 +
    skill01(a.wrestling.clinchControl) * 0.06 +
    d.wrestlingEdgeA * 0.1 +
    d.fightIqEdgeA * 0.035 -
    skill01(b.striking.distanceManagement) * 0.035 -
    skill01(b.kicking.offense) * 0.015 +
    (takedownInitiation - 0.5) * 0.11 * damp +
    (chainWrestling - 0.5) * 0.045 * damp +
    clashModifier(ctx, "takedownAttemptRateA", "takedownAttemptRateB") * 0.08,
    0.015,
    0.45
  );
  const takedownSuccessA = clamp(
    0.3 +
    d.wrestlingEdgeA * 0.44 +
    skill01(a.wrestling.takedownOffense) * 0.18 +
    skill01(a.intangibles.gamePlan) * 0.06 -
    skill01(b.wrestling.takedownDefense) * 0.11 -
    skill01(b.grappling.grapplingDefense) * 0.05 +
    (chainWrestling - 0.5) * 0.075 * damp +
    clashModifier(ctx, "takedownSuccessA", "takedownSuccessB") * 0.12,
    0.1,
    0.84
  );
  const groundControlToSubmissionThreatA = clamp(
    0.07 +
    skill01(a.grappling.submissionThreat) * 0.2 +
    skill01(a.grappling.grapplingOffense) * 0.08 +
    d.submissionBiasA * 0.12 -
    skill01(b.grappling.submissionDefense) * 0.06 -
    skill01(b.grappling.bottomSurvival) * 0.04 +
    (submissionHunting - 0.5) * 0.12 * damp +
    (backTakeHunting - 0.5) * 0.045 * damp +
    clashModifier(ctx, "submissionThreatA", "submissionThreatB") * 0.09,
    0.015,
    0.5
  );
  const groundControlToStandupA = clamp(
    0.34 +
    skill01(b.wrestling.getUps) * 0.22 +
    skill01(b.grappling.grapplingDefense) * 0.11 +
    skill01(b.grappling.reversals) * 0.07 -
    skill01(a.wrestling.control) * 0.2 -
    skill01(a.grappling.topGame) * 0.06 -
    d.groundControlBiasA * 0.14 -
    (topControlPreference - 0.5) * 0.13 * damp -
    clashModifier(ctx, "topControlRetentionA", "topControlRetentionB") * 0.12,
    0.045,
    0.78
  );
  const strikingExchangeToKnockdownA = clamp(
    0.0045 +
    skill01(a.striking.power) * 0.022 +
    skill01(a.kicking.headKicks) * 0.01 +
    d.knockdownBiasA * 0.018 +
    d.kickingEdgeA * 0.004 -
    skill01(b.durability.koResistance) * 0.009 -
    skill01(b.durability.chin) * 0.004 +
    (powerHunting - 0.5) * 0.018 * damp +
    (counterStriking - 0.5) * 0.009 * damp +
    clashModifier(ctx, "knockdownVolatilityA", "knockdownVolatilityB") * 0.022,
    0.0015,
    0.092
  );
  const finishAttemptToKoA = clamp(
    0.16 +
    skill01(a.striking.power) * 0.22 +
    skill01(a.kicking.headKicks) * 0.06 +
    d.knockdownBiasA * 0.14 +
    d.heartEdgeA * 0.03 -
    skill01(b.durability.koResistance) * 0.14 -
    skill01(b.durability.recovery) * 0.07 -
    skill01(b.durability.heart) * 0.04 +
    (powerHunting - 0.5) * 0.12 * damp,
    0.04,
    0.72
  );
  const finishAttemptToSubmissionA = clamp(
    0.1 +
    skill01(a.grappling.submissionThreat) * 0.2 +
    skill01(a.grappling.guardGame) * 0.05 +
    d.submissionBiasA * 0.14 -
    skill01(b.durability.submissionResistance) * 0.12 -
    skill01(b.grappling.submissionDefense) * 0.08 -
    skill01(b.durability.heart) * 0.03 +
    (submissionHunting - 0.5) * 0.13 * damp,
    0.03,
    0.66
  );
  return { standingToClinchA: round(standingToClinchA), standingToTakedownAttemptA: round(standingToTakedownAttemptA), takedownSuccessA: round(takedownSuccessA), groundControlToSubmissionThreatA: round(groundControlToSubmissionThreatA), groundControlToStandupA: round(groundControlToStandupA), strikingExchangeToKnockdownA: round(strikingExchangeToKnockdownA), finishAttemptToKoA: round(finishAttemptToKoA), finishAttemptToSubmissionA: round(finishAttemptToSubmissionA) };
}

function chooseInitiator(a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas, random: () => number, options: Options): SimWinner {
  const aT = options.styleGenomeA?.tendencies;
  const bT = options.styleGenomeB?.tendencies;
  const aStyleBoost = ((aT?.volume ?? 50) - 50) * 0.0012 + ((aT?.pressure ?? 50) - 50) * 0.001 + ((aT?.takedownInitiation ?? 50) - 50) * 0.0008;
  const bStyleBoost = ((bT?.volume ?? 50) - 50) * 0.0012 + ((bT?.pressure ?? 50) - 50) * 0.001 + ((bT?.takedownInitiation ?? 50) - 50) * 0.0008;
  const aPace = skill01(a.striking.volume) * 0.24 + skill01(a.kicking.kickingVolume) * 0.12 + skill01(a.striking.pressure) * 0.18 + skill01(a.wrestling.takedownOffense) * 0.18 + skill01(a.cardio.earlyPace) * 0.16 + skill01(a.intangibles.fightIq) * 0.06 + d.paceEdgeA * 0.06 + aStyleBoost;
  const bPace = skill01(b.striking.volume) * 0.24 + skill01(b.kicking.kickingVolume) * 0.12 + skill01(b.striking.pressure) * 0.18 + skill01(b.wrestling.takedownOffense) * 0.18 + skill01(b.cardio.earlyPace) * 0.16 + skill01(b.intangibles.fightIq) * 0.06 - d.paceEdgeA * 0.06 + bStyleBoost;
  return random() < clamp(aPace / Math.max(0.01, aPace + bPace), 0.14, 0.86) ? "A" : "B";
}

function scoreExchange(winner: SimWinner, a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas) {
  if (winner === "A") return 1 + skill01(a.striking.offense) * 0.45 + skill01(a.kicking.offense) * 0.15 + Math.max(0, d.strikingEdgeA) * 0.62 + Math.max(0, d.kickingEdgeA) * 0.22;
  return 1 + skill01(b.striking.offense) * 0.45 + skill01(b.kicking.offense) * 0.15 + Math.max(0, -d.strikingEdgeA) * 0.62 + Math.max(0, -d.kickingEdgeA) * 0.22;
}

function lateStyleModifier(side: Side, options: Options) {
  const genome = side === "A" ? options.styleGenomeA : options.styleGenomeB;
  const clashLate = side === "A" ? options.styleClash?.simModifiers.latePaceA ?? 0 : options.styleClash?.simModifiers.latePaceB ?? 0;
  const t = genome?.tendencies;
  return (((t?.roundThreeDurability ?? 50) - 50) * 0.0016 - ((t?.paceCrashRisk ?? 50) - 50) * 0.0022 + clashLate * 0.12) * clamp(genome?.archetype.confidence ?? 0.55, 0.25, 0.96);
}

function simOne(args: { a: UfcFighterSkillProfile; b: UfcFighterSkillProfile; d: UfcMatchupSkillDeltas; rounds: 3 | 5; random: () => number; options: Options }) {
  const { a, b, d, rounds, random, options } = args;
  const tA = transitionSet(a, b, d, { side: "A", genome: options.styleGenomeA, opponentGenome: options.styleGenomeB, clash: options.styleClash });
  const tB = transitionSet(b, a, invertDeltas(d), { side: "B", genome: options.styleGenomeB, opponentGenome: options.styleGenomeA, clash: options.styleClash });
  let scoreA = 0;
  let scoreB = 0;
  const exchangeVolumeMod = clamp(options.styleClash?.simModifiers.exchangeVolume ?? 0, -0.2, 0.2);

  for (let roundNo = 1; roundNo <= rounds; roundNo += 1) {
    const lateA = roundNo >= 3 ? (a.cardio.round3 + a.cardio.stamina + a.durability.heart - 150) / 300 + lateStyleModifier("A", options) : 0;
    const lateB = roundNo >= 3 ? (b.cardio.round3 + b.cardio.stamina + b.durability.heart - 150) / 300 + lateStyleModifier("B", options) : 0;
    const exchanges = Math.max(7, Math.min(17, Math.round((rounds === 5 ? 12 : 10) * (1 + exchangeVolumeMod))));
    for (let exchange = 0; exchange < exchanges; exchange += 1) {
      const initiator = chooseInitiator(a, b, d, random, options);
      const active = initiator === "A" ? a : b;
      const passive = initiator === "A" ? b : a;
      const trans = initiator === "A" ? tA : tB;
      const sideDeltas = initiator === "A" ? d : invertDeltas(d);
      const clinch = random() < trans.standingToClinchA;
      const takedownAttempt = random() < trans.standingToTakedownAttemptA + (clinch ? 0.045 + skill01(active.wrestling.clinchControl) * 0.018 : 0);

      if (takedownAttempt) {
        const success = random() < trans.takedownSuccessA;
        if (success) {
          if (initiator === "A") scoreA += 1.5 + Math.max(0, sideDeltas.groundControlBiasA) * 2 + skill01(active.wrestling.control) * 0.25;
          else scoreB += 1.5 + Math.max(0, sideDeltas.groundControlBiasA) * 2 + skill01(active.wrestling.control) * 0.25;
          if (random() < trans.groundControlToSubmissionThreatA && random() < trans.finishAttemptToSubmissionA + (roundNo >= 3 ? Math.max(0, initiator === "A" ? -lateB : -lateA) * 0.035 : 0)) {
            return { winner: initiator, method: "SUBMISSION" as Method, round: roundNo };
          }
          if (!(random() < trans.groundControlToStandupA)) {
            if (initiator === "A") scoreA += 0.7 + skill01(active.wrestling.control) * 0.44 + skill01(active.grappling.topGame) * 0.22;
            else scoreB += 0.7 + skill01(active.wrestling.control) * 0.44 + skill01(active.grappling.topGame) * 0.22;
          }
          continue;
        }
        if (initiator === "A") scoreB += 0.45 + skill01(passive.wrestling.scramble) * 0.22 + skill01(passive.grappling.reversals) * 0.14;
        else scoreA += 0.45 + skill01(passive.wrestling.scramble) * 0.22 + skill01(passive.grappling.reversals) * 0.14;
      }

      const strikeWinner = random() < clamp(0.5 + (initiator === "A" ? d.strikingEdgeA : -d.strikingEdgeA) * 0.29 + (initiator === "A" ? d.kickingEdgeA : -d.kickingEdgeA) * 0.08 + (initiator === "A" ? d.distanceEdgeA : -d.distanceEdgeA) * 0.08 + (initiator === "A" ? lateA - lateB : lateB - lateA) * 0.08, 0.14, 0.86) ? initiator : initiator === "A" ? "B" : "A";
      if (strikeWinner === "A") scoreA += scoreExchange("A", a, b, d);
      else scoreB += scoreExchange("B", a, b, d);
      const striker = strikeWinner === "A" ? a : b;
      const defender = strikeWinner === "A" ? b : a;
      const transForStriker = strikeWinner === "A" ? tA : tB;
      const knockdownBoost = roundNo >= 3 ? Math.max(0, (striker.cardio.round3 + striker.durability.heart - defender.cardio.round3 - defender.durability.heart) / 200) * 0.008 : 0;
      if (random() < transForStriker.strikingExchangeToKnockdownA + knockdownBoost) {
        if (strikeWinner === "A") scoreA += 2.6;
        else scoreB += 2.6;
        if (random() < transForStriker.finishAttemptToKoA) return { winner: strikeWinner, method: "KO_TKO" as Method, round: roundNo };
      }
    }
  }

  const decisionVariance = clamp(options.styleClash?.simModifiers.decisionVariance ?? 0, -0.25, 0.25);
  const leadManagementA = ((options.styleGenomeA?.tendencies.safeLeadManagement ?? 50) - 50) * 0.006;
  const leadManagementB = ((options.styleGenomeB?.tendencies.safeLeadManagement ?? 50) - 50) * 0.006;
  const decisionSwing = (random() - 0.5) * (2.1 + decisionVariance * 1.4) + d.decisionEdgeA * 2.2 + d.fightIqEdgeA * 0.5 + d.heartEdgeA * 0.25 + d.layoffRiskA * 0.25 + leadManagementA - leadManagementB;
  return { winner: scoreA + decisionSwing >= scoreB ? "A" as SimWinner : "B" as SimWinner, method: "DECISION" as Method, round: rounds };
}

function pathSummary(a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas, options: Options) {
  const reasons: string[] = [];
  if (d.strikingEdgeA > 0.08) reasons.push(`${a.fighterId} owns the cleaner boxing/strike-differential lane.`);
  if (d.strikingEdgeA < -0.08) reasons.push(`${b.fighterId} owns the cleaner boxing/strike-differential lane.`);
  if (d.kickingEdgeA > 0.08) reasons.push(`${a.fighterId} projects the better kicking/range-management layer.`);
  if (d.kickingEdgeA < -0.08) reasons.push(`${b.fighterId} projects the better kicking/range-management layer.`);
  if (d.wrestlingEdgeA > 0.08) reasons.push(`${a.fighterId} projects to create more takedown and control minutes.`);
  if (d.wrestlingEdgeA < -0.08) reasons.push(`${b.fighterId} projects to create more takedown and control minutes.`);
  if (d.knockdownBiasA > 0.06) reasons.push(`${a.fighterId} has the cleaner power-versus-chin/recovery lane.`);
  if (d.knockdownBiasA < -0.06) reasons.push(`${b.fighterId} has the cleaner power-versus-chin/recovery lane.`);
  if (d.submissionBiasA > 0.06) reasons.push(`${a.fighterId} has a stronger submission-threat versus submission-defense lane.`);
  if (d.submissionBiasA < -0.06) reasons.push(`${b.fighterId} has a stronger submission-threat versus submission-defense lane.`);
  if (d.cardioEdgeA > 0.06 || d.staminaEdgeA > 0.06) reasons.push(`${a.fighterId} grades better if pace and late-round stamina matter.`);
  if (d.cardioEdgeA < -0.06 || d.staminaEdgeA < -0.06) reasons.push(`${b.fighterId} grades better if pace and late-round stamina matter.`);
  if (d.fightIqEdgeA > 0.06) reasons.push(`${a.fighterId} has the stronger fight-IQ/game-plan signal.`);
  if (d.fightIqEdgeA < -0.06) reasons.push(`${b.fighterId} has the stronger fight-IQ/game-plan signal.`);
  if (options.styleGenomeA) reasons.push(`${a.fighterId} style genome: ${options.styleGenomeA.archetype.primary} (${Math.round(options.styleGenomeA.archetype.confidence * 100)}% confidence).`);
  if (options.styleGenomeB) reasons.push(`${b.fighterId} style genome: ${options.styleGenomeB.archetype.primary} (${Math.round(options.styleGenomeB.archetype.confidence * 100)}% confidence).`);
  if (options.styleClash) {
    reasons.push(...options.styleClash.pathToVictoryA.slice(0, 2));
    reasons.push(...options.styleClash.pathToVictoryB.slice(0, 2));
    reasons.push(...options.styleClash.styleWarnings.slice(0, 3));
  }
  return reasons.length ? reasons.slice(0, 10) : ["Skill deltas are narrow; outcome relies more on pace variance, heart, and decision swing."];
}

export function runUfcSkillMarkovSim(fighterA: UfcFighterSkillProfile, fighterB: UfcFighterSkillProfile, options: Options = {}): UfcSkillMarkovResult {
  const simulations = Math.max(250, Math.min(100_000, Math.floor(options.simulations ?? DEFAULT_SIMULATIONS)));
  const seed = Math.floor(options.seed ?? 1287);
  const rounds = options.scheduledRounds ?? 3;
  const random = rng(seed);
  const deltas = buildUfcMatchupSkillDeltas(fighterA, fighterB);
  const wins = { A: 0, B: 0 };
  const methods: Record<Method, number> = { KO_TKO: 0, SUBMISSION: 0, DECISION: 0 };
  const roundFinishes: Record<string, number> = {};
  for (let i = 0; i < simulations; i += 1) {
    const result = simOne({ a: fighterA, b: fighterB, d: deltas, rounds, random, options });
    wins[result.winner] += 1;
    methods[result.method] += 1;
    if (result.method !== "DECISION") roundFinishes[`R${result.round}`] = (roundFinishes[`R${result.round}`] ?? 0) + 1;
  }
  const roundFinishProbabilities: Record<string, number> = {};
  for (let i = 1; i <= rounds; i += 1) roundFinishProbabilities[`R${i}`] = round((roundFinishes[`R${i}`] ?? 0) / simulations);
  return {
    simulations,
    seed,
    fighterAWinProbability: round(wins.A / simulations),
    fighterBWinProbability: round(wins.B / simulations),
    methodProbabilities: { KO_TKO: round(methods.KO_TKO / simulations), SUBMISSION: round(methods.SUBMISSION / simulations), DECISION: round(methods.DECISION / simulations) },
    roundFinishProbabilities,
    transitionProbabilities: transitionSet(fighterA, fighterB, deltas, { side: "A", genome: options.styleGenomeA, opponentGenome: options.styleGenomeB, clash: options.styleClash }),
    deltas,
    styleGenomeA: options.styleGenomeA ?? null,
    styleGenomeB: options.styleGenomeB ?? null,
    styleClash: options.styleClash ?? null,
    pathSummary: pathSummary(fighterA, fighterB, deltas, options)
  };
}
