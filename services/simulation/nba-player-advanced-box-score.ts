import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
import { buildNbaPlayerRoleDepth } from "@/services/simulation/nba-player-role-depth";

export type NbaAdvancedPlayerBoxScore = {
  playerName: string;
  teamName: string;
  teamSide: "home" | "away";
  projectedMinutes: number;
  projectedSteals: number;
  projectedBlocks: number;
  projectedTurnovers: number;
  projectedFga: number;
  projectedThreePointAttempts: number;
  projectedFta: number;
  projectedUsagePct: number;
  projectedAssistPct: number;
  projectedReboundPct: number;
  projectedTurnoverPct: number;
  stocks: number;
  possessionEvents: number;
  defensiveEventRate: number;
  foulPressureRate: number;
  confidence: number;
  warnings: string[];
  drivers: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function statusAvailability(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("out")) return 0;
  if (normalized.includes("doubtful")) return 0.18;
  if (normalized.includes("questionable")) return 0.54;
  if (normalized.includes("unknown")) return 0.74;
  return 1;
}

function per36(value: number, minutes: number) {
  return minutes > 0 ? value / minutes * 36 : 0;
}

export function buildNbaAdvancedPlayerBoxScore(player: NbaPlayerStatProjection): NbaAdvancedPlayerBoxScore {
  const role = buildNbaPlayerRoleDepth(player);
  const availability = statusAvailability(player.status);
  const minutes = clamp(player.projectedMinutes, 0, 44);
  const pts36 = per36(player.projectedPoints, minutes);
  const reb36 = per36(player.projectedRebounds, minutes);
  const ast36 = per36(player.projectedAssists, minutes);
  const threes36 = per36(player.projectedThrees, minutes);
  const usagePct = clamp(8 + role.possessionLoadScore * 26 + role.starScore * 5 + role.creationScore * 3, 4, 39) * availability;
  const assistPct = clamp(4 + role.creationScore * 34 + ast36 * 1.4, 0, 48) * availability;
  const reboundPct = clamp(3 + role.reboundingScore * 24 + reb36 * 0.75, 0, 32) * availability;
  const turnoverPct = clamp(6 + role.possessionLoadScore * 8 + role.creationScore * 4 - role.roleConfidence * 2.5, 4, 19);

  const twoPointPressure = clamp((pts36 - threes36 * 3) / 24 + role.starScore * 0.16 + role.possessionLoadScore * 0.12, 0, 1.25);
  const projectedThreePointAttempts = clamp(player.projectedThrees * 2.65 + role.spacingScore * minutes * 0.065, 0, 14) * availability;
  const projectedFta = clamp(minutes * (0.025 + twoPointPressure * 0.115 + role.starScore * 0.035), 0, 16) * availability;
  const projectedFga = clamp(
    player.projectedPoints / 2.12 +
    projectedThreePointAttempts * 0.42 +
    projectedFta * -0.18 +
    role.possessionLoadScore * minutes * 0.08,
    0,
    32
  ) * availability;

  const projectedTurnovers = clamp(minutes / 36 * (0.55 + role.possessionLoadScore * 2.2 + role.creationScore * 1.05), 0, 7.2) * availability;
  const projectedSteals = clamp(minutes / 36 * (0.42 + role.rolePlayerScore * 1.05 + role.creationScore * 0.22 + role.closingLineupScore * 0.28), 0, 3.4) * availability;
  const projectedBlocks = clamp(minutes / 36 * (0.24 + role.reboundingScore * 1.18 + role.rolePlayerScore * 0.2 + role.closingLineupScore * 0.16), 0, 4.2) * availability;
  const stocks = projectedSteals + projectedBlocks;
  const possessionEvents = projectedFga + projectedFta * 0.44 + projectedAssistsToPossessions(player.projectedAssists) + projectedTurnovers;
  const defensiveEventRate = clamp((projectedSteals + projectedBlocks * 0.82) / Math.max(1, minutes) * 36, 0, 5.5);
  const foulPressureRate = clamp(projectedFta / Math.max(1, projectedFga + projectedFta), 0, 0.64);
  const confidence = clamp(player.confidence * role.roleConfidence * availability * (minutes >= 12 ? 1 : 0.72), 0.05, 0.96);
  const warnings: string[] = [];
  if (availability < 0.75) warnings.push(`${player.playerName} advanced box score discounted by availability`);
  if (confidence < 0.5) warnings.push(`${player.playerName} advanced box score confidence below 50%`);
  if (minutes < 12) warnings.push(`${player.playerName} low-minute advanced box score is volatile`);

  return {
    playerName: player.playerName,
    teamName: player.teamName,
    teamSide: player.teamSide,
    projectedMinutes: round(minutes, 1),
    projectedSteals: round(projectedSteals, 2),
    projectedBlocks: round(projectedBlocks, 2),
    projectedTurnovers: round(projectedTurnovers, 2),
    projectedFga: round(projectedFga, 2),
    projectedThreePointAttempts: round(projectedThreePointAttempts, 2),
    projectedFta: round(projectedFta, 2),
    projectedUsagePct: round(usagePct, 2),
    projectedAssistPct: round(assistPct, 2),
    projectedReboundPct: round(reboundPct, 2),
    projectedTurnoverPct: round(turnoverPct, 2),
    stocks: round(stocks, 2),
    possessionEvents: round(possessionEvents, 2),
    defensiveEventRate: round(defensiveEventRate, 2),
    foulPressureRate: round(foulPressureRate, 3),
    confidence: round(confidence, 3),
    warnings,
    drivers: [
      `usage ${usagePct.toFixed(1)}%`,
      `assist ${assistPct.toFixed(1)}%`,
      `rebound ${reboundPct.toFixed(1)}%`,
      `turnover ${turnoverPct.toFixed(1)}%`,
      `FGA ${projectedFga.toFixed(1)}`,
      `3PA ${projectedThreePointAttempts.toFixed(1)}`,
      `FTA ${projectedFta.toFixed(1)}`,
      `stocks ${stocks.toFixed(1)}`
    ]
  };
}

function projectedAssistsToPossessions(assists: number) {
  return assists * 0.62;
}

export function buildNbaAdvancedPlayerBoxScores(players: NbaPlayerStatProjection[]) {
  return players.map(buildNbaAdvancedPlayerBoxScore);
}
