import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
import { buildNbaAdvancedPlayerBoxScore } from "@/services/simulation/nba-player-advanced-box-score";
import { buildNbaPlayerRoleDepth, type NbaPlayerRoleDepth } from "@/services/simulation/nba-player-role-depth";

export type NbaPlayerOverallCategory =
  | "volume"
  | "efficiencyProxy"
  | "creation"
  | "rebounding"
  | "spacing"
  | "defensiveProxy"
  | "turnoverSecurity"
  | "foulPressure"
  | "advancedUsage"
  | "stocks"
  | "availability"
  | "closing"
  | "roleValue"
  | "overall";

export type NbaPlayerOverallWinnerScore = {
  playerName: string;
  teamName: string;
  teamSide: "home" | "away";
  projectedMinutes: number;
  status: string;
  roleTier: NbaPlayerRoleDepth["roleTier"];
  usageTier: NbaPlayerRoleDepth["usageTier"];
  archetype: NbaPlayerRoleDepth["archetype"];
  categoryScores: Record<NbaPlayerOverallCategory, number>;
  weightedOverall: number;
  closingWeightedOverall: number;
  starWeightedOverall: number;
  confidence: number;
  drivers: string[];
};

export type NbaTeamPlayerOverallWinnerScore = {
  teamName: string;
  teamSide: "home" | "away";
  playerCount: number;
  topFiveOverall: number;
  topEightOverall: number;
  starCoreOverall: number;
  creatorOverall: number;
  spacingOverall: number;
  reboundingOverall: number;
  defensiveProxyOverall: number;
  availabilityOverall: number;
  closingOverall: number;
  depthOverall: number;
  compositeOverall: number;
  confidence: number;
  players: NbaPlayerOverallWinnerScore[];
  warnings: string[];
  drivers: string[];
};

export type NbaPlayerOverallWinnerEdge = {
  modelVersion: "nba-player-overall-winner-edge-v2";
  home: NbaTeamPlayerOverallWinnerScore;
  away: NbaTeamPlayerOverallWinnerScore;
  homeCompositeEdge: number;
  homeStarCoreEdge: number;
  homeCreatorEdge: number;
  homeClosingEdge: number;
  homeAvailabilityEdge: number;
  marginDelta: number;
  probabilityDelta: number;
  confidence: number;
  warnings: string[];
  drivers: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function statusAvailability(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("out")) return 0;
  if (normalized.includes("doubtful")) return 0.18;
  if (normalized.includes("questionable")) return 0.52;
  if (normalized.includes("unknown")) return 0.72;
  return 1;
}

function per36(value: number, minutes: number) {
  return minutes > 0 ? value / minutes * 36 : 0;
}

function roleTierMultiplier(roleDepth: NbaPlayerRoleDepth) {
  switch (roleDepth.roleTier) {
    case "SUPERSTAR": return 1.34;
    case "STAR": return 1.24;
    case "PRIMARY_CREATOR": return 1.18;
    case "STARTER": return 1.09;
    case "SIXTH_MAN": return 1.03;
    case "ROTATION": return 0.94;
    case "LOW_MIN_BENCH": return 0.72;
    case "FRINGE": return 0.48;
    case "OUT": return 0.12;
  }
}

function scorePlayer(player: NbaPlayerStatProjection): NbaPlayerOverallWinnerScore {
  const roleDepth = buildNbaPlayerRoleDepth(player);
  const advanced = buildNbaAdvancedPlayerBoxScore(player);
  const minutes = clamp(player.projectedMinutes, 0, 42);
  const availability = statusAvailability(player.status);
  const minuteWeight = clamp(minutes / 34, 0, 1.16);
  const pts36 = per36(player.projectedPoints, minutes);
  const reb36 = per36(player.projectedRebounds, minutes);
  const ast36 = per36(player.projectedAssists, minutes);
  const threes36 = per36(player.projectedThrees, minutes);
  const pra36 = pts36 + reb36 + ast36;

  const volume = clamp((pra36 - 18) / 34, 0, 1);
  const advancedUsage = clamp((advanced.projectedUsagePct - 10) / 25, 0, 1);
  const shotVolume = clamp((advanced.projectedFga + advanced.projectedFta * 0.44 - 5) / 20, 0, 1);
  const foulPressure = clamp(advanced.foulPressureRate / 0.42, 0, 1);
  const stocks = clamp(advanced.stocks / 3.5, 0, 1);
  const efficiencyProxy = clamp(
    0.34 +
    threes36 * 0.05 +
    roleDepth.spacingScore * 0.16 +
    roleDepth.rolePlayerScore * 0.1 +
    foulPressure * 0.08 -
    Math.max(0, advanced.projectedTurnoverPct - 12) * 0.018 -
    Math.max(0, pts36 - 31) * 0.01,
    0,
    1
  );
  const creation = clamp(roleDepth.creationScore * 0.52 + ast36 / 17 * 0.28 + advanced.projectedAssistPct / 48 * 0.2, 0, 1);
  const rebounding = clamp(roleDepth.reboundingScore * 0.5 + reb36 / 16 * 0.28 + advanced.projectedReboundPct / 32 * 0.22, 0, 1);
  const spacing = clamp(roleDepth.spacingScore * 0.58 + threes36 / 5.5 * 0.22 + advanced.projectedThreePointAttempts / 11 * 0.2, 0, 1);
  const defensiveProxy = clamp(
    roleDepth.rolePlayerScore * 0.22 +
    rebounding * 0.18 +
    roleDepth.closingLineupScore * 0.16 +
    stocks * 0.25 +
    Math.min(1, advanced.defensiveEventRate / 4.5) * 0.12 +
    availability * 0.07,
    0,
    1
  );
  const turnoverSecurity = clamp(1 - (advanced.projectedTurnoverPct - 5) / 18, 0, 1);
  const availabilityScore = clamp(availability * roleDepth.availabilityScore, 0, 1);
  const closing = clamp(roleDepth.closingLineupScore * 0.62 + minuteWeight * 0.14 + roleDepth.starScore * 0.1 + turnoverSecurity * 0.08 + foulPressure * 0.06, 0, 1);
  const roleValue = clamp(roleDepth.starScore * 0.3 + roleDepth.rolePlayerScore * 0.2 + roleDepth.possessionLoadScore * 0.14 + roleDepth.roleConfidence * 0.18 + advancedUsage * 0.1 + turnoverSecurity * 0.08, 0, 1);

  const baseOverall = clamp(
    volume * 0.11 +
    efficiencyProxy * 0.1 +
    creation * 0.11 +
    rebounding * 0.075 +
    spacing * 0.075 +
    defensiveProxy * 0.095 +
    turnoverSecurity * 0.075 +
    foulPressure * 0.045 +
    advancedUsage * 0.065 +
    stocks * 0.045 +
    availabilityScore * 0.105 +
    closing * 0.105 +
    roleValue * 0.09,
    0,
    1
  );
  const weightedOverall = clamp(baseOverall * minuteWeight * roleTierMultiplier(roleDepth) * availability, 0, 1.45);
  const closingWeightedOverall = clamp(weightedOverall * (0.65 + closing * 0.65), 0, 1.75);
  const starWeightedOverall = clamp(weightedOverall * (0.66 + roleDepth.starScore * 0.78 + roleDepth.possessionLoadScore * 0.18 + advancedUsage * 0.18), 0, 2.1);
  const confidence = clamp(player.confidence * roleDepth.roleConfidence * advanced.confidence * availability * (minutes >= 14 ? 1.04 : 0.76), 0.05, 0.95);

  return {
    playerName: player.playerName,
    teamName: player.teamName,
    teamSide: player.teamSide,
    projectedMinutes: round(minutes, 1),
    status: player.status,
    roleTier: roleDepth.roleTier,
    usageTier: roleDepth.usageTier,
    archetype: roleDepth.archetype,
    categoryScores: {
      volume: round(volume, 4),
      efficiencyProxy: round(efficiencyProxy, 4),
      creation: round(creation, 4),
      rebounding: round(rebounding, 4),
      spacing: round(spacing, 4),
      defensiveProxy: round(defensiveProxy, 4),
      turnoverSecurity: round(turnoverSecurity, 4),
      foulPressure: round(foulPressure, 4),
      advancedUsage: round(advancedUsage, 4),
      stocks: round(stocks, 4),
      availability: round(availabilityScore, 4),
      closing: round(closing, 4),
      roleValue: round(roleValue, 4),
      overall: round(weightedOverall, 4)
    },
    weightedOverall: round(weightedOverall, 4),
    closingWeightedOverall: round(closingWeightedOverall, 4),
    starWeightedOverall: round(starWeightedOverall, 4),
    confidence: round(confidence, 4),
    drivers: [
      `${pts36.toFixed(1)} pts/36`,
      `${reb36.toFixed(1)} reb/36`,
      `${ast36.toFixed(1)} ast/36`,
      `${threes36.toFixed(1)} 3pm/36`,
      `usage ${advanced.projectedUsagePct.toFixed(1)}%`,
      `TOV ${advanced.projectedTurnoverPct.toFixed(1)}%`,
      `FGA ${advanced.projectedFga.toFixed(1)}`,
      `FTA ${advanced.projectedFta.toFixed(1)}`,
      `stocks ${advanced.stocks.toFixed(1)}`,
      `role ${roleDepth.roleTier}`,
      `usage tier ${roleDepth.usageTier}`,
      `overall ${(weightedOverall * 100).toFixed(1)}%`,
      `closing ${(closingWeightedOverall * 100).toFixed(1)}%`,
      `availability ${(availabilityScore * 100).toFixed(1)}%`
    ]
  };
}

function buildTeam(teamName: string, teamSide: "home" | "away", players: NbaPlayerOverallWinnerScore[]): NbaTeamPlayerOverallWinnerScore {
  const sorted = [...players].sort((left, right) => right.weightedOverall - left.weightedOverall);
  const closingSorted = [...players].sort((left, right) => right.closingWeightedOverall - left.closingWeightedOverall);
  const starSorted = [...players].sort((left, right) => right.starWeightedOverall - left.starWeightedOverall);
  const topFiveOverall = sum(sorted.slice(0, 5).map((player, index) => player.weightedOverall * [1.15, 1.08, 1.02, 0.96, 0.9][index]));
  const topEightOverall = sum(sorted.slice(0, 8).map((player, index) => player.weightedOverall * [1.1, 1.05, 1, 0.94, 0.88, 0.72, 0.58, 0.45][index]));
  const starCoreOverall = sum(starSorted.slice(0, 3).map((player, index) => player.starWeightedOverall * [1.18, 1, 0.82][index]));
  const creatorOverall = sum(players.map((player) => player.categoryScores.creation * player.weightedOverall));
  const spacingOverall = sum(players.map((player) => player.categoryScores.spacing * Math.min(1, player.projectedMinutes / 28)));
  const reboundingOverall = sum(players.map((player) => player.categoryScores.rebounding * Math.min(1, player.projectedMinutes / 28)));
  const defensiveProxyOverall = sum(players.map((player) => player.categoryScores.defensiveProxy * Math.min(1, player.projectedMinutes / 30)));
  const availabilityOverall = average(players.filter((player) => player.projectedMinutes >= 10).map((player) => player.categoryScores.availability));
  const closingOverall = sum(closingSorted.slice(0, 5).map((player, index) => player.closingWeightedOverall * [1.16, 1.06, 0.98, 0.9, 0.82][index]));
  const depthOverall = sum(sorted.slice(5, 10).map((player, index) => player.weightedOverall * [0.75, 0.64, 0.52, 0.4, 0.3][index]));
  const confidence = clamp(average(players.map((player) => player.confidence)) * (players.length >= 8 ? 1 : 0.82), 0.05, 0.95);
  const compositeOverall = clamp(
    topFiveOverall * 0.22 +
    topEightOverall * 0.12 +
    starCoreOverall * 0.18 +
    creatorOverall * 0.11 +
    spacingOverall * 0.08 +
    reboundingOverall * 0.07 +
    defensiveProxyOverall * 0.07 +
    availabilityOverall * 0.09 +
    closingOverall * 0.13 +
    depthOverall * 0.07,
    0,
    8
  );
  const warnings: string[] = [];
  if (players.length < 8) warnings.push(`${teamName} has fewer than 8 player-overall rows`);
  if (availabilityOverall < 0.78) warnings.push(`${teamName} player-overall availability below 78%`);
  if (confidence < 0.52) warnings.push(`${teamName} player-overall confidence below 52%`);

  return {
    teamName,
    teamSide,
    playerCount: players.length,
    topFiveOverall: round(topFiveOverall, 4),
    topEightOverall: round(topEightOverall, 4),
    starCoreOverall: round(starCoreOverall, 4),
    creatorOverall: round(creatorOverall, 4),
    spacingOverall: round(spacingOverall, 4),
    reboundingOverall: round(reboundingOverall, 4),
    defensiveProxyOverall: round(defensiveProxyOverall, 4),
    availabilityOverall: round(availabilityOverall, 4),
    closingOverall: round(closingOverall, 4),
    depthOverall: round(depthOverall, 4),
    compositeOverall: round(compositeOverall, 4),
    confidence: round(confidence, 4),
    players: sorted.slice(0, 12),
    warnings,
    drivers: [
      `top five overall ${topFiveOverall.toFixed(3)}`,
      `star core ${starCoreOverall.toFixed(3)}`,
      `creation ${creatorOverall.toFixed(3)}`,
      `spacing ${spacingOverall.toFixed(3)}`,
      `rebounding ${reboundingOverall.toFixed(3)}`,
      `closing ${closingOverall.toFixed(3)}`,
      `depth ${depthOverall.toFixed(3)}`,
      `availability ${(availabilityOverall * 100).toFixed(1)}%`
    ]
  };
}

function edge(homeValue: number, awayValue: number, divisor: number) {
  return clamp((homeValue - awayValue) / divisor, -1, 1);
}

export function buildNbaPlayerOverallWinnerEdge(args: {
  homeTeam: string;
  awayTeam: string;
  playerStatProjections: NbaPlayerStatProjection[];
}): NbaPlayerOverallWinnerEdge {
  const allPlayers = args.playerStatProjections.map(scorePlayer);
  const home = buildTeam(args.homeTeam, "home", allPlayers.filter((player) => player.teamSide === "home"));
  const away = buildTeam(args.awayTeam, "away", allPlayers.filter((player) => player.teamSide === "away"));
  const homeCompositeEdge = edge(home.compositeOverall, away.compositeOverall, 2.2);
  const homeStarCoreEdge = edge(home.starCoreOverall, away.starCoreOverall, 1.55);
  const homeCreatorEdge = edge(home.creatorOverall, away.creatorOverall, 1.4);
  const homeClosingEdge = edge(home.closingOverall, away.closingOverall, 1.55);
  const homeAvailabilityEdge = edge(home.availabilityOverall, away.availabilityOverall, 0.35);
  const confidence = clamp((home.confidence + away.confidence) / 2 * (allPlayers.length >= 14 ? 1 : 0.78), 0.05, 0.95);
  const rawMarginDelta =
    homeCompositeEdge * 1.15 +
    homeStarCoreEdge * 0.85 +
    homeCreatorEdge * 0.48 +
    homeClosingEdge * 0.72 +
    homeAvailabilityEdge * 0.55;
  const marginDelta = clamp(rawMarginDelta * confidence, -3.2, 3.2);
  const probabilityDelta = clamp(marginDelta * 0.0125, -0.026, 0.026);
  const warnings = [...home.warnings, ...away.warnings];

  return {
    modelVersion: "nba-player-overall-winner-edge-v2",
    home,
    away,
    homeCompositeEdge: round(homeCompositeEdge, 4),
    homeStarCoreEdge: round(homeStarCoreEdge, 4),
    homeCreatorEdge: round(homeCreatorEdge, 4),
    homeClosingEdge: round(homeClosingEdge, 4),
    homeAvailabilityEdge: round(homeAvailabilityEdge, 4),
    marginDelta: round(marginDelta, 4),
    probabilityDelta: round(probabilityDelta, 4),
    confidence: round(confidence, 4),
    warnings: [...new Set(warnings)],
    drivers: [
      `player overall home ${home.compositeOverall.toFixed(3)} vs away ${away.compositeOverall.toFixed(3)}`,
      `star core edge ${(homeStarCoreEdge * 100).toFixed(1)}%`,
      `creator edge ${(homeCreatorEdge * 100).toFixed(1)}%`,
      `closing edge ${(homeClosingEdge * 100).toFixed(1)}%`,
      `availability edge ${(homeAvailabilityEdge * 100).toFixed(1)}%`,
      `player overall margin delta ${marginDelta.toFixed(2)}`,
      `player overall probability delta ${(probabilityDelta * 100).toFixed(1)}%`,
      ...home.players.slice(0, 3).map((player) => `home top overall ${player.playerName} ${(player.weightedOverall * 100).toFixed(1)}% ${player.roleTier}`),
      ...away.players.slice(0, 3).map((player) => `away top overall ${player.playerName} ${(player.weightedOverall * 100).toFixed(1)}% ${player.roleTier}`)
    ]
  };
}
