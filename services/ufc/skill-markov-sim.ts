import type { UfcFighterSkillProfile } from "@/services/ufc/fighter-skill-profile";
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
  pathSummary: string[];
};

type Options = { simulations?: number; seed?: number; scheduledRounds?: 3 | 5 };
type SimWinner = "A" | "B";
type Method = "KO_TKO" | "SUBMISSION" | "DECISION";

const DEFAULT_SIMULATIONS = 25_000;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 4) => Number(value.toFixed(digits));
const skill01 = (value: number) => clamp(value / 100, 0, 1);

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

function transitionSet(a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas) {
  const standingToClinchA = clamp(
    0.08 +
    skill01(a.wrestling.clinchControl) * 0.1 +
    skill01(a.striking.clinchStriking) * 0.06 +
    skill01(a.grappling.topGame) * 0.04 +
    d.pressureEdgeA * 0.04 -
    skill01(b.wrestling.scramble) * 0.04,
    0.025,
    0.34
  );
  const standingToTakedownAttemptA = clamp(
    0.055 +
    skill01(a.wrestling.takedownOffense) * 0.2 +
    skill01(a.wrestling.clinchControl) * 0.06 +
    d.wrestlingEdgeA * 0.1 +
    d.fightIqEdgeA * 0.035 -
    skill01(b.striking.distanceManagement) * 0.035 -
    skill01(b.kicking.offense) * 0.015,
    0.015,
    0.38
  );
  const takedownSuccessA = clamp(
    0.3 +
    d.wrestlingEdgeA * 0.44 +
    skill01(a.wrestling.takedownOffense) * 0.18 +
    skill01(a.intangibles.gamePlan) * 0.06 -
    skill01(b.wrestling.takedownDefense) * 0.11 -
    skill01(b.grappling.grapplingDefense) * 0.05,
    0.1,
    0.8
  );
  const groundControlToSubmissionThreatA = clamp(
    0.07 +
    skill01(a.grappling.submissionThreat) * 0.2 +
    skill01(a.grappling.grapplingOffense) * 0.08 +
    d.submissionBiasA * 0.12 -
    skill01(b.grappling.submissionDefense) * 0.06 -
    skill01(b.grappling.bottomSurvival) * 0.04,
    0.015,
    0.42
  );
  const groundControlToStandupA = clamp(
    0.34 +
    skill01(b.wrestling.getUps) * 0.22 +
    skill01(b.grappling.grapplingDefense) * 0.11 +
    skill01(b.grappling.reversals) * 0.07 -
    skill01(a.wrestling.control) * 0.2 -
    skill01(a.grappling.topGame) * 0.06 -
    d.groundControlBiasA * 0.14,
    0.06,
    0.78
  );
  const strikingExchangeToKnockdownA = clamp(
    0.0045 +
    skill01(a.striking.power) * 0.022 +
    skill01(a.kicking.headKicks) * 0.01 +
    d.knockdownBiasA * 0.018 +
    d.kickingEdgeA * 0.004 -
    skill01(b.durability.koResistance) * 0.009 -
    skill01(b.durability.chin) * 0.004,
    0.0015,
    0.075
  );
  const finishAttemptToKoA = clamp(
    0.16 +
    skill01(a.striking.power) * 0.22 +
    skill01(a.kicking.headKicks) * 0.06 +
    d.knockdownBiasA * 0.14 +
    d.heartEdgeA * 0.03 -
    skill01(b.durability.koResistance) * 0.14 -
    skill01(b.durability.recovery) * 0.07 -
    skill01(b.durability.heart) * 0.04,
    0.04,
    0.66
  );
  const finishAttemptToSubmissionA = clamp(
    0.1 +
    skill01(a.grappling.submissionThreat) * 0.2 +
    skill01(a.grappling.guardGame) * 0.05 +
    d.submissionBiasA * 0.14 -
    skill01(b.durability.submissionResistance) * 0.12 -
    skill01(b.grappling.submissionDefense) * 0.08 -
    skill01(b.durability.heart) * 0.03,
    0.03,
    0.6
  );
  return { standingToClinchA: round(standingToClinchA), standingToTakedownAttemptA: round(standingToTakedownAttemptA), takedownSuccessA: round(takedownSuccessA), groundControlToSubmissionThreatA: round(groundControlToSubmissionThreatA), groundControlToStandupA: round(groundControlToStandupA), strikingExchangeToKnockdownA: round(strikingExchangeToKnockdownA), finishAttemptToKoA: round(finishAttemptToKoA), finishAttemptToSubmissionA: round(finishAttemptToSubmissionA) };
}

function chooseInitiator(a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas, random: () => number): SimWinner {
  const aPace = skill01(a.striking.volume) * 0.24 + skill01(a.kicking.kickingVolume) * 0.12 + skill01(a.striking.pressure) * 0.18 + skill01(a.wrestling.takedownOffense) * 0.18 + skill01(a.cardio.earlyPace) * 0.16 + skill01(a.intangibles.fightIq) * 0.06 + d.paceEdgeA * 0.06;
  const bPace = skill01(b.striking.volume) * 0.24 + skill01(b.kicking.kickingVolume) * 0.12 + skill01(b.striking.pressure) * 0.18 + skill01(b.wrestling.takedownOffense) * 0.18 + skill01(b.cardio.earlyPace) * 0.16 + skill01(b.intangibles.fightIq) * 0.06 - d.paceEdgeA * 0.06;
  return random() < clamp(aPace / Math.max(0.01, aPace + bPace), 0.16, 0.84) ? "A" : "B";
}

function scoreExchange(winner: SimWinner, a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas) {
  if (winner === "A") return 1 + skill01(a.striking.offense) * 0.45 + skill01(a.kicking.offense) * 0.15 + Math.max(0, d.strikingEdgeA) * 0.62 + Math.max(0, d.kickingEdgeA) * 0.22;
  return 1 + skill01(b.striking.offense) * 0.45 + skill01(b.kicking.offense) * 0.15 + Math.max(0, -d.strikingEdgeA) * 0.62 + Math.max(0, -d.kickingEdgeA) * 0.22;
}

function simOne(args: { a: UfcFighterSkillProfile; b: UfcFighterSkillProfile; d: UfcMatchupSkillDeltas; rounds: 3 | 5; random: () => number }) {
  const { a, b, d, rounds, random } = args;
  const tA = transitionSet(a, b, d);
  const tB = transitionSet(b, a, invertDeltas(d));
  let scoreA = 0;
  let scoreB = 0;

  for (let roundNo = 1; roundNo <= rounds; roundNo += 1) {
    const lateA = roundNo >= 3 ? (a.cardio.round3 + a.cardio.stamina + a.durability.heart - 150) / 300 : 0;
    const lateB = roundNo >= 3 ? (b.cardio.round3 + b.cardio.stamina + b.durability.heart - 150) / 300 : 0;
    const exchanges = rounds === 5 ? 12 : 10;
    for (let exchange = 0; exchange < exchanges; exchange += 1) {
      const initiator = chooseInitiator(a, b, d, random);
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

  const decisionSwing = (random() - 0.5) * 2.1 + d.decisionEdgeA * 2.2 + d.fightIqEdgeA * 0.5 + d.heartEdgeA * 0.25 + d.layoffRiskA * 0.25;
  return { winner: scoreA + decisionSwing >= scoreB ? "A" as SimWinner : "B" as SimWinner, method: "DECISION" as Method, round: rounds };
}

function pathSummary(a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas) {
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
  return reasons.length ? reasons.slice(0, 6) : ["Skill deltas are narrow; outcome relies more on pace variance, heart, and decision swing."];
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
    const result = simOne({ a: fighterA, b: fighterB, d: deltas, rounds, random });
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
    transitionProbabilities: transitionSet(fighterA, fighterB, deltas),
    deltas,
    pathSummary: pathSummary(fighterA, fighterB, deltas)
  };
}
