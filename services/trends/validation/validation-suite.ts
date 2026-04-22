import { filterRowsByConditions } from "../discovery/helpers";
import { computeWilsonInterval } from "../statistical-guardrails";
import { getRollingWindowDiagnostics } from "./rolling-windows";
import { getOutOfSampleDiagnostics } from "./out-of-sample";
import { getSeasonStabilityScore } from "./season-stability";
import { passesClvCheck } from "./clv-check";
import { assignTrendTier } from "./tier-assignment";
import type { CandidateTrendSystem, HistoricalBetOpportunity, TrendDiscoveryConfig } from "../types";

export function validateTrendSystem(
  system: CandidateTrendSystem,
  sourceRows: HistoricalBetOpportunity[],
  config: TrendDiscoveryConfig
) {
  const matchedRows = filterRowsByConditions(sourceRows, system.conditions);
  const rolling = getRollingWindowDiagnostics(matchedRows);
  const oos = getOutOfSampleDiagnostics(sourceRows, system.conditions);
  const seasonStability = getSeasonStabilityScore(system);
  const clvPass = passesClvCheck(system, config.requirePositiveClv);
  const interval = computeWilsonInterval({ wins: system.wins, losses: system.losses });
  const lowerBoundBonus = typeof interval.lower === "number" ? Math.max(interval.lower - 0.5, 0) * 90 : 0;
  const intervalPenalty = typeof interval.lower === "number" && interval.lower < 0.5 ? 10 : 0;

  const validationScore =
    system.score +
    lowerBoundBonus +
    rolling.score * 26 +
    oos.score * 20 +
    seasonStability * 10 +
    (clvPass ? 5 : -10) -
    intervalPenalty -
    oos.penalty * 0.12;

  const warnings = [...system.warnings];
  if (!clvPass) {
    warnings.push("CLV and close-beat profile are weak.");
  }
  if (rolling.warning) {
    warnings.push(rolling.warning);
  }
  if (oos.warning) {
    warnings.push(oos.warning);
  }
  if (typeof interval.lower === "number" && interval.lower < 0.5) {
    warnings.push("Confidence lower bound does not clear break-even.");
  }

  return {
    ...system,
    validationScore,
    score: validationScore,
    tier: assignTrendTier(system),
    warnings: Array.from(new Set(warnings))
  } satisfies CandidateTrendSystem;
}
