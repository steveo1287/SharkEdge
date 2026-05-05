export type NbaWinnerSignalInput = {
  key: string;
  label: string;
  probabilityDelta: number;
  marginDelta: number;
  confidence: number;
  weight: number;
};

export type NbaWinnerSignalConsensus = {
  modelVersion: "nba-winner-signal-consensus-v1";
  signalCount: number;
  activeSignalCount: number;
  homeSignalCount: number;
  awaySignalCount: number;
  neutralSignalCount: number;
  agreementRate: number;
  weightedAgreementRate: number;
  directionalConfidence: number;
  conflictScore: number;
  dispersionScore: number;
  consensusMultiplier: number;
  consensusProbabilityDelta: number;
  consensusMarginDelta: number;
  status: "GREEN" | "YELLOW" | "RED" | "INSUFFICIENT";
  blockers: string[];
  warnings: string[];
  drivers: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function direction(value: number) {
  if (value > 0.0025) return 1;
  if (value < -0.0025) return -1;
  return 0;
}

function weightedDirection(signal: NbaWinnerSignalInput) {
  return direction(signal.probabilityDelta) * clamp(signal.confidence, 0, 1) * clamp(signal.weight, 0, 2);
}

export function buildNbaWinnerSignalConsensus(signals: NbaWinnerSignalInput[]): NbaWinnerSignalConsensus {
  const normalized = signals.map((signal) => ({
    ...signal,
    probabilityDelta: Number.isFinite(signal.probabilityDelta) ? signal.probabilityDelta : 0,
    marginDelta: Number.isFinite(signal.marginDelta) ? signal.marginDelta : 0,
    confidence: clamp(signal.confidence, 0, 1),
    weight: clamp(signal.weight, 0, 2)
  }));
  const active = normalized.filter((signal) => Math.abs(signal.probabilityDelta) >= 0.0025 || Math.abs(signal.marginDelta) >= 0.2);
  const homeSignalCount = active.filter((signal) => direction(signal.probabilityDelta) > 0).length;
  const awaySignalCount = active.filter((signal) => direction(signal.probabilityDelta) < 0).length;
  const neutralSignalCount = normalized.length - homeSignalCount - awaySignalCount;
  const leadingDirection = homeSignalCount === awaySignalCount ? 0 : homeSignalCount > awaySignalCount ? 1 : -1;
  const agreeingSignals = leadingDirection === 0 ? 0 : active.filter((signal) => direction(signal.probabilityDelta) === leadingDirection).length;
  const agreementRate = active.length ? agreeingSignals / active.length : 0;
  const weightedDirectionalSum = sum(active.map(weightedDirection));
  const weightedMagnitude = sum(active.map((signal) => Math.abs(weightedDirection(signal))));
  const weightedAgreementRate = weightedMagnitude > 0 ? Math.abs(weightedDirectionalSum) / weightedMagnitude : 0;
  const directionalConfidence = active.length ? average(active.map((signal) => signal.confidence * Math.abs(direction(signal.probabilityDelta)))) : 0;
  const deltas = active.map((signal) => signal.probabilityDelta);
  const meanDelta = average(deltas);
  const dispersionScore = deltas.length > 1
    ? clamp(Math.sqrt(average(deltas.map((value) => (value - meanDelta) ** 2))) / 0.035, 0, 1)
    : 0;
  const conflictScore = clamp((1 - weightedAgreementRate) * 0.7 + dispersionScore * 0.3, 0, 1);
  const consensusMultiplier = active.length < 3
    ? 0.58
    : clamp(0.28 + weightedAgreementRate * 0.54 + directionalConfidence * 0.18 - dispersionScore * 0.22, 0.22, 1.04);
  const rawProbabilityDelta = sum(active.map((signal) => signal.probabilityDelta * signal.confidence * signal.weight));
  const rawMarginDelta = sum(active.map((signal) => signal.marginDelta * signal.confidence * signal.weight));
  const consensusProbabilityDelta = clamp(rawProbabilityDelta * consensusMultiplier, -0.0525, 0.0525);
  const consensusMarginDelta = clamp(rawMarginDelta * consensusMultiplier, -4.8, 4.8);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (active.length < 3) warnings.push("fewer than 3 active NBA winner signals");
  if (agreementRate < 0.5 && active.length >= 3) blockers.push("NBA winner signals disagree directionally");
  if (weightedAgreementRate < 0.55 && active.length >= 3) blockers.push("NBA winner weighted signal consensus below 55%");
  if (dispersionScore > 0.72) warnings.push("NBA winner signal dispersion is high");
  if (conflictScore > 0.62) warnings.push("NBA winner signal conflict is elevated");

  const status: NbaWinnerSignalConsensus["status"] = active.length < 3
    ? "INSUFFICIENT"
    : blockers.length
      ? "RED"
      : warnings.length
        ? "YELLOW"
        : "GREEN";

  return {
    modelVersion: "nba-winner-signal-consensus-v1",
    signalCount: normalized.length,
    activeSignalCount: active.length,
    homeSignalCount,
    awaySignalCount,
    neutralSignalCount,
    agreementRate: round(agreementRate),
    weightedAgreementRate: round(weightedAgreementRate),
    directionalConfidence: round(directionalConfidence),
    conflictScore: round(conflictScore),
    dispersionScore: round(dispersionScore),
    consensusMultiplier: round(consensusMultiplier),
    consensusProbabilityDelta: round(consensusProbabilityDelta),
    consensusMarginDelta: round(consensusMarginDelta),
    status,
    blockers,
    warnings,
    drivers: [
      `signal consensus ${status}`,
      `active signals ${active.length}/${normalized.length}`,
      `home signals ${homeSignalCount}, away signals ${awaySignalCount}, neutral ${neutralSignalCount}`,
      `agreement ${(agreementRate * 100).toFixed(1)}%`,
      `weighted agreement ${(weightedAgreementRate * 100).toFixed(1)}%`,
      `conflict ${(conflictScore * 100).toFixed(1)}%`,
      `dispersion ${(dispersionScore * 100).toFixed(1)}%`,
      `consensus multiplier ${(consensusMultiplier * 100).toFixed(1)}%`,
      `consensus probability delta ${(consensusProbabilityDelta * 100).toFixed(1)}%`,
      `consensus margin delta ${consensusMarginDelta.toFixed(2)}`,
      ...active.map((signal) => `${signal.label}: prob ${(signal.probabilityDelta * 100).toFixed(1)}%, margin ${signal.marginDelta.toFixed(2)}, conf ${(signal.confidence * 100).toFixed(1)}%`)
    ]
  };
}
