import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
import { buildNbaPlayerRoleDepth } from "@/services/simulation/nba-player-role-depth";
import type { RealitySimIntel } from "@/services/simulation/reality-sim-engine";

export type NbaCoachingPaceTeamProfile = {
  teamName: string;
  teamSide: "home" | "away";
  playerCount: number;
  paceBias: number;
  halfCourtBias: number;
  transitionBias: number;
  threePointRateBias: number;
  freeThrowPressureBias: number;
  offensiveReboundBias: number;
  turnoverTolerance: number;
  defensiveSchemeAggression: number;
  rotationTightness: number;
  benchTrust: number;
  starMinutesAggression: number;
  closeGameSlowdown: number;
  blowoutBenchRisk: number;
  styleComposite: number;
  confidence: number;
  warnings: string[];
  drivers: string[];
};

export type NbaCoachingPaceProfile = {
  modelVersion: "nba-coaching-pace-profile-v1";
  home: NbaCoachingPaceTeamProfile;
  away: NbaCoachingPaceTeamProfile;
  homePaceStyleEdge: number;
  homeRotationEdge: number;
  homeStarMinutesEdge: number;
  homeBenchTrustEdge: number;
  homeCloseGameStyleEdge: number;
  projectedPossessionDelta: number;
  marginDelta: number;
  totalDelta: number;
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

function factorValue(realityIntel: RealitySimIntel | null | undefined, patterns: RegExp[], fallback = 0) {
  const factors = realityIntel?.factors ?? [];
  for (const pattern of patterns) {
    const match = factors.find((factor) => pattern.test(factor.label));
    if (match && Number.isFinite(match.value)) return match.value;
  }
  return fallback;
}

function statusAvailability(status: string) {
  const text = status.toLowerCase();
  if (text.includes("out")) return 0;
  if (text.includes("doubtful")) return 0.18;
  if (text.includes("questionable")) return 0.54;
  if (text.includes("unknown")) return 0.74;
  return 1;
}

function sidePlayers(players: NbaPlayerStatProjection[], side: "home" | "away") {
  return players.filter((player) => player.teamSide === side);
}

function projectedTotalPace(projectedTotal: number | null | undefined) {
  return clamp(((projectedTotal ?? 224) - 224) / 18, -1, 1);
}

function buildTeamProfile(args: {
  teamName: string;
  teamSide: "home" | "away";
  players: NbaPlayerStatProjection[];
  projectedTotal: number | null | undefined;
  realityIntel?: RealitySimIntel | null;
}): NbaCoachingPaceTeamProfile {
  const rows = args.players.map((player) => ({ player, roleDepth: buildNbaPlayerRoleDepth(player), availability: statusAvailability(player.status) }));
  const totalMinutes = sum(rows.map((row) => Math.max(0, row.player.projectedMinutes)));
  const activeMinutes = sum(rows.map((row) => row.player.projectedMinutes * row.availability));
  const activeMinuteShare = totalMinutes > 0 ? clamp(activeMinutes / totalMinutes, 0, 1) : 0;
  const topMinutes = [...rows].sort((a, b) => b.player.projectedMinutes - a.player.projectedMinutes);
  const topFiveMinutes = sum(topMinutes.slice(0, 5).map((row) => row.player.projectedMinutes * row.availability));
  const benchMinutes = sum(rows.filter((row) => row.player.projectedMinutes < 24).map((row) => row.player.projectedMinutes * row.availability));
  const rotationCount = rows.filter((row) => row.player.projectedMinutes >= 14 && row.availability > 0.5).length;
  const starMinuteShare = totalMinutes > 0
    ? sum(rows.map((row) => row.player.projectedMinutes * row.roleDepth.starScore * row.availability)) / totalMinutes
    : 0;
  const creatorMinutes = sum(rows.map((row) => row.player.projectedMinutes * row.roleDepth.creationScore * row.availability));
  const spacingMinutes = sum(rows.map((row) => row.player.projectedMinutes * row.roleDepth.spacingScore * row.availability));
  const reboundingMinutes = sum(rows.map((row) => row.player.projectedMinutes * row.roleDepth.reboundingScore * row.availability));
  const closingStrength = sum(topMinutes.slice(0, 7).map((row) => row.roleDepth.closingLineupScore * row.availability)) / 5.5;
  const paceContext = factorValue(args.realityIntel, [/pace/i, /tempo/i], 0);
  const restContext = factorValue(args.realityIntel, [/rest/i, /travel/i, /back.?to.?back/i], 0);
  const totalPace = projectedTotalPace(args.projectedTotal);

  const rotationTightness = clamp(topFiveMinutes / 170 + Math.max(0, 8 - rotationCount) * 0.08 + starMinuteShare * 0.35, 0, 1.45);
  const benchTrust = clamp(benchMinutes / 96 + Math.max(0, rotationCount - 7) * 0.08, 0, 1.35);
  const starMinutesAggression = clamp(starMinuteShare * 3.4 + topFiveMinutes / 210 + closingStrength * 0.14, 0, 1.5);
  const transitionBias = clamp(0.5 + totalPace * 0.28 + paceContext * 0.1 + creatorMinutes / 260 + spacingMinutes / 360 - rotationTightness * 0.08, 0, 1.35);
  const halfCourtBias = clamp(0.54 + rotationTightness * 0.22 + closingStrength * 0.18 - transitionBias * 0.16, 0, 1.35);
  const threePointRateBias = clamp(0.38 + spacingMinutes / 250 + transitionBias * 0.12, 0, 1.35);
  const freeThrowPressureBias = clamp(0.36 + starMinutesAggression * 0.18 + creatorMinutes / 360 + halfCourtBias * 0.08, 0, 1.25);
  const offensiveReboundBias = clamp(0.34 + reboundingMinutes / 280 - transitionBias * 0.08 + benchTrust * 0.06, 0, 1.25);
  const turnoverTolerance = clamp(0.48 + transitionBias * 0.24 + creatorMinutes / 420 - halfCourtBias * 0.12, 0, 1.25);
  const defensiveSchemeAggression = clamp(0.42 + transitionBias * 0.16 + average(rows.map((row) => row.roleDepth.rolePlayerScore * row.availability)) * 0.22 + closingStrength * 0.12, 0, 1.25);
  const closeGameSlowdown = clamp(0.38 + halfCourtBias * 0.36 + rotationTightness * 0.2 + starMinutesAggression * 0.12 - transitionBias * 0.16, 0, 1.35);
  const blowoutBenchRisk = clamp(benchTrust * 0.34 + Math.max(0, 10 - rotationCount) * -0.04 + Math.max(0, rotationCount - 8) * 0.08 + (1 - activeMinuteShare) * 0.18, 0, 1.25);
  const paceBias = clamp(totalPace * 0.46 + paceContext * 0.18 + transitionBias * 0.34 - closeGameSlowdown * 0.18 + restContext * 0.04, -1.2, 1.2);
  const styleComposite = clamp(
    paceBias * 0.16 +
    transitionBias * 0.13 +
    halfCourtBias * 0.11 +
    threePointRateBias * 0.1 +
    freeThrowPressureBias * 0.09 +
    offensiveReboundBias * 0.07 +
    defensiveSchemeAggression * 0.08 +
    rotationTightness * 0.12 +
    starMinutesAggression * 0.11 +
    closeGameSlowdown * 0.08 +
    benchTrust * 0.05,
    -0.5,
    1.65
  );
  const confidence = clamp(average(rows.map((row) => row.player.confidence * row.roleDepth.roleConfidence * row.availability)) * (args.players.length >= 7 ? 1 : 0.76), 0.08, 0.95);
  const warnings: string[] = [];
  if (args.players.length < 7) warnings.push(`${args.teamName} coaching/pace profile has fewer than 7 projected players`);
  if (activeMinuteShare < 0.82) warnings.push(`${args.teamName} coaching/pace active minute share below 82%`);
  if (confidence < 0.52) warnings.push(`${args.teamName} coaching/pace confidence below 52%`);

  return {
    teamName: args.teamName,
    teamSide: args.teamSide,
    playerCount: args.players.length,
    paceBias: round(paceBias),
    halfCourtBias: round(halfCourtBias),
    transitionBias: round(transitionBias),
    threePointRateBias: round(threePointRateBias),
    freeThrowPressureBias: round(freeThrowPressureBias),
    offensiveReboundBias: round(offensiveReboundBias),
    turnoverTolerance: round(turnoverTolerance),
    defensiveSchemeAggression: round(defensiveSchemeAggression),
    rotationTightness: round(rotationTightness),
    benchTrust: round(benchTrust),
    starMinutesAggression: round(starMinutesAggression),
    closeGameSlowdown: round(closeGameSlowdown),
    blowoutBenchRisk: round(blowoutBenchRisk),
    styleComposite: round(styleComposite),
    confidence: round(confidence),
    warnings,
    drivers: [
      `pace bias ${paceBias.toFixed(2)}`,
      `transition ${(transitionBias * 100).toFixed(1)}%`,
      `half court ${(halfCourtBias * 100).toFixed(1)}%`,
      `rotation tightness ${(rotationTightness * 100).toFixed(1)}%`,
      `bench trust ${(benchTrust * 100).toFixed(1)}%`,
      `star minutes ${(starMinutesAggression * 100).toFixed(1)}%`,
      `close slowdown ${(closeGameSlowdown * 100).toFixed(1)}%`,
      `blowout bench risk ${(blowoutBenchRisk * 100).toFixed(1)}%`,
      `active minute share ${(activeMinuteShare * 100).toFixed(1)}%`
    ]
  };
}

function edge(home: number, away: number, divisor: number) {
  return clamp((home - away) / divisor, -1, 1);
}

export function buildNbaCoachingPaceProfile(args: {
  homeTeam: string;
  awayTeam: string;
  projectedHomeMargin: number;
  projectedTotal: number | null | undefined;
  realityIntel?: RealitySimIntel | null;
  playerStatProjections: NbaPlayerStatProjection[];
}): NbaCoachingPaceProfile {
  const home = buildTeamProfile({
    teamName: args.homeTeam,
    teamSide: "home",
    players: sidePlayers(args.playerStatProjections, "home"),
    projectedTotal: args.projectedTotal,
    realityIntel: args.realityIntel
  });
  const away = buildTeamProfile({
    teamName: args.awayTeam,
    teamSide: "away",
    players: sidePlayers(args.playerStatProjections, "away"),
    projectedTotal: args.projectedTotal,
    realityIntel: args.realityIntel
  });
  const closeSpreadScale = Math.abs(args.projectedHomeMargin) <= 4 ? 1 : Math.abs(args.projectedHomeMargin) <= 8 ? 0.68 : 0.35;
  const homePaceStyleEdge = edge(home.paceBias, away.paceBias, 0.8);
  const homeRotationEdge = edge(home.rotationTightness, away.rotationTightness, 0.45);
  const homeStarMinutesEdge = edge(home.starMinutesAggression, away.starMinutesAggression, 0.5);
  const homeBenchTrustEdge = edge(home.benchTrust, away.benchTrust, 0.45);
  const homeCloseGameStyleEdge = edge(home.closeGameSlowdown + home.starMinutesAggression * 0.35, away.closeGameSlowdown + away.starMinutesAggression * 0.35, 0.65);
  const confidence = clamp((home.confidence + away.confidence) / 2 * (args.playerStatProjections.length >= 14 ? 1 : 0.78), 0.08, 0.95);
  const projectedPossessionDelta = clamp((home.paceBias + away.paceBias) * 1.8 + (home.transitionBias + away.transitionBias - home.closeGameSlowdown - away.closeGameSlowdown) * 0.9, -4.2, 4.2);
  const rawMarginDelta =
    homeRotationEdge * 0.42 +
    homeStarMinutesEdge * 0.72 +
    homeBenchTrustEdge * 0.34 +
    homeCloseGameStyleEdge * 0.76 * closeSpreadScale +
    homePaceStyleEdge * 0.22;
  const marginDelta = clamp(rawMarginDelta * confidence, -2.4, 2.4);
  const totalDelta = clamp(projectedPossessionDelta * 1.85 * confidence, -7.5, 7.5);
  const probabilityDelta = clamp(marginDelta * 0.0115, -0.0185, 0.0185);
  const warnings = [...home.warnings, ...away.warnings];

  return {
    modelVersion: "nba-coaching-pace-profile-v1",
    home,
    away,
    homePaceStyleEdge: round(homePaceStyleEdge),
    homeRotationEdge: round(homeRotationEdge),
    homeStarMinutesEdge: round(homeStarMinutesEdge),
    homeBenchTrustEdge: round(homeBenchTrustEdge),
    homeCloseGameStyleEdge: round(homeCloseGameStyleEdge),
    projectedPossessionDelta: round(projectedPossessionDelta),
    marginDelta: round(marginDelta),
    totalDelta: round(totalDelta),
    probabilityDelta: round(probabilityDelta),
    confidence: round(confidence),
    warnings: [...new Set(warnings)],
    drivers: [
      `coaching pace style edge ${(homePaceStyleEdge * 100).toFixed(1)}%`,
      `rotation edge ${(homeRotationEdge * 100).toFixed(1)}%`,
      `star minutes edge ${(homeStarMinutesEdge * 100).toFixed(1)}%`,
      `bench trust edge ${(homeBenchTrustEdge * 100).toFixed(1)}%`,
      `close-game style edge ${(homeCloseGameStyleEdge * 100).toFixed(1)}%`,
      `projected possession delta ${projectedPossessionDelta.toFixed(2)}`,
      `coaching margin delta ${marginDelta.toFixed(2)}`,
      `coaching total delta ${totalDelta.toFixed(2)}`,
      `coaching probability delta ${(probabilityDelta * 100).toFixed(1)}%`,
      ...home.drivers.map((driver) => `home coaching: ${driver}`),
      ...away.drivers.map((driver) => `away coaching: ${driver}`)
    ]
  };
}
