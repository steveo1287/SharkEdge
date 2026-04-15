import type { CandidateTrendSystem } from "../types";

function overlapRatio(a: CandidateTrendSystem, b: CandidateTrendSystem) {
  const aIds = new Set(a.triggerEventIds ?? []);
  const bIds = new Set(b.triggerEventIds ?? []);
  if (!aIds.size || !bIds.size) {
    return 0;
  }

  let shared = 0;
  for (const id of aIds) {
    if (bIds.has(id)) {
      shared += 1;
    }
  }

  return shared / Math.min(aIds.size, bIds.size);
}

export function pruneCorrelatedSystems(systems: CandidateTrendSystem[], maxOverlap: number) {
  const kept: CandidateTrendSystem[] = [];

  for (const system of systems.sort((left, right) => right.score - left.score)) {
    if (kept.some((other) => overlapRatio(system, other) >= maxOverlap)) {
      continue;
    }
    kept.push(system);
  }

  return kept;
}
