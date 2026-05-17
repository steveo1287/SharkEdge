import { persistUfcStyleCalibrationSnapshot } from "@/services/ufc/style-calibration-store";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function main() {
  const modelVersion = argValue("modelVersion") ?? "ufc-fight-iq-v1";
  const label = argValue("label") ?? "style-calibration";
  const result = await persistUfcStyleCalibrationSnapshot(modelVersion, label);
  console.log(JSON.stringify({ ok: true, id: result.id, modelVersion, label, report: result.report }, null, 2));
}

main().catch((error) => {
  console.error("[worker-ufc-style-calibration]", error instanceof Error ? error.message : error);
  process.exit(1);
});
