import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { DEFAULT_TUNING, SimTuningParams } from "./sim-tuning";

const GLOBAL_SCOPE = "global";
const MIN_SETTLED_FOR_TUNE = 30;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function parseParams(raw: unknown): SimTuningParams {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_TUNING;
  const p = raw as Partial<SimTuningParams>;
  return {
    calibrationScale: typeof p.calibrationScale === "number" ? p.calibrationScale : DEFAULT_TUNING.calibrationScale,
    varianceScale: typeof p.varianceScale === "number" ? p.varianceScale : DEFAULT_TUNING.varianceScale,
    matchupWeight: typeof p.matchupWeight === "number" ? p.matchupWeight : DEFAULT_TUNING.matchupWeight,
    paceWeight: typeof p.paceWeight === "number" ? p.paceWeight : DEFAULT_TUNING.paceWeight
  };
}

async function computeBrierScore(): Promise<{ brier: number; sampleSize: number } | null> {
  const settled = await prisma.simPrediction.findMany({
    where: { result: { in: ["WIN", "LOSS"] } },
    select: { result: true, simOverPct: true },
    orderBy: { createdAt: "desc" },
    take: 500
  });

  if (settled.length < MIN_SETTLED_FOR_TUNE) return null;

  const brier = settled.reduce((sum, r) => {
    const predicted = clamp(r.simOverPct, 0.01, 0.99);
    const actual = r.result === "WIN" ? 1 : 0;
    return sum + (predicted - actual) ** 2;
  }, 0) / settled.length;

  return { brier, sampleSize: settled.length };
}

export async function autoTuneModel(): Promise<SimTuningParams> {
  const stored = await prisma.simTuning.findFirst({ where: { scope: GLOBAL_SCOPE } });
  const base = parseParams(stored?.params);

  const calibration = await computeBrierScore();
  if (!calibration) return base;

  const { brier, sampleSize } = calibration;

  // Nudge calibrationScale down if Brier is high (overconfident), up if low
  const targetBrier = 0.23;
  const brierDelta = brier - targetBrier;
  const newCalibrationScale = clamp(base.calibrationScale - brierDelta * 0.5, 0.6, 1.4);

  // Widen variance when overconfident
  const newVarianceScale = brier > 0.28
    ? clamp(base.varianceScale + 0.04, 0.8, 1.5)
    : brier < 0.20
      ? clamp(base.varianceScale - 0.02, 0.8, 1.5)
      : base.varianceScale;

  const tuned: SimTuningParams = {
    calibrationScale: Number(newCalibrationScale.toFixed(3)),
    varianceScale: Number(newVarianceScale.toFixed(3)),
    matchupWeight: base.matchupWeight,
    paceWeight: base.paceWeight
  };

  await prisma.simTuning.upsert({
    where: { scope: GLOBAL_SCOPE },
    update: { params: toJson(tuned), brierScore: brier, sampleSize },
    create: { scope: GLOBAL_SCOPE, params: toJson(tuned), brierScore: brier, sampleSize }
  });

  return tuned;
}

export async function saveTuning(params: SimTuningParams): Promise<void> {
  await prisma.simTuning.upsert({
    where: { scope: GLOBAL_SCOPE },
    update: { params: toJson(params) },
    create: { scope: GLOBAL_SCOPE, params: toJson(params) }
  });
}
