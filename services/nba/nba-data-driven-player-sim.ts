import type { PropCardView } from "@/lib/types/domain";
import { buildAdaptivePlayerSimV2 } from "@/services/simulation/player-sim-v2-adaptive";
import { buildNbaMinutesUsageProjection } from "@/services/simulation/nba-minutes-usage-model";
import { applyNbaPlayerSimAccuracyLayer } from "@/services/simulation/nba-player-sim-accuracy-layer";
import type { SimTuningParams } from "@/services/simulation/sim-tuning";
import { getNbaPlayerProjectionContext } from "./nba-player-projection-context-service";

function estimateTeamTotalFromMarket(prop: PropCardView) {
  const total = prop.marketTruth?.consensusTotal ?? prop.evProfile?.marketTotal ?? null;
  const spread = prop.marketTruth?.consensusSpread ?? null;
  if (typeof total === "number" && typeof spread === "number") return Math.max(70, total / 2 - spread / 2);
  if (typeof total === "number") return Math.max(70, total / 2);
  return 112;
}

function toSimPropType(marketType: PropCardView["marketType"]) {
  switch (marketType) {
    case "player_points": return "Points";
    case "player_rebounds": return "Rebounds";
    case "player_assists": return "Assists";
    case "player_threes": return "Threes";
    default: return String(marketType).replace(/_/g, " ");
  }
}

export async function buildDataDrivenNbaPlayerSim(prop: PropCardView, tuning?: SimTuningParams, bankroll?: number) {
  const propType = toSimPropType(prop.marketType);
  const ctx = await getNbaPlayerProjectionContext({
    playerName: prop.player.name,
    team: prop.team?.abbreviation,
    opponent: prop.opponent?.abbreviation,
    propType
  });

  const minutesUsage = buildNbaMinutesUsageProjection({
    player: prop.player.name,
    position: prop.player.position,
    starter: null,
    seasonMinutes: ctx.seasonMinutes,
    last5Minutes: ctx.last5Minutes,
    last10Minutes: ctx.last10Minutes,
    seasonUsageRate: ctx.seasonUsageRate,
    last5UsageRate: ctx.last5UsageRate,
    last10UsageRate: ctx.last10UsageRate,
    injuryStatus: ctx.injuryStatus,
    teammateUsageVacatedPct: null,
    pace: ctx.teamPace && ctx.opponentPace ? (ctx.teamPace + ctx.opponentPace) / 2 : ctx.teamPace,
    gameTotal: prop.marketTruth?.consensusTotal ?? null,
    spreadAbs: typeof prop.marketTruth?.consensusSpread === "number" ? Math.abs(prop.marketTruth.consensusSpread) : null,
    rotationStability: ctx.source === "databallr" ? 0.78 : 0.52
  });

  const baseTeamTotal = estimateTeamTotalFromMarket(prop);
  const baseMean = propType === "Points"
    ? baseTeamTotal * minutesUsage.projectedUsageRate
    : propType === "Rebounds"
      ? minutesUsage.projectedMinutes * 0.28
      : propType === "Assists"
        ? minutesUsage.projectedMinutes * 0.22
        : baseTeamTotal * minutesUsage.projectedUsageRate;

  const nbaAccuracy = applyNbaPlayerSimAccuracyLayer({
    propType,
    line: prop.line,
    baseMean,
    minutes: ctx.seasonMinutes,
    projectedMinutes: minutesUsage.projectedMinutes,
    seasonAvg: ctx.seasonAvg,
    last5Avg: ctx.last5Avg,
    last10Avg: ctx.last10Avg,
    usageRate: minutesUsage.projectedUsageRate,
    trueShootingPct: null,
    teamPace: ctx.teamPace,
    opponentPace: ctx.opponentPace,
    opponentDefRating: ctx.opponentDefRating,
    opponentRankVsPosition: ctx.opponentRankVsPosition,
    injuryStatus: ctx.injuryStatus,
    teammateUsageVacatedPct: null,
    nba2kRating: ctx.nba2kRating,
    synergyPlayTypePpp: ctx.synergyPlayTypePpp,
    synergyFrequencyPct: ctx.synergyFrequencyPct
  });

  const adjustedUsage = propType === "Points"
    ? Math.max(0.01, nbaAccuracy.adjustedMean / Math.max(baseTeamTotal, 1))
    : minutesUsage.projectedUsageRate;

  const sim = buildAdaptivePlayerSimV2({
    player: prop.player.name,
    propType,
    line: prop.line,
    odds: prop.bestAvailableOddsAmerican ?? prop.oddsAmerican,
    teamTotal: baseTeamTotal,
    minutes: minutesUsage.projectedMinutes,
    usageRate: adjustedUsage,
    opponentRank: ctx.opponentRankVsPosition,
    pace: ctx.teamPace && ctx.opponentPace ? (ctx.teamPace + ctx.opponentPace) / 2 : ctx.teamPace,
    recentForm: ctx.seasonAvg && ctx.last5Avg ? Math.max(-1, Math.min(1, (ctx.last5Avg - ctx.seasonAvg) / Math.max(ctx.seasonAvg, 1))) : null,
    lineMovement: prop.lineMovement,
    trend: {
      recentAvg: ctx.last5Avg ?? prop.line,
      longAvg: ctx.seasonAvg ?? prop.line,
      recentMinutes: ctx.last5Minutes,
      longMinutes: ctx.seasonMinutes
    },
    market: {
      averageOdds: prop.averageOddsAmerican,
      bestAvailableOdds: prop.bestAvailableOddsAmerican,
      lineMovement: prop.lineMovement,
      bookCount: prop.sportsbookCount,
      marketDeltaAmerican: prop.marketDeltaAmerican,
      expectedValuePct: prop.expectedValuePct,
      side: prop.side
    },
    bankroll
  }, tuning);

  return {
    ...sim,
    reasons: [
      `Data source: ${ctx.source}`,
      ...minutesUsage.minutesReasons,
      ...minutesUsage.usageReasons,
      ...nbaAccuracy.reasons,
      ...sim.reasons
    ],
    riskFlags: [
      ...minutesUsage.riskFlags,
      ...nbaAccuracy.riskFlags,
      ...sim.riskFlags
    ],
    dataContext: {
      source: ctx.source,
      updatedAt: ctx.updatedAt,
      minutesUsage,
      nbaAccuracy
    }
  };
}
