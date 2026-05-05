import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
import { buildNbaPlayerRoleDepth } from "@/services/simulation/nba-player-role-depth";

export type NbaPossessionTeamScore = {
  teamName: string;
  teamSide: "home" | "away";
  playerCount: number;
  projectedPossessions: number;
  projectedOffensiveEfficiency: number;
  rawProjectedPoints: number;
  marketAnchoredProjectedPoints: number;
  playerPointSum: number;
  creationIndex: number;
  shootingIndex: number;
  reboundingIndex: number;
  turnoverSecurityIndex: number;
  freeThrowPressureProxy: number;
  starCreationIndex: number;
  closingIndex: number;
  availabilityIndex: number;
  confidence: number;
  warnings: string[];
  drivers: string[];
};

export type NbaPossessionScoreModel = {
  modelVersion: "nba-possession-score-model-v1";
  home: NbaPossessionTeamScore;
  away: NbaPossessionTeamScore;
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedHomeMargin: number;
  marketAnchoredTotal: number;
  marketAnchoredHomeMargin: number;
  marginDelta: number;
  totalDelta: number;
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
  if (normalized.includes("questionable")) return 0.54;
  if (normalized.includes("unknown")) return 0.74;
  return 1;
}

function sidePlayers(players: NbaPlayerStatProjection[], side: "home" | "away") {
  return players.filter((player) => player.teamSide === side);
}

function per36(value: number, minutes: number) {
  return minutes > 0 ? value / minutes * 36 : 0;
}

function basePossessions(projectedTotal: number | null | undefined) {
  // NBA team efficiency generally lives near 108-122 points per 100 possessions.
  // Use market/engine total as the pace anchor but keep it bounded so score math
  // cannot create absurd possession environments.
  return clamp(((projectedTotal ?? 224) / 2) / 1.135, 92, 106);
}

function buildTeamScore(args: {
  teamName: string;
  teamSide: "home" | "away";
  players: NbaPlayerStatProjection[];
  opponentPlayers: NbaPlayerStatProjection[];
  projectedTotal: number | null | undefined;
  marketAnchorPoints: number;
}) {
  const projectedPossessions = basePossessions(args.projectedTotal);
  const playerPointSum = sum(args.players.map((player) => player.projectedPoints * statusAvailability(player.status)));
  const playerRebounds = sum(args.players.map((player) => player.projectedRebounds * statusAvailability(player.status)));
  const playerAssists = sum(args.players.map((player) => player.projectedAssists * statusAvailability(player.status)));
  const playerThrees = sum(args.players.map((player) => player.projectedThrees * statusAvailability(player.status)));
  const opponentRebounds = sum(args.opponentPlayers.map((player) => player.projectedRebounds * statusAvailability(player.status)));
  const roleRows = args.players.map((player) => ({ player, roleDepth: buildNbaPlayerRoleDepth(player) }));
  const activeMinuteTotal = sum(args.players.map((player) => player.projectedMinutes * statusAvailability(player.status)));
  const minutesTotal = sum(args.players.map((player) => Math.max(0, player.projectedMinutes)));

  const creationIndex = clamp(0.5 + (playerAssists - 24) / 36 + average(roleRows.map((row) => row.roleDepth.creationScore)) * 0.22, 0, 1.35);
  const shootingIndex = clamp(0.5 + (playerThrees - 12) / 22 + average(roleRows.map((row) => row.roleDepth.spacingScore)) * 0.24, 0, 1.35);
  const reboundingIndex = clamp(0.5 + (playerRebounds - opponentRebounds) / 48 + average(roleRows.map((row) => row.roleDepth.reboundingScore)) * 0.2, 0, 1.35);
  const turnoverSecurityIndex = clamp(0.82 - average(roleRows.map((row) => row.roleDepth.possessionLoadScore)) * 0.18 + creationIndex * 0.16, 0.35, 1.15);
  const freeThrowPressureProxy = clamp(0.42 + average(args.players.map((player) => per36(player.projectedPoints, player.projectedMinutes))) / 58 + average(roleRows.map((row) => row.roleDepth.starScore)) * 0.2, 0, 1.25);
  const starCreationIndex = clamp(sum(roleRows.map((row) => row.roleDepth.starScore * row.roleDepth.creationScore * Math.min(1, row.player.projectedMinutes / 32))), 0, 3.2);
  const closingIndex = clamp(sum(roleRows.map((row) => row.roleDepth.closingLineupScore * Math.min(1, row.player.projectedMinutes / 30))) / 5.5, 0, 1.45);
  const availabilityIndex = minutesTotal > 0 ? clamp(activeMinuteTotal / minutesTotal, 0, 1) : 0;

  // Four-factor shape in efficiency form: shooting is king, then creation/turnover
  // security, rebounding, and foul/FT pressure proxy. Star and closing creation are
  // used as late-clock efficiency stabilizers.
  const efficiencyEdge =
    (shootingIndex - 0.5) * 9.8 +
    (creationIndex - 0.5) * 6.4 +
    (reboundingIndex - 0.5) * 3.7 +
    (turnoverSecurityIndex - 0.75) * 5.4 +
    (freeThrowPressureProxy - 0.5) * 3.1 +
    starCreationIndex * 1.15 +
    (closingIndex - 0.75) * 2.6 -
    (1 - availabilityIndex) * 8.5;
  const playerPointEfficiency = projectedPossessions > 0 ? playerPointSum / projectedPossessions * 100 : 113.5;
  const projectedOffensiveEfficiency = clamp(playerPointEfficiency * 0.54 + (113.5 + efficiencyEdge) * 0.46, 96, 129);
  const rawProjectedPoints = projectedPossessions * projectedOffensiveEfficiency / 100;
  const marketAnchoredProjectedPoints = clamp(args.marketAnchorPoints * 0.58 + rawProjectedPoints * 0.42, 82, 152);
  const confidence = clamp(average(args.players.map((player) => player.confidence)) * availabilityIndex * (args.players.length >= 7 ? 1 : 0.76), 0.08, 0.95);
  const warnings: string[] = [];
  if (args.players.length < 7) warnings.push(`${args.teamName} possession model has fewer than 7 projected players`);
  if (availabilityIndex < 0.82) warnings.push(`${args.teamName} possession model availability below 82%`);
  if (confidence < 0.52) warnings.push(`${args.teamName} possession model confidence below 52%`);

  return {
    teamName: args.teamName,
    teamSide: args.teamSide,
    playerCount: args.players.length,
    projectedPossessions: round(projectedPossessions),
    projectedOffensiveEfficiency: round(projectedOffensiveEfficiency),
    rawProjectedPoints: round(rawProjectedPoints),
    marketAnchoredProjectedPoints: round(marketAnchoredProjectedPoints),
    playerPointSum: round(playerPointSum),
    creationIndex: round(creationIndex, 4),
    shootingIndex: round(shootingIndex, 4),
    reboundingIndex: round(reboundingIndex, 4),
    turnoverSecurityIndex: round(turnoverSecurityIndex, 4),
    freeThrowPressureProxy: round(freeThrowPressureProxy, 4),
    starCreationIndex: round(starCreationIndex, 4),
    closingIndex: round(closingIndex, 4),
    availabilityIndex: round(availabilityIndex, 4),
    confidence: round(confidence, 4),
    warnings,
    drivers: [
      `possessions ${projectedPossessions.toFixed(1)}`,
      `off eff ${projectedOffensiveEfficiency.toFixed(1)}`,
      `player points ${playerPointSum.toFixed(1)}`,
      `creation ${(creationIndex * 100).toFixed(1)}%`,
      `shooting ${(shootingIndex * 100).toFixed(1)}%`,
      `rebounding ${(reboundingIndex * 100).toFixed(1)}%`,
      `turnover security ${(turnoverSecurityIndex * 100).toFixed(1)}%`,
      `FT pressure proxy ${(freeThrowPressureProxy * 100).toFixed(1)}%`,
      `availability ${(availabilityIndex * 100).toFixed(1)}%`
    ]
  } satisfies NbaPossessionTeamScore;
}

export function buildNbaPossessionScoreModel(args: {
  homeTeam: string;
  awayTeam: string;
  projectedHomeMargin: number;
  projectedTotal: number | null | undefined;
  playerStatProjections: NbaPlayerStatProjection[];
}): NbaPossessionScoreModel {
  const projectedTotal = args.projectedTotal ?? 224;
  const marketAnchorHome = projectedTotal / 2 + args.projectedHomeMargin / 2;
  const marketAnchorAway = projectedTotal / 2 - args.projectedHomeMargin / 2;
  const homePlayers = sidePlayers(args.playerStatProjections, "home");
  const awayPlayers = sidePlayers(args.playerStatProjections, "away");
  const home = buildTeamScore({
    teamName: args.homeTeam,
    teamSide: "home",
    players: homePlayers,
    opponentPlayers: awayPlayers,
    projectedTotal,
    marketAnchorPoints: marketAnchorHome
  });
  const away = buildTeamScore({
    teamName: args.awayTeam,
    teamSide: "away",
    players: awayPlayers,
    opponentPlayers: homePlayers,
    projectedTotal,
    marketAnchorPoints: marketAnchorAway
  });
  const projectedHomeScore = home.marketAnchoredProjectedPoints;
  const projectedAwayScore = away.marketAnchoredProjectedPoints;
  const modelTotal = projectedHomeScore + projectedAwayScore;
  const modelMargin = projectedHomeScore - projectedAwayScore;
  const marketAnchoredTotal = clamp(projectedTotal * 0.64 + modelTotal * 0.36, 170, 285);
  const marketAnchoredHomeMargin = clamp(args.projectedHomeMargin * 0.62 + modelMargin * 0.38, -24, 24);
  const marginDelta = clamp(marketAnchoredHomeMargin - args.projectedHomeMargin, -4.5, 4.5);
  const totalDelta = clamp(marketAnchoredTotal - projectedTotal, -9, 9);
  const confidence = clamp((home.confidence + away.confidence) / 2 * (args.playerStatProjections.length >= 14 ? 1 : 0.78), 0.08, 0.95);
  const warnings = [...home.warnings, ...away.warnings];
  if (args.playerStatProjections.length < 14) warnings.push("possession score model has fewer than 14 player rows");

  return {
    modelVersion: "nba-possession-score-model-v1",
    home,
    away,
    projectedHomeScore: round(projectedHomeScore),
    projectedAwayScore: round(projectedAwayScore),
    projectedTotal: round(marketAnchoredTotal),
    projectedHomeMargin: round(marketAnchoredHomeMargin),
    marketAnchoredTotal: round(marketAnchoredTotal),
    marketAnchoredHomeMargin: round(marketAnchoredHomeMargin),
    marginDelta: round(marginDelta, 4),
    totalDelta: round(totalDelta, 4),
    confidence: round(confidence, 4),
    warnings: [...new Set(warnings)],
    drivers: [
      `possession home ${projectedHomeScore.toFixed(1)} away ${projectedAwayScore.toFixed(1)}`,
      `possession total ${marketAnchoredTotal.toFixed(1)}`,
      `possession margin ${marketAnchoredHomeMargin.toFixed(1)}`,
      `margin delta ${marginDelta.toFixed(2)}`,
      `total delta ${totalDelta.toFixed(2)}`,
      `home ${home.projectedOffensiveEfficiency.toFixed(1)} off eff`,
      `away ${away.projectedOffensiveEfficiency.toFixed(1)} off eff`,
      ...home.drivers.map((driver) => `home possession: ${driver}`),
      ...away.drivers.map((driver) => `away possession: ${driver}`)
    ]
  };
}
