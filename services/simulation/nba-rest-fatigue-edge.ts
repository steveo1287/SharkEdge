import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
import { buildNbaPlayerRoleDepth } from "@/services/simulation/nba-player-role-depth";
import type { RealitySimIntel } from "@/services/simulation/reality-sim-engine";

export type NbaRestFatigueTeam = {
  teamName: string;
  teamSide: "home" | "away";
  playerCount: number;
  restTravelSignal: number;
  activeMinuteLoad: number;
  starMinuteBurden: number;
  creatorFatigueRisk: number;
  benchCoverage: number;
  rotationCompression: number;
  lateGameFatigueRisk: number;
  defensiveFatigueRisk: number;
  shootingLegsRisk: number;
  availabilityIndex: number;
  fatigueComposite: number;
  confidence: number;
  warnings: string[];
  drivers: string[];
};

export type NbaRestFatigueEdge = {
  modelVersion: "nba-rest-fatigue-edge-v1";
  home: NbaRestFatigueTeam;
  away: NbaRestFatigueTeam;
  homeRestEdge: number;
  homeBenchCoverageEdge: number;
  homeStarBurdenEdge: number;
  homeLateGameFatigueEdge: number;
  homeShootingLegsEdge: number;
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

function statusAvailability(status: string) {
  const text = status.toLowerCase();
  if (text.includes("out")) return 0;
  if (text.includes("doubtful")) return 0.18;
  if (text.includes("questionable")) return 0.54;
  if (text.includes("unknown")) return 0.74;
  return 1;
}

function factorValue(realityIntel: RealitySimIntel | null | undefined, patterns: RegExp[], fallback = 0) {
  const factors = realityIntel?.factors ?? [];
  for (const pattern of patterns) {
    const match = factors.find((factor) => pattern.test(factor.label));
    if (match && Number.isFinite(match.value)) return match.value;
  }
  return fallback;
}

function sidePlayers(players: NbaPlayerStatProjection[], side: "home" | "away") {
  return players.filter((player) => player.teamSide === side);
}

function buildTeam(args: {
  teamName: string;
  teamSide: "home" | "away";
  players: NbaPlayerStatProjection[];
  realityIntel?: RealitySimIntel | null;
}): NbaRestFatigueTeam {
  const rows = args.players.map((player) => ({ player, roleDepth: buildNbaPlayerRoleDepth(player), availability: statusAvailability(player.status) }));
  const totalMinutes = sum(rows.map((row) => Math.max(0, row.player.projectedMinutes)));
  const activeMinutes = sum(rows.map((row) => row.player.projectedMinutes * row.availability));
  const availabilityIndex = totalMinutes > 0 ? clamp(activeMinutes / totalMinutes, 0, 1) : 0;
  const restTravelSignal = clamp(factorValue(args.realityIntel, [/rest/i, /travel/i, /back.?to.?back/i, /fatigue/i], 0), -1, 1);
  const sortedMinutes = [...rows].sort((left, right) => right.player.projectedMinutes - left.player.projectedMinutes);
  const topFiveMinutes = sum(sortedMinutes.slice(0, 5).map((row) => row.player.projectedMinutes * row.availability));
  const topEightMinutes = sum(sortedMinutes.slice(0, 8).map((row) => row.player.projectedMinutes * row.availability));
  const rotationCount = rows.filter((row) => row.player.projectedMinutes >= 14 && row.availability > 0.5).length;
  const starMinuteLoad = sum(rows.map((row) => row.player.projectedMinutes * row.roleDepth.starScore * row.availability));
  const creatorMinuteLoad = sum(rows.map((row) => row.player.projectedMinutes * row.roleDepth.creationScore * row.availability));
  const spacingMinuteLoad = sum(rows.map((row) => row.player.projectedMinutes * row.roleDepth.spacingScore * row.availability));
  const defensiveMinuteLoad = sum(rows.map((row) => row.player.projectedMinutes * row.roleDepth.rolePlayerScore * row.availability));
  const benchMinutes = sum(rows.filter((row) => row.player.projectedMinutes < 24).map((row) => row.player.projectedMinutes * row.availability));
  const activeMinuteLoad = clamp(topEightMinutes / 240, 0, 1.25);
  const starMinuteBurden = clamp(starMinuteLoad / 82 + Math.max(0, topFiveMinutes - 170) / 80, 0, 1.45);
  const creatorFatigueRisk = clamp(creatorMinuteLoad / 150 + starMinuteBurden * 0.22 + Math.max(0, 7 - rotationCount) * 0.08, 0, 1.45);
  const benchCoverage = clamp(benchMinutes / 98 + Math.max(0, rotationCount - 7) * 0.08, 0, 1.35);
  const rotationCompression = clamp(Math.max(0, 8 - rotationCount) * 0.16 + topFiveMinutes / 190 + starMinuteBurden * 0.18 - benchCoverage * 0.16, 0, 1.45);
  const lateGameFatigueRisk = clamp(starMinuteBurden * 0.38 + creatorFatigueRisk * 0.26 + rotationCompression * 0.24 - benchCoverage * 0.16 - restTravelSignal * 0.08, 0, 1.35);
  const defensiveFatigueRisk = clamp(defensiveMinuteLoad / 180 + rotationCompression * 0.22 + lateGameFatigueRisk * 0.18 - benchCoverage * 0.1, 0, 1.35);
  const shootingLegsRisk = clamp(spacingMinuteLoad / 165 + starMinuteBurden * 0.22 + restTravelSignal * -0.08 + rotationCompression * 0.16, 0, 1.35);
  const fatigueComposite = clamp(
    lateGameFatigueRisk * 0.24 +
    starMinuteBurden * 0.18 +
    creatorFatigueRisk * 0.16 +
    defensiveFatigueRisk * 0.14 +
    shootingLegsRisk * 0.12 +
    rotationCompression * 0.14 -
    benchCoverage * 0.16 -
    restTravelSignal * 0.1,
    0,
    1.55
  );
  const confidence = clamp(average(rows.map((row) => row.player.confidence * row.roleDepth.roleConfidence * row.availability)) * (args.players.length >= 7 ? 1 : 0.76), 0.08, 0.95);
  const warnings: string[] = [];
  if (args.players.length < 7) warnings.push(`${args.teamName} rest/fatigue model has fewer than 7 player rows`);
  if (availabilityIndex < 0.82) warnings.push(`${args.teamName} rest/fatigue active minute share below 82%`);
  if (confidence < 0.52) warnings.push(`${args.teamName} rest/fatigue confidence below 52%`);
  if (lateGameFatigueRisk > 0.95) warnings.push(`${args.teamName} late-game fatigue risk is elevated`);

  return {
    teamName: args.teamName,
    teamSide: args.teamSide,
    playerCount: args.players.length,
    restTravelSignal: round(restTravelSignal),
    activeMinuteLoad: round(activeMinuteLoad),
    starMinuteBurden: round(starMinuteBurden),
    creatorFatigueRisk: round(creatorFatigueRisk),
    benchCoverage: round(benchCoverage),
    rotationCompression: round(rotationCompression),
    lateGameFatigueRisk: round(lateGameFatigueRisk),
    defensiveFatigueRisk: round(defensiveFatigueRisk),
    shootingLegsRisk: round(shootingLegsRisk),
    availabilityIndex: round(availabilityIndex),
    fatigueComposite: round(fatigueComposite),
    confidence: round(confidence),
    warnings,
    drivers: [
      `rest/travel signal ${restTravelSignal.toFixed(2)}`,
      `active minute load ${(activeMinuteLoad * 100).toFixed(1)}%`,
      `star burden ${(starMinuteBurden * 100).toFixed(1)}%`,
      `creator fatigue ${(creatorFatigueRisk * 100).toFixed(1)}%`,
      `bench coverage ${(benchCoverage * 100).toFixed(1)}%`,
      `rotation compression ${(rotationCompression * 100).toFixed(1)}%`,
      `late fatigue ${(lateGameFatigueRisk * 100).toFixed(1)}%`,
      `def fatigue ${(defensiveFatigueRisk * 100).toFixed(1)}%`,
      `shooting legs risk ${(shootingLegsRisk * 100).toFixed(1)}%`,
      `availability ${(availabilityIndex * 100).toFixed(1)}%`
    ]
  };
}

function edge(home: number, away: number, divisor: number) {
  return clamp((home - away) / divisor, -1, 1);
}

export function buildNbaRestFatigueEdge(args: {
  homeTeam: string;
  awayTeam: string;
  projectedHomeMargin: number;
  realityIntel?: RealitySimIntel | null;
  playerStatProjections: NbaPlayerStatProjection[];
}): NbaRestFatigueEdge {
  const home = buildTeam({
    teamName: args.homeTeam,
    teamSide: "home",
    players: sidePlayers(args.playerStatProjections, "home"),
    realityIntel: args.realityIntel
  });
  const away = buildTeam({
    teamName: args.awayTeam,
    teamSide: "away",
    players: sidePlayers(args.playerStatProjections, "away"),
    realityIntel: args.realityIntel
  });
  const closeSpreadScale = Math.abs(args.projectedHomeMargin) <= 5 ? 1 : Math.abs(args.projectedHomeMargin) <= 9 ? 0.7 : 0.38;
  const homeRestEdge = edge(home.restTravelSignal, away.restTravelSignal, 0.8);
  const homeBenchCoverageEdge = edge(home.benchCoverage, away.benchCoverage, 0.45);
  const homeStarBurdenEdge = edge(away.starMinuteBurden, home.starMinuteBurden, 0.52);
  const homeLateGameFatigueEdge = edge(away.lateGameFatigueRisk, home.lateGameFatigueRisk, 0.55);
  const homeShootingLegsEdge = edge(away.shootingLegsRisk, home.shootingLegsRisk, 0.55);
  const confidence = clamp((home.confidence + away.confidence) / 2 * (args.playerStatProjections.length >= 14 ? 1 : 0.78), 0.08, 0.95);
  const rawMarginDelta =
    homeRestEdge * 0.44 +
    homeBenchCoverageEdge * 0.42 +
    homeStarBurdenEdge * 0.58 +
    homeLateGameFatigueEdge * 0.72 * closeSpreadScale +
    homeShootingLegsEdge * 0.34;
  const marginDelta = clamp(rawMarginDelta * confidence, -2.2, 2.2);
  const totalDelta = clamp((away.shootingLegsRisk + home.shootingLegsRisk - home.benchCoverage - away.benchCoverage) * -2.2 * confidence, -5.5, 5.5);
  const probabilityDelta = clamp(marginDelta * 0.011, -0.0175, 0.0175);
  const warnings = [...home.warnings, ...away.warnings];

  return {
    modelVersion: "nba-rest-fatigue-edge-v1",
    home,
    away,
    homeRestEdge: round(homeRestEdge),
    homeBenchCoverageEdge: round(homeBenchCoverageEdge),
    homeStarBurdenEdge: round(homeStarBurdenEdge),
    homeLateGameFatigueEdge: round(homeLateGameFatigueEdge),
    homeShootingLegsEdge: round(homeShootingLegsEdge),
    marginDelta: round(marginDelta),
    totalDelta: round(totalDelta),
    probabilityDelta: round(probabilityDelta),
    confidence: round(confidence),
    warnings: [...new Set(warnings)],
    drivers: [
      `rest edge ${(homeRestEdge * 100).toFixed(1)}%`,
      `bench coverage edge ${(homeBenchCoverageEdge * 100).toFixed(1)}%`,
      `star burden edge ${(homeStarBurdenEdge * 100).toFixed(1)}%`,
      `late fatigue edge ${(homeLateGameFatigueEdge * 100).toFixed(1)}%`,
      `shooting legs edge ${(homeShootingLegsEdge * 100).toFixed(1)}%`,
      `rest/fatigue margin delta ${marginDelta.toFixed(2)}`,
      `rest/fatigue total delta ${totalDelta.toFixed(2)}`,
      `rest/fatigue probability delta ${(probabilityDelta * 100).toFixed(1)}%`,
      ...home.drivers.map((driver) => `home fatigue: ${driver}`),
      ...away.drivers.map((driver) => `away fatigue: ${driver}`)
    ]
  };
}
