import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
import { buildNbaPlayerRoleDepth, type NbaPlayerRoleDepth } from "@/services/simulation/nba-player-role-depth";
import type { RealitySimIntel } from "@/services/simulation/reality-sim-engine";

export type NbaTeamStrengthGrade = {
  teamSide: "home" | "away";
  teamName: string;
  offensiveGrade: number;
  defensiveGrade: number;
  paceGrade: number;
  shootingGrade: number;
  creationGrade: number;
  turnoverGrade: number;
  reboundingGrade: number;
  spacingGrade: number;
  recentFormGrade: number;
  restTravelGrade: number;
  rosterImpactGrade: number;
  starPowerGrade: number;
  roleDepthGrade: number;
  closingLineupGrade: number;
  overallPowerRating: number;
  confidence: number;
  playerCount: number;
  activeMinuteShare: number;
  starCount: number;
  creatorCount: number;
  rotationCount: number;
  blockers: string[];
  warnings: string[];
  drivers: string[];
};

export type NbaRosterImpactPlayer = {
  playerName: string;
  teamName: string;
  teamSide: "home" | "away";
  projectedMinutes: number;
  roleDepth: NbaPlayerRoleDepth;
  roleTier: NbaPlayerRoleDepth["roleTier"];
  usageTier: NbaPlayerRoleDepth["usageTier"];
  archetype: NbaPlayerRoleDepth["archetype"];
  starScore: number;
  rolePlayerScore: number;
  closingLineupScore: number;
  replacementRisk: number;
  offensiveImpact: number;
  defensiveImpact: number;
  reboundingImpact: number;
  spacingImpact: number;
  creationImpact: number;
  turnoverImpact: number;
  availabilityPenalty: number;
  totalImpactPoints: number;
  confidence: number;
  drivers: string[];
};

export type NbaUsageRedistributionGrade = {
  homeMissingMinutes: number;
  awayMissingMinutes: number;
  homeMissingStarScore: number;
  awayMissingStarScore: number;
  homeEfficiencyPenalty: number;
  awayEfficiencyPenalty: number;
  homeBenchDepthPenalty: number;
  awayBenchDepthPenalty: number;
  homeTeamImpactDelta: number;
  awayTeamImpactDelta: number;
  confidence: number;
  warnings: string[];
  drivers: string[];
};

export type NbaMatchupStyleGrade = {
  homeStyleEdge: number;
  paceEdge: number;
  shootingEdge: number;
  creationEdge: number;
  reboundingEdge: number;
  spacingEdge: number;
  starPowerEdge: number;
  roleDepthEdge: number;
  restTravelEdge: number;
  benchEdge: number;
  confidence: number;
  drivers: string[];
};

export type NbaTeamStrengthRosterImpact = {
  modelVersion: "nba-team-strength-roster-impact-v1";
  homeTeam: NbaTeamStrengthGrade;
  awayTeam: NbaTeamStrengthGrade;
  homeRoster: NbaRosterImpactPlayer[];
  awayRoster: NbaRosterImpactPlayer[];
  usageRedistribution: NbaUsageRedistributionGrade;
  matchupStyle: NbaMatchupStyleGrade;
  neutralCourtMargin: number;
  homeCourtAdjustment: number;
  restTravelAdjustment: number;
  rosterImpactAdjustment: number;
  usageRedistributionAdjustment: number;
  matchupStyleAdjustment: number;
  finalProjectedHomeMargin: number;
  probabilityDelta: number;
  boundedProbabilityDelta: number;
  confidence: number;
  blockers: string[];
  warnings: string[];
  drivers: string[];
};

export type NbaTeamStrengthRosterInput = {
  awayTeam: string;
  homeTeam: string;
  projectedHomeMargin: number;
  projectedTotal: number | null;
  homeWinPct: number;
  awayWinPct: number;
  realityIntel?: RealitySimIntel | null;
  playerStatProjections?: NbaPlayerStatProjection[] | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
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
  const normalized = status.toLowerCase();
  if (normalized.includes("out")) return 0;
  if (normalized.includes("doubtful")) return 0.2;
  if (normalized.includes("questionable")) return 0.55;
  if (normalized.includes("unknown")) return 0.75;
  return 1;
}

function roleImpactMultiplier(roleDepth: NbaPlayerRoleDepth) {
  switch (roleDepth.roleTier) {
    case "SUPERSTAR": return 1.32;
    case "STAR": return 1.22;
    case "PRIMARY_CREATOR": return 1.16;
    case "STARTER": return 1.08;
    case "SIXTH_MAN": return 1.03;
    case "ROTATION": return 0.94;
    case "LOW_MIN_BENCH": return 0.72;
    case "FRINGE": return 0.5;
    case "OUT": return 0.15;
  }
}

function playerImpact(player: NbaPlayerStatProjection): NbaRosterImpactPlayer {
  const roleDepth = buildNbaPlayerRoleDepth(player);
  const minutes = clamp(player.projectedMinutes, 0, 42);
  const minuteShare = minutes / 36;
  const availability = statusAvailability(player.status);
  const pointsPer36 = minutes > 0 ? player.projectedPoints / minutes * 36 : 0;
  const reboundsPer36 = minutes > 0 ? player.projectedRebounds / minutes * 36 : 0;
  const assistsPer36 = minutes > 0 ? player.projectedAssists / minutes * 36 : 0;
  const threesPer36 = minutes > 0 ? player.projectedThrees / minutes * 36 : 0;
  const confidence = clamp(player.confidence * availability * (0.8 + roleDepth.roleConfidence * 0.2), 0.05, 0.95);
  const roleMultiplier = roleImpactMultiplier(roleDepth);

  const offensiveImpact = clamp(((pointsPer36 - 13.5) * 0.11 * minuteShare) * (0.88 + roleDepth.scoringScore * 0.22) * roleMultiplier, -2.5, 4.2);
  const creationImpact = clamp(((assistsPer36 - 3.0) * 0.18 * minuteShare) * (0.86 + roleDepth.creationScore * 0.3) * roleMultiplier, -1.8, 3.2);
  const reboundingImpact = clamp(((reboundsPer36 - 5.3) * 0.11 * minuteShare) * (0.9 + roleDepth.reboundingScore * 0.2), -1.6, 2.3);
  const spacingImpact = clamp(((threesPer36 - 1.5) * 0.16 * minuteShare) * (0.9 + roleDepth.spacingScore * 0.22), -1.4, 2.1);
  const turnoverImpact = clamp(-(Math.max(0, assistsPer36 - 7.5) * 0.04 + Math.max(0, pointsPer36 - 27) * 0.025) * minuteShare * (0.85 + roleDepth.possessionLoadScore * 0.3), -1.1, 0.15);
  const defensiveProxy = clamp((reboundingImpact * 0.25) + (spacingImpact < -0.4 ? -0.1 : 0.05) + (minutes >= 30 ? 0.08 : 0) + roleDepth.rolePlayerScore * 0.12, -0.8, 0.95);
  const availabilityPenalty = clamp((1 - availability) * (minutes / 36) * (2.4 + roleDepth.starScore * 2.1), 0, 4.0);
  const starPremium = roleDepth.starScore >= 0.68 ? roleDepth.starScore * 0.75 * roleDepth.closingLineupScore : 0;
  const roleFloor = roleDepth.rolePlayerScore >= 0.58 ? roleDepth.rolePlayerScore * 0.22 : 0;
  const totalImpactPoints = clamp(
    (offensiveImpact + creationImpact + reboundingImpact + spacingImpact + turnoverImpact + defensiveProxy + starPremium + roleFloor) * confidence - availabilityPenalty,
    -5.5,
    6.8
  );

  return {
    playerName: player.playerName,
    teamName: player.teamName,
    teamSide: player.teamSide,
    projectedMinutes: round(minutes, 1),
    roleDepth,
    roleTier: roleDepth.roleTier,
    usageTier: roleDepth.usageTier,
    archetype: roleDepth.archetype,
    starScore: roleDepth.starScore,
    rolePlayerScore: roleDepth.rolePlayerScore,
    closingLineupScore: roleDepth.closingLineupScore,
    replacementRisk: roleDepth.replacementRisk,
    offensiveImpact: round(offensiveImpact, 3),
    defensiveImpact: round(defensiveProxy, 3),
    reboundingImpact: round(reboundingImpact, 3),
    spacingImpact: round(spacingImpact, 3),
    creationImpact: round(creationImpact, 3),
    turnoverImpact: round(turnoverImpact, 3),
    availabilityPenalty: round(availabilityPenalty, 3),
    totalImpactPoints: round(totalImpactPoints, 3),
    confidence: round(confidence, 3),
    drivers: [
      `${minutes.toFixed(1)} projected minutes`,
      `${pointsPer36.toFixed(1)} pts/36`,
      `${reboundsPer36.toFixed(1)} reb/36`,
      `${assistsPer36.toFixed(1)} ast/36`,
      `${threesPer36.toFixed(1)} 3pm/36`,
      `role ${roleDepth.roleTier}`,
      `usage ${roleDepth.usageTier}`,
      `archetype ${roleDepth.archetype}`,
      `star score ${(roleDepth.starScore * 100).toFixed(1)}%`,
      `availability ${availability.toFixed(2)}`
    ]
  };
}

function sidePlayers(players: NbaPlayerStatProjection[], side: "home" | "away") {
  return players.filter((player) => player.teamSide === side);
}

function buildTeamGrade(args: {
  teamSide: "home" | "away";
  teamName: string;
  players: NbaPlayerStatProjection[];
  roster: NbaRosterImpactPlayer[];
  realityIntel?: RealitySimIntel | null;
  projectedTotal: number | null;
}) {
  const totalMinutes = sum(args.players.map((player) => Math.max(0, player.projectedMinutes)));
  const activeMinutes = sum(args.players.map((player) => Math.max(0, player.projectedMinutes) * statusAvailability(player.status)));
  const points = sum(args.players.map((player) => player.projectedPoints));
  const rebounds = sum(args.players.map((player) => player.projectedRebounds));
  const assists = sum(args.players.map((player) => player.projectedAssists));
  const threes = sum(args.players.map((player) => player.projectedThrees));
  const avgConfidence = average(args.players.map((player) => player.confidence));
  const sideSign = args.teamSide === "home" ? 1 : -1;
  const offenseContext = sideSign * factorValue(args.realityIntel, [/offen/i, /team.*attack/i], 0);
  const defenseContext = sideSign * factorValue(args.realityIntel, [/defen/i, /rim/i, /stop/i], 0);
  const paceContext = factorValue(args.realityIntel, [/pace/i, /tempo/i], 0);
  const formContext = sideSign * factorValue(args.realityIntel, [/form/i, /recent/i], 0);
  const restContext = sideSign * factorValue(args.realityIntel, [/rest/i, /travel/i, /back.?to.?back/i], 0);
  const expectedTeamPoints = (args.projectedTotal ?? 224) / 2;
  const starCount = args.roster.filter((player) => player.roleTier === "SUPERSTAR" || player.roleTier === "STAR").length;
  const creatorCount = args.roster.filter((player) => player.roleTier === "PRIMARY_CREATOR" || player.archetype === "ON_BALL_ENGINE" || player.archetype === "PLAYMAKING_GUARD").length;
  const rotationCount = args.roster.filter((player) => player.projectedMinutes >= 14 && player.roleTier !== "OUT").length;
  const starPowerGrade = clamp(sum(args.roster.map((player) => player.starScore * player.closingLineupScore * 2.2)) - 2.2, -3.5, 5.5);
  const roleDepthGrade = clamp(sum(args.roster.map((player) => player.rolePlayerScore * Math.min(1, player.projectedMinutes / 24))) / 2.2 - 1.8, -3.5, 4.5);
  const closingLineupGrade = clamp(sum(args.roster.slice(0, 7).map((player) => player.closingLineupScore)) / 1.9 - 2.2, -3.5, 4.5);
  const offensiveGrade = clamp((points - expectedTeamPoints) * 0.18 + offenseContext * 0.35 + starPowerGrade * 0.16, -5.5, 5.5);
  const creationGrade = clamp((assists - 24) * 0.12 + offenseContext * 0.16 + creatorCount * 0.28, -4.5, 4.5);
  const shootingGrade = clamp((threes - 12.2) * 0.18 + (points - expectedTeamPoints) * 0.04 + roleDepthGrade * 0.1, -4.5, 4.5);
  const reboundingGrade = clamp((rebounds - 43) * 0.1 + defenseContext * 0.12, -4, 4);
  const spacingGrade = clamp((threes - 12.2) * 0.12 + creationGrade * 0.18, -3.5, 3.5);
  const defensiveGrade = clamp(reboundingGrade * 0.32 + defenseContext * 0.42 + avgConfidence * 0.35 + roleDepthGrade * 0.08, -4.5, 4.5);
  const paceGrade = clamp(paceContext * 0.3 + ((args.projectedTotal ?? 224) - 224) * 0.02, -3, 3);
  const turnoverGrade = clamp(creationGrade * 0.15 - Math.max(0, assists - 31) * 0.05 + creatorCount * 0.04, -2.5, 2.5);
  const recentFormGrade = clamp(formContext * 0.4, -3, 3);
  const restTravelGrade = clamp(restContext * 0.45, -3, 3);
  const rosterImpactGrade = clamp(sum(args.roster.map((player) => player.totalImpactPoints)) / 2.7, -6, 6);
  const activeMinuteShare = totalMinutes > 0 ? activeMinutes / totalMinutes : 0;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (args.players.length < 7) blockers.push(`${args.teamName} roster projection has fewer than 7 players`);
  if (activeMinuteShare < 0.82) warnings.push(`${args.teamName} projected active minute share below 82%`);
  if (avgConfidence < 0.52) warnings.push(`${args.teamName} roster confidence below 52%`);
  if (starCount === 0 && creatorCount === 0) warnings.push(`${args.teamName} has no projected star or primary creator in role-depth layer`);
  const overallPowerRating = clamp(
    offensiveGrade * 0.19 + defensiveGrade * 0.16 + creationGrade * 0.12 + shootingGrade * 0.11 + reboundingGrade * 0.08 + spacingGrade * 0.07 + recentFormGrade * 0.08 + restTravelGrade * 0.08 + rosterImpactGrade * 0.24 + starPowerGrade * 0.14 + roleDepthGrade * 0.08 + closingLineupGrade * 0.08,
    -9,
    9
  );

  return {
    teamSide: args.teamSide,
    teamName: args.teamName,
    offensiveGrade: round(offensiveGrade, 3),
    defensiveGrade: round(defensiveGrade, 3),
    paceGrade: round(paceGrade, 3),
    shootingGrade: round(shootingGrade, 3),
    creationGrade: round(creationGrade, 3),
    turnoverGrade: round(turnoverGrade, 3),
    reboundingGrade: round(reboundingGrade, 3),
    spacingGrade: round(spacingGrade, 3),
    recentFormGrade: round(recentFormGrade, 3),
    restTravelGrade: round(restTravelGrade, 3),
    rosterImpactGrade: round(rosterImpactGrade, 3),
    starPowerGrade: round(starPowerGrade, 3),
    roleDepthGrade: round(roleDepthGrade, 3),
    closingLineupGrade: round(closingLineupGrade, 3),
    overallPowerRating: round(overallPowerRating, 3),
    confidence: round(clamp(avgConfidence * activeMinuteShare, 0.1, 0.95), 3),
    playerCount: args.players.length,
    activeMinuteShare: round(activeMinuteShare, 3),
    starCount,
    creatorCount,
    rotationCount,
    blockers,
    warnings,
    drivers: [
      `${points.toFixed(1)} projected team points`,
      `${rebounds.toFixed(1)} projected rebounds`,
      `${assists.toFixed(1)} projected assists`,
      `${threes.toFixed(1)} projected threes`,
      `stars ${starCount}, creators ${creatorCount}, rotation ${rotationCount}`,
      `star power ${starPowerGrade.toFixed(2)}`,
      `role depth ${roleDepthGrade.toFixed(2)}`,
      `roster impact ${rosterImpactGrade.toFixed(2)}`,
      `active minute share ${(activeMinuteShare * 100).toFixed(1)}%`
    ]
  } satisfies NbaTeamStrengthGrade;
}

function buildUsageRedistribution(homeRoster: NbaRosterImpactPlayer[], awayRoster: NbaRosterImpactPlayer[]) {
  function side(roster: NbaRosterImpactPlayer[]) {
    const missingMinutes = sum(roster.map((player) => Math.max(0, player.projectedMinutes) * (1 - statusAvailability(player.roleDepth.availabilityScore <= 0.05 ? "out" : "available"))));
    const missingStarScore = sum(roster.map((player) => player.projectedMinutes * (1 - player.roleDepth.availabilityScore) * player.starScore));
    const benchMinutes = sum(roster.filter((player) => player.projectedMinutes < 20 && player.roleTier !== "OUT").map((player) => Math.max(0, player.projectedMinutes)));
    const topUsageMinutes = sum(roster.filter((player) => player.starScore >= 0.58 || player.creationImpact >= 0.8).map((player) => player.projectedMinutes));
    const efficiencyPenalty = clamp(missingMinutes * 0.035 + missingStarScore * 0.035 + Math.max(0, 65 - benchMinutes) * 0.008, 0, 4.2);
    const benchDepthPenalty = clamp(Math.max(0, 55 - benchMinutes) * 0.025 + Math.max(0, 7 - roster.filter((player) => player.projectedMinutes >= 14).length) * 0.18, 0, 2.8);
    const teamImpactDelta = clamp(topUsageMinutes * 0.012 - efficiencyPenalty - benchDepthPenalty, -5.5, 3.0);
    return { missingMinutes, missingStarScore, efficiencyPenalty, benchDepthPenalty, teamImpactDelta };
  }
  const home = side(homeRoster);
  const away = side(awayRoster);
  const warnings: string[] = [];
  if (home.missingMinutes > 18 || home.missingStarScore > 8) warnings.push("home side has major projected missing star/usage minutes");
  if (away.missingMinutes > 18 || away.missingStarScore > 8) warnings.push("away side has major projected missing star/usage minutes");
  return {
    homeMissingMinutes: round(home.missingMinutes, 1),
    awayMissingMinutes: round(away.missingMinutes, 1),
    homeMissingStarScore: round(home.missingStarScore, 3),
    awayMissingStarScore: round(away.missingStarScore, 3),
    homeEfficiencyPenalty: round(home.efficiencyPenalty, 3),
    awayEfficiencyPenalty: round(away.efficiencyPenalty, 3),
    homeBenchDepthPenalty: round(home.benchDepthPenalty, 3),
    awayBenchDepthPenalty: round(away.benchDepthPenalty, 3),
    homeTeamImpactDelta: round(home.teamImpactDelta, 3),
    awayTeamImpactDelta: round(away.teamImpactDelta, 3),
    confidence: round(clamp(1 - (home.missingMinutes + away.missingMinutes + home.missingStarScore + away.missingStarScore) / 140, 0.2, 0.95), 3),
    warnings,
    drivers: [
      `home missing minutes ${home.missingMinutes.toFixed(1)}`,
      `away missing minutes ${away.missingMinutes.toFixed(1)}`,
      `home missing star score ${home.missingStarScore.toFixed(2)}`,
      `away missing star score ${away.missingStarScore.toFixed(2)}`,
      `home bench penalty ${home.benchDepthPenalty.toFixed(2)}`,
      `away bench penalty ${away.benchDepthPenalty.toFixed(2)}`
    ]
  } satisfies NbaUsageRedistributionGrade;
}

function buildMatchupStyle(home: NbaTeamStrengthGrade, away: NbaTeamStrengthGrade) {
  const paceEdge = clamp(home.paceGrade - away.paceGrade, -3, 3);
  const shootingEdge = clamp(home.shootingGrade - away.shootingGrade, -4.5, 4.5);
  const creationEdge = clamp(home.creationGrade - away.creationGrade, -4.5, 4.5);
  const reboundingEdge = clamp(home.reboundingGrade - away.reboundingGrade, -4, 4);
  const spacingEdge = clamp(home.spacingGrade - away.spacingGrade, -3.5, 3.5);
  const starPowerEdge = clamp(home.starPowerGrade - away.starPowerGrade, -5, 5);
  const roleDepthEdge = clamp(home.roleDepthGrade - away.roleDepthGrade, -4, 4);
  const restTravelEdge = clamp(home.restTravelGrade - away.restTravelGrade, -4, 4);
  const benchEdge = clamp(home.activeMinuteShare - away.activeMinuteShare, -0.25, 0.25) * 7 + clamp(home.rotationCount - away.rotationCount, -3, 3) * 0.16;
  const homeStyleEdge = clamp(paceEdge * 0.06 + shootingEdge * 0.13 + creationEdge * 0.14 + reboundingEdge * 0.1 + spacingEdge * 0.09 + starPowerEdge * 0.18 + roleDepthEdge * 0.1 + restTravelEdge * 0.12 + benchEdge * 0.1, -5.5, 5.5);
  return {
    homeStyleEdge: round(homeStyleEdge, 3),
    paceEdge: round(paceEdge, 3),
    shootingEdge: round(shootingEdge, 3),
    creationEdge: round(creationEdge, 3),
    reboundingEdge: round(reboundingEdge, 3),
    spacingEdge: round(spacingEdge, 3),
    starPowerEdge: round(starPowerEdge, 3),
    roleDepthEdge: round(roleDepthEdge, 3),
    restTravelEdge: round(restTravelEdge, 3),
    benchEdge: round(benchEdge, 3),
    confidence: round(clamp((home.confidence + away.confidence) / 2, 0.1, 0.95), 3),
    drivers: [
      `star power edge ${starPowerEdge.toFixed(2)}`,
      `role depth edge ${roleDepthEdge.toFixed(2)}`,
      `shooting edge ${shootingEdge.toFixed(2)}`,
      `creation edge ${creationEdge.toFixed(2)}`,
      `rebounding edge ${reboundingEdge.toFixed(2)}`,
      `rest/travel edge ${restTravelEdge.toFixed(2)}`,
      `bench/availability edge ${benchEdge.toFixed(2)}`
    ]
  } satisfies NbaMatchupStyleGrade;
}

function marginToProbabilityDelta(margin: number) {
  // Deliberately small: roughly 1 spread point ~= 1.6 percentage points here,
  // then capped by the market-anchored winner engine.
  return clamp(margin * 0.016, -0.055, 0.055);
}

export function buildNbaTeamStrengthRosterImpact(input: NbaTeamStrengthRosterInput): NbaTeamStrengthRosterImpact {
  const players = input.playerStatProjections ?? [];
  const homePlayers = sidePlayers(players, "home");
  const awayPlayers = sidePlayers(players, "away");
  const homeRoster = homePlayers.map(playerImpact).sort((left, right) => right.totalImpactPoints - left.totalImpactPoints);
  const awayRoster = awayPlayers.map(playerImpact).sort((left, right) => right.totalImpactPoints - left.totalImpactPoints);
  const homeTeam = buildTeamGrade({ teamSide: "home", teamName: input.homeTeam, players: homePlayers, roster: homeRoster, realityIntel: input.realityIntel, projectedTotal: input.projectedTotal });
  const awayTeam = buildTeamGrade({ teamSide: "away", teamName: input.awayTeam, players: awayPlayers, roster: awayRoster, realityIntel: input.realityIntel, projectedTotal: input.projectedTotal });
  const usageRedistribution = buildUsageRedistribution(homeRoster, awayRoster);
  const matchupStyle = buildMatchupStyle(homeTeam, awayTeam);
  const neutralCourtMargin = clamp(homeTeam.overallPowerRating - awayTeam.overallPowerRating, -12, 12);
  const homeCourtAdjustment = 1.35;
  const restTravelAdjustment = clamp(homeTeam.restTravelGrade - awayTeam.restTravelGrade, -2.5, 2.5) * 0.28;
  const rosterImpactAdjustment = clamp(homeTeam.rosterImpactGrade - awayTeam.rosterImpactGrade, -5.5, 5.5) * 0.38;
  const usageRedistributionAdjustment = clamp(usageRedistribution.homeTeamImpactDelta - usageRedistribution.awayTeamImpactDelta, -5, 5) * 0.42;
  const matchupStyleAdjustment = matchupStyle.homeStyleEdge * 0.5;
  const rawMargin = neutralCourtMargin + homeCourtAdjustment + restTravelAdjustment + rosterImpactAdjustment + usageRedistributionAdjustment + matchupStyleAdjustment;
  const finalProjectedHomeMargin = clamp(input.projectedHomeMargin * 0.56 + rawMargin * 0.44, -16, 16);
  const probabilityDelta = marginToProbabilityDelta(finalProjectedHomeMargin - input.projectedHomeMargin);
  const confidence = clamp((homeTeam.confidence + awayTeam.confidence + usageRedistribution.confidence + matchupStyle.confidence) / 4, 0.1, 0.95);
  const boundedProbabilityDelta = round(clamp(probabilityDelta * confidence, -0.035, 0.035), 4);
  const blockers = [...homeTeam.blockers, ...awayTeam.blockers];
  const warnings = [...homeTeam.warnings, ...awayTeam.warnings, ...usageRedistribution.warnings];
  if (players.length < 14) warnings.push("NBA roster-impact engine has fewer than 14 projected player rows");
  if (confidence < 0.52) warnings.push("NBA roster-impact confidence below 52%");

  return {
    modelVersion: "nba-team-strength-roster-impact-v1",
    homeTeam,
    awayTeam,
    homeRoster: homeRoster.slice(0, 12),
    awayRoster: awayRoster.slice(0, 12),
    usageRedistribution,
    matchupStyle,
    neutralCourtMargin: round(neutralCourtMargin, 3),
    homeCourtAdjustment: round(homeCourtAdjustment, 3),
    restTravelAdjustment: round(restTravelAdjustment, 3),
    rosterImpactAdjustment: round(rosterImpactAdjustment, 3),
    usageRedistributionAdjustment: round(usageRedistributionAdjustment, 3),
    matchupStyleAdjustment: round(matchupStyleAdjustment, 3),
    finalProjectedHomeMargin: round(finalProjectedHomeMargin, 3),
    probabilityDelta: round(probabilityDelta, 4),
    boundedProbabilityDelta,
    confidence: round(confidence, 3),
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    drivers: [
      `neutral court margin ${neutralCourtMargin.toFixed(2)}`,
      `home court ${homeCourtAdjustment.toFixed(2)}`,
      `roster impact adjustment ${rosterImpactAdjustment.toFixed(2)}`,
      `usage redistribution adjustment ${usageRedistributionAdjustment.toFixed(2)}`,
      `matchup style adjustment ${matchupStyleAdjustment.toFixed(2)}`,
      `home stars ${homeTeam.starCount}, away stars ${awayTeam.starCount}`,
      `home creators ${homeTeam.creatorCount}, away creators ${awayTeam.creatorCount}`,
      `bounded probability delta ${(boundedProbabilityDelta * 100).toFixed(1)}%`
    ]
  };
}
