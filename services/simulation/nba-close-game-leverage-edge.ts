import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
import { buildNbaPlayerRoleDepth } from "@/services/simulation/nba-player-role-depth";

export type NbaCloseGameTeamLeverage = {
  teamName: string;
  teamSide: "home" | "away";
  playerCount: number;
  closerCreation: number;
  closerShotMaking: number;
  closerSpacing: number;
  turnoverSecurity: number;
  freeThrowPressureProxy: number;
  defensiveSwitchabilityProxy: number;
  lateReboundSecurity: number;
  availabilityIndex: number;
  topCloserScore: number;
  topTwoCloserScore: number;
  topFiveClosingScore: number;
  closeGameComposite: number;
  confidence: number;
  warnings: string[];
  drivers: string[];
};

export type NbaCloseGameLeverageEdge = {
  modelVersion: "nba-close-game-leverage-edge-v1";
  home: NbaCloseGameTeamLeverage;
  away: NbaCloseGameTeamLeverage;
  spreadLeverage: number;
  homeCloseGameEdge: number;
  homeCloserCreationEdge: number;
  homeTopCloserEdge: number;
  homeTurnoverSecurityEdge: number;
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
  const text = status.toLowerCase();
  if (text.includes("out")) return 0;
  if (text.includes("doubtful")) return 0.18;
  if (text.includes("questionable")) return 0.54;
  if (text.includes("unknown")) return 0.72;
  return 1;
}

function per36(value: number, minutes: number) {
  return minutes > 0 ? value / minutes * 36 : 0;
}

function sidePlayers(players: NbaPlayerStatProjection[], side: "home" | "away") {
  return players.filter((player) => player.teamSide === side);
}

function buildTeam(teamName: string, teamSide: "home" | "away", players: NbaPlayerStatProjection[]): NbaCloseGameTeamLeverage {
  const rows = players.map((player) => {
    const roleDepth = buildNbaPlayerRoleDepth(player);
    const availability = statusAvailability(player.status);
    const minutesWeight = Math.min(1, player.projectedMinutes / 34) * availability;
    const pts36 = per36(player.projectedPoints, player.projectedMinutes);
    const ast36 = per36(player.projectedAssists, player.projectedMinutes);
    const reb36 = per36(player.projectedRebounds, player.projectedMinutes);
    const threes36 = per36(player.projectedThrees, player.projectedMinutes);
    const closerCreation = clamp(roleDepth.creationScore * 0.44 + roleDepth.starScore * 0.34 + Math.min(1, ast36 / 9) * 0.14 + Math.min(1, pts36 / 31) * 0.08, 0, 1.35);
    const closerShotMaking = clamp(roleDepth.starScore * 0.3 + roleDepth.spacingScore * 0.28 + Math.min(1, pts36 / 30) * 0.26 + Math.min(1, threes36 / 4.8) * 0.16, 0, 1.35);
    const turnoverSecurity = clamp(0.9 - roleDepth.possessionLoadScore * 0.22 + roleDepth.creationScore * 0.18 + roleDepth.roleConfidence * 0.12, 0.25, 1.2);
    const freeThrowPressureProxy = clamp(0.42 + roleDepth.starScore * 0.22 + Math.min(1, pts36 / 32) * 0.18 + roleDepth.possessionLoadScore * 0.12, 0, 1.2);
    const defensiveSwitchabilityProxy = clamp(roleDepth.rolePlayerScore * 0.28 + roleDepth.reboundingScore * 0.18 + roleDepth.closingLineupScore * 0.3 + Math.min(1, player.projectedMinutes / 32) * 0.14 + availability * 0.1, 0, 1.25);
    const lateReboundSecurity = clamp(roleDepth.reboundingScore * 0.56 + Math.min(1, reb36 / 12) * 0.32 + roleDepth.closingLineupScore * 0.12, 0, 1.25);
    const closingScore = clamp(
      closerCreation * 0.24 +
      closerShotMaking * 0.2 +
      roleDepth.spacingScore * 0.1 +
      turnoverSecurity * 0.12 +
      freeThrowPressureProxy * 0.1 +
      defensiveSwitchabilityProxy * 0.1 +
      lateReboundSecurity * 0.07 +
      roleDepth.closingLineupScore * 0.16,
      0,
      1.5
    ) * minutesWeight;
    return { player, roleDepth, availability, minutesWeight, closerCreation, closerShotMaking, turnoverSecurity, freeThrowPressureProxy, defensiveSwitchabilityProxy, lateReboundSecurity, closingScore };
  });
  const sortedClosers = [...rows].sort((left, right) => right.closingScore - left.closingScore);
  const activeMinuteTotal = sum(rows.map((row) => row.player.projectedMinutes * row.availability));
  const totalMinutes = sum(rows.map((row) => Math.max(0, row.player.projectedMinutes)));
  const availabilityIndex = totalMinutes > 0 ? clamp(activeMinuteTotal / totalMinutes, 0, 1) : 0;
  const topCloserScore = sortedClosers[0]?.closingScore ?? 0;
  const topTwoCloserScore = sum(sortedClosers.slice(0, 2).map((row, index) => row.closingScore * [1, 0.82][index]));
  const topFiveClosingScore = sum(sortedClosers.slice(0, 5).map((row, index) => row.closingScore * [1.08, 0.96, 0.84, 0.72, 0.6][index]));
  const closerCreation = sum(sortedClosers.slice(0, 5).map((row, index) => row.closerCreation * row.minutesWeight * [1, 0.88, 0.75, 0.62, 0.5][index]));
  const closerShotMaking = sum(sortedClosers.slice(0, 5).map((row, index) => row.closerShotMaking * row.minutesWeight * [1, 0.86, 0.72, 0.58, 0.46][index]));
  const closerSpacing = sum(sortedClosers.slice(0, 5).map((row, index) => row.roleDepth.spacingScore * row.minutesWeight * [1, 0.86, 0.72, 0.58, 0.46][index]));
  const turnoverSecurity = average(sortedClosers.slice(0, 6).map((row) => row.turnoverSecurity * row.availability));
  const freeThrowPressureProxy = sum(sortedClosers.slice(0, 4).map((row, index) => row.freeThrowPressureProxy * row.minutesWeight * [1, 0.82, 0.62, 0.44][index]));
  const defensiveSwitchabilityProxy = average(sortedClosers.slice(0, 7).map((row) => row.defensiveSwitchabilityProxy * row.availability));
  const lateReboundSecurity = average(sortedClosers.slice(0, 7).map((row) => row.lateReboundSecurity * row.availability));
  const closeGameComposite = clamp(
    topCloserScore * 0.22 +
    topTwoCloserScore * 0.16 +
    topFiveClosingScore * 0.16 +
    closerCreation * 0.13 +
    closerShotMaking * 0.11 +
    closerSpacing * 0.06 +
    turnoverSecurity * 0.08 +
    freeThrowPressureProxy * 0.06 +
    defensiveSwitchabilityProxy * 0.05 +
    lateReboundSecurity * 0.04 +
    availabilityIndex * 0.08,
    0,
    5
  );
  const confidence = clamp(average(rows.map((row) => row.player.confidence * row.roleDepth.roleConfidence * row.availability)) * (players.length >= 7 ? 1 : 0.76), 0.08, 0.95);
  const warnings: string[] = [];
  if (players.length < 7) warnings.push(`${teamName} close-game leverage has fewer than 7 player rows`);
  if (availabilityIndex < 0.82) warnings.push(`${teamName} close-game availability below 82%`);
  if (confidence < 0.52) warnings.push(`${teamName} close-game confidence below 52%`);

  return {
    teamName,
    teamSide,
    playerCount: players.length,
    closerCreation: round(closerCreation),
    closerShotMaking: round(closerShotMaking),
    closerSpacing: round(closerSpacing),
    turnoverSecurity: round(turnoverSecurity),
    freeThrowPressureProxy: round(freeThrowPressureProxy),
    defensiveSwitchabilityProxy: round(defensiveSwitchabilityProxy),
    lateReboundSecurity: round(lateReboundSecurity),
    availabilityIndex: round(availabilityIndex),
    topCloserScore: round(topCloserScore),
    topTwoCloserScore: round(topTwoCloserScore),
    topFiveClosingScore: round(topFiveClosingScore),
    closeGameComposite: round(closeGameComposite),
    confidence: round(confidence),
    warnings,
    drivers: [
      `top closer ${topCloserScore.toFixed(2)}`,
      `top two closers ${topTwoCloserScore.toFixed(2)}`,
      `top five closing ${topFiveClosingScore.toFixed(2)}`,
      `creator close ${(closerCreation * 100).toFixed(1)}%`,
      `shot making ${(closerShotMaking * 100).toFixed(1)}%`,
      `spacing ${(closerSpacing * 100).toFixed(1)}%`,
      `turnover security ${(turnoverSecurity * 100).toFixed(1)}%`,
      `FT pressure proxy ${(freeThrowPressureProxy * 100).toFixed(1)}%`,
      `switchability ${(defensiveSwitchabilityProxy * 100).toFixed(1)}%`,
      `availability ${(availabilityIndex * 100).toFixed(1)}%`,
      ...sortedClosers.slice(0, 3).map((row) => `${row.player.playerName} close score ${row.closingScore.toFixed(2)} ${row.roleDepth.roleTier}`)
    ]
  };
}

function edge(home: number, away: number, divisor: number) {
  return clamp((home - away) / divisor, -1, 1);
}

function spreadLeverage(projectedHomeMargin: number) {
  const absMargin = Math.abs(projectedHomeMargin);
  if (absMargin <= 3.5) return 1;
  if (absMargin <= 6.5) return 0.78;
  if (absMargin <= 9.5) return 0.42;
  return 0.18;
}

export function buildNbaCloseGameLeverageEdge(args: {
  homeTeam: string;
  awayTeam: string;
  projectedHomeMargin: number;
  playerStatProjections: NbaPlayerStatProjection[];
}): NbaCloseGameLeverageEdge {
  const home = buildTeam(args.homeTeam, "home", sidePlayers(args.playerStatProjections, "home"));
  const away = buildTeam(args.awayTeam, "away", sidePlayers(args.playerStatProjections, "away"));
  const leverage = spreadLeverage(args.projectedHomeMargin);
  const homeCloseGameEdge = edge(home.closeGameComposite, away.closeGameComposite, 1.8);
  const homeCloserCreationEdge = edge(home.closerCreation, away.closerCreation, 1.3);
  const homeTopCloserEdge = edge(home.topCloserScore, away.topCloserScore, 0.65);
  const homeTurnoverSecurityEdge = edge(home.turnoverSecurity, away.turnoverSecurity, 0.4);
  const homeAvailabilityEdge = edge(home.availabilityIndex, away.availabilityIndex, 0.35);
  const confidence = clamp((home.confidence + away.confidence) / 2 * (args.playerStatProjections.length >= 14 ? 1 : 0.78), 0.08, 0.95);
  const rawMarginDelta =
    homeCloseGameEdge * 1.05 +
    homeCloserCreationEdge * 0.74 +
    homeTopCloserEdge * 0.58 +
    homeTurnoverSecurityEdge * 0.36 +
    homeAvailabilityEdge * 0.45;
  const marginDelta = clamp(rawMarginDelta * leverage * confidence, -2.7, 2.7);
  const probabilityDelta = clamp(marginDelta * 0.0118, -0.021, 0.021);
  const warnings = [...home.warnings, ...away.warnings];

  return {
    modelVersion: "nba-close-game-leverage-edge-v1",
    home,
    away,
    spreadLeverage: round(leverage),
    homeCloseGameEdge: round(homeCloseGameEdge),
    homeCloserCreationEdge: round(homeCloserCreationEdge),
    homeTopCloserEdge: round(homeTopCloserEdge),
    homeTurnoverSecurityEdge: round(homeTurnoverSecurityEdge),
    homeAvailabilityEdge: round(homeAvailabilityEdge),
    marginDelta: round(marginDelta),
    probabilityDelta: round(probabilityDelta),
    confidence: round(confidence),
    warnings: [...new Set(warnings)],
    drivers: [
      `spread leverage ${(leverage * 100).toFixed(1)}%`,
      `close-game edge ${(homeCloseGameEdge * 100).toFixed(1)}%`,
      `closer creation edge ${(homeCloserCreationEdge * 100).toFixed(1)}%`,
      `top closer edge ${(homeTopCloserEdge * 100).toFixed(1)}%`,
      `turnover security edge ${(homeTurnoverSecurityEdge * 100).toFixed(1)}%`,
      `availability edge ${(homeAvailabilityEdge * 100).toFixed(1)}%`,
      `close-game margin delta ${marginDelta.toFixed(2)}`,
      `close-game probability delta ${(probabilityDelta * 100).toFixed(1)}%`,
      ...home.drivers.map((driver) => `home close: ${driver}`),
      ...away.drivers.map((driver) => `away close: ${driver}`)
    ]
  };
}
