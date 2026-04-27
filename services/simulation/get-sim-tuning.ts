import { prisma } from "@/lib/prisma";
import type { SimTuningParams } from "./sim-auto-tuner";

const DEFAULT_TUNING: SimTuningParams = {
  calibrationScale: 1.0,
  varianceScale: 1.0,
  matchupWeight: 1.0,
  paceWeight: 1.0
};

let tuningCache: { data: Record<string, SimTuningParams>; timestamp: number } = {
  data: { global: DEFAULT_TUNING },
  timestamp: 0
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getSimTuning(scope: string = "global"): Promise<SimTuningParams> {
  try {
    const now = Date.now();

    // Return cached if valid
    if (now - tuningCache.timestamp < CACHE_DURATION && tuningCache.data[scope]) {
      return tuningCache.data[scope];
    }

    // Fetch from DB
    const tuning = await prisma.simTuning.findUnique({
      where: { scope }
    });

    const params = tuning ? (tuning.params as SimTuningParams) : DEFAULT_TUNING;

    // Update cache
    tuningCache.data[scope] = params;
    tuningCache.timestamp = now;

    return params;
  } catch (error) {
    console.error(`Failed to fetch tuning for ${scope}:`, error);
    return DEFAULT_TUNING;
  }
}

export async function getAllSimTunings(): Promise<Record<string, SimTuningParams>> {
  try {
    const tunings = await prisma.simTuning.findMany();
    const result: Record<string, SimTuningParams> = { global: DEFAULT_TUNING };

    for (const tuning of tunings) {
      result[tuning.scope] = tuning.params as SimTuningParams;
    }

    return result;
  } catch (error) {
    console.error("Failed to fetch all tunings:", error);
    return { global: DEFAULT_TUNING };
  }
}

export function invalidateCache() {
  tuningCache.timestamp = 0;
}
