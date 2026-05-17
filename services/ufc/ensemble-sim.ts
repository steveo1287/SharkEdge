import { buildExchangeStatsFromUfcFeature, runUfcExchangeMonteCarlo, type UfcExchangeMonteCarloResult } from "@/services/ufc/exchange-monte-carlo";
import { buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { buildUfcFighterStyleGenome, type UfcFighterStyleGenome } from "@/services/ufc/fighter-style-genome";
import { buildUfcMatchupStyleClash, type UfcMatchupStyleClash } from "@/services/ufc/matchup-style-clash";
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
  styleGenome: { fighterA: UfcFighterStyleGenome | null; fighterB: UfcFighterStyleGenome | null; clash: UfcMatchupStyleClash | null };
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
const METHOD_PRIOR = { KO_TKO: 0.32, SUBMISSION: 0.21, DECISION: 0.47 };

function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%$/, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

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

function qualityRank(quality: string | null | undefined) {
  if (quality === "A") return 4;
  if (quality === "B") return 3;
  if (quality === "C") return 2;
  if (quality === "D") return 1;
  return 0;
}

function featureReliability(feature: UfcModelFeatureSnapshot) {
  const root = asRecord(feature.feature);
  const diagnostics = asRecord(root.profileDiagnostics);
  const eliteProfile = asRecord(root.eliteProfile);
  const sample = asRecord(eliteProfile.sample);
  const source = typeof root.source === "string" ? root.source : "unknown";
  const dataQuality = typeof diagnostics.dataQuality === "string" ? diagnostics.dataQuality : typeof eliteProfile.dataQuality === "string" ? eliteProfile.dataQuality : null;
  const seconds = numeric(diagnostics.seconds) ?? 0;
  const rounds = numeric(feature.roundsFought) ?? numeric(sample.roundsFought) ?? 0;
  const ufcFights = numeric(feature.ufcFights) ?? numeric(sample.ufcFights) ?? 0;
  const proFights = numeric(feature.proFights) ?? numeric(sample.proFights) ?? 0;
  const usefulHistory = seconds >= 900 || rounds >= 3 || ufcFights >= 1;
  const coldStart = Boolean(feature.coldStartActive) && !usefulHistory;
  const historyWeighted = source === "elite-fighter-profile-builder" || source === "elite-fighter-profile-builder-fight-snapshot" || Boolean(asRecord(eliteProfile.diagnostics).historyWeighted) || usefulHistory;
  const missingCore = [feature.sigStrikesLandedPerMin, feature.sigStrikesAbsorbedPerMin, feature.takedownsPer15, feature.takedownDefensePct, feature.submissionAttemptsPer15, feature.controlTimePct].filter((value) => typeof value !== "number" || !Number.isFinite(value)).length;
  const base = qualityRank(dataQuality) * 16 + Math.min(18, ufcFights * 4) + Math.min(14, rounds * 1.2) + (historyWeighted ? 10 : 0) - missingCore * 7 - (coldStart ? 18 : 0) + Math.min(8, proFights * 0.5);
  const score = Math.max(0, Math.min(100, Math.round(base)));
  return { score, dataQuality: dataQuality ?? "UNKNOWN", usefulHistory, coldStart, historyWeighted, missingCore };
}

function matchupReliability(fighterAFeature: UfcModelFeatureSnapshot, fighterBFeature: UfcModelFeatureSnapshot) {
  const a = featureReliability(fighterAFeature);
  const b = featureReliability(fighterBFeature);
  const score = Math.min(a.score, b.score);
  const weak = score < 55 || a.coldStart || b.coldStart || a.dataQuality === "D" || b.dataQuality === "D";
  const veryWeak = score < 42 || (a.dataQuality === "D" && b.dataQuality === "D") || (a.missingCore >= 3 || b.missingCore >= 3);
  return { score, weak, veryWeak, fighterA: a, fighterB: b };
}

function shrinkPairForReliability(pair: { a: number; b: number }, reliability: ReturnType<typeof matchupReliability>) {
  if (!reliability.weak) return pair;
  const maxEdge = reliability.veryWeak ? 0.035 : 0.055;
  const aEdge = Math.max(-maxEdge, Math.min(maxEdge, pair.a - 0.5));
  return normalizePair(0.5 + aEdge, 0.5 - aEdge);
}

function applyMethodReliabilityGuard(methods: UfcEnsembleSimResult["methodProbabilities"], reliability: ReturnType<typeof matchupReliability>) {
  if (!reliability.weak) return normalizeMethods(methods);
  const priorWeight = reliability.veryWeak ? 0.82 : 0.58;
  const raw = normalizeMethods(methods);
  const blended = normalizeMethods({
    KO_TKO: raw.KO_TKO * (1 - priorWeight) + METHOD_PRIOR.KO_TKO * priorWeight,
    SUBMISSION: raw.SUBMISSION * (1 - priorWeight) + METHOD_PRIOR.SUBMISSION * priorWeight,
    DECISION: raw.DECISION * (1 - priorWeight) + METHOD_PRIOR.DECISION * priorWeight
  });
  const decisionCap = reliability.veryWeak ? 0.49 : 0.53;
  if (blended.DECISION <= decisionCap) return blended;
  const overflow = blended.DECISION - decisionCap;
  return normalizeMethods({ KO_TKO: blended.KO_TKO + overflow * 0.62, SUBMISSION: blended.SUBMISSION + overflow * 0.38, DECISION: decisionCap });
}

function reliabilityFlags(reliability: ReturnType<typeof matchupReliability>) {
  const flags: string[] = [];
  if (reliability.weak) flags.push("method-prior-fallback");
  if (reliability.veryWeak) flags.push("winner-probability-shrunk-for-weak-inputs");
  if (reliability.fighterA.dataQuality === "D") flags.push("fighter-a-profile-d-quality");
  if (reliability.fighterB.dataQuality === "D") flags.push("fighter-b-profile-d-quality");
  if (reliability.fighterA.coldStart) flags.push("fighter-a-cold-start-method-cap");
  if (reliability.fighterB.coldStart) flags.push("fighter-b-cold-start-method-cap");
  return flags;
}

function reliabilitySummary(reliability: ReturnType<typeof matchupReliability>) {
  if (!reliability.weak) return [];
  return [
    `Method model fallback guard active: matchup reliability ${reliability.score}/100; method probabilities blended toward base UFC priors and decision confidence capped.`,
    `Winner probability shrink active for weak inputs: A profile ${reliability.fighterA.dataQuality}/${reliability.fighterA.score}, B profile ${reliability.fighterB.dataQuality}/${reliability.fighterB.score}.`
  ];
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
  for (const warning of skill.styleClash?.styleWarnings ?? []) flags.push(`style-clash:${warning}`);
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
  if (skill.styleGenomeA && skill.styleGenomeB) summary.push(`Style genome: A=${skill.styleGenomeA.archetype.primary}, B=${skill.styleGenomeB.archetype.primary}.`);
  return [...new Set(summary)].slice(0, 12);
}

export function blendUfcSimOutputs(args: { skillMarkov: UfcSkillMarkovResult; exchangeMonteCarlo: UfcExchangeMonteCarloResult; roundByRound: UfcRoundByRoundFightResult; styleMatchup: UfcStyleMatchupResult; weights?: Partial<UfcEnsembleWeights>; reliability?: ReturnType<typeof matchupReliability> }): UfcEnsembleSimResult {
  const weights = normalizeWeights(args.weights);
  const rawPair = normalizePair(
    blendProbability(args.skillMarkov.fighterAWinProbability, args.exchangeMonteCarlo.fighterAWinProbability, args.roundByRound.fighterAWinProbability, args.styleMatchup.fighterAWinProbability, weights),
    blendProbability(args.skillMarkov.fighterBWinProbability, args.exchangeMonteCarlo.fighterBWinProbability, args.roundByRound.fighterBWinProbability, args.styleMatchup.fighterBWinProbability, weights)
  );
  const reliability = args.reliability;
  const pair = reliability ? shrinkPairForReliability(rawPair, reliability) : rawPair;
  const methods = reliability ? applyMethodReliabilityGuard({
    KO_TKO: blendProbability(args.skillMarkov.methodProbabilities.KO_TKO, args.exchangeMonteCarlo.methodProbabilities.KO_TKO, args.roundByRound.methodProbabilities.KO_TKO, args.styleMatchup.methodProbabilities.KO_TKO, weights),
    SUBMISSION: blendProbability(args.skillMarkov.methodProbabilities.SUBMISSION, args.exchangeMonteCarlo.methodProbabilities.SUBMISSION, args.roundByRound.methodProbabilities.SUBMISSION, args.styleMatchup.methodProbabilities.SUBMISSION, weights),
    DECISION: blendProbability(args.skillMarkov.methodProbabilities.DECISION, args.exchangeMonteCarlo.methodProbabilities.DECISION, args.roundByRound.methodProbabilities.DECISION, args.styleMatchup.methodProbabilities.DECISION, weights)
  }, reliability) : normalizeMethods({
    KO_TKO: blendProbability(args.skillMarkov.methodProbabilities.KO_TKO, args.exchangeMonteCarlo.methodProbabilities.KO_TKO, args.roundByRound.methodProbabilities.KO_TKO, args.styleMatchup.methodProbabilities.KO_TKO, weights),
    SUBMISSION: blendProbability(args.skillMarkov.methodProbabilities.SUBMISSION, args.exchangeMonteCarlo.methodProbabilities.SUBMISSION, args.roundByRound.methodProbabilities.SUBMISSION, args.styleMatchup.methodProbabilities.SUBMISSION, weights),
    DECISION: blendProbability(args.skillMarkov.methodProbabilities.DECISION, args.exchangeMonteCarlo.methodProbabilities.DECISION, args.roundByRound.methodProbabilities.DECISION, args.styleMatchup.methodProbabilities.DECISION, weights)
  });
  const physicalRoundWeight = weights.roundByRound / Math.max(0.0001, weights.exchangeMonteCarlo + weights.roundByRound);
  const baseDangerFlags = dangerFlags(args.skillMarkov, args.exchangeMonteCarlo, args.roundByRound, args.styleMatchup);
  const basePathSummary = pathSummary(args.skillMarkov, args.exchangeMonteCarlo, args.roundByRound, args.styleMatchup);
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
    styleGenome: { fighterA: args.skillMarkov.styleGenomeA ?? null, fighterB: args.skillMarkov.styleGenomeB ?? null, clash: args.skillMarkov.styleClash ?? null },
    averageFightLengthSeconds: round(args.exchangeMonteCarlo.averageFightLengthSeconds * (1 - physicalRoundWeight) + args.roundByRound.averageFightLengthSeconds * physicalRoundWeight, 1),
    averageDamage: averagePair(args.exchangeMonteCarlo.averageDamage, args.roundByRound.averageDamage, physicalRoundWeight),
    averageControlSeconds: averagePair(args.exchangeMonteCarlo.averageControlSeconds, args.roundByRound.averageControlSeconds, physicalRoundWeight),
    averageKnockdowns: averagePair(args.exchangeMonteCarlo.averageKnockdowns, args.roundByRound.averageKnockdowns, physicalRoundWeight),
    pathSummary: [...new Set([...(reliability ? reliabilitySummary(reliability) : []), ...basePathSummary])].slice(0, 14),
    dangerFlags: [...new Set([...baseDangerFlags, ...(reliability ? reliabilityFlags(reliability) : [])])],
    sourceOutputs: args
  };
}

export function runUfcEnsembleSimFromFeatures(fighterAFeature: UfcModelFeatureSnapshot, fighterBFeature: UfcModelFeatureSnapshot, options: UfcEnsembleSimOptions = {}): UfcEnsembleSimResult {
  const simulations = options.simulations ?? DEFAULT_SIMULATIONS;
  const seed = options.seed ?? 1287;
  const scheduledRounds = options.scheduledRounds ?? 3;
  const fighterAProfile = buildUfcFighterSkillProfile({ feature: fighterAFeature });
  const fighterBProfile = buildUfcFighterSkillProfile({ feature: fighterBFeature });
  const fighterAFeatureRoot = asRecord(fighterAFeature.feature);
  const fighterBFeatureRoot = asRecord(fighterBFeature.feature);
  const styleGenomeA = buildUfcFighterStyleGenome({ fighterId: fighterAProfile.fighterId, skillProfile: fighterAProfile, feature: fighterAFeature, profileIntelligence: asRecord(fighterAFeatureRoot.profileIntelligence), completeProfile: asRecord(fighterAFeatureRoot.completeProfile) });
  const styleGenomeB = buildUfcFighterStyleGenome({ fighterId: fighterBProfile.fighterId, skillProfile: fighterBProfile, feature: fighterBFeature, profileIntelligence: asRecord(fighterBFeatureRoot.profileIntelligence), completeProfile: asRecord(fighterBFeatureRoot.completeProfile) });
  const styleClash = buildUfcMatchupStyleClash(styleGenomeA, styleGenomeB);
  const skillMarkov = runUfcSkillMarkovSim(fighterAProfile, fighterBProfile, { simulations, seed, scheduledRounds, styleGenomeA, styleGenomeB, styleClash });
  const exchangeMonteCarlo = runUfcExchangeMonteCarlo(buildExchangeStatsFromUfcFeature(fighterAFeature), buildExchangeStatsFromUfcFeature(fighterBFeature), { simulations, seed: seed + 17, scheduledRounds, exchangeSeconds: 5 });
  const roundByRound = runUfcRoundByRoundFightEngine(fighterAProfile, fighterBProfile, { simulations, seed: seed + 31, scheduledRounds });
  const styleMatchup = runUfcStyleMatchupEngine(fighterAProfile, fighterBProfile, { simulations, seed: seed + 47, scheduledRounds });
  const reliability = matchupReliability(fighterAFeature, fighterBFeature);
  return blendUfcSimOutputs({ skillMarkov, exchangeMonteCarlo, roundByRound, styleMatchup, weights: options.weights, reliability });
}