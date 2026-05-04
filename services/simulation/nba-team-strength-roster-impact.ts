import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
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
  overallPowerRating: number;
  confidence: number;
  playerCount: number;
  activeMinuteShare: number;
  blockers: string[];
  warnings: string[];
  drivers: string[];
};

export type NbaRosterImpactPlayer = {
  playerName: string;
  teamName: string;
  teamSide: "home" | "away";
  projectedMinutes: number;
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

function safe(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function playerImpact(player: NbaPlayerStatProjection): NbaRosterImpactPlayer {
  const minutes = clamp(player.projectedMinutes, 0, 42);
  const minuteShare = minutes / 36;
  const availability = statusAvailability(player.status);
  const pointsPer36 = minutes > 0 ? player.projectedPoints / minutes * 36 : 0;
  const reboundsPer36 = minutes > 0 ? player.projectedRebounds / minutes * 36 : 0;
  const assistsPer36 = minutes > 0 ? player.projectedAssists / minutes * 36 : 0;
  const threesPer36 = minutes > 0 ? player.projectedThrees / minutes * 36 : 0;
  const confidence = clamp(player.confidence * availability, 0.05, 0.95);

  const offensiveImpact = clamp((pointsPer36 - 13.5) * 0.11 * minuteShare, -2.2, 3.4);
  const creationImpact = clamp((assistsPer36 - 3.0) * 0.18 * minuteShare, -1.6, 2.6);
  const reboundingImpact = clamp((reboundsPer36 - 5.3) * 0.11 * minuteShare, -1.5, 2.0);
  const spacingImpact = clamp((threesPer36 - 1.5) * 0.16 * minuteShare, -1.2, 1.8);
  const turnoverImpact = clamp(-(Math.max(0, assistsPer36 - 7.5) * 0.04 + Math.max(0, pointsPer36 - 27) * 0.025) * minuteShare, -0.9, 0.15);
  const defensiveProxy = clamp((reboundingImpact * 0.25) + (spacingImpact < -0.4 ? -0.1 : 0.05) + (minutes >= 30 ? 0.08 : 0), -0.7, 0.7);
  const availabilityPenalty = clamp((1 - availability) * (minutes / 36) * 2.8, 0, 2.8);
  const totalImpactPoints = clamp(
    (offensiveImpact + creationImpact + reboundingImpact + spacingImpact + turnoverImpact + defensiveProxy) * confidence - availabilityPenalty,
    -4.5,
    5.5
  );

  return {
    playerName: player.playerName,
    teamName: player.teamName,
    teamSide: player.teamSide,
    projectedMinutes: round(minutes, 1),
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
  const offensiveGrade = clamp((points - expectedTeamPoints) * 0.18 + offenseContext * 0.35, -5, 5);
  const creationGrade = clamp((assists - 24) * 0.12 + offenseContext * 0.16, -4, 4);
  const shootingGrade = clamp((threes - 12.2) * 0.18 + (points - expectedTeamPoints) * 0.04, -4, 4);
  const reboundingGrade = clamp((rebounds - 43) * 0.1 + defenseContext * 0.12, -4, 4);
  const spacingGrade = clamp((threes - 12.2) * 0.12 + creationGrade * 0.18, -3.5, 3.5);
  const defensiveGrade = clamp(reboundingGrade * 0.32 + defenseContext * 0.42 + avgConfidence * 0.35, -4, 4);
  const paceGrade = clamp(paceContext * 0.3 + ((args.projectedTotal ?? 224) - 224) * 0.02, -3, 3);
  const turnoverGrade = clamp(creationGrade * 0.15 - Math.max(0, assists - 31) * 0.05, -2.5, 2.5);
  const recentFormGrade = clamp(formContext * 0.4, -3, 3);
  const restTravelGrade = clamp(restContext * 0.45, -3, 3);
  const rosterImpactGrade = clamp(sum(args.roster.map((player) => player.totalImpactPoints)) / 2.7, -6, 6);
  const activeMinuteShare = totalMinutes > 0 ? activeMinutes / totalMinutes : 0;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (args.players.length < 7) blockers.push(`${args.teamName} roster projection has fewer than 7 players`);
  if (activeMinuteShare < 0.82) warnings.push(`${args.teamName} projected active minute share below 82%`);
  if (avgConfidence < 0.52) warnings.push(`${args.teamName} roster confidence below 52%`);
  const overallPowerRating = clamp(
    offensiveGrade * 0.2 + defensiveGrade * 0.18 + creationGrade * 0.13 + shootingGrade * 0.13 + reboundingGrade * 0.1 + spacingGrade * 0.08 + recentFormGrade * 0.09 + restTravelGrade * 0.09 + rosterImpactGrade * 0.28,
    -8,
    8
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
    overallPowerRating: round(overallPowerRating, 3),
    confidence: round(clamp(avgConfidence * activeMinuteShare, 0.1, 0.95), 3),
    playerCount: args.players.length,
    activeMinuteShare: round(activeMinuteShare, 3),
    blockers,
    warnings,
    drivers: [
      `${points.toFixed(1)} projected team points`,
      `${rebounds.toFixed(1)} projected rebounds`,
      `${assists.toFixed(1)} projected assists`,
      `${threes.toFixed(1)} projected threes`,
      `roster impact ${rosterImpactGrade.toFixed(2)}`,
      `active minute share ${(activeMinuteShare * 100).toFixed(1)}%`
    ]
  } satisfies NbaTeamStrengthGrade;
}

function buildUsageRedistribution(homePlayers: NbaPlayerStatProjection[], awayPlayers: NbaPlayerStatProjection[]) {
  function side(players: NbaPlayerStatProjection[]) {
    const missingMinutes = sum(players.map((player) => Math.max(0, player.projectedMinutes) * (1 - statusAvailability(player.status))));
    const benchMinutes = sum(players.filter((player) => player.projectedMinutes < 20).map((player) => Math.max(0, player.projectedMinutes)));
    const topUsageMinutes = sum(players.filter((player) => player.projectedPoints >= 18 || player.projectedAssists >= 6).map((player) => player.projectedMinutes));
    const efficiencyPenalty = clamp(missingMinutes * 0.035 + Math.max(0, 65 - benchMinutes) * 0.008, 0, 3.2);
    const benchDepthPenalty = clamp(Math.max(0, 55 - benchMinutes) * 0.025, 0, 2.2);
    const teamImpactDelta = clamp(topUsageMinutes * 0.012 - efficiencyPenalty - benchDepthPenalty, -4.5, 2.5);
    return { missingMinutes, efficiencyPenalty, benchDepthPenalty, teamImpactDelta };
  }
  const home = side(homePlayers);
  const away = side(awayPlayers);
  const warnings: string[] = [];
  if (home.missingMinutes > 18) warnings.push("home side has major projected missing minutes");
  if (away.missingMinutes > 18) warnings.push("away side has major projected missing minutes");
  return {
    homeMissingMinutes: round(home.missingMinutes, 1),
    awayMissingMinutes: round(away.missingMinutes, 1),
    homeEfficiencyPenalty: round(home.efficiencyPenalty, 3),
    awayEfficiencyPenalty: round(away.efficiencyPenalty, 3),
    homeBenchDepthPenalty: round(home.benchDepthPenalty, 3),
    awayBenchDepthPenalty: round(away.benchDepthPenalty, 3),
    homeTeamImpactDelta: round(home.teamImpactDelta, 3),
    awayTeamImpactDelta: round(away.teamImpactDelta, 3),
    confidence: round(clamp(1 - (home.missingMinutes + away.missingMinutes) / 110, 0.2, 0.95), 3),
    warnings,
    drivers: [
      `home missing minutes ${home.missingMinutes.toFixed(1)}`,
      `away missing minutes ${away.missingMinutes.toFixed(1)}`,
      `home bench penalty ${home.benchDepthPenalty.toFixed(2)}`,
      `away bench penalty ${away.benchDepthPenalty.toFixed(2)}`
    ]
  } satisfies NbaUsageRedistributionGrade;
}

function buildMatchupStyle(home: NbaTeamStrengthGrade, away: NbaTeamStrengthGrade) {
  const paceEdge = clamp(home.paceGrade - away.paceGrade, -3, 3);
  const shootingEdge = clamp(home.shootingGrade - away.shootingGrade, -4, 4);
  const creationEdge = clamp(home.creationGrade - away.creationGrade, -4, 4);
  const reboundingEdge = clamp(home.reboundingGrade - away.reboundingGrade, -4, 4);
  const spacingEdge = clamp(home.spacingGrade - away.spacingGrade, -3.5, 3.5);
  const restTravelEdge = clamp(home.restTravelGrade - away.restTravelGrade, -4, 4);
  const benchEdge = clamp(home.activeMinuteShare - away.activeMinuteShare, -0.25, 0.25) * 7;
  const homeStyleEdge = clamp(paceEdge * 0.08 + shootingEdge * 0.16 + creationEdge * 0.15 + reboundingEdge * 0.12 + spacingEdge * 0.11 + restTravelEdge * 0.14 + benchEdge * 0.12, -4.5, 4.5);
  return {
    homeStyleEdge: round(homeStyleEdge, 3),
    paceEdge: round(paceEdge, 3),
    shootingEdge: round(shootingEdge, 3),
    creationEdge: round(creationEdge, 3),
    reboundingEdge: round(reboundingEdge, 3),
    spacingEdge: round(spacingEdge, 3),
    restTravelEdge: round(restTravelEdge, 3),
    benchEdge: round(benchEdge, 3),
    confidence: round(clamp((home.confidence + away.confidence) / 2, 0.1, 0.95), 3),
    drivers: [
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
  const usageRedistribution = buildUsageRedistribution(homePlayers, awayPlayers);
  const matchupStyle = buildMatchupStyle(homeTeam, awayTeam);
  const neutralCourtMargin = clamp(homeTeam.overallPowerRating - awayTeam.overallPowerRating, -11, 11);
  const homeCourtAdjustment = 1.35;
  const restTravelAdjustment = clamp(homeTeam.restTravelGrade - awayTeam.restTravelGrade, -2.5, 2.5) * 0.28;
  const rosterImpactAdjustment = clamp(homeTeam.rosterImpactGrade - awayTeam.rosterImpactGrade, -5, 5) * 0.38;
  const usageRedistributionAdjustment = clamp(usageRedistribution.homeTeamImpactDelta - usageRedistribution.awayTeamImpactDelta, -4, 4) * 0.42;
  const matchupStyleAdjustment = matchupStyle.homeStyleEdge * 0.5;
  const rawMargin = neutralCourtMargin + homeCourtAdjustment + restTravelAdjustment + rosterImpactAdjustment + usageRedistributionAdjustment + matchupStyleAdjustment;
  const finalProjectedHomeMargin = clamp(input.projectedHomeMargin * 0.58 + rawMargin * 0.42, -16, 16);
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
      `bounded probability delta ${(boundedProbabilityDelta * 100).toFixed(1)}%`
    ]
  };
}
