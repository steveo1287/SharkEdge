import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

export type UfcExchangeFighterStats = {
  fighterId: string;
  slpm: number;
  sapm: number;
  strikeAccuracyPct: number;
  strikeDefensePct: number;
  knockdownsPer15: number;
  takedownsPer15: number;
  takedownAccuracyPct: number;
  takedownDefensePct: number;
  submissionAttemptsPer15: number;
  controlTimePct: number;
  finishRate: number;
  koLossRate?: number;
  submissionLossRate?: number;
  durability?: number;
  cardio?: number;
  opponentAdjustedStrength?: number;
};

export type UfcExchangeMonteCarloOptions = {
  simulations?: number;
  seed?: number;
  scheduledRounds?: 3 | 5;
  exchangeSeconds?: 1 | 2 | 3 | 5 | 10;
};

export type UfcExchangeMonteCarloResult = {
  simulations: number;
  seed: number;
  scheduledRounds: 3 | 5;
  exchangeSeconds: number;
  fighterAWinProbability: number;
  fighterBWinProbability: number;
  methodProbabilities: { KO_TKO: number; SUBMISSION: number; DECISION: number };
  roundFinishProbabilities: Record<string, number>;
  averageFightLengthSeconds: number;
  averageDamage: { fighterA: number; fighterB: number };
  averageControlSeconds: { fighterA: number; fighterB: number };
  averageKnockdowns: { fighterA: number; fighterB: number };
  diagnosticProbabilities: {
    fighterAStrikeAttemptPerExchange: number;
    fighterBStrikeAttemptPerExchange: number;
    fighterAStrikeLandGivenAttempt: number;
    fighterBStrikeLandGivenAttempt: number;
    fighterATakedownAttemptPerExchange: number;
    fighterBTakedownAttemptPerExchange: number;
    fighterATakedownSuccessGivenAttempt: number;
    fighterBTakedownSuccessGivenAttempt: number;
  };
};

type Winner = "A" | "B";
type Method = "KO_TKO" | "SUBMISSION" | "DECISION";

const DEFAULT_SIMULATIONS = 25_000;
const DEFAULT_EXCHANGE_SECONDS = 5;
const ROUND_SECONDS = 300;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 4) => Number(value.toFixed(digits));
const num = (value: number | null | undefined, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pct(value: number, fallback: number) {
  const normalized = num(value, fallback);
  return clamp(normalized > 1 ? normalized / 100 : normalized, 0, 1);
}

export function blendedLandProbability(offAccuracyPct: number, opponentDefensePct: number) {
  return clamp((pct(offAccuracyPct, 44) + (1 - pct(opponentDefensePct, 54))) / 2, 0.08, 0.78);
}

export function blendedTakedownSuccessProbability(offAccuracyPct: number, opponentDefensePct: number) {
  return clamp((pct(offAccuracyPct, 35) + (1 - pct(opponentDefensePct, 62))) / 2, 0.04, 0.82);
}

function attemptsPerExchangeFromLandedPerMinute(slpm: number, accuracyPct: number, exchangeSeconds: number) {
  const accuracy = clamp(pct(accuracyPct, 44), 0.12, 0.75);
  return clamp(((num(slpm, 3.3) / accuracy) / 60) * exchangeSeconds, 0.005, 0.95);
}

function takedownAttemptsPerExchange(takedownsPer15: number, takedownAccuracyPct: number, exchangeSeconds: number) {
  const accuracy = clamp(pct(takedownAccuracyPct, 35), 0.08, 0.75);
  return clamp(((num(takedownsPer15, 1.2) / accuracy) / 900) * exchangeSeconds, 0.001, 0.28);
}

function submissionAttemptPerExchange(submissionAttemptsPer15: number, exchangeSeconds: number) {
  return clamp((num(submissionAttemptsPer15, 0.45) / 900) * exchangeSeconds, 0.0005, 0.12);
}

function durability01(fighter: UfcExchangeFighterStats) {
  return clamp((num(fighter.durability, 58) - num(fighter.koLossRate, 0) * 20 - num(fighter.submissionLossRate, 0) * 10) / 100, 0.12, 0.96);
}

function opponentStrengthAdjustment(fighter: UfcExchangeFighterStats) {
  const strength = num(fighter.opponentAdjustedStrength, 50);
  const normalized = strength <= 1 ? strength * 100 : strength;
  return clamp((normalized - 50) / 100, -0.35, 0.35);
}

function expectedControlSeconds(wrestler: UfcExchangeFighterStats, defender: UfcExchangeFighterStats, exchangeSeconds: number) {
  const controlEdge = pct(wrestler.controlTimePct, 18) - (1 - pct(defender.takedownDefensePct, 62));
  return clamp(exchangeSeconds * (0.35 + controlEdge), 0.5, exchangeSeconds);
}

export function buildExchangeStatsFromUfcFeature(feature: UfcModelFeatureSnapshot): UfcExchangeFighterStats {
  return {
    fighterId: feature.fighterId,
    slpm: num(feature.sigStrikesLandedPerMin, 3.3),
    sapm: num(feature.sigStrikesAbsorbedPerMin, 3.3),
    strikeAccuracyPct: num(feature.sigStrikeAccuracyPct, 44),
    strikeDefensePct: num(feature.sigStrikeDefensePct, 54),
    knockdownsPer15: num(feature.knockdownsPer15, 0.25),
    takedownsPer15: num(feature.takedownsPer15, 1.2),
    takedownAccuracyPct: num(feature.takedownAccuracyPct, 35),
    takedownDefensePct: num(feature.takedownDefensePct, 62),
    submissionAttemptsPer15: num(feature.submissionAttemptsPer15, 0.45),
    controlTimePct: num(feature.controlTimePct, 18),
    finishRate: num(feature.finishRate, 0.52),
    durability: 100 - clamp(num(feature.sigStrikesAbsorbedPerMin, 3.3) * 8, 8, 70),
    cardio: num(feature.lateRoundPerformance, 50),
    opponentAdjustedStrength: num(feature.opponentAdjustedStrength, 50)
  };
}

function diagnostic(a: UfcExchangeFighterStats, b: UfcExchangeFighterStats, exchangeSeconds: number) {
  return {
    fighterAStrikeAttemptPerExchange: round(attemptsPerExchangeFromLandedPerMinute(a.slpm, a.strikeAccuracyPct, exchangeSeconds)),
    fighterBStrikeAttemptPerExchange: round(attemptsPerExchangeFromLandedPerMinute(b.slpm, b.strikeAccuracyPct, exchangeSeconds)),
    fighterAStrikeLandGivenAttempt: round(blendedLandProbability(a.strikeAccuracyPct, b.strikeDefensePct)),
    fighterBStrikeLandGivenAttempt: round(blendedLandProbability(b.strikeAccuracyPct, a.strikeDefensePct)),
    fighterATakedownAttemptPerExchange: round(takedownAttemptsPerExchange(a.takedownsPer15, a.takedownAccuracyPct, exchangeSeconds)),
    fighterBTakedownAttemptPerExchange: round(takedownAttemptsPerExchange(b.takedownsPer15, b.takedownAccuracyPct, exchangeSeconds)),
    fighterATakedownSuccessGivenAttempt: round(blendedTakedownSuccessProbability(a.takedownAccuracyPct, b.takedownDefensePct)),
    fighterBTakedownSuccessGivenAttempt: round(blendedTakedownSuccessProbability(b.takedownAccuracyPct, a.takedownDefensePct))
  };
}

function simulateOne(args: { a: UfcExchangeFighterStats; b: UfcExchangeFighterStats; random: () => number; rounds: 3 | 5; exchangeSeconds: number }) {
  const { a, b, random, rounds, exchangeSeconds } = args;
  const diag = diagnostic(a, b, exchangeSeconds);
  const exchangesPerRound = Math.floor(ROUND_SECONDS / exchangeSeconds);
  const score = { A: 0, B: 0 };
  const damage = { A: 0, B: 0 };
  const control = { A: 0, B: 0 };
  const knockdowns = { A: 0, B: 0 };
  let elapsedSeconds = 0;
  const strengthA = opponentStrengthAdjustment(a);
  const strengthB = opponentStrengthAdjustment(b);

  for (let roundNo = 1; roundNo <= rounds; roundNo += 1) {
    const roundScore = { A: 0, B: 0 };
    const lateA = roundNo >= 3 ? clamp((num(a.cardio, 50) - 50) / 100, -0.25, 0.25) : 0;
    const lateB = roundNo >= 3 ? clamp((num(b.cardio, 50) - 50) / 100, -0.25, 0.25) : 0;

    for (let exchange = 0; exchange < exchangesPerRound; exchange += 1) {
      elapsedSeconds += exchangeSeconds;
      for (const side of ["A", "B"] as const) {
        const attacker = side === "A" ? a : b;
        const defender = side === "A" ? b : a;
        const sideLate = side === "A" ? lateA : lateB;
        const sideStrength = side === "A" ? strengthA : strengthB;
        const strikeAttemptP = side === "A" ? diag.fighterAStrikeAttemptPerExchange : diag.fighterBStrikeAttemptPerExchange;
        const landP = side === "A" ? diag.fighterAStrikeLandGivenAttempt : diag.fighterBStrikeLandGivenAttempt;
        if (random() < clamp(strikeAttemptP * (1 + sideLate * 0.25), 0, 0.98) && random() < clamp(landP + sideStrength * 0.04, 0.04, 0.82)) {
          const isPower = random() < clamp(0.18 + num(attacker.knockdownsPer15, 0.25) * 0.12 + num(attacker.finishRate, 0.52) * 0.12, 0.08, 0.48);
          const impact = (isPower ? 2.4 : 1) * (0.8 + random() * 0.55) * (1 + sideStrength * 0.12);
          const defenderDamageKey = side === "A" ? "B" : "A";
          damage[defenderDamageKey] += impact;
          roundScore[side] += isPower ? 1.25 : 0.45;
          const kdP = clamp((num(attacker.knockdownsPer15, 0.25) / 900) * exchangeSeconds * 2.8 + (isPower ? 0.006 : 0) - durability01(defender) * 0.004, 0.0005, 0.09);
          if (random() < kdP) {
            knockdowns[side] += 1;
            roundScore[side] += 3;
            damage[defenderDamageKey] += 5 + random() * 4;
          }
          const finishP = clamp((damage[defenderDamageKey] / 2200) * (1 - durability01(defender)) + num(attacker.finishRate, 0.52) * 0.002 + (isPower ? 0.003 : 0), 0, 0.18);
          if (random() < finishP) return { winner: side as Winner, method: "KO_TKO" as Method, round: roundNo, elapsedSeconds, damage, control, knockdowns };
        }
      }

      for (const side of ["A", "B"] as const) {
        const attacker = side === "A" ? a : b;
        const defender = side === "A" ? b : a;
        const tdAttemptP = side === "A" ? diag.fighterATakedownAttemptPerExchange : diag.fighterBTakedownAttemptPerExchange;
        const tdSuccessP = side === "A" ? diag.fighterATakedownSuccessGivenAttempt : diag.fighterBTakedownSuccessGivenAttempt;
        if (random() < tdAttemptP) {
          if (random() < tdSuccessP) {
            const ctrl = expectedControlSeconds(attacker, defender, exchangeSeconds);
            control[side] += ctrl;
            roundScore[side] += 1.4 + ctrl / exchangeSeconds;
            const subAttemptP = submissionAttemptPerExchange(attacker.submissionAttemptsPer15, exchangeSeconds) * (ctrl / exchangeSeconds);
            if (random() < subAttemptP) {
              const subFinishP = clamp(0.08 + pct(attacker.finishRate, 0.52) * 0.18 + num(defender.submissionLossRate, 0) * 0.12 - durability01(defender) * 0.08, 0.025, 0.42);
              if (random() < subFinishP) return { winner: side as Winner, method: "SUBMISSION" as Method, round: roundNo, elapsedSeconds, damage, control, knockdowns };
            }
          } else {
            roundScore[side === "A" ? "B" : "A"] += 0.2;
          }
        }
      }
    }
    if (roundScore.A > roundScore.B) score.A += 10;
    else if (roundScore.B > roundScore.A) score.B += 10;
    else { score.A += 9; score.B += 9; }
  }

  const decisionNoise = (random() - 0.5) * 2.5;
  return { winner: score.A + damage.B * 0.015 + control.A * 0.005 + decisionNoise >= score.B + damage.A * 0.015 + control.B * 0.005 ? "A" as Winner : "B" as Winner, method: "DECISION" as Method, round: rounds, elapsedSeconds, damage, control, knockdowns };
}

export function runUfcExchangeMonteCarlo(a: UfcExchangeFighterStats, b: UfcExchangeFighterStats, options: UfcExchangeMonteCarloOptions = {}): UfcExchangeMonteCarloResult {
  const simulations = Math.max(250, Math.min(100_000, Math.floor(options.simulations ?? DEFAULT_SIMULATIONS)));
  const seed = Math.floor(options.seed ?? 1287);
  const scheduledRounds = options.scheduledRounds ?? 3;
  const exchangeSeconds = options.exchangeSeconds ?? DEFAULT_EXCHANGE_SECONDS;
  const random = rng(seed);
  const wins = { A: 0, B: 0 };
  const methods: Record<Method, number> = { KO_TKO: 0, SUBMISSION: 0, DECISION: 0 };
  const rounds: Record<string, number> = {};
  const damage = { A: 0, B: 0 };
  const control = { A: 0, B: 0 };
  const knockdowns = { A: 0, B: 0 };
  let totalLength = 0;

  for (let i = 0; i < simulations; i += 1) {
    const result = simulateOne({ a, b, random, rounds: scheduledRounds, exchangeSeconds });
    wins[result.winner] += 1;
    methods[result.method] += 1;
    totalLength += result.elapsedSeconds;
    damage.A += result.damage.A;
    damage.B += result.damage.B;
    control.A += result.control.A;
    control.B += result.control.B;
    knockdowns.A += result.knockdowns.A;
    knockdowns.B += result.knockdowns.B;
    if (result.method !== "DECISION") rounds[`R${result.round}`] = (rounds[`R${result.round}`] ?? 0) + 1;
  }

  const roundFinishProbabilities: Record<string, number> = {};
  for (let i = 1; i <= scheduledRounds; i += 1) roundFinishProbabilities[`R${i}`] = round((rounds[`R${i}`] ?? 0) / simulations);

  return {
    simulations,
    seed,
    scheduledRounds,
    exchangeSeconds,
    fighterAWinProbability: round(wins.A / simulations),
    fighterBWinProbability: round(wins.B / simulations),
    methodProbabilities: { KO_TKO: round(methods.KO_TKO / simulations), SUBMISSION: round(methods.SUBMISSION / simulations), DECISION: round(methods.DECISION / simulations) },
    roundFinishProbabilities,
    averageFightLengthSeconds: round(totalLength / simulations, 2),
    averageDamage: { fighterA: round(damage.A / simulations, 2), fighterB: round(damage.B / simulations, 2) },
    averageControlSeconds: { fighterA: round(control.A / simulations, 2), fighterB: round(control.B / simulations, 2) },
    averageKnockdowns: { fighterA: round(knockdowns.A / simulations, 4), fighterB: round(knockdowns.B / simulations, 4) },
    diagnosticProbabilities: diagnostic(a, b, exchangeSeconds)
  };
}
