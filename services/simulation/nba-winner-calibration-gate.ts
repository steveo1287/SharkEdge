import { getNbaWinnerAdvancedCalibrationGate } from "@/services/simulation/nba-winner-calibration-metrics";

export async function getNbaWinnerRuntimeCalibrationGate(args: {
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  limit?: number;
}) {
  const gate = await getNbaWinnerAdvancedCalibrationGate(args);
  const provenGreenBucket = gate.bucket?.status === "GREEN" && gate.bucket.sampleSize >= 100 && gate.blockers.length === 0;
  return {
    ...gate,
    shouldPass: gate.shouldPass || gate.blockers.length > 0,
    shouldBlockStrongBet: !provenGreenBucket
  };
}
