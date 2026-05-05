import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
import { buildNbaPlayerRoleDepth } from "@/services/simulation/nba-player-role-depth";

export type NbaDefensiveEventTeam = {
  teamName: string;
  teamSide: "home" | "away";
  playerCount: number;
  stealPressure: number;
  blockPressure: number;
  deflectionProxy: number;
  rimProtection: number;
  possessionDisruption: number;
  opponentTurnoverPressure: number;
  transitionPressure: number;
  defensiveReboundSecurity: number;
  foulRiskProxy: number;
  availabilityIndex: number;
  eventStopScore: number;
  confidence: number;
  warnings: string[];
  drivers: string[];
};

export type NbaDefensiveEventEdge = {
  modelVersion: "nba-defensive-event-edge-v1";
  home: NbaDefensiveEventTeam;
  away: NbaDefensiveEventTeam;
  homeStopEdge: number;
  homePossessionDisruptionEdge: number;
  homeRimProtectionEdge: number;
  homeReboundSecurityEdge: number;
  homeFoulRiskEdge: number;
  homeExpectedExtraPossessions: number;
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
  if (text.includes("unknown")) return 0.74;
  return 1;
}

function per36(value: number, minutes: number) {
  return minutes > 0 ? value / minutes * 36 : 0;
}

function side(players: NbaPlayerStatProjection[], teamSide: "home" | "away") {
  return players.filter((player) => player.teamSide === teamSide);
}

function buildTeam(teamName: string, teamSide: "home" | "away", players: NbaPlayerStatProjection[]): NbaDefensiveEventTeam {
  const rows = players.map((player) => ({ player, roleDepth: buildNbaPlayerRoleDepth(player), availability: statusAvailability(player.status) }));
  const activeMinutes = sum(rows.map((row) => row.player.projectedMinutes * row.availability));
  const totalMinutes = sum(rows.map((row) => Math.max(0, row.player.projectedMinutes)));
  const availabilityIndex = totalMinutes > 0 ? clamp(activeMinutes / totalMinutes, 0, 1) : 0;
  const minuteWeights = rows.map((row) => Math.min(1, row.player.projectedMinutes / 32) * row.availability);
  const stealPressure = clamp(sum(rows.map((row, index) => (
    row.roleDepth.rolePlayerScore * 0.34 +
    row.roleDepth.creationScore * 0.1 +
    row.roleDepth.possessionLoadScore * 0.08 +
    Math.min(1, per36(row.player.projectedAssists, row.player.projectedMinutes) / 8.5) * 0.1 +
    row.roleDepth.closingLineupScore * 0.12
  ) * minuteWeights[index])) / 3.4, 0, 1.45);
  const blockPressure = clamp(sum(rows.map((row, index) => (
    row.roleDepth.reboundingScore * 0.34 +
    row.roleDepth.rolePlayerScore * 0.12 +
    Math.min(1, per36(row.player.projectedRebounds, row.player.projectedMinutes) / 11.5) * 0.18 +
    row.roleDepth.closingLineupScore * 0.1
  ) * minuteWeights[index])) / 3.3, 0, 1.45);
  const deflectionProxy = clamp(stealPressure * 0.58 + average(rows.map((row) => row.roleDepth.rolePlayerScore * row.availability)) * 0.42, 0, 1.4);
  const rimProtection = clamp(blockPressure * 0.68 + average(rows.map((row) => row.roleDepth.reboundingScore * row.availability)) * 0.32, 0, 1.4);
  const defensiveReboundSecurity = clamp(sum(rows.map((row, index) => (
    row.roleDepth.reboundingScore * 0.54 +
    Math.min(1, per36(row.player.projectedRebounds, row.player.projectedMinutes) / 12) * 0.34 +
    row.roleDepth.rolePlayerScore * 0.12
  ) * minuteWeights[index])) / 3.5, 0, 1.45);
  const possessionDisruption = clamp(stealPressure * 0.52 + deflectionProxy * 0.3 + blockPressure * 0.18, 0, 1.45);
  const opponentTurnoverPressure = clamp(stealPressure * 0.62 + deflectionProxy * 0.38, 0, 1.45);
  const transitionPressure = clamp(stealPressure * 0.55 + average(rows.map((row) => row.roleDepth.creationScore * row.availability)) * 0.22 + average(rows.map((row) => row.roleDepth.spacingScore * row.availability)) * 0.18, 0, 1.35);
  const highUsageLoad = average(rows.map((row) => row.roleDepth.possessionLoadScore * Math.min(1, row.player.projectedMinutes / 34) * row.availability));
  const foulRiskProxy = clamp(0.42 + highUsageLoad * 0.18 + blockPressure * 0.14 - defensiveReboundSecurity * 0.1, 0.15, 1.15);
  const eventStopScore = clamp(
    possessionDisruption * 0.28 +
    opponentTurnoverPressure * 0.18 +
    rimProtection * 0.2 +
    defensiveReboundSecurity * 0.18 +
    transitionPressure * 0.08 +
    availabilityIndex * 0.08 -
    foulRiskProxy * 0.07,
    0,
    1.55
  );
  const confidence = clamp(average(rows.map((row) => row.player.confidence * row.roleDepth.roleConfidence * row.availability)) * (players.length >= 7 ? 1 : 0.76), 0.08, 0.95);
  const warnings: string[] = [];
  if (players.length < 7) warnings.push(`${teamName} defensive event model has fewer than 7 player rows`);
  if (availabilityIndex < 0.82) warnings.push(`${teamName} defensive event availability below 82%`);
  if (confidence < 0.52) warnings.push(`${teamName} defensive event confidence below 52%`);

  return {
    teamName,
    teamSide,
    playerCount: players.length,
    stealPressure: round(stealPressure),
    blockPressure: round(blockPressure),
    deflectionProxy: round(deflectionProxy),
    rimProtection: round(rimProtection),
    possessionDisruption: round(possessionDisruption),
    opponentTurnoverPressure: round(opponentTurnoverPressure),
    transitionPressure: round(transitionPressure),
    defensiveReboundSecurity: round(defensiveReboundSecurity),
    foulRiskProxy: round(foulRiskProxy),
    availabilityIndex: round(availabilityIndex),
    eventStopScore: round(eventStopScore),
    confidence: round(confidence),
    warnings,
    drivers: [
      `steal pressure ${(stealPressure * 100).toFixed(1)}%`,
      `block pressure ${(blockPressure * 100).toFixed(1)}%`,
      `deflection proxy ${(deflectionProxy * 100).toFixed(1)}%`,
      `rim protection ${(rimProtection * 100).toFixed(1)}%`,
      `possession disruption ${(possessionDisruption * 100).toFixed(1)}%`,
      `def reb security ${(defensiveReboundSecurity * 100).toFixed(1)}%`,
      `foul risk proxy ${(foulRiskProxy * 100).toFixed(1)}%`,
      `availability ${(availabilityIndex * 100).toFixed(1)}%`
    ]
  };
}

function edge(home: number, away: number, divisor = 1) {
  return clamp((home - away) / divisor, -1, 1);
}

export function buildNbaDefensiveEventEdge(args: {
  homeTeam: string;
  awayTeam: string;
  playerStatProjections: NbaPlayerStatProjection[];
}): NbaDefensiveEventEdge {
  const home = buildTeam(args.homeTeam, "home", side(args.playerStatProjections, "home"));
  const away = buildTeam(args.awayTeam, "away", side(args.playerStatProjections, "away"));
  const homeStopEdge = edge(home.eventStopScore, away.eventStopScore, 0.55);
  const homePossessionDisruptionEdge = edge(home.possessionDisruption, away.possessionDisruption, 0.45);
  const homeRimProtectionEdge = edge(home.rimProtection, away.rimProtection, 0.45);
  const homeReboundSecurityEdge = edge(home.defensiveReboundSecurity, away.defensiveReboundSecurity, 0.42);
  const homeFoulRiskEdge = edge(away.foulRiskProxy, home.foulRiskProxy, 0.42);
  const confidence = clamp((home.confidence + away.confidence) / 2 * (args.playerStatProjections.length >= 14 ? 1 : 0.78), 0.08, 0.95);
  const homeExpectedExtraPossessions = clamp(
    homePossessionDisruptionEdge * 1.4 +
    homeReboundSecurityEdge * 0.9 +
    homeFoulRiskEdge * 0.55,
    -3.2,
    3.2
  );
  const rawMarginDelta =
    homeStopEdge * 0.95 +
    homePossessionDisruptionEdge * 0.72 +
    homeRimProtectionEdge * 0.52 +
    homeReboundSecurityEdge * 0.46 +
    homeFoulRiskEdge * 0.38 +
    homeExpectedExtraPossessions * 0.38;
  const marginDelta = clamp(rawMarginDelta * confidence, -2.8, 2.8);
  const probabilityDelta = clamp(marginDelta * 0.0115, -0.021, 0.021);
  const warnings = [...home.warnings, ...away.warnings];

  return {
    modelVersion: "nba-defensive-event-edge-v1",
    home,
    away,
    homeStopEdge: round(homeStopEdge),
    homePossessionDisruptionEdge: round(homePossessionDisruptionEdge),
    homeRimProtectionEdge: round(homeRimProtectionEdge),
    homeReboundSecurityEdge: round(homeReboundSecurityEdge),
    homeFoulRiskEdge: round(homeFoulRiskEdge),
    homeExpectedExtraPossessions: round(homeExpectedExtraPossessions),
    marginDelta: round(marginDelta),
    probabilityDelta: round(probabilityDelta),
    confidence: round(confidence),
    warnings: [...new Set(warnings)],
    drivers: [
      `defensive event stop edge ${(homeStopEdge * 100).toFixed(1)}%`,
      `possession disruption edge ${(homePossessionDisruptionEdge * 100).toFixed(1)}%`,
      `rim protection edge ${(homeRimProtectionEdge * 100).toFixed(1)}%`,
      `defensive rebound edge ${(homeReboundSecurityEdge * 100).toFixed(1)}%`,
      `foul risk edge ${(homeFoulRiskEdge * 100).toFixed(1)}%`,
      `expected extra possessions ${homeExpectedExtraPossessions.toFixed(2)}`,
      `defensive event margin delta ${marginDelta.toFixed(2)}`,
      `defensive event probability delta ${(probabilityDelta * 100).toFixed(1)}%`,
      ...home.drivers.map((driver) => `home defense: ${driver}`),
      ...away.drivers.map((driver) => `away defense: ${driver}`)
    ]
  };
}
