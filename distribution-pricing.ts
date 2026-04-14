import { filterRowsByConditions } from "../discovery/helpers";
import { getRollingWindowScore } from "./rolling-windows";
import { getOutOfSampleScore } from "./out-of-sample";
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
  const rolling = getRollingWindowScore(matchedRows);
  const oos = getOutOfSampleScore(sourceRows, system.conditions);
  const seasonStability = getSeasonStabilityScore(system);
  const clvPass = passesClvCheck(system, config.requirePositiveClv);

  const validationScore = system.score + (rolling * 20) + (oos * 10) + (seasonStability * 10) + (clvPass ? 5 : -10);
  const warnings = [...system.warnings];
  if (!clvPass) {
    warnings.push("CLV and close-beat profile are weak.");
  }
  if (rolling < 0.4) {
    warnings.push("Rolling windows are unstable.");
  }

  return {
    ...system,
    validationScore,
    score: validationScore,
    tier: assignTrendTier(system),
    warnings
  } satisfies CandidateTrendSystem;
}
