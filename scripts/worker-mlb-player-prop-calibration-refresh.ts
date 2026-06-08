import { refreshMlbPlayerPropCalibrationSnapshots } from "@/services/simulation/mlb-player-prop-calibration-persistence";

function numberArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  return Number.isFinite(value) ? value : fallback;
}

async function main() {
  const lookbackDays = numberArg("lookback-days", 365);
  const minBinSample = numberArg("min-bin-sample", 25);
  const report = await refreshMlbPlayerPropCalibrationSnapshots({
    lookbackDays,
    minBinSample,
    persist: true
  });
  console.log(JSON.stringify({
    ok: true,
    worker: "mlb-player-prop-calibration-refresh",
    lookbackDays,
    minBinSample,
    rowCount: report.rowCount,
    snapshotCount: report.snapshotCount,
    persistedSnapshotCount: report.persistedSnapshotCount,
    calibrationSampleSize: report.calibration.sampleSize,
    brierScore: report.calibration.brierScore,
    logLoss: report.calibration.logLoss,
    warnings: report.warnings
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    worker: "mlb-player-prop-calibration-refresh",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exitCode = 1;
});
