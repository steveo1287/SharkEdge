import { prisma } from "@/lib/db/prisma";
import { DEFAULT_TUNING, SimTuningParams } from "./sim-tuning";

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function brier(logs: any) {
  return avg(
    logs.map((l: any) => {
      const p = l.side === "over" ? l.simOverPct : l.simUnderPct;
      const actual = l.result === "WIN" ? 1 : 0;
      return (p - actual) ** 2;
    })
  );
}

function evaluate(params: SimTuningParams, logs: any) {
  return brier(logs);
}

export async function autoTuneModel() {
  const logs = await prisma.simPrediction.findMany({
    where: { result: { in: ["WIN", "LOSS"] } }
  });

  if (logs.length < 200) {
    console.log("Insufficient data for tuning: need 200+ settled predictions");
    return DEFAULT_TUNING;
  }

  let params: SimTuningParams = { ...DEFAULT_TUNING };
  const step = 0.02;

  function tryAdjust(key: keyof SimTuningParams) {
    const base = evaluate(params, logs);
    const up = { ...params, [key]: params[key] + step };
    const down = { ...params, [key]: params[key] - step };
    const upScore = evaluate(up, logs);
    const downScore = evaluate(down, logs);
    if (upScore < base) return up;
    if (downScore < base) return down;
    return params;
  }

  const keys: (keyof SimTuningParams)[] = [
    "calibrationScale",
    "varianceScale",
    "matchupWeight",
    "paceWeight"
  ];

  for (let i = 0; i < 25; i++) {
    for (const key of keys) {
      params = tryAdjust(key);
    }
  }

  return params;
}

export async function saveTuning(params: SimTuningParams) {
  await prisma.simTuning.upsert({
    where: { scope: "global" },
    update: { params },
    create: { scope: "global", params }
  });
}
