import { computeUncertaintyPenalty } from "./confidence";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampProb(value: number) {
  return clamp(value, 0.0001, 0.9999);
}

export function calibrateProbability(input: {
  rawProb: number | null;
  calibrationError: number | null;
  sampleSize: number;
}): number | null {
  if (typeof input.rawProb !== "number" || !Number.isFinite(input.rawProb)) return null;

  const raw = clampProb(input.rawProb);
  const n = Math.max(0, Math.floor(input.sampleSize));

  // Shrinkage: weak samples and poor calibration should push toward 0.5.
  const penalty = computeUncertaintyPenalty({
    sampleSize: n,
    calibrationError: input.calibrationError,
    stabilityScore: 70
  });
  const shrink = clamp(penalty / 100, 0.05, 0.75);

  return clampProb(0.5 + (raw - 0.5) * (1 - shrink));
}

export function scoreCalibrationQuality(input: {
  calibrationError: number | null;
  brierScore: number | null;
  sampleSize: number;
}): number {
  const n = Math.max(0, Math.floor(input.sampleSize));
  const sampleFactor = n >= 250 ? 1 : n >= 120 ? 0.9 : n >= 60 ? 0.8 : n >= 30 ? 0.68 : 0.55;

  const calErrorScore =
    typeof input.calibrationError === "number" && Number.isFinite(input.calibrationError)
      ? clamp(100 - input.calibrationError * 160, 10, 100)
      : 55;

  // Brier score ranges 0..1 (lower better); in betting-ish use it’s usually < 0.25.
  const brierScore =
    typeof input.brierScore === "number" && Number.isFinite(input.brierScore)
      ? clamp(100 - input.brierScore * 260, 10, 100)
      : 55;

  const score = (calErrorScore * 0.6 + brierScore * 0.4) * sampleFactor;
  return Math.round(clamp(score, 0, 100));
}

