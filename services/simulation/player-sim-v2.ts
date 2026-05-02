import { DEFAULT_TUNING, SimTuningParams } from "./sim-tuning";
import { getSimRunDepth } from "./sim-run-depth";

export type PlayerSimV2Input = {
  player: string;
  propType: string;
  line: number;
  odds: number;

  // core inputs — replace with real projections as the data layer matures
  teamTotal: number;
  minutes: number;
  usageRate: number;

  // context
  opponentRank?: number | null; // 1-30, lower = tougher defense
  pace?: number | null; // 95-105 normalized
  recentForm?: number | null; // -1 to +1
  lineMovement?: number | null;
  seed?: string;
  sims?: number;
};

export type PlayerSimV2Output = {
  rawMean: number;
  adjustedMean: number;
  probability: number;
  calibratedProbability: number;
  fairOdds: number;
  edgePct: number;
  confidence: number;
  decision: "ATTACK" | "WATCH" | "PASS";
  reasons: string[];
  riskFlags: string[];
  simCount: number;
  modelVersion: "player-sim-v2";
};

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function americanToProb(odds: number) {
  if (!Number.isFinite(odds) || odds === 0) return 0.5;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

export function probToAmerican(p: number) {
  const prob = Math.max(0.001, Math.min(0.999, p));
  if (prob > 0.5) return -Math.round((prob / (1 - prob)) * 100);
  return Math.round(((1 - prob) / prob) * 100);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSample(mean: number, std: number, random: () => number) {
  const u = Math.max(random(), Number.EPSILON);
  const v = Math.max(random(), Number.EPSILON);
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * std;
}

function normalizePropType(propType: string) {
  const cleaned = propType.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (cleaned.includes("point")) return "Points";
  if (cleaned.includes("rebound")) return "Rebounds";
  if (cleaned.includes("assist")) return "Assists";
  if (cleaned.includes("three")) return "Threes";
  if (cleaned.includes("strikeout")) return "Strikeouts";
  if (cleaned.includes("out")) return "Outs";
  if (cleaned.includes("shot")) return "Shots";
  if (cleaned.includes("save")) return "Saves";
  return propType.trim() || "Prop";
}

export function baselineMean(input: PlayerSimV2Input) {
  const propType = normalizePropType(input.propType);
  const teamTotal = Math.max(0, input.teamTotal);
  const usageRate = Math.max(0.01, input.usageRate);
  const minutes = Math.max(0, input.minutes);

  if (propType === "Points") return teamTotal * usageRate;
  if (propType === "Rebounds") return minutes * 0.28;
  if (propType === "Assists") return minutes * 0.22;
  if (propType === "Threes") return Math.max(0.2, teamTotal * usageRate * 0.12);
  if (propType === "Strikeouts") return Math.max(1.5, input.line * usageRate * 4.6);
  if (propType === "Outs") return Math.max(6, input.line * usageRate * 2.4);
  if (propType === "Shots") return Math.max(0.5, minutes * 0.18);
  if (propType === "Saves") return Math.max(12, minutes * 0.48);

  return teamTotal * usageRate;
}

export function applyAdjustments(mean: number, input: PlayerSimV2Input, tuning: SimTuningParams = DEFAULT_TUNING) {
  let adjusted = Math.max(0, mean);
  const reasons: string[] = [];

  if (typeof input.opponentRank === "number" && Number.isFinite(input.opponentRank)) {
    const rank = Math.max(1, Math.min(30, input.opponentRank));
    const adj = (15 - rank) * 0.01;
    adjusted *= 1 + adj * tuning.matchupWeight;
    reasons.push(`Matchup adj ${(adj * tuning.matchupWeight) >= 0 ? "+" : ""}${(adj * tuning.matchupWeight).toFixed(2)}`);
  }

  if (typeof input.pace === "number" && Number.isFinite(input.pace)) {
    const paceAdj = (input.pace - 100) * 0.01;
    adjusted *= 1 + paceAdj * tuning.paceWeight;
    reasons.push(`Pace adj ${(paceAdj * tuning.paceWeight) >= 0 ? "+" : ""}${(paceAdj * tuning.paceWeight).toFixed(2)}`);
  }

  if (typeof input.recentForm === "number" && Number.isFinite(input.recentForm) && input.recentForm !== 0) {
    const form = Math.max(-1, Math.min(1, input.recentForm));
    adjusted *= 1 + form * 0.05;
    reasons.push(`Form adjustment ${form >= 0 ? "+" : ""}${form.toFixed(2)}`);
  }

  if (!reasons.length) reasons.push("Baseline projection only; context inputs pending");

  return { adjusted, reasons };
}

export function simulate(mean: number, line: number, input: PlayerSimV2Input, tuning: SimTuningParams = DEFAULT_TUNING) {
  const sims = Math.max(1000, Math.min(input.sims ?? getSimRunDepth("detail"), 25000));
  const propType = normalizePropType(input.propType);
  const varianceScale = propType === "Strikeouts" || propType === "Outs" ? 0.22 : propType === "Threes" ? 0.34 : 0.25;
  const std = Math.max(0.2, mean * varianceScale * tuning.varianceScale);
  const seedSource = input.seed ?? `${input.player}:${propType}:${line}:${mean}:${input.odds}:${input.teamTotal}:${input.minutes}:${input.usageRate}`;
  const random = seededRandom(hashString(seedSource));
  let over = 0;

  for (let i = 0; i < sims; i++) {
    const val = Math.max(0, normalSample(mean, std, random));
    if (val > line) over++;
  }

  return { probability: over / sims, simCount: sims };
}

export function calibrate(prob: number) {
  const p = Math.max(0.001, Math.min(0.999, prob));
  if (p > 0.7) return p * 0.92;
  if (p > 0.6) return p * 0.95;
  if (p > 0.55) return p * 0.97;
  if (p < 0.3) return 1 - (1 - p) * 0.92;
  if (p < 0.4) return 1 - (1 - p) * 0.95;
  if (p < 0.45) return 1 - (1 - p) * 0.97;
  return p;
}

export function decide(edge: number, confidence: number): PlayerSimV2Output["decision"] {
  if (edge > 5 && confidence > 0.65) return "ATTACK";
  if (edge > 2) return "WATCH";
  return "PASS";
}

export function buildPlayerSimV2(input: PlayerSimV2Input, tuning: SimTuningParams = DEFAULT_TUNING): PlayerSimV2Output {
  const rawMean = baselineMean(input);
  const { adjusted, reasons } = applyAdjustments(rawMean, input, tuning);
  const { probability, simCount } = simulate(adjusted, input.line, input, tuning);
  const calibrated = calibrate(probability) * tuning.calibrationScale;
  const implied = americanToProb(input.odds);
  const edge = (calibrated - implied) * 100;
  const confidence = Math.min(0.9, 0.55 + Math.abs(edge) / 20);
  const decision = decide(edge, confidence);
  const riskFlags: string[] = [];

  if (typeof input.lineMovement === "number" && input.lineMovement < 0) riskFlags.push("Line moving against");
  if (confidence < 0.6) riskFlags.push("Low confidence");
  if (Math.abs(adjusted - rawMean) / Math.max(rawMean, 1) > 0.18) riskFlags.push("Large context adjustment");

  return {
    rawMean: round(rawMean),
    adjustedMean: round(adjusted),
    probability: round(probability, 5),
    calibratedProbability: round(calibrated, 5),
    fairOdds: probToAmerican(calibrated),
    edgePct: round(edge, 4),
    confidence: round(confidence, 4),
    decision,
    reasons,
    riskFlags,
    simCount,
    modelVersion: "player-sim-v2"
  };
}
