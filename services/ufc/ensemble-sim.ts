import { buildExchangeStatsFromUfcFeature, runUfcExchangeMonteCarlo, type UfcExchangeMonteCarloResult } from "@/services/ufc/exchange-monte-carlo";
import { buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { runUfcRoundByRoundFightEngine, type UfcRoundByRoundFightResult } from "@/services/ufc/round-by-round-fight-engine";
import { runUfcSkillMarkovSim, type UfcSkillMarkovResult } from "@/services/ufc/skill-markov-sim";
import { runUfcStyleMatchupEngine, type UfcStyleMatchupResult } from "@/services/ufc/style-matchup-engine";

export type UfcEnsembleWeights = {
  skillMarkov: number;
  exchangeMonteCarlo: number;
  roundByRound: number;
  styleMatchup: number;
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
  methodProbabilities: { KO_TKO: number; SUBMISSION: number; DECISION: number };
  roundFinishProbabilities: Record<string, number>;
  transitionProbabilities: Record<string, number>;
  exchangeDiagnostics: UfcExchangeMonteCarloResult["diagnosticProbabilities"];
  roundEngineDiagnostics: UfcRoundByRoundFightResult["diagnosticProbabilities"];
  styleMatchup: UfcStyleMatchupResult["style"];
  stylePathWins: UfcStyleMatchupResult["pathWins"];
  averageFightLengthSeconds: number;
  averageDamage: UfcExchangeMonteCarloResult["averageDamage"];
  averageControlSeconds: UfcExchangeMonteCarloResult["averageControlSeconds"];
  averageKnockdowns: UfcExchangeMonteCarloResult["averageKnockdowns"];
  pathSummary: string[];
  dangerFlags: string[];
  sourceOutputs: {
    skillMarkov: UfcSkillMarkovResult;
    exchangeMonteCarlo: UfcExchangeMonteCarloResult;
    roundByRound: UfcRoundByRoundFightResult;
    styleMatchup: UfcStyleMatchupResult;
  };
};

const DEFAULT_SIMULATIONS = 25_000;
const DEFAULT_WEIGHTS: UfcEnsembleWeights = { skillMarkov: 0.34, exchangeMonteCarlo: 0.28, roundByRound: 0.2, styleMatchup: 0.18 };

function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }

function normalizeWeights(input?: Partial<UfcEnsembleWeights>): UfcEnsembleWeights {
  const skill = input?.skillMarkov ?? DEFAULT_WEIGHTS.skillMarkov;
  const exchange = input?.exchangeMonteCarlo ?? DEFAULT_WEIGHTS.exchangeMonteCarlo;
  const roundEngine = input?.roundByRound ?? DEFAULT_WEIGHTS.roundByRound;
  const style = input?.styleMatchup ?? DEFAULT_WEIGHTS.styleMatchup;
  const total = Math.max(0.0001, skill + exchange + roundEngine + style);
  return { skillMarkov: round(skill / total, 4), exchangeMonteCarlo: round(exchange / total, 4), roundByRound: round(roundEngine / total, 4), styleMatchup: round(style / total, 4) };
}

function blendProbability(skill: number, exchange: number, roundEngine: number, style: number, weights: UfcEnsembleWeights) {
  return round(skill * weights.skillMarkov + exchange * weights.exchangeMonteCarlo + roundEngine * weights.roundByRound + style * weights.styleMatchup);
}

function normalizePair(a: number, b: number) {
  const total = Math.max(0.0001, a + b);
  return { a: round(a / total), b: round(b / total) };
}

function normalizeMethods(methods: UfcEnsembleSimResult["methodProbabilities"]) {
  const total = Math.max(0.0001, methods.KO_TKO + methods.SUBMISSION + methods.DECISION);
  return { KO_TKO: round(methods.KO_TKO / total), SUBMISSION: round(methods.SUBMISSION / total), DECISION: round(methods.DECISION / total) };
}

function blendRoundFinishes(skill: Record<string, number>, exchange: Record<string, number>, roundEngine: Record<string, number>, style: Record<string, number>, weights: UfcEnsembleWeights, scheduledRounds: 3 | 5) {
  const output: Record<string, number> = {};
  for (let roundNo = 1; roundNo <= scheduledRounds; roundNo += 1) {
    const key = `R${roundNo}`;
    output[key] = blendProbability(skill[key] ?? 0, exchange[key] ?? 0, roundEngine[key] ?? 0, style[key] ?? 0, weights);
  }
  return output;
}

function blendTransitions(skill: Record<string, number>, roundEngine: Record<string, number>, style: Record<string, number>, weights: UfcEnsembleWeights) {
  const keys = Array.from(new Set([...Object.keys(skill), ...Object.keys(roundEngine), ...Object.keys(style)]));
  return Object.fromEntries(keys.map((key) => [key, round((skill[key] ?? 0) * weights.skillMarkov + (roundEngine[key] ?? 0) * weights.roundByRound + (style[key] ?? 0) * weights.styleMatchup)]));
}

function averagePair(exchange: { fighterA: number; fighterB: number }, roundEngine: { fighterA: number; fighterB: number }, roundWeight: number) {
  return { fighterA: round(exchange.fighterA * (1 - roundWeight) + roundEngine.fighterA * roundWeight, 2), fighterB: round(exchange.fighterB * (1 - roundWeight) + roundEngine.fighterB * roundWeight, 2) };
}

function dangerFlags(skill: UfcSkillMarkovResult, exchange: UfcExchangeMonteCarloResult, roundEngine: UfcRoundByRoundFightResult, style: UfcStyleMatchupResult) {
  const flags: string[] = [];
  const maxA = Math.max(skill.fighterAWinProbability, exchange.fighterAWinProbability, roundEngine.fighterAWinProbability, style.fighterAWinProbability);
  const minA = Math.min(skill.fighterAWinProbability, exchange.fighterAWinProbability, roundEngine.fighterAWinProbability, style.fighterAWinProbability);
  if (maxA - minA >= 0.12) flags.push("engine-disagreement");
  if (exchange.averageDamage.fighterA >= 75 || exchange.averageDamage.fighterB >= 75 || roundEngine.averageDamage.fighterA >= 75 || roundEngine.averageDamage.fighterB >= 75) flags.push("high-damage-variance");
  if (skill.deltas.upsetRisk >= 0.35) flags.push("high-upset-risk");
  if (exchange.methodProbabilities.KO_TKO >= 0.35 || roundEngine.methodProbabilities.KO_TKO >= 0.42 || style.methodProbabilities.KO_TKO >= 0.34) flags.push("finish-volatility");
  if (style.dangerFlags.includes("style-engine-high-input-volatility")) flags.push("style-input-volatility");
  return [...new Set([...flags, ...roundEngine.dangerFlags, ...style.dangerFlags])];
}

function pathSummary(skill: UfcSkillMarkovResult, exchange: UfcExchangeMonteCarloResult, roundEngine: UfcRoundByRoundFightResult, style: UfcStyleMatchupResult) {
  const summary = [...skill.pathSummary];
  if (exchange.averageControlSeconds.fighterA > exchange.averageControlSeconds.fighterB + 20) summary.push("Exchange Monte Carlo projects Fighter A control-time pressure.");
  if (exchange.averageControlSeconds.fighterB > exchange.averageControlSeconds.fighterA + 20) summary.push("Exchange Monte Carlo projects Fighter B control-time pressure.");
  if (exchange.averageKnockdowns.fighterA > exchange.averageKnockdowns.fighterB + 0.05) summary.push("Exchange Monte Carlo gives Fighter A the stronger knockdown lane.");
  if (exchange.averageKnockdowns.fighterB > exchange.averageKnockdowns.fighterA + 0.05) summary.push("Exchange Monte Carlo gives Fighter B the stronger knockdown lane.");
  summary.push(...roundEngine.pathSummary);
  summary.push(...style.pathSummary);
  return [...new Set(summary)].slice(0, 10);
}

export function blendUfcSimOutputs(args: { skillMarkov: UfcSkillMarkovResult; exchangeMonteCarlo: UfcExchangeMonteCarloResult; roundByRound: UfcRoundByRoundFightResult; styleMatchup: UfcStyleMatchupResult; weights?: Partial<UfcEnsembleWeights> }): UfcEnsembleSimResult {
  const weights = normalizeWeights(args.weights);
  const pair = normalizePair(
    blendProbability(args.skillMarkov.fighterAWinProbability, args.exchangeMonteCarlo.fighterAWinProbability, args.roundByRound.fighterAWinProbability, args.styleMatchup.fighterAWinProbability, weights),
    blendProbability(args.skillMarkov.fighterBWinProbability, args.exchangeMonteCarlo.fighterBWinProbability, args.roundByRound.fighterBWinProbability, args.styleMatchup.fighterBWinProbability, weights)
  );
  const methods = normalizeMethods({
    KO_TKO: blendProbability(args.skillMarkov.methodProbabilities.KO_TKO, args.exchangeMonteCarlo.methodProbabilities.KO_TKO, args.roundByRound.methodProbabilities.KO_TKO, args.styleMatchup.methodProbabilities.KO_TKO, weights),
    SUBMISSION: blendProbability(args.skillMarkov.methodProbabilities.SUBMISSION, args.exchangeMonteCarlo.methodProbabilities.SUBMISSION, args.roundByRound.methodProbabilities.SUBMISSION, args.styleMatchup.methodProbabilities.SUBMISSION, weights),
    DECISION: blendProbability(args.skillMarkov.methodProbabilities.DECISION, args.exchangeMonteCarlo.methodProbabilities.DECISION, args.roundByRound.methodProbabilities.DECISION, args.styleMatchup.methodProbabilities.DECISION, weights)
  });
  const physicalRoundWeight = weights.roundByRound / Math.max(0.0001, weights.exchangeMonteCarlo + weights.roundByRound);
  return {
    engine: "ensemble",
    simulations: args.skillMarkov.simulations,
    seed: args.skillMarkov.seed,
    scheduledRounds: args.exchangeMonteCarlo.scheduledRounds,
    weights,
    fighterAWinProbability: pair.a,
    fighterBWinProbability: pair.b,
    methodProbabilities: methods,
    roundFinishProbabilities: blendRoundFinishes(args.skillMarkov.roundFinishProbabilities, args.exchangeMonteCarlo.roundFinishProbabilities, args.roundByRound.roundFinishProbabilities, args.styleMatchup.roundFinishProbabilities, weights, args.exchangeMonteCarlo.scheduledRounds),
    transitionProbabilities: blendTransitions(args.skillMarkov.transitionProbabilities, args.roundByRound.transitionProbabilities, args.styleMatchup.transitionProbabilities, weights),
    exchangeDiagnostics: args.exchangeMonteCarlo.diagnosticProbabilities,
    roundEngineDiagnostics: args.roundByRound.diagnosticProbabilities,
    styleMatchup: args.styleMatchup.style,
    stylePathWins: args.styleMatchup.pathWins,
    averageFightLengthSeconds: round(args.exchangeMonteCarlo.averageFightLengthSeconds * (1 - physicalRoundWeight) + args.roundByRound.averageFightLengthSeconds * physicalRoundWeight, 1),
    averageDamage: averagePair(args.exchangeMonteCarlo.averageDamage, args.roundByRound.averageDamage, physicalRoundWeight),
    averageControlSeconds: averagePair(args.exchangeMonteCarlo.averageControlSeconds, args.roundByRound.averageControlSeconds, physicalRoundWeight),
    averageKnockdowns: averagePair(args.exchangeMonteCarlo.averageKnockdowns, args.roundByRound.averageKnockdowns, physicalRoundWeight),
    pathSummary: pathSummary(args.skillMarkov, args.exchangeMonteCarlo, args.roundByRound, args.styleMatchup),
    dangerFlags: dangerFlags(args.skillMarkov, args.exchangeMonteCarlo, args.roundByRound, args.styleMatchup),
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
  const roundByRound = runUfcRoundByRoundFightEngine(fighterAProfile, fighterBProfile, { simulations, seed: seed + 31, scheduledRounds });
  const styleMatchup = runUfcStyleMatchupEngine(fighterAProfile, fighterBProfile, { simulations, seed: seed + 47, scheduledRounds });
  return blendUfcSimOutputs({ skillMarkov, exchangeMonteCarlo, roundByRound, styleMatchup, weights: options.weights });
}
