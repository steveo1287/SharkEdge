import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { getMergedRealPlayerFeed, type RealPlayerFeedRecord } from "@/services/simulation/nba-real-player-feed";
import { buildNbaPlayerRoleDepth, type NbaPlayerRoleTier, type NbaPlayerUsageTier, type NbaPlayerArchetype } from "@/services/simulation/nba-player-role-depth";
import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";

export type NbaLeagueRankingCategory =
  | "points"
  | "rebounds"
  | "assists"
  | "threes"
  | "steals"
  | "blocks"
  | "turnovers"
  | "stocks"
  | "pra"
  | "pr"
  | "pa"
  | "ra"
  | "minutes"
  | "usage"
  | "assistRate"
  | "reboundRate"
  | "turnoverRate"
  | "trueShooting"
  | "effectiveFg"
  | "freeThrowRate"
  | "threePointRate"
  | "offensiveImpact"
  | "defensiveImpact"
  | "netImpact"
  | "onOffNet"
  | "rimPressure"
  | "threePointGravity"
  | "defensiveVersatility"
  | "pointOfAttackDefense"
  | "rimProtection"
  | "clutchImpact"
  | "fatigueRisk"
  | "availabilityRisk"
  | "starPower"
  | "creation"
  | "spacing"
  | "closingLineup"
  | "roleDepth"
  | "overall";

export type NbaLeagueRankSource = RealPlayerFeedRecord["source"] | "projection" | "synthetic";

export type NbaLeaguePlayerCategoryRank = {
  category: NbaLeagueRankingCategory;
  value: number;
  per36Value: number | null;
  rawRank: number;
  per36Rank: number | null;
  teamRank: number;
  roleTierRank: number;
  usageTierRank: number;
  leaguePercentile: number;
  roleTierPercentile: number;
  usageTierPercentile: number;
  teamPercentile: number;
  roleAdjustedPercentile: number;
  confidenceAdjustedPercentile: number;
};

export type NbaLeaguePlayerRank = {
  playerName: string;
  teamName: string;
  source: NbaLeagueRankSource;
  sourceConfidence: number;
  roleTier: NbaPlayerRoleTier;
  usageTier: NbaPlayerUsageTier;
  archetype: NbaPlayerArchetype;
  projectedMinutes: number;
  status: string;
  rawOverallRank: number;
  teamOverallRank: number;
  roleTierOverallRank: number;
  usageTierOverallRank: number;
  leaguePercentile: number;
  teamPercentile: number;
  roleTierPercentile: number;
  usageTierPercentile: number;
  roleAdjustedPercentile: number;
  confidenceAdjustedPercentile: number;
  overallScore: number;
  categories: NbaLeaguePlayerCategoryRank[];
  drivers: string[];
  warnings: string[];
};

export type NbaLeagueRankingUniverse = {
  modelVersion: "nba-league-player-rankings-v1";
  generatedAt: string;
  playerCount: number;
  realSourceCount: number;
  syntheticSourceCount: number;
  status: "GREEN" | "YELLOW" | "RED";
  players: NbaLeaguePlayerRank[];
  warnings: string[];
  blockers: string[];
};

const CACHE_KEY = "nba:league-player-rankings:v1";
const CACHE_TTL_SECONDS = 60 * 30;

const CATEGORIES: NbaLeagueRankingCategory[] = [
  "points",
  "rebounds",
  "assists",
  "threes",
  "steals",
  "blocks",
  "turnovers",
  "stocks",
  "pra",
  "pr",
  "pa",
  "ra",
  "minutes",
  "usage",
  "assistRate",
  "reboundRate",
  "turnoverRate",
  "trueShooting",
  "effectiveFg",
  "freeThrowRate",
  "threePointRate",
  "offensiveImpact",
  "defensiveImpact",
  "netImpact",
  "onOffNet",
  "rimPressure",
  "threePointGravity",
  "defensiveVersatility",
  "pointOfAttackDefense",
  "rimProtection",
  "clutchImpact",
  "fatigueRisk",
  "availabilityRisk",
  "starPower",
  "creation",
  "spacing",
  "closingLineup",
  "roleDepth",
  "overall"
];

const LOWER_IS_BETTER = new Set<NbaLeagueRankingCategory>(["turnovers", "turnoverRate", "fatigueRisk", "availabilityRisk"]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function statusAvailability(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("out")) return 0;
  if (normalized.includes("doubtful")) return 0.2;
  if (normalized.includes("questionable")) return 0.55;
  if (normalized.includes("unknown")) return 0.75;
  return 1;
}

function sourceConfidence(source: NbaLeagueRankSource) {
  switch (source) {
    case "databallr": return 0.9;
    case "lineup-feed": return 0.88;
    case "injury-feed": return 0.84;
    case "nba-stats-api": return 0.82;
    case "balldontlie": return 0.76;
    case "espn-roster": return 0.5;
    case "projection": return 0.62;
    case "synthetic": return 0.22;
    case "merged": return 0.82;
    default: return 0.4;
  }
}

function projectionFromRecord(record: RealPlayerFeedRecord): NbaPlayerStatProjection {
  const availability = statusAvailability(record.status);
  const minutes = clamp(record.projectedMinutes, 0, 42);
  const points = clamp((record.usageRate * 0.65 + record.offensiveEpm * 1.6 + record.trueShooting * 0.18) * (minutes / 30) * availability, 0, 38);
  const rebounds = clamp(record.reboundRate * 0.52 * (minutes / 30) * availability, 0, 18);
  const assists = clamp(record.assistRate * 0.26 * (minutes / 30) * availability, 0, 14);
  const threes = clamp(record.threePointGravity * 0.42 * (minutes / 30) * availability, 0, 7);
  return {
    playerName: record.playerName,
    teamName: record.teamName,
    teamSide: "home",
    status: record.status,
    projectedMinutes: round(minutes, 1),
    projectedPoints: round(points, 1),
    projectedRebounds: round(rebounds, 1),
    projectedAssists: round(assists, 1),
    projectedThrees: round(threes, 1),
    floor: { points: round(points * 0.62, 1), rebounds: round(rebounds * 0.62, 1), assists: round(assists * 0.62, 1), threes: round(threes * 0.55, 1) },
    median: { points: round(points, 1), rebounds: round(rebounds, 1), assists: round(assists, 1), threes: round(threes, 1) },
    ceiling: { points: round(points * 1.38, 1), rebounds: round(rebounds * 1.35, 1), assists: round(assists * 1.35, 1), threes: round(threes * 1.55, 1) },
    confidence: sourceConfidence(record.source),
    simulationRuns: 0,
    propHitProbabilities: {},
    whyLikely: [],
    whyNotLikely: [],
    source: record.source
  };
}

function recordFromProjection(projection: NbaPlayerStatProjection): RealPlayerFeedRecord {
  const minutes = clamp(projection.projectedMinutes, 0, 42);
  const pointsPer36 = minutes > 0 ? projection.projectedPoints / minutes * 36 : 0;
  const reboundsPer36 = minutes > 0 ? projection.projectedRebounds / minutes * 36 : 0;
  const assistsPer36 = minutes > 0 ? projection.projectedAssists / minutes * 36 : 0;
  const threesPer36 = minutes > 0 ? projection.projectedThrees / minutes * 36 : 0;
  const usageRate = clamp(projection.projectedPoints + projection.projectedAssists * 2.15 + projection.projectedThrees * 0.75, 3, 38);
  return {
    playerName: projection.playerName,
    teamName: projection.teamName,
    status: projection.status as RealPlayerFeedRecord["status"],
    projectedMinutes: minutes,
    usageRate,
    offensiveEpm: clamp((pointsPer36 - 15) / 4, -6, 8),
    defensiveEpm: clamp((reboundsPer36 - 5.5) / 5, -5, 6),
    netImpact: clamp((pointsPer36 - 15) / 4 + (reboundsPer36 - 5.5) / 5, -8, 12),
    onOffNet: clamp((pointsPer36 + assistsPer36 + reboundsPer36 - 25) / 2.5, -16, 16),
    trueShooting: clamp(54 + threesPer36 * 1.1 + pointsPer36 * 0.12, 44, 70),
    assistRate: clamp(assistsPer36 * 3.1, 0, 48),
    reboundRate: clamp(reboundsPer36 * 1.65, 0, 28),
    turnoverRate: clamp(usageRate * 0.34, 3, 26),
    rimPressure: clamp(pointsPer36 * 0.18, 0, 10),
    threePointGravity: clamp(threesPer36 * 2.05, 0, 10),
    defensiveVersatility: clamp(reboundsPer36 * 0.4 + projection.confidence * 3, 0, 10),
    pointOfAttackDefense: clamp(projection.confidence * 5, 0, 10),
    rimProtection: clamp(reboundsPer36 * 0.42, 0, 10),
    clutchImpact: clamp((pointsPer36 - 18) / 7, -5, 5),
    fatigueRisk: clamp(1 - projection.confidence, 0, 1),
    source: "merged"
  };
}

function categoryValue(record: RealPlayerFeedRecord, roleDepth: ReturnType<typeof buildNbaPlayerRoleDepth>, projection: NbaPlayerStatProjection, category: NbaLeagueRankingCategory) {
  const pra = projection.projectedPoints + projection.projectedRebounds + projection.projectedAssists;
  switch (category) {
    case "points": return projection.projectedPoints;
    case "rebounds": return projection.projectedRebounds;
    case "assists": return projection.projectedAssists;
    case "threes": return projection.projectedThrees;
    case "steals": return clamp(record.pointOfAttackDefense * 0.18 + record.defensiveVersatility * 0.08, 0, 3.2);
    case "blocks": return clamp(record.rimProtection * 0.2, 0, 4);
    case "turnovers": return clamp(record.turnoverRate * record.usageRate / 120, 0, 6);
    case "stocks": return clamp(record.pointOfAttackDefense * 0.18 + record.defensiveVersatility * 0.08 + record.rimProtection * 0.2, 0, 6);
    case "pra": return pra;
    case "pr": return projection.projectedPoints + projection.projectedRebounds;
    case "pa": return projection.projectedPoints + projection.projectedAssists;
    case "ra": return projection.projectedRebounds + projection.projectedAssists;
    case "minutes": return projection.projectedMinutes;
    case "usage": return record.usageRate;
    case "assistRate": return record.assistRate;
    case "reboundRate": return record.reboundRate;
    case "turnoverRate": return record.turnoverRate;
    case "trueShooting": return record.trueShooting;
    case "effectiveFg": return clamp(record.trueShooting - 3 + record.threePointGravity * 0.2, 40, 72);
    case "freeThrowRate": return clamp(record.rimPressure * 0.075 + record.usageRate * 0.01, 0, 1.2);
    case "threePointRate": return clamp(record.threePointGravity / 10, 0, 1);
    case "offensiveImpact": return record.offensiveEpm;
    case "defensiveImpact": return record.defensiveEpm;
    case "netImpact": return record.netImpact;
    case "onOffNet": return record.onOffNet;
    case "rimPressure": return record.rimPressure;
    case "threePointGravity": return record.threePointGravity;
    case "defensiveVersatility": return record.defensiveVersatility;
    case "pointOfAttackDefense": return record.pointOfAttackDefense;
    case "rimProtection": return record.rimProtection;
    case "clutchImpact": return record.clutchImpact;
    case "fatigueRisk": return record.fatigueRisk;
    case "availabilityRisk": return 1 - roleDepth.availabilityScore;
    case "starPower": return roleDepth.starScore;
    case "creation": return roleDepth.creationScore;
    case "spacing": return roleDepth.spacingScore;
    case "closingLineup": return roleDepth.closingLineupScore;
    case "roleDepth": return roleDepth.rolePlayerScore;
    case "overall": return overallScore(record, roleDepth, projection);
  }
}

function categoryPer36(record: RealPlayerFeedRecord, roleDepth: ReturnType<typeof buildNbaPlayerRoleDepth>, projection: NbaPlayerStatProjection, category: NbaLeagueRankingCategory) {
  const minutes = projection.projectedMinutes;
  if (minutes <= 0) return null;
  switch (category) {
    case "points": return projection.projectedPoints / minutes * 36;
    case "rebounds": return projection.projectedRebounds / minutes * 36;
    case "assists": return projection.projectedAssists / minutes * 36;
    case "threes": return projection.projectedThrees / minutes * 36;
    case "steals":
    case "blocks":
    case "turnovers":
    case "stocks":
    case "pra":
    case "pr":
    case "pa":
    case "ra": return categoryValue(record, roleDepth, projection, category) / minutes * 36;
    default: return categoryValue(record, roleDepth, projection, category);
  }
}

function overallScore(record: RealPlayerFeedRecord, roleDepth: ReturnType<typeof buildNbaPlayerRoleDepth>, projection: NbaPlayerStatProjection) {
  const availability = statusAvailability(record.status);
  const minutesWeight = clamp(projection.projectedMinutes / 34, 0, 1.25);
  const sourceWeight = sourceConfidence(record.source);
  const impactScore = clamp((record.netImpact + 6) / 18, 0, 1);
  const usageScore = clamp((record.usageRate - 8) / 27, 0, 1);
  const score = (
    roleDepth.starScore * 0.22 +
    roleDepth.creationScore * 0.12 +
    roleDepth.scoringScore * 0.11 +
    roleDepth.rolePlayerScore * 0.1 +
    roleDepth.spacingScore * 0.06 +
    roleDepth.reboundingScore * 0.06 +
    roleDepth.closingLineupScore * 0.08 +
    impactScore * 0.18 +
    usageScore * 0.07
  ) * minutesWeight * availability * (0.75 + sourceWeight * 0.25);
  return clamp(score, 0, 1.6);
}

function rankFor(rows: PreparedPlayer[], selector: (row: PreparedPlayer) => number, target: PreparedPlayer, lowerIsBetter = false) {
  const sorted = [...new Set(rows.map(selector).filter(Number.isFinite).sort((left, right) => lowerIsBetter ? left - right : right - left))];
  const value = selector(target);
  const index = sorted.findIndex((candidate) => candidate === value);
  return index >= 0 ? index + 1 : sorted.length + 1;
}

function percentileFromRank(rank: number, total: number) {
  if (total <= 1) return 1;
  return clamp((total - rank) / (total - 1), 0, 1);
}

function teamKey(teamName: string) {
  return teamName.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

type PreparedPlayer = {
  record: RealPlayerFeedRecord;
  projection: NbaPlayerStatProjection;
  roleDepth: ReturnType<typeof buildNbaPlayerRoleDepth>;
  overallScore: number;
};

function preparePlayers(records: RealPlayerFeedRecord[], projections: NbaPlayerStatProjection[] = []) {
  const byKey = new Map<string, RealPlayerFeedRecord>();
  for (const record of records) {
    byKey.set(`${teamKey(record.teamName)}:${record.playerName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`, record);
  }
  for (const projection of projections) {
    const key = `${teamKey(projection.teamName)}:${projection.playerName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
    if (!byKey.has(key)) byKey.set(key, recordFromProjection(projection));
  }
  return [...byKey.values()].map((record) => {
    const projection = projectionFromRecord(record);
    const roleDepth = buildNbaPlayerRoleDepth(projection);
    return { record, projection, roleDepth, overallScore: overallScore(record, roleDepth, projection) };
  });
}

function buildCategoryRank(row: PreparedPlayer, rows: PreparedPlayer[], category: NbaLeagueRankingCategory): NbaLeaguePlayerCategoryRank {
  const lowerIsBetter = LOWER_IS_BETTER.has(category);
  const value = categoryValue(row.record, row.roleDepth, row.projection, category);
  const per36Value = categoryPer36(row.record, row.roleDepth, row.projection, category);
  const teamRows = rows.filter((candidate) => teamKey(candidate.record.teamName) === teamKey(row.record.teamName));
  const roleRows = rows.filter((candidate) => candidate.roleDepth.roleTier === row.roleDepth.roleTier);
  const usageRows = rows.filter((candidate) => candidate.roleDepth.usageTier === row.roleDepth.usageTier);
  const rawRank = rankFor(rows, (candidate) => categoryValue(candidate.record, candidate.roleDepth, candidate.projection, category), row, lowerIsBetter);
  const per36Rank = per36Value == null ? null : rankFor(rows, (candidate) => categoryPer36(candidate.record, candidate.roleDepth, candidate.projection, category) ?? (lowerIsBetter ? Infinity : -Infinity), row, lowerIsBetter);
  const teamRank = rankFor(teamRows, (candidate) => categoryValue(candidate.record, candidate.roleDepth, candidate.projection, category), row, lowerIsBetter);
  const roleTierRank = rankFor(roleRows, (candidate) => categoryValue(candidate.record, candidate.roleDepth, candidate.projection, category), row, lowerIsBetter);
  const usageTierRank = rankFor(usageRows, (candidate) => categoryValue(candidate.record, candidate.roleDepth, candidate.projection, category), row, lowerIsBetter);
  const leaguePercentile = percentileFromRank(rawRank, rows.length);
  const roleTierPercentile = percentileFromRank(roleTierRank, roleRows.length);
  const usageTierPercentile = percentileFromRank(usageTierRank, usageRows.length);
  const teamPercentile = percentileFromRank(teamRank, teamRows.length);
  const roleAdjustedPercentile = clamp(leaguePercentile * 0.58 + roleTierPercentile * 0.22 + usageTierPercentile * 0.2, 0, 1);
  const confidenceAdjustedPercentile = roleAdjustedPercentile * sourceConfidence(row.record.source) * row.roleDepth.roleConfidence;
  return {
    category,
    value: round(value, 4),
    per36Value: per36Value == null ? null : round(per36Value, 4),
    rawRank,
    per36Rank,
    teamRank,
    roleTierRank,
    usageTierRank,
    leaguePercentile: round(leaguePercentile, 4),
    roleTierPercentile: round(roleTierPercentile, 4),
    usageTierPercentile: round(usageTierPercentile, 4),
    teamPercentile: round(teamPercentile, 4),
    roleAdjustedPercentile: round(roleAdjustedPercentile, 4),
    confidenceAdjustedPercentile: round(confidenceAdjustedPercentile, 4)
  };
}

function buildRankedPlayer(row: PreparedPlayer, rows: PreparedPlayer[]): NbaLeaguePlayerRank {
  const teamRows = rows.filter((candidate) => teamKey(candidate.record.teamName) === teamKey(row.record.teamName));
  const roleRows = rows.filter((candidate) => candidate.roleDepth.roleTier === row.roleDepth.roleTier);
  const usageRows = rows.filter((candidate) => candidate.roleDepth.usageTier === row.roleDepth.usageTier);
  const rawOverallRank = rankFor(rows, (candidate) => candidate.overallScore, row);
  const teamOverallRank = rankFor(teamRows, (candidate) => candidate.overallScore, row);
  const roleTierOverallRank = rankFor(roleRows, (candidate) => candidate.overallScore, row);
  const usageTierOverallRank = rankFor(usageRows, (candidate) => candidate.overallScore, row);
  const leaguePercentile = percentileFromRank(rawOverallRank, rows.length);
  const teamPercentile = percentileFromRank(teamOverallRank, teamRows.length);
  const roleTierPercentile = percentileFromRank(roleTierOverallRank, roleRows.length);
  const usageTierPercentile = percentileFromRank(usageTierOverallRank, usageRows.length);
  const roleAdjustedPercentile = clamp(leaguePercentile * 0.55 + roleTierPercentile * 0.25 + usageTierPercentile * 0.2, 0, 1);
  const sourceQuality = sourceConfidence(row.record.source);
  const confidenceAdjustedPercentile = clamp(roleAdjustedPercentile * sourceQuality * row.roleDepth.roleConfidence, 0, 1);
  const warnings: string[] = [];
  if (sourceQuality < 0.55) warnings.push("low-confidence source; league ranking is provisional");
  if (row.projection.projectedMinutes < 8) warnings.push("low-minute player; percentile can be noisy");
  if (row.roleDepth.roleTier === "OUT") warnings.push("unavailable player; rank reflects availability penalty");
  return {
    playerName: row.record.playerName,
    teamName: row.record.teamName,
    source: row.record.source,
    sourceConfidence: round(sourceQuality, 3),
    roleTier: row.roleDepth.roleTier,
    usageTier: row.roleDepth.usageTier,
    archetype: row.roleDepth.archetype,
    projectedMinutes: round(row.projection.projectedMinutes, 1),
    status: row.record.status,
    rawOverallRank,
    teamOverallRank,
    roleTierOverallRank,
    usageTierOverallRank,
    leaguePercentile: round(leaguePercentile, 4),
    teamPercentile: round(teamPercentile, 4),
    roleTierPercentile: round(roleTierPercentile, 4),
    usageTierPercentile: round(usageTierPercentile, 4),
    roleAdjustedPercentile: round(roleAdjustedPercentile, 4),
    confidenceAdjustedPercentile: round(confidenceAdjustedPercentile, 4),
    overallScore: round(row.overallScore, 4),
    categories: CATEGORIES.map((category) => buildCategoryRank(row, rows, category)),
    drivers: [
      `league rank ${rawOverallRank}/${rows.length}`,
      `team rank ${teamOverallRank}/${teamRows.length}`,
      `role rank ${roleTierOverallRank}/${roleRows.length}`,
      `usage rank ${usageTierOverallRank}/${usageRows.length}`,
      `source ${row.record.source} confidence ${(sourceQuality * 100).toFixed(0)}%`,
      `role ${row.roleDepth.roleTier}`,
      `archetype ${row.roleDepth.archetype}`
    ],
    warnings
  };
}

export async function buildNbaLeaguePlayerRankingUniverse(args: { projectedPlayers?: NbaPlayerStatProjection[]; bypassCache?: boolean } = {}): Promise<NbaLeagueRankingUniverse> {
  if (!args.bypassCache && !args.projectedPlayers?.length) {
    const cached = await readHotCache<NbaLeagueRankingUniverse>(CACHE_KEY);
    if (cached) return cached;
  }
  const feed = await getMergedRealPlayerFeed();
  const prepared = preparePlayers(feed, args.projectedPlayers ?? []);
  const players = prepared.map((row) => buildRankedPlayer(row, prepared)).sort((left, right) => left.rawOverallRank - right.rawOverallRank);
  const realSourceCount = players.filter((player) => player.source !== "synthetic" && player.sourceConfidence >= 0.55).length;
  const syntheticSourceCount = players.filter((player) => player.source === "synthetic" || player.sourceConfidence < 0.55).length;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (players.length < 150) blockers.push(`league player ranking universe has only ${players.length} players`);
  if (realSourceCount < 100) warnings.push(`only ${realSourceCount} players have medium/high-confidence sources`);
  if (syntheticSourceCount > players.length * 0.35) warnings.push("more than 35% of player rankings are low-confidence/synthetic");
  const status = blockers.length ? "RED" : warnings.length ? "YELLOW" : "GREEN";
  const universe = {
    modelVersion: "nba-league-player-rankings-v1",
    generatedAt: new Date().toISOString(),
    playerCount: players.length,
    realSourceCount,
    syntheticSourceCount,
    status,
    players,
    warnings,
    blockers
  } satisfies NbaLeagueRankingUniverse;
  if (!args.projectedPlayers?.length) await writeHotCache(CACHE_KEY, universe, CACHE_TTL_SECONDS);
  return universe;
}

export async function getNbaLeagueRanksByPlayer(args: { projectedPlayers?: NbaPlayerStatProjection[] } = {}) {
  const universe = await buildNbaLeaguePlayerRankingUniverse({ projectedPlayers: args.projectedPlayers });
  const map = new Map<string, NbaLeaguePlayerRank>();
  for (const player of universe.players) {
    map.set(`${teamKey(player.teamName)}:${player.playerName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`, player);
  }
  return { universe, map };
}

export function nbaLeaguePlayerRankKey(playerName: string, teamName: string) {
  return `${teamKey(teamName)}:${playerName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}
