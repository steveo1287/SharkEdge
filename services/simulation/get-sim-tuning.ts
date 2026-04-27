import { DEFAULT_TUNING, SimTuningParams } from "./sim-tuning";

export async function getSimTuning(): Promise<SimTuningParams> {
  return DEFAULT_TUNING;
}
