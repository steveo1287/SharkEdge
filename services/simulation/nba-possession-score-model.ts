import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
import { buildNbaAdvancedPlayerBoxScore } from "@/services/simulation/nba-player-advanced-box-score";
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
  modelVersion: "nba-possession-score-model-v2";
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
  const opponentRebounds = sum(args.opponentPlayers.map((player) => player.projectedRebounds * statusAvailability(player.status)));
  const rows = args.players.map((player) => ({
    player,
    roleDepth: buildNbaPlayerRoleDepth(player),
    advanced: buildNbaAdvancedPlayerBoxScore(player),
    availability: statusAvailability(player.status)
  }));
  const activeMinuteTotal = sum(rows.map((row) => row.player.projectedMinutes * row.availability));
  const minutesTotal = sum(rows.map((row) => Math.max(0, row.player.projectedMinutes)));
  const projectedAssists = sum(rows.map((row) => row.player.projectedAssists * row.availability));
  const projectedRebounds = sum(rows.map((row) => row.player.projectedRebounds * row.availability));
  const projectedThrees = sum(rows.map((row) => row.player.projectedThrees * row.availability));
  const projectedFga = sum(rows.map((row) => row.advanced.projectedFga * row.availability));
  const projectedThreePointAttempts = sum(rows.map((row) => row.advanced.projectedThreePointAttempts * row.availability));
  const projectedFta = sum(rows.map((row) => row.advanced.projectedFta * row.availability));
  const projectedTurnovers = sum(rows.map((row) => row.advanced.projectedTurnovers * row.availability));
  const avgTurnoverPct = average(rows.map((row) => row.advanced.projectedTurnoverPct * row.availability));
  const avgFoulPressure = average(rows.map((row) => row.advanced.foulPressureRate * row.availability));

  const creationIndex = clamp(0.5 + (projectedAssists - 24) / 38 + average(rows.map((row) => row.roleDepth.creationScore)) * 0.18 + average(rows.map((row) => row.advanced.projectedAssistPct / 48 * row.availability)) * 0.2, 0, 1.35);
  const shootingIndex = clamp(0.5 + (projectedThrees - 12) / 26 + (projectedThreePointAttempts - 32) / 90 + average(rows.map((row) => row.roleDepth.spacingScore)) * 0.18, 0, 1.35);
  const reboundingIndex = clamp(0.5 + (projectedRebounds - opponentRebounds) / 48 + average(rows.map((row) => row.roleDepth.reboundingScore)) * 0.16 + average(rows.map((row) => row.advanced.projectedReboundPct / 32 * row.availability)) * 0.16, 0, 1.35);
  const turnoverSecurityIndex = clamp(0.94 - projectedTurnovers / 18 - avgTurnoverPct / 70 + creationIndex * 0.14, 0.35, 1.15);
  const freeThrowPressureProxy = clamp(0.36 + projectedFta / 34 + avgFoulPressure * 0.34 + average(rows.map((row) => row.roleDepth.starScore)) * 0.13, 0, 1.25);
  const shotVolumeIndex = clamp(projectedFga / 92 + projectedThreePointAttempts / 88 + projectedFta / 72, 0, 1.35);
  const starCreationIndex = clamp(sum(rows.map((row) => row.roleDepth.starScore * row.roleDepth.creationScore * Math.min(1, row.player.projectedMinutes / 32))), 0, 3.2);
  const closingIndex = clamp(sum(rows.map((row) => row.roleDepth.closingLineupScore * Math.min(1, row.player.projectedMinutes / 30))) / 5.5, 0, 1.45);
  const availabilityIndex = minutesTotal > 0 ? clamp(activeMinuteTotal / minutesTotal, 0, 1) : 0;

  // Four-factor shape in efficiency form: shooting is king, then creation/turnover
  // security, rebounding, and foul/FT pressure. The advanced box score supplies
  // turnover, FGA, 3PA and FTA estimates so this is no longer only proxy-driven.
  const efficiencyEdge =
    (shootingIndex - 0.5) * 9.4 +
    (creationIndex - 0.5) * 6.1 +
    (reboundingIndex - 0.5) * 3.7 +
    (turnoverSecurityIndex - 0.75) * 6.0 +
    (freeThrowPressureProxy - 0.5) * 3.8 +
    (shotVolumeIndex - 0.95) * 2.1 +
    starCreationIndex * 1.1 +
    (closingIndex - 0.75) * 2.5 -
    (1 - availabilityIndex) * 8.5;
  const playerPointEfficiency = projectedPossessions > 0 ? playerPointSum / projectedPossessions * 100 : 113.5;
  const projectedOffensiveEfficiency = clamp(playerPointEfficiency * 0.52 + (113.5 + efficiencyEdge) * 0.48, 96, 129);
  const rawProjectedPoints = projectedPossessions * projectedOffensiveEfficiency / 100;
  const marketAnchoredProjectedPoints = clamp(args.marketAnchorPoints * 0.58 + rawProjectedPoints * 0.42, 82, 152);
  const confidence = clamp(average(rows.map((row) => row.player.confidence * row.advanced.confidence)) * availabilityIndex * (args.players.length >= 7 ? 1 : 0.76), 0.08, 0.95);
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
      `FGA ${projectedFga.toFixed(1)}`,
      `3PA ${projectedThreePointAttempts.toFixed(1)}`,
      `FTA ${projectedFta.toFixed(1)}`,
      `TOV ${projectedTurnovers.toFixed(1)}`,
      `creation ${(creationIndex * 100).toFixed(1)}%`,
      `shooting ${(shootingIndex * 100).toFixed(1)}%`,
      `rebounding ${(reboundingIndex * 100).toFixed(1)}%`,
      `turnover security ${(turnoverSecurityIndex * 100).toFixed(1)}%`,
      `FT pressure ${(freeThrowPressureProxy * 100).toFixed(1)}%`,
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
    modelVersion: "nba-possession-score-model-v2",
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
