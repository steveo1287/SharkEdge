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

type MlbPitcherRatingRow = {
  pitcher_id: string;
  pitcher_name: string;
  team: string;
  role_tier: string | null;
  xera_quality: number | null;
  fip_quality: number | null;
  k_bb: number | null;
  hr_risk: number | null;
  groundball_rate: number | null;
  platoon_split: number | null;
  stamina: number | null;
  recent_workload: number | null;
  arsenal_quality: number | null;
  overall: number | null;
  metrics_json: unknown;
  snapshot_at: Date | string | null;
};

type MlbLineupSnapshotRow = {
  game_id: string;
  team: string;
  confirmed: boolean | null;
  starting_pitcher_id: string | null;
  starting_pitcher_name: string | null;
  batting_order_json: unknown;
  available_relievers_json: unknown;
  unavailable_relievers_json: unknown;
  captured_at: Date | string | null;
};

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
  const safeTotal = Math.max(0, total);
  const safeCount = Math.max(0, Math.min(count, safeTotal));
  const value = pct(safeCount, safeTotal);
  return { key, label, count: safeCount, total: safeTotal, pct: value, status: statusFromPct(value) };
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

function hasNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function jsonArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

async function safeMlbPitcherRatings() {
  try {
    return await prisma.$queryRaw<MlbPitcherRatingRow[]>`
      SELECT DISTINCT ON (pitcher_id)
        pitcher_id, pitcher_name, team, role_tier, xera_quality, fip_quality, k_bb, hr_risk,
        groundball_rate, platoon_split, stamina, recent_workload, arsenal_quality, overall, metrics_json, snapshot_at
      FROM mlb_pitcher_ratings
      ORDER BY pitcher_id, snapshot_at DESC
      LIMIT 2500;
    `;
  } catch {
    return [];
  }
}

async function safeMlbLineupSnapshots() {
  try {
    return await prisma.$queryRaw<MlbLineupSnapshotRow[]>`
      SELECT DISTINCT ON (game_id, team)
        game_id, team, confirmed, starting_pitcher_id, starting_pitcher_name,
        batting_order_json, available_relievers_json, unavailable_relievers_json, captured_at
      FROM mlb_lineup_snapshots
      ORDER BY game_id, team, captured_at DESC
      LIMIT 2500;
    `;
  } catch {
    return [];
  }
}

function pitcherStatLike(row: JsonRecord) {
  return hasAny(row, ["pitcherOuts", "outsPitched", "inningsPitched", "pitchingStrikeouts", "pitchesThrown", "gameScore", "era", "fip", "xera", "xERA"])
    || Object.keys(nestedRecord(row, ["statcast", "pitching"])).length > 0;
}

function pitcherRatingHasArsenal(row: MlbPitcherRatingRow) {
  const metrics = asRecord(row.metrics_json);
  const raw = asRecord(metrics.raw);
  return hasNumber(row.arsenal_quality)
    || Object.keys(nestedRecord(raw, ["statcast", "pitching", "pitchMix"])).length > 0
    || hasAny(raw, ["arsenalQuality", "pitchQuality"]);
}

function pitcherRatingHasContext(row: MlbPitcherRatingRow) {
  return hasNumber(row.xera_quality)
    || hasNumber(row.fip_quality)
    || hasNumber(row.k_bb)
    || hasNumber(row.groundball_rate)
    || hasNumber(row.stamina)
    || hasNumber(row.recent_workload)
    || hasNumber(row.overall);
}

function lineupHasStarter(row: MlbLineupSnapshotRow) {
  return Boolean(row.starting_pitcher_id || row.starting_pitcher_name);
}

function lineupHasPitchingFallback(row: MlbLineupSnapshotRow, pitcherTeams: Set<string>) {
  return lineupHasStarter(row) || pitcherTeams.has(row.team);
}

function lineupHasBullpen(row: MlbLineupSnapshotRow) {
  return jsonArrayLength(row.available_relievers_json) > 0 || jsonArrayLength(row.unavailable_relievers_json) > 0;
}

function lineupHasBullpenFallback(row: MlbLineupSnapshotRow, pitcherTeams: Set<string>) {
  return lineupHasBullpen(row) || pitcherTeams.has(row.team);
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

  const [players, playerStats, teamStats, pitcherRatings, lineupSnapshots] = await Promise.all([
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
    }),
    safeMlbPitcherRatings(),
    safeMlbLineupSnapshots()
  ]);

  const playerTotal = Math.max(1, players.length);
  const statTotal = Math.max(1, playerStats.length);
  const teamTotal = Math.max(1, teamStats.length);
  const lineupTotal = Math.max(1, lineupSnapshots.length || teamStats.length);
  const statRecords = playerStats.map((row) => asRecord(row.statsJson));
  const pitcherStatRecords = statRecords.filter(pitcherStatLike);
  const pitcherProfileTotal = Math.max(1, pitcherRatings.length || pitcherStatRecords.length);
  const teamRecords = teamStats.map((row) => asRecord(row.statsJson));
  const pitcherTeams = new Set(pitcherRatings.map((row) => row.team).filter(Boolean));

  const rawPitchMixCount = boolCount(pitcherStatRecords, (row) => Object.keys(nestedRecord(row, ["statcast", "pitching", "pitchMix"])).length > 0);
  const runtimePitchMixCount = boolCount(pitcherRatings, pitcherRatingHasArsenal);
  const rawPitcherContextCount = boolCount(pitcherStatRecords, (row) => hasAny(row, ["pitcherOuts", "outsPitched", "pitchingStrikeouts", "pitchesThrown", "gameScore", "era", "fip", "xera", "xERA"]));
  const runtimePitcherContextCount = boolCount(pitcherRatings, pitcherRatingHasContext);
  const rawProbableCount = boolCount(teamRecords, (row) => hasAny(row, ["probablePitcherId", "probablePitcherName", "starterPitcherId", "starterPitcherName"]));
  const runtimeProbableCount = boolCount(lineupSnapshots, (row) => lineupHasPitchingFallback(row, pitcherTeams));
  const rawBullpenCount = boolCount(teamRecords, (row) => hasAny(row, ["bullpenInningsLast3", "bullpenPitchesLast3", "highLeveragePitchesLast3", "closerAvailable"]));
  const runtimeBullpenCount = boolCount(lineupSnapshots, (row) => lineupHasBullpenFallback(row, pitcherTeams));

  const metrics = [
    metric("mlb_roster_identity", "Roster players with external IDs", boolCount(players, (player) => Object.keys(asRecord(player.externalIds)).length > 0), playerTotal),
    metric("mlb_positions", "Roster players with positions", boolCount(players, (player) => Boolean(player.position)), playerTotal),
    metric("mlb_recent_player_rows", "Roster players with recent stat rows", uniqueCount(playerStats, (row) => row.playerId), playerTotal),
    metric("mlb_starters_tagged", "Player stat rows tagged as starters", boolCount(playerStats, (row) => row.starter), statTotal),
    metric("mlb_statcast_profiles", "Player rows with Statcast profiles", boolCount(statRecords, (row) => Object.keys(asRecord(row.statcast)).length > 0), statTotal),
    metric("mlb_xwoba", "Player rows with xwOBA", boolCount(statRecords, (row) => hasNested(row, ["statcast", "xwoba"])), statTotal),
    metric("mlb_hard_hit", "Player rows with hard-hit rate", boolCount(statRecords, (row) => hasNested(row, ["statcast", "hardHitRate"])), statTotal),
    metric("mlb_pitch_mix", "Pitcher rows with pitch/arsenal profile", Math.max(rawPitchMixCount, runtimePitchMixCount), pitcherProfileTotal),
    metric("mlb_pitcher_context", "Pitcher rows with model context", Math.max(rawPitcherContextCount, runtimePitcherContextCount), pitcherProfileTotal),
    metric("mlb_plate_discipline", "Rows with plate-discipline tendency", boolCount(statRecords, (row) => hasNested(row, ["statcast", "chaseRate"]) || hasNested(row, ["statcast", "contactRate"]) || hasAny(row, ["strikeoutRate", "walkRate"])), statTotal),
    metric("mlb_probable_pitchers", "Games/teams with starter context", Math.max(rawProbableCount, runtimeProbableCount), lineupSnapshots.length ? lineupTotal : teamTotal),
    metric("mlb_bullpen_usage", "Games/teams with bullpen context", Math.max(rawBullpenCount, runtimeBullpenCount), lineupSnapshots.length ? lineupTotal : teamTotal)
  ];

  return buildLane("MLB", "MLB roster/player tendencies", metrics, {
    playerCount: players.length,
    playerStatRows: playerStats.length,
    pitcherStatRows: pitcherStatRecords.length,
    teamStatRows: teamStats.length,
    pitcherRatingRows: pitcherRatings.length,
    lineupSnapshotRows: lineupSnapshots.length,
    latestPlayerStatAt: latestIso(playerStats.map((row) => row.updatedAt)),
    latestTeamStatAt: latestIso(teamStats.map((row) => row.updatedAt)),
    latestPitcherRatingAt: latestIso(pitcherRatings.map((row) => row.snapshot_at)),
    latestLineupSnapshotAt: latestIso(lineupSnapshots.map((row) => row.captured_at))
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
