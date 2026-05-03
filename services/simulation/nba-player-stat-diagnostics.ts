import type { NbaPlayerComboStatProjection, NbaPlayerFullStatProjection } from "./nba-player-full-stat-projection";
import type { NbaPlayerStatProjection } from "./nba-player-stat-projection";
import type { NbaStatKey } from "./nba-player-stat-profile";

export type NbaStatCompletenessDiagnostics = {
  blockers: string[];
  warnings: string[];
  degraded: boolean;
};

type FullStatLike = {
  projectedMinutes: number;
  stats: Partial<Record<NbaStatKey, Pick<NbaPlayerStatProjection, "mean" | "warnings" | "blockers">>>;
  combos?: Partial<Record<string, Pick<NbaPlayerComboStatProjection, "mean" | "warnings" | "blockers">>>;
};

function mean(projection: Pick<NbaPlayerStatProjection, "mean"> | undefined) {
  return typeof projection?.mean === "number" && Number.isFinite(projection.mean) ? projection.mean : 0;
}

export function diagnoseNbaStatCompleteness(full: FullStatLike): NbaStatCompletenessDiagnostics {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const minutes = full.projectedMinutes;
  const points = mean(full.stats.points);
  const rebounds = mean(full.stats.rebounds);
  const assists = mean(full.stats.assists);
  const threes = mean(full.stats.threes);
  const steals = mean(full.stats.steals);
  const blocks = mean(full.stats.blocks);
  const turnovers = mean(full.stats.turnovers);
  const pra = mean(full.stats.pra);

  if (minutes >= 24 && rebounds <= 0.5) warnings.push("rebound projection suspiciously low");
  if (minutes >= 24 && assists <= 0.5) warnings.push("assist projection suspiciously low");
  if (minutes >= 20 && points >= 8 && threes <= 0 && steals <= 0 && blocks <= 0 && rebounds <= 0.5 && assists <= 0.5) {
    blockers.push("stat family collapse suspected");
  }
  if (minutes >= 20 && points >= 8 && rebounds <= 0.5 && assists <= 0.5 && threes <= 0.2 && steals <= 0.1 && blocks <= 0.1) {
    blockers.push("non-point stat projection collapse suspected");
  }
  if (minutes >= 24 && turnovers <= 0.1) warnings.push("turnover projection suspiciously low");
  if (pra > 0 && pra < points + rebounds + assists - 0.5) warnings.push("PRA projection below component sum");
  if (pra === points && minutes >= 20 && rebounds + assists > 1) warnings.push("PRA projection appears points-only");

  return {
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    degraded: blockers.length > 0 || warnings.length > 0
  };
}
