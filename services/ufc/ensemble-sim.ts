import { buildExchangeStatsFromUfcFeature, runUfcExchangeMonteCarlo, type UfcExchangeMonteCarloResult } from "@/services/ufc/exchange-monte-carlo";
import { buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { runUfcSkillMarkovSim, type UfcSkillMarkovResult } from "@/services/ufc/skill-markov-sim";

export type UfcEnsembleWeights = {
  skillMarkov: number;
  exchangeMonteCarlo: number;
};

export type UfcEnsembleSimOptions = {
  simulations?: number;
  seed?: number;
  scheduledRounds?: 3 | 5;
  weights?: Partial<UfcEnsembleWeights>;
};

export type UfcEnsembleSimResult = {
  engine: "ensemble";
  simulations: number;
  seed: number;
  scheduledRounds: 3 | 5;
  weights: UfcEnsembleWeights;
  fighterAWinProbability: number;
  fighterBWinProbability: number;
  methodProbabilities: {
    KO_TKO: number;
    SUBMISSION: number;
    DECISION: number;
  };
  roundFinishProbabilities: Record<string, number>;
  transitionProbabilities: Record<string, number>;
  exchangeDiagnostics: UfcExchangeMonteCarloResult["diagnosticProbabilities"];
  averageFightLengthSeconds: number;
  averageDamage: UfcExchangeMonteCarloResult["averageDamage"];
  averageControlSeconds: UfcExchangeMonteCarloResult["averageControlSeconds"];
  averageKnockdowns: UfcExchangeMonteCarloResult["averageKnockdowns"];
  pathSummary: string[];
  dangerFlags: string[];
  sourceOutputs: {
    skillMarkov: UfcSkillMarkovResult;
    exchangeMonteCarlo: UfcExchangeMonteCarloResult;
  };
};

const DEFAULT_SIMULATIONS = 25_000;
const DEFAULT_WEIGHTS: UfcEnsembleWeights = { skillMarkov: 0.55, exchangeMonteCarlo: 0.45 };

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function normalizeWeights(input?: Partial<UfcEnsembleWeights>): UfcEnsembleWeights {
  const skill = input?.skillMarkov ?? DEFAULT_WEIGHTS.skillMarkov;
  const exchange = input?.exchangeMonteCarlo ?? DEFAULT_WEIGHTS.exchangeMonteCarlo;
  const total = Math.max(0.0001, skill + exchange);
  return {
    skillMarkov: round(skill / total, 4),
    exchangeMonteCarlo: round(exchange / total, 4)
  };
}

function blendProbability(skill: number, exchange: number, weights: UfcEnsembleWeights) {
  return round(skill * weights.skillMarkov + exchange * weights.exchangeMonteCarlo);
}

function normalizePair(a: number, b: number) {
  const total = Math.max(0.0001, a + b);
  return { a: round(a / total), b: round(b / total) };
}

function normalizeMethods(methods: UfcEnsembleSimResult["methodProbabilities"]) {
  const total = Math.max(0.0001, methods.KO_TKO + methods.SUBMISSION + methods.DECISION);
  return {
    KO_TKO: round(methods.KO_TKO / total),
    SUBMISSION: round(methods.SUBMISSION / total),
    DECISION: round(methods.DECISION / total)
  };
}

function blendRoundFinishes(skill: Record<string, number>, exchange: Record<string, number>, weights: UfcEnsembleWeights, scheduledRounds: 3 | 5) {
  const output: Record<string, number> = {};
  for (let roundNo = 1; roundNo <= scheduledRounds; roundNo += 1) {
    const key = `R${roundNo}`;
    output[key] = blendProbability(skill[key] ?? 0, exchange[key] ?? 0, weights);
  }
  return output;
}

function dangerFlags(skill: UfcSkillMarkovResult, exchange: UfcExchangeMonteCarloResult) {
  const flags: string[] = [];
  const disagreement = Math.abs(skill.fighterAWinProbability - exchange.fighterAWinProbability);
  if (disagreement >= 0.12) flags.push("engine-disagreement");
  if (exchange.averageDamage.fighterA >= 75 || exchange.averageDamage.fighterB >= 75) flags.push("high-damage-variance");
  if (skill.deltas.upsetRisk >= 0.35) flags.push("high-upset-risk");
  if (exchange.methodProbabilities.KO_TKO >= 0.35) flags.push("finish-volatility");
  return flags;
}

function pathSummary(skill: UfcSkillMarkovResult, exchange: UfcExchangeMonteCarloResult) {
  const summary = [...skill.pathSummary];
  if (exchange.averageControlSeconds.fighterA > exchange.averageControlSeconds.fighterB + 20) summary.push("Exchange Monte Carlo projects Fighter A control-time pressure.");
  if (exchange.averageControlSeconds.fighterB > exchange.averageControlSeconds.fighterA + 20) summary.push("Exchange Monte Carlo projects Fighter B control-time pressure.");
  if (exchange.averageKnockdowns.fighterA > exchange.averageKnockdowns.fighterB + 0.05) summary.push("Exchange Monte Carlo gives Fighter A the stronger knockdown lane.");
  if (exchange.averageKnockdowns.fighterB > exchange.averageKnockdowns.fighterA + 0.05) summary.push("Exchange Monte Carlo gives Fighter B the stronger knockdown lane.");
  return [...new Set(summary)].slice(0, 6);
}

export function blendUfcSimOutputs(args: {
  skillMarkov: UfcSkillMarkovResult;
  exchangeMonteCarlo: UfcExchangeMonteCarloResult;
  weights?: Partial<UfcEnsembleWeights>;
}): UfcEnsembleSimResult {
  const weights = normalizeWeights(args.weights);
  const pair = normalizePair(
    blendProbability(args.skillMarkov.fighterAWinProbability, args.exchangeMonteCarlo.fighterAWinProbability, weights),
    blendProbability(args.skillMarkov.fighterBWinProbability, args.exchangeMonteCarlo.fighterBWinProbability, weights)
  );
  const methods = normalizeMethods({
    KO_TKO: blendProbability(args.skillMarkov.methodProbabilities.KO_TKO, args.exchangeMonteCarlo.methodProbabilities.KO_TKO, weights),
    SUBMISSION: blendProbability(args.skillMarkov.methodProbabilities.SUBMISSION, args.exchangeMonteCarlo.methodProbabilities.SUBMISSION, weights),
    DECISION: blendProbability(args.skillMarkov.methodProbabilities.DECISION, args.exchangeMonteCarlo.methodProbabilities.DECISION, weights)
  });

  return {
    engine: "ensemble",
    simulations: args.skillMarkov.simulations,
    seed: args.skillMarkov.seed,
    scheduledRounds: args.exchangeMonteCarlo.scheduledRounds,
    weights,
    fighterAWinProbability: pair.a,
    fighterBWinProbability: pair.b,
    methodProbabilities: methods,
    roundFinishProbabilities: blendRoundFinishes(args.skillMarkov.roundFinishProbabilities, args.exchangeMonteCarlo.roundFinishProbabilities, weights, args.exchangeMonteCarlo.scheduledRounds),
    transitionProbabilities: args.skillMarkov.transitionProbabilities,
    exchangeDiagnostics: args.exchangeMonteCarlo.diagnosticProbabilities,
    averageFightLengthSeconds: args.exchangeMonteCarlo.averageFightLengthSeconds,
    averageDamage: args.exchangeMonteCarlo.averageDamage,
    averageControlSeconds: args.exchangeMonteCarlo.averageControlSeconds,
    averageKnockdowns: args.exchangeMonteCarlo.averageKnockdowns,
    pathSummary: pathSummary(args.skillMarkov, args.exchangeMonteCarlo),
    dangerFlags: dangerFlags(args.skillMarkov, args.exchangeMonteCarlo),
    sourceOutputs: args
  };
}

export function runUfcEnsembleSimFromFeatures(fighterAFeature: UfcModelFeatureSnapshot, fighterBFeature: UfcModelFeatureSnapshot, options: UfcEnsembleSimOptions = {}): UfcEnsembleSimResult {
  const simulations = options.simulations ?? DEFAULT_SIMULATIONS;
  const seed = options.seed ?? 1287;
  const scheduledRounds = options.scheduledRounds ?? 3;
  const fighterAProfile = buildUfcFighterSkillProfile({ feature: fighterAFeature });
  const fighterBProfile = buildUfcFighterSkillProfile({ feature: fighterBFeature });
  const skillMarkov = runUfcSkillMarkovSim(fighterAProfile, fighterBProfile, { simulations, seed, scheduledRounds });
  const exchangeMonteCarlo = runUfcExchangeMonteCarlo(buildExchangeStatsFromUfcFeature(fighterAFeature), buildExchangeStatsFromUfcFeature(fighterBFeature), { simulations, seed: seed + 17, scheduledRounds, exchangeSeconds: 5 });
  return blendUfcSimOutputs({ skillMarkov, exchangeMonteCarlo, weights: options.weights });
}
