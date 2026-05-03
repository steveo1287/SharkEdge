import { runUfcOperationalSkillSim } from "@/services/ufc/operational-sim";
import { persistUfcCalibrationSnapshot } from "@/services/ufc/calibration";
import { persistUfcEnsembleCalibrationReport } from "@/services/ufc/ensemble-calibration";
import { resolveUfcShadowPrediction } from "@/services/ufc/shadow-mode";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string) {
  const value = argValue(name);
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric arg --${name}=${value}`);
  return parsed;
}

async function main() {
  const mode = argValue("mode") ?? "simulate";
  const modelVersion = argValue("modelVersion") ?? "ufc-fight-iq-v1";

  if (mode === "simulate") {
    const fightId = argValue("fightId");
    if (!fightId) throw new Error("Missing --fightId for simulate mode");
    const result = await runUfcOperationalSkillSim(fightId, {
      modelVersion,
      simulations: numberArg("simulations") ?? undefined,
      seed: numberArg("seed") ?? undefined,
      recordShadow: hasFlag("shadow"),
      marketOddsAOpen: numberArg("marketOddsAOpen"),
      marketOddsBOpen: numberArg("marketOddsBOpen"),
      marketOddsAClose: numberArg("marketOddsAClose"),
      marketOddsBClose: numberArg("marketOddsBClose"),
      skillMarkovWeight: numberArg("skillMarkovWeight"),
      exchangeMonteCarloWeight: numberArg("exchangeMonteCarloWeight")
    });
    console.log(JSON.stringify({ ok: true, mode, result }, null, 2));
    return;
  }

  if (mode === "resolve-shadow") {
    const fightId = argValue("fightId");
    const actualWinnerFighterId = argValue("actualWinnerFighterId");
    if (!fightId || !actualWinnerFighterId) throw new Error("Missing --fightId or --actualWinnerFighterId for resolve-shadow mode");
    const result = await resolveUfcShadowPrediction({
      fightId,
      actualWinnerFighterId,
      marketOddsAClose: numberArg("marketOddsAClose"),
      marketOddsBClose: numberArg("marketOddsBClose")
    });
    console.log(JSON.stringify({ ok: true, mode, result }, null, 2));
    return;
  }

  if (mode === "calibrate") {
    const result = await persistUfcCalibrationSnapshot(modelVersion, argValue("label") ?? "shadow-mode");
    console.log(JSON.stringify({ ok: true, mode, result }, null, 2));
    return;
  }

  if (mode === "calibrate-ensemble") {
    const result = await persistUfcEnsembleCalibrationReport(modelVersion, argValue("label") ?? "ensemble-weight-learner");
    console.log(JSON.stringify({ ok: true, mode, result }, null, 2));
    return;
  }

  throw new Error(`Unknown UFC operational worker mode: ${mode}`);
}

main().catch((error) => {
  console.error("[worker-ufc-operational-sim]", error instanceof Error ? error.message : error);
  process.exit(1);
});
