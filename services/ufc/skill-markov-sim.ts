import type { UfcFighterSkillProfile } from "@/services/ufc/fighter-skill-profile";
import { buildUfcMatchupSkillDeltas, type UfcMatchupSkillDeltas } from "@/services/ufc/matchup-skill-deltas";

export type UfcSkillMarkovResult = {
  simulations: number;
  seed: number;
  fighterAWinProbability: number;
  fighterBWinProbability: number;
  methodProbabilities: {
    KO_TKO: number;
    SUBMISSION: number;
    DECISION: number;
  };
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

type Options = {
  simulations?: number;
  seed?: number;
  scheduledRounds?: 3 | 5;
};

type SimWinner = "A" | "B";
type Method = "KO_TKO" | "SUBMISSION" | "DECISION";

const DEFAULT_SIMULATIONS = 25_000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function skill01(value: number) {
  return clamp(value / 100, 0, 1);
}

function transitionSet(a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas) {
  const standingToClinchA = clamp(0.1 + skill01(a.wrestling.control) * 0.14 + skill01(a.grappling.topGame) * 0.05 - skill01(b.wrestling.scramble) * 0.05, 0.03, 0.31);
  const standingToTakedownAttemptA = clamp(0.07 + skill01(a.wrestling.takedownOffense) * 0.22 + d.wrestlingEdgeA * 0.1 - skill01(b.striking.volume) * 0.03, 0.02, 0.36);
  const takedownSuccessA = clamp(0.32 + d.wrestlingEdgeA * 0.48 + skill01(a.wrestling.takedownOffense) * 0.2 - skill01(b.wrestling.takedownDefense) * 0.12, 0.12, 0.78);
  const groundControlToSubmissionThreatA = clamp(0.08 + skill01(a.grappling.submissionThreat) * 0.22 + d.submissionBiasA * 0.12 - skill01(b.grappling.bottomSurvival) * 0.07, 0.02, 0.38);
  const groundControlToStandupA = clamp(0.38 + skill01(b.wrestling.getUps) * 0.28 - skill01(a.wrestling.control) * 0.24 - d.groundControlBiasA * 0.16, 0.08, 0.74);
  const strikingExchangeToKnockdownA = clamp(0.006 + skill01(a.striking.power) * 0.028 + d.knockdownBiasA * 0.018 - skill01(b.durability.koResistance) * 0.012, 0.002, 0.07);
  const finishAttemptToKoA = clamp(0.18 + skill01(a.striking.power) * 0.27 + d.knockdownBiasA * 0.14 - skill01(b.durability.koResistance) * 0.18, 0.05, 0.62);
  const finishAttemptToSubmissionA = clamp(0.12 + skill01(a.grappling.submissionThreat) * 0.25 + d.submissionBiasA * 0.14 - skill01(b.durability.submissionResistance) * 0.16, 0.04, 0.56);
  return {
    standingToClinchA: round(standingToClinchA),
    standingToTakedownAttemptA: round(standingToTakedownAttemptA),
    takedownSuccessA: round(takedownSuccessA),
    groundControlToSubmissionThreatA: round(groundControlToSubmissionThreatA),
    groundControlToStandupA: round(groundControlToStandupA),
    strikingExchangeToKnockdownA: round(strikingExchangeToKnockdownA),
    finishAttemptToKoA: round(finishAttemptToKoA),
    finishAttemptToSubmissionA: round(finishAttemptToSubmissionA)
  };
}

function chooseInitiator(a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas, random: () => number): SimWinner {
  const aPace = skill01(a.striking.volume) * 0.35 + skill01(a.wrestling.takedownOffense) * 0.25 + skill01(a.cardio.earlyPace) * 0.25 + d.paceEdgeA * 0.15;
  const bPace = skill01(b.striking.volume) * 0.35 + skill01(b.wrestling.takedownOffense) * 0.25 + skill01(b.cardio.earlyPace) * 0.25 - d.paceEdgeA * 0.15;
  return random() < clamp(aPace / Math.max(0.01, aPace + bPace), 0.18, 0.82) ? "A" : "B";
}

function scoreExchange(winner: SimWinner, a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas) {
  if (winner === "A") return 1 + skill01(a.striking.offense) * 0.6 + Math.max(0, d.strikingEdgeA) * 0.8;
  return 1 + skill01(b.striking.offense) * 0.6 + Math.max(0, -d.strikingEdgeA) * 0.8;
}

function invertDeltas(d: UfcMatchupSkillDeltas): UfcMatchupSkillDeltas {
  return {
    fighterAId: d.fighterBId,
    fighterBId: d.fighterAId,
    strikingEdgeA: -d.strikingEdgeA,
    wrestlingEdgeA: -d.wrestlingEdgeA,
    grapplingEdgeA: -d.grapplingEdgeA,
    cardioEdgeA: -d.cardioEdgeA,
    durabilityEdgeA: -d.durabilityEdgeA,
    finishEdgeA: -d.finishEdgeA,
    decisionEdgeA: -d.decisionEdgeA,
    paceEdgeA: -d.paceEdgeA,
    groundControlBiasA: -d.groundControlBiasA,
    knockdownBiasA: -d.knockdownBiasA,
    submissionBiasA: -d.submissionBiasA,
    upsetRisk: d.upsetRisk
  };
}

function simOne(args: { a: UfcFighterSkillProfile; b: UfcFighterSkillProfile; d: UfcMatchupSkillDeltas; rounds: 3 | 5; random: () => number }) {
  const { a, b, d, rounds, random } = args;
  const tA = transitionSet(a, b, d);
  const tB = transitionSet(b, a, invertDeltas(d));
  let scoreA = 0;
  let scoreB = 0;

  for (let roundNo = 1; roundNo <= rounds; roundNo += 1) {
    const lateModifierA = roundNo >= 3 ? (a.cardio.round3 - 50) / 100 : 0;
    const lateModifierB = roundNo >= 3 ? (b.cardio.round3 - 50) / 100 : 0;
    const exchanges = rounds === 5 ? 12 : 10;

    for (let exchange = 0; exchange < exchanges; exchange += 1) {
      const initiator = chooseInitiator(a, b, d, random);
      const active = initiator === "A" ? a : b;
      const passive = initiator === "A" ? b : a;
      const trans = initiator === "A" ? tA : tB;
      const sideDeltas = initiator === "A" ? d : invertDeltas(d);

      const clinch = random() < trans.standingToClinchA;
      const takedownAttempt = random() < (trans.standingToTakedownAttemptA + (clinch ? 0.05 : 0));

      if (takedownAttempt) {
        const success = random() < trans.takedownSuccessA;
        if (success) {
          if (initiator === "A") scoreA += 1.5 + Math.max(0, sideDeltas.groundControlBiasA) * 2;
          else scoreB += 1.5 + Math.max(0, sideDeltas.groundControlBiasA) * 2;

          const subThreat = random() < trans.groundControlToSubmissionThreatA;
          if (subThreat && random() < trans.finishAttemptToSubmissionA + (roundNo >= 3 ? Math.max(0, -lateModifierB) * 0.03 : 0)) {
            return { winner: initiator, method: "SUBMISSION" as Method, round: roundNo };
          }

          const standup = random() < trans.groundControlToStandupA;
          if (!standup) {
            if (initiator === "A") scoreA += 0.7 + skill01(active.wrestling.control) * 0.6;
            else scoreB += 0.7 + skill01(active.wrestling.control) * 0.6;
          }
          continue;
        }

        if (initiator === "A") scoreB += 0.45 + skill01(passive.wrestling.scramble) * 0.3;
        else scoreA += 0.45 + skill01(passive.wrestling.scramble) * 0.3;
      }

      const strikeWinner = random() < clamp(0.5 + (initiator === "A" ? d.strikingEdgeA : -d.strikingEdgeA) * 0.38 + (initiator === "A" ? lateModifierA - lateModifierB : lateModifierB - lateModifierA) * 0.08, 0.16, 0.84)
        ? initiator
        : initiator === "A" ? "B" : "A";

      if (strikeWinner === "A") scoreA += scoreExchange("A", a, b, d);
      else scoreB += scoreExchange("B", a, b, d);

      const striker = strikeWinner === "A" ? a : b;
      const defender = strikeWinner === "A" ? b : a;
      const transForStriker = strikeWinner === "A" ? tA : tB;
      const knockdownBoost = roundNo >= 3 ? Math.max(0, (striker.cardio.round3 - defender.cardio.round3) / 100) * 0.008 : 0;
      if (random() < transForStriker.strikingExchangeToKnockdownA + knockdownBoost) {
        if (strikeWinner === "A") scoreA += 2.6;
        else scoreB += 2.6;
        if (random() < transForStriker.finishAttemptToKoA) {
          return { winner: strikeWinner, method: "KO_TKO" as Method, round: roundNo };
        }
      }
    }
  }

  const decisionSwing = (random() - 0.5) * 2.1 + d.decisionEdgeA * 2.4;
  return { winner: scoreA + decisionSwing >= scoreB ? "A" as SimWinner : "B" as SimWinner, method: "DECISION" as Method, round: rounds };
}

function pathSummary(a: UfcFighterSkillProfile, b: UfcFighterSkillProfile, d: UfcMatchupSkillDeltas) {
  const reasons: string[] = [];
  if (d.wrestlingEdgeA > 0.08) reasons.push(`${a.fighterId} projects to create more ground-control minutes.`);
  if (d.wrestlingEdgeA < -0.08) reasons.push(`${b.fighterId} projects to create more ground-control minutes.`);
  if (d.knockdownBiasA > 0.06) reasons.push(`${a.fighterId} has the cleaner power-versus-durability lane.`);
  if (d.knockdownBiasA < -0.06) reasons.push(`${b.fighterId} has the cleaner power-versus-durability lane.`);
  if (d.submissionBiasA > 0.06) reasons.push(`${a.fighterId} has a stronger submission-threat lane.`);
  if (d.submissionBiasA < -0.06) reasons.push(`${b.fighterId} has a stronger submission-threat lane.`);
  if (d.cardioEdgeA > 0.06) reasons.push(`${a.fighterId} grades better if the fight reaches late rounds.`);
  if (d.cardioEdgeA < -0.06) reasons.push(`${b.fighterId} grades better if the fight reaches late rounds.`);
  if (!reasons.length) reasons.push("Skill deltas are narrow; outcome relies more on pace variance and decision swing.");
  return reasons.slice(0, 5);
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
    if (result.method !== "DECISION") {
      const key = `R${result.round}`;
      roundFinishes[key] = (roundFinishes[key] ?? 0) + 1;
    }
  }

  const roundFinishProbabilities: Record<string, number> = {};
  for (let i = 1; i <= rounds; i += 1) {
    roundFinishProbabilities[`R${i}`] = round((roundFinishes[`R${i}`] ?? 0) / simulations);
  }

  return {
    simulations,
    seed,
    fighterAWinProbability: round(wins.A / simulations),
    fighterBWinProbability: round(wins.B / simulations),
    methodProbabilities: {
      KO_TKO: round(methods.KO_TKO / simulations),
      SUBMISSION: round(methods.SUBMISSION / simulations),
      DECISION: round(methods.DECISION / simulations)
    },
    roundFinishProbabilities,
    transitionProbabilities: transitionSet(fighterA, fighterB, deltas),
    deltas,
    pathSummary: pathSummary(fighterA, fighterB, deltas)
  };
}
