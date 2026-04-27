import { DEFAULT_TUNING, SimTuningParams } from "./sim-tuning";

export async function autoTuneModel(): Promise<SimTuningParams> {
  // Auto-tuning disabled - database schema not yet set up
  return DEFAULT_TUNING;
}

export async function saveTuning(params: SimTuningParams): Promise<void> {
  // Saving tuning disabled - database schema not yet set up
}
