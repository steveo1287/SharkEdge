import type { MlbCalibratedOutcome, MlbOutcomeDistribution } from "@/lib/types/mlb-outcome-math";
import { buildMlbEliteSimSnapshot } from "@/services/modeling/mlb-elite-sim-service";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function logistic(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function temperatureScale(prob: number, temperature: number) {
  const p = clamp(prob, 0.0001, 0.9999);
  const logit = Math.log(p / (1 - p));
  return clamp(logistic(logit / temperature), 0.0001, 0.9999);
}

function histogramShrink(prob: number, toward = 0.5, weight = 0.12) {
  return clamp(prob * (1 - weight) + toward * weight, 0.0001, 0.9999);
}

export async function buildMlbCalibratedOutcomeMath(eventId: string): Promise<MlbCalibratedOutcome> {
  const snapshot = await buildMlbEliteSimSnapshot(eventId);

  const margin = snapshot.homeExpectedRuns - snapshot.awayExpectedRuns;
  const total = snapshot.normalizedTotal;

  const rawHomeWin = clamp(logistic(margin * 0.72), 0.02, 0.98);
  const rawAwayWin = round(1 - rawHomeWin);
  const rawOver = clamp(logistic((total - 8.6) * 0.85), 0.03, 0.97);
  const rawUnder = round(1 - rawOver);

  const raw: MlbOutcomeDistribution = {
    homeWinProb: round(rawHomeWin),
    awayWinProb: rawAwayWin,
    coverProbHome: round(clamp(rawHomeWin - 0.02, 0.02, 0.98)),
    coverProbAway: round(clamp(rawAwayWin - 0.02, 0.02, 0.98)),
    overProb: round(rawOver),
    underProb: rawUnder,
    expectedMargin: round(margin, 3),
    expectedTotal: round(total, 2)
  };

  const stabilityPenalty = clamp(
    Math.abs(snapshot.parkWeatherDelta) * 0.22 + Math.abs(snapshot.bullpenFatigueDelta) * 0.18,
    0.01,
    0.14
  );
  const marketAgreement = clamp(1 - stabilityPenalty * 1.5, 0.52, 0.97);

  const calibratedHomeWin = histogramShrink(temperatureScale(raw.homeWinProb, 1 + stabilityPenalty), 0.5, stabilityPenalty);
  const calibratedAwayWin = round(1 - calibratedHomeWin);
  const calibratedOver = histogramShrink(temperatureScale(raw.overProb, 1 + stabilityPenalty), 0.5, stabilityPenalty);
  const calibratedUnder = round(1 - calibratedOver);

  const calibrated: MlbOutcomeDistribution = {
    homeWinProb: round(calibratedHomeWin),
    awayWinProb: calibratedAwayWin,
    coverProbHome: round(clamp(calibratedHomeWin - 0.018, 0.02, 0.98)),
    coverProbAway: round(clamp(calibratedAwayWin - 0.018, 0.02, 0.98)),
    overProb: round(calibratedOver),
    underProb: calibratedUnder,
    expectedMargin: raw.expectedMargin,
    expectedTotal: raw.expectedTotal
  };

  const decisionScore = round(
    (Math.max(calibrated.homeWinProb, calibrated.awayWinProb) - 0.5) * marketAgreement * (1 - stabilityPenalty) * 100,
    3
  );

  return {
    raw,
    calibrated,
    calibrationPenalty: round(stabilityPenalty, 4),
    marketAgreement: round(marketAgreement, 4),
    decisionScore
  };
}
