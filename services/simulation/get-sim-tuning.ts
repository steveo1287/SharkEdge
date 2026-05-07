import { prisma } from "@/lib/db/prisma";
import { DEFAULT_TUNING, getLeagueTuning, SimTuningParams } from "./sim-tuning";

function parseParams(raw: unknown): SimTuningParams | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Partial<SimTuningParams>;
  if (typeof p.calibrationScale !== "number") return null;
  return {
    calibrationScale: p.calibrationScale,
    varianceScale: typeof p.varianceScale === "number" ? p.varianceScale : DEFAULT_TUNING.varianceScale,
    matchupWeight: typeof p.matchupWeight === "number" ? p.matchupWeight : DEFAULT_TUNING.matchupWeight,
    paceWeight: typeof p.paceWeight === "number" ? p.paceWeight : DEFAULT_TUNING.paceWeight
  };
}

export async function getSimTuning(leagueKey?: string | null): Promise<SimTuningParams> {
  const leagueOverride = getLeagueTuning(leagueKey);

  // If the league has an explicit override (e.g. MLB varianceScale), use it directly
  if (leagueKey && leagueOverride !== DEFAULT_TUNING) return leagueOverride;

  // Otherwise load global auto-tuned params from DB, falling back to defaults
  const stored = await prisma.simTuning
    .findFirst({ where: { scope: "global" } })
    .catch(() => null);

  return parseParams(stored?.params) ?? DEFAULT_TUNING;
}
