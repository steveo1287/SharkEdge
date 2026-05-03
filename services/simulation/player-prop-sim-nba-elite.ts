import * as legacy from "./player-prop-sim";
import { projectNbaPlayerStat, type NbaPlayerStatProjection } from "./nba-player-stat-projection";
import { getNbaLineupTruth } from "./nba-lineup-truth";
import type { PlayerPropSimulationInput, PlayerPropSimulationSummary } from "./player-prop-sim";
import type { NbaStatKey } from "./nba-player-stat-profile";

export type { PlayerPropSimulationInput, PlayerPropSimulationSummary } from "./player-prop-sim";

function normalizeNbaStatKey(statKey: string): NbaStatKey | null {
  switch (statKey) {
    case "player_points":
    case "points":
      return "points";
    case "player_rebounds":
    case "rebounds":
      return "rebounds";
    case "player_assists":
    case "assists":
      return "assists";
    case "player_threes":
    case "threes":
    case "3pm":
      return "threes";
    case "player_steals":
    case "steals":
      return "steals";
    case "player_blocks":
    case "blocks":
      return "blocks";
    case "player_turnovers":
    case "turnovers":
      return "turnovers";
    case "player_pra":
    case "pra":
      return "pra";
    default:
      return null;
  }
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function projectionToLegacySummary(projection: NbaPlayerStatProjection, legacySummary: PlayerPropSimulationSummary): PlayerPropSimulationSummary {
  const hitProbOver = { ...legacySummary.hitProbOver };
  const hitProbUnder = { ...legacySummary.hitProbUnder };
  if (typeof projection.marketLine === "number" && projection.overProbability !== null && projection.underProbability !== null) {
    const key = String(projection.marketLine);
    hitProbOver[key] = projection.overProbability;
    hitProbUnder[key] = projection.underProbability;
  }

  return {
    ...legacySummary,
    meanValue: projection.mean,
    medianValue: projection.median,
    stdDev: projection.stdDev,
    p10: projection.p10,
    p50: projection.median,
    p90: projection.p90,
    hitProbOver,
    hitProbUnder,
    contextualEdgeScore: projection.noBet ? Math.min(legacySummary.contextualEdgeScore, 1) : Math.max(legacySummary.contextualEdgeScore, round(projection.confidence * 10, 2)),
    drivers: [
      "NBA elite player-stat projection active.",
      ...projection.drivers,
      ...projection.blockers.map((blocker) => `Prop blocker: ${blocker}.`),
      ...projection.warnings.map((warning) => `Prop warning: ${warning}.`),
      ...legacySummary.drivers.slice(0, 4)
    ],
    priorWeight: Math.max(legacySummary.priorWeight, projection.noBet ? 0.7 : 0.25),
    sourceSummary: projection.noBet
      ? `Elite NBA prop model blocked action: ${projection.blockers.join("; ") || "insufficient safety context"}.`
      : `Elite NBA prop model: ${round(projection.minutes.projectedMinutes, 1)} minutes, ${projection.statKey} mean ${projection.mean}, confidence ${round(projection.confidence * 100, 1)}%.`,
    projectedMinutes: projection.minutes.projectedMinutes,
    perMinuteRate: projection.profile.statRatesPerMinute[projection.statKey] ?? legacySummary.perMinuteRate ?? null,
    sampleSize: projection.profile.sampleSize,
    minutesSampleSize: projection.profile.sampleSize,
    usageRateProxy: projection.profile.tendencies.usageRate,
    trueShootingPct: projection.profile.attributes.rimFinishingSkill,
    opportunityRate: projection.profile.tendencies.shotAttemptRate,
    roleConfidence: projection.minutes.confidence
  };
}

function playerStatusFromDrivers(input: PlayerPropSimulationInput): "ACTIVE" | "PROBABLE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | "UNKNOWN" | null {
  const text = [input.playerName, input.playerIntangibles, input.interactionContext]
    .map((value) => typeof value === "string" ? value : JSON.stringify(value ?? {}))
    .join(" ")
    .toLowerCase();
  if (text.includes("out") || text.includes("inactive")) return "OUT";
  if (text.includes("doubtful")) return "DOUBTFUL";
  if (text.includes("questionable")) return "QUESTIONABLE";
  if (text.includes("probable")) return "PROBABLE";
  return "ACTIVE";
}

export async function simulateNbaElitePlayerPropProjection(input: PlayerPropSimulationInput): Promise<PlayerPropSimulationSummary> {
  const legacySummary = legacy.simulatePlayerPropProjection(input);
  const statKey = normalizeNbaStatKey(input.statKey);
  if (input.leagueKey !== "NBA" || !statKey) return legacySummary;

  const teamName = input.teamStyle?.teamName ?? null;
  const opponentName = input.opponentStyle?.teamName ?? null;
  const lineupTruth = teamName && opponentName
    ? await getNbaLineupTruth({ awayTeam: teamName, homeTeam: opponentName }).catch(() => null)
    : null;

  const projection = projectNbaPlayerStat({
    playerId: input.playerId,
    playerName: input.playerName,
    team: teamName,
    position: input.position,
    statKey,
    recentStats: input.recentStats as Record<string, unknown>[],
    lineupTruth,
    marketLine: input.marketLine,
    marketOddsOver: input.marketOddsOver,
    marketOddsUnder: input.marketOddsUnder,
    playerStatus: playerStatusFromDrivers(input),
    teammateOutUsageImpact: lineupTruth?.highUsageOut ? 5 : 0,
    teammateQuestionableUsageImpact: lineupTruth?.starQuestionable ? 4 : 0
  });

  return projectionToLegacySummary(projection, legacySummary);
}

export function simulatePlayerPropProjection(input: PlayerPropSimulationInput): PlayerPropSimulationSummary {
  return legacy.simulatePlayerPropProjection(input);
}

export const __playerPropSimTestHooks = legacy.__playerPropSimTestHooks;
