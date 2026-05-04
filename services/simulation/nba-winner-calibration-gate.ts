import { getNbaWinnerAdvancedCalibrationGate } from "@/services/simulation/nba-winner-calibration-metrics";
import { hardenNbaWinnerBucket } from "@/services/simulation/nba-winner-calibration-hardening";

export async function getNbaWinnerRuntimeCalibrationGate(args: {
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  limit?: number;
}) {
  const gate = await getNbaWinnerAdvancedCalibrationGate(args);
  const hardening = hardenNbaWinnerBucket(gate.bucket);
  const blockers = [...new Set([...gate.blockers, ...hardening.blockers])];
  const warnings = [...new Set([...gate.warnings, ...hardening.warnings])];
  const provenGreenBucket = gate.bucket?.status === "GREEN"
    && gate.bucket.sampleSize >= 250
    && gate.blockers.length === 0
    && hardening.status === "PROVEN";

  return {
    ...gate,
    hardening,
    blockers,
    warnings,
    shouldPass: gate.shouldPass || hardening.shouldPass || blockers.length > 0,
    shouldBlockStrongBet: !provenGreenBucket,
    recommendedMaxModelDeltaPct: hardening.recommendedMaxModelDeltaPct,
    shrinkageFactor: hardening.shrinkageFactor,
    proofScore: hardening.proofScore
  };
}
