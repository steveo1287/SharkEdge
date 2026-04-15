import type { TrendCondition } from "../types";

export function expandConditionCombos(seed: TrendCondition[][], atoms: TrendCondition[], maxConditions: number) {
  const next: TrendCondition[][] = [];

  for (const existing of seed) {
    if (existing.length >= maxConditions) {
      continue;
    }

    const usedGroups = new Set(existing.map((condition) => condition.group));
    for (const atom of atoms) {
      if (usedGroups.has(atom.group)) {
        continue;
      }

      if (existing.some((condition) => condition.field === atom.field && condition.label === atom.label)) {
        continue;
      }

      next.push([...existing, atom]);
    }
  }

  return next;
}
