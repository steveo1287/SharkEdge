import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
import { buildNbaPlayerRoleDepth, type NbaPlayerRoleDepth } from "@/services/simulation/nba-player-role-depth";

export type NbaRankingCategory =
  | "points"
  | "rebounds"
  | "assists"
  | "threes"
  | "pra"
  | "minutes"
  | "usage"
  | "starPower"
  | "creation"
  | "spacing"
  | "rebounding"
  | "availabilityRisk"
  | "closingLineup"
  | "roleDepth"
  | "overall";

export type NbaRankSide = "HOME" | "AWAY" | "NEUTRAL";

export type NbaPlayerCategoryRanking = {
  category: NbaRankingCategory;
  rawValue: number;
  per36Value: number | null;
  rawRank: number;
  perMinuteRank: number | null;
  teamRelativeRank: number;
  matchupPercentile: number;
  teamShare: number;
  roleAdjustedScore: number;
  confidenceAdjustedScore: number;
};

export type NbaRankedPlayer = {
  playerName: string;
  teamName: string;
  teamSide: "home" | "away";
  roleDepth: NbaPlayerRoleDepth;
  projectedMinutes: number;
  overallScore: number;
  teamUsageShare: number;
  teamMinuteShare: number;
  teamStarShare: number;
  rawOverallRank: number;
  teamOverallRank: number;
  matchupPercentile: number;
  categories: NbaPlayerCategoryRanking[];
  drivers: string[];
};

export type NbaTeamCategoryRanking = {
  category: NbaRankingCategory;
  rawValue: number;
  matchupRank: number;
  matchupPercentile: number;
  categoryScore: number;
  confidenceAdjustedScore: number;
};

export type NbaRankedTeam = {
  teamName: string;
  teamSide: "home" | "away";
  overallScore: number;
  offenseScore: number;
  rosterScore: number;
  starPowerScore: number;
  roleDepthScore: number;
  creationScore: number;
  spacingScore: number;
  reboundingScore: number;
  availabilityScore: number;
  closingLineupScore: number;
  depthScore: number;
  confidence: number;
  categories: NbaTeamCategoryRanking[];
  drivers: string[];
};

export type NbaMatchupRankingEdge = {
  category: NbaRankingCategory;
  homeValue: number;
  awayValue: number;
  homePercentile: number;
  awayPercentile: number;
  edge: number;
  confidence: number;
  winner: NbaRankSide;
};

export type NbaPlayerTeamRankingSnapshot = {
  modelVersion: "nba-player-team-rankings-v1";
  homeTeam: string;
  awayTeam: string;
  players: NbaRankedPlayer[];
  home: NbaRankedTeam;
  away: NbaRankedTeam;
  matchupEdges: NbaMatchupRankingEdge[];
  homeCompositeEdge: number;
  boundedProbabilityDelta: number;
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
  if (normalized.includes("doubtful")) return 0.2;
  if (normalized.includes("questionable")) return 0.55;
  if (normalized.includes("unknown")) return 0.75;
  return 1;
}

function percentileFromRank(rank: number, total: number) {
  if (total <= 1) return 1;
  return clamp((total - rank) / (total - 1), 0, 1);
}

function denseRank<T>(rows: T[], selector: (row: T) => number, target: T) {
  const sortedValues = [...new Set(rows.map(selector).filter(Number.isFinite).sort((left, right) => right - left))];
  const value = selector(target);
  const index = sortedValues.findIndex((candidate) => candidate === value);
  return index >= 0 ? index + 1 : sortedValues.length + 1;
}

function categoryRawValue(player: NbaPlayerStatProjection, roleDepth: NbaPlayerRoleDepth, category: NbaRankingCategory) {
  const pra = player.projectedPoints + player.projectedRebounds + player.projectedAssists;
  switch (category) {
    case "points": return player.projectedPoints;
    case "rebounds": return player.projectedRebounds;
    case "assists": return player.projectedAssists;
    case "threes": return player.projectedThrees;
    case "pra": return pra;
    case "minutes": return player.projectedMinutes;
    case "usage": return roleDepth.possessionLoadScore;
    case "starPower": return roleDepth.starScore;
    case "creation": return roleDepth.creationScore;
    case "spacing": return roleDepth.spacingScore;
    case "rebounding": return roleDepth.reboundingScore;
    case "availabilityRisk": return 1 - roleDepth.availabilityScore;
    case "closingLineup": return roleDepth.closingLineupScore;
    case "roleDepth": return roleDepth.rolePlayerScore;
    case "overall": return playerOverallScore(player, roleDepth);
  }
}

function categoryPer36Value(player: NbaPlayerStatProjection, roleDepth: NbaPlayerRoleDepth, category: NbaRankingCategory) {
  const minutes = player.projectedMinutes;
  if (minutes <= 0) return null;
  switch (category) {
    case "points": return player.projectedPoints / minutes * 36;
    case "rebounds": return player.projectedRebounds / minutes * 36;
    case "assists": return player.projectedAssists / minutes * 36;
    case "threes": return player.projectedThrees / minutes * 36;
    case "pra": return (player.projectedPoints + player.projectedRebounds + player.projectedAssists) / minutes * 36;
    case "minutes": return minutes;
    case "overall": return playerOverallScore(player, roleDepth);
    default: return categoryRawValue(player, roleDepth, category);
  }
}

function roleMultiplier(roleDepth: NbaPlayerRoleDepth) {
  switch (roleDepth.roleTier) {
    case "SUPERSTAR": return 1.22;
    case "STAR": return 1.16;
    case "PRIMARY_CREATOR": return 1.12;
    case "STARTER": return 1.06;
    case "SIXTH_MAN": return 1.03;
    case "ROTATION": return 0.96;
    case "LOW_MIN_BENCH": return 0.78;
    case "FRINGE": return 0.58;
    case "OUT": return 0.18;
  }
}

function playerOverallScore(player: NbaPlayerStatProjection, roleDepth: NbaPlayerRoleDepth) {
  const minutesWeight = clamp(player.projectedMinutes / 36, 0, 1.2);
  const statusWeight = statusAvailability(player.status);
  const score = (
    roleDepth.starScore * 0.27 +
    roleDepth.possessionLoadScore * 0.17 +
    roleDepth.creationScore * 0.14 +
    roleDepth.scoringScore * 0.13 +
    roleDepth.rolePlayerScore * 0.1 +
    roleDepth.spacingScore * 0.07 +
    roleDepth.reboundingScore * 0.07 +
    roleDepth.closingLineupScore * 0.05
  ) * minutesWeight * statusWeight * roleMultiplier(roleDepth);
  return clamp(score, 0, 1.5);
}

function teamShare(value: number, total: number) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return clamp(value / total, 0, 1);
}

function buildPlayerCategoryRanking(args: {
  player: NbaPlayerStatProjection;
  roleDepth: NbaPlayerRoleDepth;
  allPlayers: Array<{ player: NbaPlayerStatProjection; roleDepth: NbaPlayerRoleDepth }>;
  teamPlayers: Array<{ player: NbaPlayerStatProjection; roleDepth: NbaPlayerRoleDepth }>;
  category: NbaRankingCategory;
}) {
  const rawValue = categoryRawValue(args.player, args.roleDepth, args.category);
  const per36Value = categoryPer36Value(args.player, args.roleDepth, args.category);
  const rawRank = denseRank(args.allPlayers, (row) => categoryRawValue(row.player, row.roleDepth, args.category), { player: args.player, roleDepth: args.roleDepth });
  const perMinuteRank = per36Value == null ? null : denseRank(args.allPlayers, (row) => categoryPer36Value(row.player, row.roleDepth, args.category) ?? -Infinity, { player: args.player, roleDepth: args.roleDepth });
  const teamRelativeRank = denseRank(args.teamPlayers, (row) => categoryRawValue(row.player, row.roleDepth, args.category), { player: args.player, roleDepth: args.roleDepth });
  const categoryTotal = sum(args.teamPlayers.map((row) => Math.max(0, categoryRawValue(row.player, row.roleDepth, args.category))));
  const matchupPercentile = percentileFromRank(rawRank, args.allPlayers.length);
  const roleAdjustedScore = clamp((rawValue * 0.55 + (per36Value ?? rawValue) * 0.25) * roleMultiplier(args.roleDepth), 0, 999);
  const confidenceAdjustedScore = roleAdjustedScore * args.player.confidence * args.roleDepth.availabilityScore;
  return {
    category: args.category,
    rawValue: round(rawValue, 3),
    per36Value: per36Value == null ? null : round(per36Value, 3),
    rawRank,
    perMinuteRank,
    teamRelativeRank,
    matchupPercentile: round(matchupPercentile, 4),
    teamShare: round(teamShare(Math.max(0, rawValue), categoryTotal), 4),
    roleAdjustedScore: round(roleAdjustedScore, 4),
    confidenceAdjustedScore: round(confidenceAdjustedScore, 4)
  } satisfies NbaPlayerCategoryRanking;
}

const PLAYER_CATEGORIES: NbaRankingCategory[] = [
  "points",
  "rebounds",
  "assists",
  "threes",
  "pra",
  "minutes",
  "usage",
  "starPower",
  "creation",
  "spacing",
  "rebounding",
  "availabilityRisk",
  "closingLineup",
  "roleDepth",
  "overall"
];

function buildRankedPlayers(players: NbaPlayerStatProjection[]) {
  const prepared = players.map((player) => ({ player, roleDepth: buildNbaPlayerRoleDepth(player) }));
  const overallTotalByTeam = new Map<string, number>();
  const usageTotalByTeam = new Map<string, number>();
  const minuteTotalByTeam = new Map<string, number>();
  const starTotalByTeam = new Map<string, number>();
  for (const row of prepared) {
    const key = `${row.player.teamSide}:${row.player.teamName}`;
    overallTotalByTeam.set(key, (overallTotalByTeam.get(key) ?? 0) + playerOverallScore(row.player, row.roleDepth));
    usageTotalByTeam.set(key, (usageTotalByTeam.get(key) ?? 0) + row.roleDepth.possessionLoadScore);
    minuteTotalByTeam.set(key, (minuteTotalByTeam.get(key) ?? 0) + row.player.projectedMinutes);
    starTotalByTeam.set(key, (starTotalByTeam.get(key) ?? 0) + row.roleDepth.starScore);
  }

  return prepared.map((row) => {
    const teamRows = prepared.filter((candidate) => candidate.player.teamSide === row.player.teamSide && candidate.player.teamName === row.player.teamName);
    const teamKey = `${row.player.teamSide}:${row.player.teamName}`;
    const overallScore = playerOverallScore(row.player, row.roleDepth);
    const rawOverallRank = denseRank(prepared, (candidate) => playerOverallScore(candidate.player, candidate.roleDepth), row);
    const teamOverallRank = denseRank(teamRows, (candidate) => playerOverallScore(candidate.player, candidate.roleDepth), row);
    return {
      playerName: row.player.playerName,
      teamName: row.player.teamName,
      teamSide: row.player.teamSide,
      roleDepth: row.roleDepth,
      projectedMinutes: round(row.player.projectedMinutes, 1),
      overallScore: round(overallScore, 4),
      teamUsageShare: round(teamShare(row.roleDepth.possessionLoadScore, usageTotalByTeam.get(teamKey) ?? 0), 4),
      teamMinuteShare: round(teamShare(row.player.projectedMinutes, minuteTotalByTeam.get(teamKey) ?? 0), 4),
      teamStarShare: round(teamShare(row.roleDepth.starScore, starTotalByTeam.get(teamKey) ?? 0), 4),
      rawOverallRank,
      teamOverallRank,
      matchupPercentile: round(percentileFromRank(rawOverallRank, prepared.length), 4),
      categories: PLAYER_CATEGORIES.map((category) => buildPlayerCategoryRanking({ player: row.player, roleDepth: row.roleDepth, allPlayers: prepared, teamPlayers: teamRows, category })),
      drivers: [
        `overall rank ${rawOverallRank}/${prepared.length}`,
        `team rank ${teamOverallRank}/${teamRows.length}`,
        `role ${row.roleDepth.roleTier}`,
        `usage ${row.roleDepth.usageTier}`,
        `star share ${(teamShare(row.roleDepth.starScore, starTotalByTeam.get(teamKey) ?? 0) * 100).toFixed(1)}%`,
        `minute share ${(teamShare(row.player.projectedMinutes, minuteTotalByTeam.get(teamKey) ?? 0) * 100).toFixed(1)}%`
      ]
    } satisfies NbaRankedPlayer;
  }).sort((left, right) => right.overallScore - left.overallScore);
}

function teamCategoryValue(teamPlayers: NbaRankedPlayer[], category: NbaRankingCategory) {
  switch (category) {
    case "points": return sum(teamPlayers.map((player) => player.categories.find((row) => row.category === "points")?.rawValue ?? 0));
    case "rebounds": return sum(teamPlayers.map((player) => player.categories.find((row) => row.category === "rebounds")?.rawValue ?? 0));
    case "assists": return sum(teamPlayers.map((player) => player.categories.find((row) => row.category === "assists")?.rawValue ?? 0));
    case "threes": return sum(teamPlayers.map((player) => player.categories.find((row) => row.category === "threes")?.rawValue ?? 0));
    case "pra": return sum(teamPlayers.map((player) => player.categories.find((row) => row.category === "pra")?.rawValue ?? 0));
    case "minutes": return sum(teamPlayers.map((player) => player.projectedMinutes));
    case "usage": return sum(teamPlayers.map((player) => player.roleDepth.possessionLoadScore * player.teamMinuteShare));
    case "starPower": return sum(teamPlayers.map((player) => player.roleDepth.starScore * player.roleDepth.closingLineupScore));
    case "creation": return average(teamPlayers.map((player) => player.roleDepth.creationScore * Math.min(1, player.projectedMinutes / 30)));
    case "spacing": return average(teamPlayers.map((player) => player.roleDepth.spacingScore * Math.min(1, player.projectedMinutes / 28)));
    case "rebounding": return average(teamPlayers.map((player) => player.roleDepth.reboundingScore * Math.min(1, player.projectedMinutes / 28)));
    case "availabilityRisk": return average(teamPlayers.map((player) => player.roleDepth.replacementRisk));
    case "closingLineup": return sum(teamPlayers.slice(0, 7).map((player) => player.roleDepth.closingLineupScore));
    case "roleDepth": return average(teamPlayers.map((player) => player.roleDepth.rolePlayerScore * Math.min(1, player.projectedMinutes / 24)));
    case "overall": return sum(teamPlayers.map((player) => player.overallScore));
  }
}

function buildTeam(args: { teamName: string; teamSide: "home" | "away"; players: NbaRankedPlayer[]; opponent: NbaRankedPlayer[] }) {
  const categories = PLAYER_CATEGORIES.map((category) => {
    const rawValue = teamCategoryValue(args.players, category);
    const opponentValue = teamCategoryValue(args.opponent, category);
    const higherIsBetter = category !== "availabilityRisk";
    const matchupRank = higherIsBetter ? (rawValue >= opponentValue ? 1 : 2) : (rawValue <= opponentValue ? 1 : 2);
    const matchupPercentile = matchupRank === 1 ? 1 : 0;
    const normalizedEdge = higherIsBetter
      ? clamp((rawValue - opponentValue) / (Math.abs(opponentValue) + 1), -1, 1)
      : clamp((opponentValue - rawValue) / (Math.abs(opponentValue) + 1), -1, 1);
    const categoryScore = clamp(0.5 + normalizedEdge * 0.5, 0, 1);
    const confidenceAdjustedScore = categoryScore * average(args.players.map((player) => player.roleDepth.roleConfidence));
    return {
      category,
      rawValue: round(rawValue, 4),
      matchupRank,
      matchupPercentile,
      categoryScore: round(categoryScore, 4),
      confidenceAdjustedScore: round(confidenceAdjustedScore, 4)
    } satisfies NbaTeamCategoryRanking;
  });
  const get = (category: NbaRankingCategory) => categories.find((row) => row.category === category)?.categoryScore ?? 0.5;
  const offenseScore = average([get("points"), get("assists"), get("threes"), get("pra")]);
  const rosterScore = get("overall");
  const starPowerScore = get("starPower");
  const roleDepthScore = get("roleDepth");
  const creationScore = get("creation");
  const spacingScore = get("spacing");
  const reboundingScore = get("rebounding");
  const availabilityScore = get("availabilityRisk");
  const closingLineupScore = get("closingLineup");
  const depthScore = average([roleDepthScore, closingLineupScore, availabilityScore]);
  const confidence = clamp(average(args.players.map((player) => player.roleDepth.roleConfidence)) * (args.players.length >= 7 ? 1 : 0.78), 0.1, 0.95);
  const overallScore = clamp(
    offenseScore * 0.16 + rosterScore * 0.18 + starPowerScore * 0.18 + creationScore * 0.12 + spacingScore * 0.08 + reboundingScore * 0.08 + roleDepthScore * 0.09 + closingLineupScore * 0.07 + availabilityScore * 0.04,
    0,
    1
  );
  return {
    teamName: args.teamName,
    teamSide: args.teamSide,
    overallScore: round(overallScore, 4),
    offenseScore: round(offenseScore, 4),
    rosterScore: round(rosterScore, 4),
    starPowerScore: round(starPowerScore, 4),
    roleDepthScore: round(roleDepthScore, 4),
    creationScore: round(creationScore, 4),
    spacingScore: round(spacingScore, 4),
    reboundingScore: round(reboundingScore, 4),
    availabilityScore: round(availabilityScore, 4),
    closingLineupScore: round(closingLineupScore, 4),
    depthScore: round(depthScore, 4),
    confidence: round(confidence, 4),
    categories,
    drivers: [
      `overall ${(overallScore * 100).toFixed(1)}%`,
      `star power ${(starPowerScore * 100).toFixed(1)}%`,
      `creation ${(creationScore * 100).toFixed(1)}%`,
      `closing lineup ${(closingLineupScore * 100).toFixed(1)}%`,
      `availability ${(availabilityScore * 100).toFixed(1)}%`
    ]
  } satisfies NbaRankedTeam;
}

function buildEdges(home: NbaRankedTeam, away: NbaRankedTeam) {
  return PLAYER_CATEGORIES.map((category) => {
    const homeCategory = home.categories.find((row) => row.category === category)!;
    const awayCategory = away.categories.find((row) => row.category === category)!;
    const higherIsBetter = category !== "availabilityRisk";
    const rawEdge = higherIsBetter
      ? homeCategory.categoryScore - awayCategory.categoryScore
      : awayCategory.categoryScore - homeCategory.categoryScore;
    const edge = clamp(rawEdge, -1, 1);
    return {
      category,
      homeValue: homeCategory.rawValue,
      awayValue: awayCategory.rawValue,
      homePercentile: homeCategory.matchupPercentile,
      awayPercentile: awayCategory.matchupPercentile,
      edge: round(edge, 4),
      confidence: round((home.confidence + away.confidence) / 2, 4),
      winner: Math.abs(edge) < 0.04 ? "NEUTRAL" : edge > 0 ? "HOME" : "AWAY"
    } satisfies NbaMatchupRankingEdge;
  });
}

export function buildNbaPlayerTeamRankingSnapshot(args: {
  homeTeam: string;
  awayTeam: string;
  playerStatProjections: NbaPlayerStatProjection[];
}): NbaPlayerTeamRankingSnapshot {
  const players = buildRankedPlayers(args.playerStatProjections);
  const homePlayers = players.filter((player) => player.teamSide === "home");
  const awayPlayers = players.filter((player) => player.teamSide === "away");
  const warnings: string[] = [];
  if (homePlayers.length < 7) warnings.push("home team has fewer than 7 ranked players");
  if (awayPlayers.length < 7) warnings.push("away team has fewer than 7 ranked players");
  const home = buildTeam({ teamName: args.homeTeam, teamSide: "home", players: homePlayers, opponent: awayPlayers });
  const away = buildTeam({ teamName: args.awayTeam, teamSide: "away", players: awayPlayers, opponent: homePlayers });
  const matchupEdges = buildEdges(home, away);
  const keyEdges = matchupEdges.filter((edge) => ["overall", "starPower", "creation", "closingLineup", "availabilityRisk", "roleDepth", "spacing", "rebounding"].includes(edge.category));
  const homeCompositeEdge = clamp(
    (home.overallScore - away.overallScore) * 0.42 +
    (home.starPowerScore - away.starPowerScore) * 0.2 +
    (home.creationScore - away.creationScore) * 0.12 +
    (home.closingLineupScore - away.closingLineupScore) * 0.1 +
    (home.availabilityScore - away.availabilityScore) * 0.1 +
    (home.roleDepthScore - away.roleDepthScore) * 0.06,
    -1,
    1
  );
  const confidence = clamp((home.confidence + away.confidence) / 2 * (warnings.length ? 0.82 : 1), 0.1, 0.95);
  const boundedProbabilityDelta = round(clamp(homeCompositeEdge * 0.015 * confidence, -0.012, 0.012), 4);
  return {
    modelVersion: "nba-player-team-rankings-v1",
    homeTeam: args.homeTeam,
    awayTeam: args.awayTeam,
    players,
    home,
    away,
    matchupEdges,
    homeCompositeEdge: round(homeCompositeEdge, 4),
    boundedProbabilityDelta,
    confidence: round(confidence, 4),
    warnings,
    drivers: [
      `home overall ${(home.overallScore * 100).toFixed(1)}% vs away ${(away.overallScore * 100).toFixed(1)}%`,
      `home star ${(home.starPowerScore * 100).toFixed(1)}% vs away ${(away.starPowerScore * 100).toFixed(1)}%`,
      `home creation ${(home.creationScore * 100).toFixed(1)}% vs away ${(away.creationScore * 100).toFixed(1)}%`,
      `ranking edge ${(homeCompositeEdge * 100).toFixed(1)}%`,
      `ranking probability delta ${(boundedProbabilityDelta * 100).toFixed(1)}%`,
      ...keyEdges.slice(0, 4).map((edge) => `${edge.category} edge ${edge.edge.toFixed(3)} ${edge.winner}`)
    ]
  };
}
