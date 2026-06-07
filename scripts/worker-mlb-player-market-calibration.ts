import { fitAndPersistMlbPlayerMarketCalibrationProfile } from "@/services/simulation/mlb-player-prop-inning-calibration";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function main() {
  const limit = Number(argValue("limit") ?? 25000);
  const result = await fitAndPersistMlbPlayerMarketCalibrationProfile(limit);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
