import { CompetitorType, SportCode } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type TendencyCoverageStatus = "ELITE" | "USABLE" | "THIN" | "MISSING";
export type TendencyCoverageSport = "MLB" | "MMA";

export type TendencyCoverageMetric = {
  key: string;
  label: string;
  count: number;
  total: number;
  pct: number | null;
  status: TendencyCoverageStatus;
};

export type TendencyCoverageLane = {
  sport: TendencyCoverageSport;
  label: string;
  score: number;
  status: TendencyCoverageStatus;
  metrics: TendencyCoverageMetric[];
  warnings: string[];
  nextActions: string[];
  sample: Record<string, string | number | null>;
};

export type PlayerTendencyCoverageReport = {
  generatedAt: string;
  score: number;
  status: TendencyCoverageStatus;
  lanes: TendencyCoverageLane[];
  blockers: string[];
  nextActions: string[];
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function pct(count: number, total: number) {
  return total ? count / total : null;
}

function statusFromPct(value: number | null): TendencyCoverageStatus {
  if (value == null) return "MISSING";
  if (value >= 0.8) return "ELITE";
  if (value >= 0.5) return "USABLE";
  if (value > 0.05) return "THIN";
  return "MISSING";
}

function statusFromScore(score: number): TendencyCoverageStatus {
  if (score >= 85) return "ELITE";
  if (score >= 65) return "USABLE";
  if (score >= 30) return "THIN";
  return "MISSING";
}

function metric(key: string, label: string, count: number, total: number): TendencyCoverageMetric {
  const value = pct(count, total);
  return { key, label, count, total, pct: value, status: statusFromPct(value) };
}

function hasAny(record: JsonRecord, keys: string[]) {
  return keys.some((key) => record[key] !== undefined && record[key] !== null && record[key] !== "");
}

function hasNested(record: JsonRecord, path: string[]) {
  let current: unknown = record;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return current !== undefined && current !== null && current !== "";
}

function nestedRecord(record: JsonRecord, path: string[]) {
  let current: unknown = record;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return asRecord(current);
}

function boolCount<T>(rows: T[], fn: (row: T) => boolean) {
  return rows.reduce((sum, row) => sum + (fn(row) ? 1 : 0), 0);
}

function uniqueCount<T>(rows: T[], fn: (row: T) => string | null | undefined) {
  const values = new Set<string>();
  for (const row of rows) {
    const value = fn(row);
    if (value) values.add(value);
  }
  return values.size;
}

function average(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function latestIso(values: Array<Date | string | null | undefined>) {
  const times = values
    .map((value) => value ? new Date(value).getTime() : NaN)
    .filter((value) => Number.isFinite(value));
  if (!times.length) return null;
  return new Date(Math.max(...times)).toISOString();
}

function recordHasKeys(record: JsonRecord, keys: string[]) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(record, key) && record[key] !== null && record[key] !== "");
}

function buildLane(sport: TendencyCoverageSport, label: string, metrics: TendencyCoverageMetric[], sample: Record<string, string | number | null>): TendencyCoverageLane {
  const weighted = average(metrics.map((item) => item.pct)) ?? 0;
  const score = Math.round(weighted * 100);
  const status = statusFromScore(score);
  const warnings = metrics
    .filter((item) => item.status === "MISSING" || item.status === "THIN")
    .map((item) => `${item.label} coverage is ${item.status}: ${item.count}/${item.total}.`);
  const nextActions = metrics
    .filter((item) => item.status !== "ELITE")
    .map((item) => {
      if (sport === "MLB") {
        if (item.key.includes("statcast") || item.key.includes("xwoba") || item.key.includes("hard_hit")) return "Wire Statcast quality into player stat rows: xwOBA, barrel rate, hard-hit rate, chase/contact, and pitch quality.";
        if (item.key.includes("pitch")) return "Add pitcher tendency profiles: pitch mix, strikeout/walk profile, rolling game score, handedness split, and expected contact quality.";
        if (item.key.includes("probable") || item.key.includes("bullpen")) return "Add pregame team context: probable starter, bullpen last-3 usage, high-leverage availability, and starter confirmation.";
        return "Improve MLB roster/player identity coverage and recent stat rows before official player-level confidence."
      }
      if (item.key.includes("striking")) return "Wire UFC striking tendencies: SLpM, SApM, accuracy, defense, knockdowns, distance/clinch/ground split.";
      if (item.key.includes("grappling")) return "Wire UFC grappling tendencies: takedown average, takedown defense, submission rate, control time, reversals, get-up ability.";
      if (item.key.includes("history")) return "Wire fight history and opponent-strength context: recent form, layoff, level of competition, finish/decision mix, short-notice flags.";
      return "Improve MMA fighter profile identity, bio, and style/tendency coverage before official fight confidence.";
    });
  return {
    sport,
    label,
    score,
    status,
    metrics,
    warnings: Array.from(new Set(warnings)).slice(0, 10),
    nextActions: Array.from(new Set(nextActions)).slice(0, 8),
    sample
  };
}

async function buildMlbLane(): Promise<TendencyCoverageLane> {
  const league = await prisma.league.findUnique({ where: { key: "MLB" } });
  if (!league) {
    return buildLane("MLB", "MLB roster/player tendencies", [], { playerCount: 0, latestPlayerStatAt: null });
  }

  const [players, playerStats, teamStats] = await Promise.all([
    prisma.player.findMany({
      where: { leagueId: league.id },
      select: { id: true, name: true, position: true, status: true, externalIds: true, updatedAt: true },
      take: 2500
    }),
    prisma.playerGameStat.findMany({
      where: { player: { leagueId: league.id } },
      select: { playerId: true, statsJson: true, starter: true, updatedAt: true, outcomeStatus: true },
      orderBy: { updatedAt: "desc" },
      take: 7500
    }),
    prisma.teamGameStat.findMany({
      where: { team: { leagueId: league.id } },
      select: { statsJson: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 1500
    })
  ]);

  const playerTotal = Math.max(1, players.length);
  const statTotal = Math.max(1, playerStats.length);
  const teamTotal = Math.max(1, teamStats.length);
  const statRecords = playerStats.map((row) => asRecord(row.statsJson));
  const teamRecords = teamStats.map((row) => asRecord(row.statsJson));

  const metrics = [
    metric("mlb_roster_identity", "Roster players with external IDs", boolCount(players, (player) => Object.keys(asRecord(player.externalIds)).length > 0), playerTotal),
    metric("mlb_positions", "Roster players with positions", boolCount(players, (player) => Boolean(player.position)), playerTotal),
    metric("mlb_recent_player_rows", "Roster players with recent stat rows", uniqueCount(playerStats, (row) => row.playerId), playerTotal),
    metric("mlb_starters_tagged", "Player stat rows tagged as starters", boolCount(playerStats, (row) => row.starter), statTotal),
    metric("mlb_statcast_profiles", "Player rows with Statcast profiles", boolCount(statRecords, (row) => Object.keys(asRecord(row.statcast)).length > 0), statTotal),
    metric("mlb_xwoba", "Player rows with xwOBA", boolCount(statRecords, (row) => hasNested(row, ["statcast", "xwoba"])), statTotal),
    metric("mlb_hard_hit", "Player rows with hard-hit rate", boolCount(statRecords, (row) => hasNested(row, ["statcast", "hardHitRate"])), statTotal),
    metric("mlb_pitch_mix", "Pitcher rows with pitch mix", boolCount(statRecords, (row) => Object.keys(nestedRecord(row, ["statcast", "pitching", "pitchMix"])).length > 0), statTotal),
    metric("mlb_pitcher_context", "Player rows with pitcher context", boolCount(statRecords, (row) => hasAny(row, ["pitcherOuts", "outsPitched", "pitchingStrikeouts", "pitchesThrown", "gameScore"])), statTotal),
    metric("mlb_plate_discipline", "Rows with plate-discipline tendency", boolCount(statRecords, (row) => hasNested(row, ["statcast", "chaseRate"]) || hasNested(row, ["statcast", "contactRate"]) || hasAny(row, ["strikeoutRate", "walkRate"])), statTotal),
    metric("mlb_probable_pitchers", "Team rows with probable starters", boolCount(teamRecords, (row) => hasAny(row, ["probablePitcherId", "probablePitcherName", "starterPitcherId", "starterPitcherName"])), teamTotal),
    metric("mlb_bullpen_usage", "Team rows with bullpen usage", boolCount(teamRecords, (row) => hasAny(row, ["bullpenInningsLast3", "bullpenPitchesLast3", "highLeveragePitchesLast3", "closerAvailable"])), teamTotal)
  ];

  return buildLane("MLB", "MLB roster/player tendencies", metrics, {
    playerCount: players.length,
    playerStatRows: playerStats.length,
    teamStatRows: teamStats.length,
    latestPlayerStatAt: latestIso(playerStats.map((row) => row.updatedAt)),
    latestTeamStatAt: latestIso(teamStats.map((row) => row.updatedAt))
  });
}

async function buildMmaLane(): Promise<TendencyCoverageLane> {
  const fighters = await prisma.competitor.findMany({
    where: { sport: { code: SportCode.MMA }, type: CompetitorType.FIGHTER },
    select: { id: true, name: true, externalIds: true, metadataJson: true, updatedAt: true },
    take: 2500
  });

  const total = Math.max(1, fighters.length);
  const records = fighters.map((fighter) => asRecord(fighter.metadataJson));
  const metrics = [
    metric("mma_fighter_identity", "Fighters with external IDs", boolCount(fighters, (fighter) => Object.keys(asRecord(fighter.externalIds)).length > 0), total),
    metric("mma_bio_profiles", "Fighters with bio profile", boolCount(records, (row) => recordHasKeys(row, ["age", "height", "reach", "stance", "weightClass", "camp"])), total),
    metric("mma_reach_stance", "Fighters with reach/stance", boolCount(records, (row) => hasAny(row, ["reach", "reachInches"]) && hasAny(row, ["stance", "fightingStance"])), total),
    metric("mma_fight_history", "Fighters with fight history", boolCount(records, (row) => recordHasKeys(row, ["record", "wins", "losses", "recentFights", "opponents", "fightHistory"])), total),
    metric("mma_opponent_strength", "Fighters with opponent-strength context", boolCount(records, (row) => recordHasKeys(row, ["opponentStrength", "strengthOfSchedule", "qualityWins", "rankedWins"])), total),
    metric("mma_striking_tendencies", "Fighters with striking tendencies", boolCount(records, (row) => recordHasKeys(row, ["slpm", "sigStrikesLandedPerMinute", "sapm", "sigStrikeAccuracy", "sigStrikeDefense", "knockdowns"])), total),
    metric("mma_grappling_tendencies", "Fighters with grappling tendencies", boolCount(records, (row) => recordHasKeys(row, ["tdAvg", "takedownAverage", "tdDefense", "submissionAverage", "controlTime", "reversals"])), total),
    metric("mma_finish_profile", "Fighters with finish/decision profile", boolCount(records, (row) => recordHasKeys(row, ["finishRate", "koWins", "submissionWins", "decisionRate", "methodSplits"])), total),
    metric("mma_layoff_short_notice", "Fighters with layoff/short-notice flags", boolCount(records, (row) => recordHasKeys(row, ["lastFightDate", "layoffDays", "shortNotice", "campChange", "weightMiss"])), total)
  ];

  return buildLane("MMA", "MMA fighter profiles/tendencies", metrics, {
    fighterCount: fighters.length,
    latestFighterUpdatedAt: latestIso(fighters.map((fighter) => fighter.updatedAt))
  });
}

export async function getPlayerTendencyCoverageReport(): Promise<PlayerTendencyCoverageReport> {
  const [mlbLane, mmaLane] = await Promise.all([buildMlbLane(), buildMmaLane()]);
  const lanes = [mlbLane, mmaLane];
  const score = Math.round(average(lanes.map((lane) => lane.score)) ?? 0);
  const status = statusFromScore(score);
  const blockers = lanes.flatMap((lane) => lane.status === "MISSING" ? [`${lane.sport}: ${lane.label} is missing.`] : []);
  const nextActions = lanes.flatMap((lane) => lane.nextActions).slice(0, 12);

  return {
    generatedAt: new Date().toISOString(),
    score,
    status,
    lanes,
    blockers,
    nextActions: Array.from(new Set(nextActions))
  };
}
