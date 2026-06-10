import { prisma } from "@/lib/db/prisma";
import { buildUfcModelFeaturesFromWarehouse } from "@/services/ufc/fighter-feature-auto-builder";

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
  includedInScore: boolean;
  scoringReason: string;
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

type UfcModelFeatureRow = {
  fight_id: string;
  fight_date: Date | string | null;
  fighter_id: string;
  opponent_fighter_id: string | null;
  snapshot_at: Date | string | null;
  model_version: string;
  pro_fights: number | null;
  ufc_fights: number | null;
  rounds_fought: number | null;
  sig_strikes_landed_per_min: number | null;
  sig_strikes_absorbed_per_min: number | null;
  striking_differential: number | null;
  takedowns_per_15: number | null;
  takedown_defense_pct: number | null;
  submission_attempts_per_15: number | null;
  control_time_pct: number | null;
  opponent_adjusted_strength: number | null;
  cold_start_active: boolean | null;
  feature_json: unknown;
  updated_at: Date | string | null;
};

type UfcFighterRow = {
  id: string;
  full_name: string;
  external_key: string | null;
  stance: string | null;
  height_inches: number | null;
  reach_inches: number | null;
  combat_base: string | null;
  payload_json: unknown;
  updated_at: Date | string | null;
};

type UfcFightCountRow = {
  active_fights: number | bigint | string | null;
  latest_fight_date: Date | string | null;
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

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function featureRecord(row: UfcModelFeatureRow) {
  return asRecord(row.feature_json);
}

function featureRawPayload(row: UfcModelFeatureRow) {
  return asRecord(featureRecord(row).rawPayload);
}

function featureRawStats(row: UfcModelFeatureRow) {
  return asRecord(featureRawPayload(row).stats);
}

function fighterPayloadStats(row: UfcFighterRow | undefined) {
  return asRecord(asRecord(row?.payload_json).stats);
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

async function safeUfcModelFeatures() {
  try {
    return await prisma.$queryRaw<UfcModelFeatureRow[]>`
      SELECT DISTINCT ON (fight_id, fighter_id, model_version)
        fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version,
        pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min,
        striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15,
        control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json, updated_at
      FROM ufc_model_features
      ORDER BY fight_id, fighter_id, model_version, updated_at DESC
      LIMIT 5000;
    `;
  } catch {
    return [];
  }
}

async function safeUfcFighters() {
  try {
    return await prisma.$queryRaw<UfcFighterRow[]>`
      SELECT id, full_name, external_key, stance, height_inches, reach_inches, combat_base, payload_json, updated_at
      FROM ufc_fighters
      ORDER BY updated_at DESC
      LIMIT 5000;
    `;
  } catch {
    return [];
  }
}

async function safeActiveUfcFightSummary() {
  try {
    const rows = await prisma.$queryRaw<UfcFightCountRow[]>`
      SELECT COUNT(*) AS active_fights, MAX(fight_date) AS latest_fight_date
      FROM ufc_fights
      WHERE fight_date >= now() - interval '3 days'
        AND status NOT IN ('CANCELED', 'VOID');
    `;
    return { activeFights: toNumber(rows[0]?.active_fights), latestFightDate: latestIso([rows[0]?.latest_fight_date]) };
  } catch {
    return { activeFights: 0, latestFightDate: null };
  }
}

async function maybeBuildUfcFeatures(activeFights: number, featureRows: number) {
  if (activeFights <= 0 || featureRows >= activeFights * 2) return { attempted: false, features: featureRows, error: null as string | null };
  try {
    const result = await buildUfcModelFeaturesFromWarehouse({ limit: Math.min(200, Math.max(50, activeFights * 2)), modelVersion: "ufc-fight-iq-v1" });
    return { attempted: true, features: Number(result.features ?? featureRows), error: result.ok ? null : result.error ?? "UFC feature auto-build failed" };
  } catch (error) {
    return { attempted: true, features: featureRows, error: error instanceof Error ? error.message : "UFC feature auto-build failed" };
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

function ufcHasIdentity(row: UfcModelFeatureRow, fighter: UfcFighterRow | undefined) {
  return Boolean(row.fighter_id && (fighter?.full_name || featureRecord(row).fighterName));
}

function ufcHasBio(row: UfcModelFeatureRow, fighter: UfcFighterRow | undefined) {
  const feature = featureRecord(row);
  return hasAny(feature, ["age", "heightInches", "reachInches", "stance", "weightClass"])
    || Boolean(fighter?.height_inches || fighter?.reach_inches || fighter?.stance || fighter?.combat_base);
}

function ufcHasReachStance(row: UfcModelFeatureRow, fighter: UfcFighterRow | undefined) {
  const feature = featureRecord(row);
  return Boolean((feature.reachInches || fighter?.reach_inches) && (feature.stance || fighter?.stance));
}

function ufcHasHistory(row: UfcModelFeatureRow) {
  return hasNumber(row.pro_fights) || hasNumber(row.ufc_fights) || hasNumber(row.rounds_fought) || hasAny(featureRawStats(row), ["proFights", "ufcFights", "roundsFought", "record", "recentFights"]);
}

function ufcHasOpponentStrength(row: UfcModelFeatureRow) {
  return hasNumber(row.opponent_adjusted_strength) || hasAny(featureRawStats(row), ["opponentStrength", "opponentAdjustedStrength", "strengthOfSchedule"]);
}

function ufcHasStriking(row: UfcModelFeatureRow, fighter: UfcFighterRow | undefined) {
  const feature = featureRecord(row);
  const rawStats = featureRawStats(row);
  const fighterStats = fighterPayloadStats(fighter);
  return hasNumber(row.sig_strikes_landed_per_min)
    || hasNumber(row.sig_strikes_absorbed_per_min)
    || hasNumber(row.striking_differential)
    || hasAny(feature, ["sigStrikeAccuracyPct", "sigStrikeDefensePct", "knockdownsPer15"])
    || hasAny(rawStats, ["slpm", "sapm", "sigStrikesLandedPerMin", "sigStrikesAbsorbedPerMin", "sigStrikeAccuracyPct", "sigStrikeDefensePct", "knockdowns"])
    || hasAny(fighterStats, ["slpm", "sapm", "sigStrikesLandedPerMin", "sigStrikesAbsorbedPerMin", "sigStrikeAccuracyPct", "sigStrikeDefensePct", "knockdowns"]);
}

function ufcHasGrappling(row: UfcModelFeatureRow, fighter: UfcFighterRow | undefined) {
  const feature = featureRecord(row);
  const rawStats = featureRawStats(row);
  const fighterStats = fighterPayloadStats(fighter);
  return hasNumber(row.takedowns_per_15)
    || hasNumber(row.takedown_defense_pct)
    || hasNumber(row.submission_attempts_per_15)
    || hasNumber(row.control_time_pct)
    || hasAny(feature, ["takedownAccuracyPct"])
    || hasAny(rawStats, ["tdAvg", "takedownsPer15", "tdDefense", "submissionAverage", "submissionAttemptsPer15", "controlTimePct"])
    || hasAny(fighterStats, ["tdAvg", "takedownsPer15", "tdDefense", "submissionAverage", "submissionAttemptsPer15", "controlTimePct"]);
}

function ufcHasFinishProfile(row: UfcModelFeatureRow, fighter: UfcFighterRow | undefined) {
  const feature = featureRecord(row);
  const rawStats = featureRawStats(row);
  const fighterStats = fighterPayloadStats(fighter);
  return hasAny(feature, ["finishRate", "lateRoundPerformance"])
    || hasAny(rawStats, ["finishRate", "finish_rate", "koWins", "submissionWins", "decisionRate", "methodSplits"])
    || hasAny(fighterStats, ["finishRate", "finish_rate", "koWins", "submissionWins", "decisionRate", "methodSplits"]);
}

function ufcHasLayoff(row: UfcModelFeatureRow) {
  const feature = featureRecord(row);
  const raw = featureRawPayload(row);
  return hasAny(feature, ["daysSinceLastFight", "shortNotice"])
    || hasAny(raw, ["lastFightDate", "layoffDays", "daysSinceLastFight", "shortNotice", "campChange", "weightMiss"]);
}

function buildLane(
  sport: TendencyCoverageSport,
  label: string,
  metrics: TendencyCoverageMetric[],
  sample: Record<string, string | number | null>,
  options: { includedInScore?: boolean; scoringReason?: string } = {}
): TendencyCoverageLane {
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
      if (item.key.includes("history") || item.key.includes("opponent")) return "Wire fight history and opponent-strength context: recent form, layoff, level of competition, finish/decision mix, short-notice flags.";
      return "Improve MMA fighter profile identity, bio, and style/tendency coverage before official fight confidence.";
    });
  return {
    sport,
    label,
    score,
    status,
    includedInScore: options.includedInScore ?? true,
    scoringReason: options.scoringReason ?? "Active modeled lane.",
    metrics,
    warnings: Array.from(new Set(warnings)).slice(0, 10),
    nextActions: Array.from(new Set(nextActions)).slice(0, 8),
    sample
  };
}

async function buildMlbLane(): Promise<TendencyCoverageLane> {
  const league = await prisma.league.findUnique({ where: { key: "MLB" } });
  if (!league) {
    return buildLane("MLB", "MLB roster/player tendencies", [], { playerCount: 0, latestPlayerStatAt: null }, { includedInScore: false, scoringReason: "MLB league row is missing." });
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
  const typedPlayers = players as Array<{ id: string; position?: string | null; externalIds?: unknown }>;
  const typedPlayerStats = playerStats as Array<{ playerId: string; starter?: boolean | null; updatedAt: string | Date | null; statsJson: unknown }>;
  const typedTeamStats = teamStats as Array<{ statsJson: unknown; updatedAt: string | Date | null }>;
  const typedPitcherRatings = pitcherRatings as Array<{ team?: string | null; snapshot_at: string | Date | null } & Record<string, unknown>>;
  const typedLineupSnapshots = lineupSnapshots as Array<MlbLineupSnapshotRow & { captured_at: string | Date | null }>;

  const playerTotal = Math.max(1, typedPlayers.length);
  const statTotal = Math.max(1, typedPlayerStats.length);
  const teamTotal = Math.max(1, typedTeamStats.length);
  const lineupTotal = Math.max(1, typedLineupSnapshots.length || typedTeamStats.length);
  const statRecords: JsonRecord[] = typedPlayerStats.map((row) => asRecord(row.statsJson));
  const pitcherStatRecords: JsonRecord[] = statRecords.filter(pitcherStatLike);
  const pitcherProfileTotal = Math.max(1, typedPitcherRatings.length || pitcherStatRecords.length);
  const teamRecords: JsonRecord[] = typedTeamStats.map((row) => asRecord(row.statsJson));
  const pitcherTeams = new Set<string>(typedPitcherRatings.map((row) => row.team).filter((team): team is string => Boolean(team)));

  const rawPitchMixCount = boolCount(pitcherStatRecords, (row) => Object.keys(nestedRecord(row, ["statcast", "pitching", "pitchMix"])).length > 0);
  const runtimePitchMixCount = boolCount(typedPitcherRatings, pitcherRatingHasArsenal);
  const rawPitcherContextCount = boolCount(pitcherStatRecords, (row) => hasAny(row, ["pitcherOuts", "outsPitched", "pitchingStrikeouts", "pitchesThrown", "gameScore", "era", "fip", "xera", "xERA"]));
  const runtimePitcherContextCount = boolCount(typedPitcherRatings, pitcherRatingHasContext);
  const rawProbableCount = boolCount(teamRecords, (row) => hasAny(row, ["probablePitcherId", "probablePitcherName", "starterPitcherId", "starterPitcherName"]));
  const runtimeProbableCount = boolCount(typedLineupSnapshots, (row) => lineupHasPitchingFallback(row, pitcherTeams));
  const rawBullpenCount = boolCount(teamRecords, (row) => hasAny(row, ["bullpenInningsLast3", "bullpenPitchesLast3", "highLeveragePitchesLast3", "closerAvailable"]));
  const runtimeBullpenCount = boolCount(typedLineupSnapshots, (row) => lineupHasBullpenFallback(row, pitcherTeams));

  const metrics = [
    metric("mlb_roster_identity", "Roster players with external IDs", boolCount(typedPlayers, (player) => Object.keys(asRecord(player.externalIds)).length > 0), playerTotal),
    metric("mlb_positions", "Roster players with positions", boolCount(typedPlayers, (player) => Boolean(player.position)), playerTotal),
    metric("mlb_recent_player_rows", "Roster players with recent stat rows", uniqueCount(typedPlayerStats, (row) => row.playerId), playerTotal),
    metric("mlb_starters_tagged", "Player stat rows tagged as starters", boolCount(typedPlayerStats, (row) => row.starter), statTotal),
    metric("mlb_statcast_profiles", "Player rows with Statcast profiles", boolCount(statRecords, (row) => Object.keys(asRecord(row.statcast)).length > 0), statTotal),
    metric("mlb_xwoba", "Player rows with xwOBA", boolCount(statRecords, (row) => hasNested(row, ["statcast", "xwoba"])), statTotal),
    metric("mlb_hard_hit", "Player rows with hard-hit rate", boolCount(statRecords, (row) => hasNested(row, ["statcast", "hardHitRate"])), statTotal),
    metric("mlb_pitch_mix", "Pitcher rows with pitch/arsenal profile", Math.max(rawPitchMixCount, runtimePitchMixCount), pitcherProfileTotal),
    metric("mlb_pitcher_context", "Pitcher rows with model context", Math.max(rawPitcherContextCount, runtimePitcherContextCount), pitcherProfileTotal),
    metric("mlb_plate_discipline", "Rows with plate-discipline tendency", boolCount(statRecords, (row) => hasNested(row, ["statcast", "chaseRate"]) || hasNested(row, ["statcast", "contactRate"]) || hasAny(row, ["strikeoutRate", "walkRate"])), statTotal),
    metric("mlb_probable_pitchers", "Games/teams with starter context", Math.max(rawProbableCount, runtimeProbableCount), typedLineupSnapshots.length ? lineupTotal : teamTotal),
    metric("mlb_bullpen_usage", "Games/teams with bullpen context", Math.max(rawBullpenCount, runtimeBullpenCount), typedLineupSnapshots.length ? lineupTotal : teamTotal)
  ];

  return buildLane("MLB", "MLB roster/player tendencies", metrics, {
    playerCount: typedPlayers.length,
    playerStatRows: typedPlayerStats.length,
    pitcherStatRows: pitcherStatRecords.length,
    teamStatRows: typedTeamStats.length,
    pitcherRatingRows: typedPitcherRatings.length,
    lineupSnapshotRows: typedLineupSnapshots.length,
    latestPlayerStatAt: latestIso(typedPlayerStats.map((row) => row.updatedAt)),
    latestTeamStatAt: latestIso(typedTeamStats.map((row) => (row as { updatedAt?: string | Date | null }).updatedAt)),
    latestPitcherRatingAt: latestIso(typedPitcherRatings.map((row) => (row as { snapshot_at?: string | Date | null }).snapshot_at)),
    latestLineupSnapshotAt: latestIso(typedLineupSnapshots.map((row) => row.captured_at))
  }, { includedInScore: true, scoringReason: "MLB is an active SimHub product lane." });
}

async function buildMmaLane(): Promise<TendencyCoverageLane> {
  const active = await safeActiveUfcFightSummary();
  let [fighters, features] = await Promise.all([safeUfcFighters(), safeUfcModelFeatures()]);
  const typedFeatures = features as UfcModelFeatureRow[];
  const autoBuild = await maybeBuildUfcFeatures(active.activeFights, features.length);
  if (autoBuild.attempted && autoBuild.features !== features.length) {
    features = await safeUfcModelFeatures();
    fighters = await safeUfcFighters();
  }
  const finalTypedFighters = fighters as UfcFighterRow[];
  const finalTypedFeatures = features as UfcModelFeatureRow[];

  const includedInScore = active.activeFights > 0 || finalTypedFeatures.length > 0;
  const fighterMap = new Map(finalTypedFighters.map((fighter) => [fighter.id, fighter]));
  const total = Math.max(1, finalTypedFeatures.length || finalTypedFighters.length || active.activeFights * 2);
  const featureRows = finalTypedFeatures.length;
  const metrics = [
    metric("mma_fighter_identity", "Fighters with model identity", boolCount(finalTypedFeatures, (row) => ufcHasIdentity(row, fighterMap.get(row.fighter_id))), total),
    metric("mma_bio_profiles", "Fighters with bio profile", boolCount(finalTypedFeatures, (row) => ufcHasBio(row, fighterMap.get(row.fighter_id))), total),
    metric("mma_reach_stance", "Fighters with reach/stance", boolCount(finalTypedFeatures, (row) => ufcHasReachStance(row, fighterMap.get(row.fighter_id))), total),
    metric("mma_fight_history", "Fighters with fight history", boolCount(finalTypedFeatures, ufcHasHistory), total),
    metric("mma_opponent_strength", "Fighters with opponent-strength context", boolCount(finalTypedFeatures, ufcHasOpponentStrength), total),
    metric("mma_striking_tendencies", "Fighters with striking tendencies", boolCount(finalTypedFeatures, (row) => ufcHasStriking(row, fighterMap.get(row.fighter_id))), total),
    metric("mma_grappling_tendencies", "Fighters with grappling tendencies", boolCount(finalTypedFeatures, (row) => ufcHasGrappling(row, fighterMap.get(row.fighter_id))), total),
    metric("mma_finish_profile", "Fighters with finish/decision profile", boolCount(finalTypedFeatures, (row) => ufcHasFinishProfile(row, fighterMap.get(row.fighter_id))), total),
    metric("mma_layoff_short_notice", "Fighters with layoff/short-notice flags", boolCount(finalTypedFeatures, ufcHasLayoff), total)
  ];

  return buildLane("MMA", "MMA fighter profiles/tendencies", metrics, {
    activeFights: active.activeFights,
    fighterCount: finalTypedFighters.length,
    featureRows,
    autoBuildAttempted: autoBuild.attempted ? 1 : 0,
    autoBuildFeatures: autoBuild.features,
    autoBuildError: autoBuild.error,
    latestFightDate: active.latestFightDate,
    latestFeatureUpdatedAt: latestIso(finalTypedFeatures.map((row) => row.updated_at)),
    latestFighterUpdatedAt: latestIso(finalTypedFighters.map((fighter) => fighter.updated_at))
  }, {
    includedInScore,
    scoringReason: includedInScore
      ? "MMA has active UFC warehouse/model feature rows and is counted in product readiness."
      : "MMA is not counted until UFC warehouse/model feature rows are loaded for active fight cards."
  });
}

export async function getPlayerTendencyCoverageReport(): Promise<PlayerTendencyCoverageReport> {
  const [mlbLane, mmaLane] = await Promise.all([buildMlbLane(), buildMmaLane()]);
  const lanes = [mlbLane, mmaLane];
  const scoredLanes = lanes.filter((lane) => lane.includedInScore);
  const score = Math.round(average(scoredLanes.map((lane) => lane.score)) ?? 0);
  const status = statusFromScore(score);
  const blockers = scoredLanes.flatMap((lane) => lane.status === "MISSING" ? [`${lane.sport}: ${lane.label} is missing.`] : []);
  const nextActions = lanes
    .flatMap((lane) => lane.includedInScore || lane.sport === "MLB" ? lane.nextActions : ["Load UFC warehouse fighters/fights and run /api/sim/ufc/features/auto-build before counting MMA fighter tendency readiness."])
    .slice(0, 12);

  return {
    generatedAt: new Date().toISOString(),
    score,
    status,
    lanes,
    blockers,
    nextActions: Array.from(new Set(nextActions))
  };
}
