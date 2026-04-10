import type { CandidateTrendSystem } from "../types";

export function passesClvCheck(system: CandidateTrendSystem, requirePositiveClv: boolean) {
  if (!requirePositiveClv) {
    return true;
  }

  return (system.avgClv ?? 0) >= 0 || (system.beatCloseRate ?? 0) >= 0.52;
}
