import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbPlayerDataPipeTables } from "@/services/players/mlb-player-data-pipe";
import { ensureMlbRosterIntelligenceTables } from "@/services/simulation/mlb-roster-intelligence";

export type MlbPlayerRatingBacktestRow = {
  playerId: string;
  playerName: string;
  team: string;
  role: "BATTER" | "PITCHER";
  season: number;
  source: string;
  predictedOverall: number;
  actualOutcomeScore: number | null;
  error: number | null;
  absError: number | null;
  direction: "OVER_RATED" | "UNDER_RATED" | "ON_TARGET" | "PENDING";
  sourceSnapshotDate: string | null;
  outcomeSnapshotDate: string | null;
  sampleSize: number | null;
  sampleWeight: number | null;
  metrics: Record<string, unknown>;
};

export type MlbPlayerRatingBacktestResult = {
  ok: boolean;
  generatedAt: string;
  source: string;
  season: number | null;
  summary: {
    graded: number;
    pending: number;
    meanAbsError: number | null;
    meanError: number | null;
    withinFivePct: number | null;
    withinTenPct: number | null;
    overRated: number;
    underRated: number;
    onTarget: number;
  };
  rows: MlbPlayerRatingBacktestRow[];
  recommendations: Array<{ key: string; label: string; detail: string }>;
  warnings: string[];
};

type RatingRow = {
  player_id?: string;
  player_name?: string;
  pitcher_id?: string;
  pitcher_name?: string;
  team: string;
  season: number;
  overall: number | null;
  metrics_json: Record<string, unknown> | null;
  source: string;
  snapshot_at: Date | string;
};

type SnapshotRow = {
  player_id?: string;
  pitcher_id?: string;
  season: number;
  snapshot_date: Date | string;
  stats_json: Record<string, unknown>;
};

function n(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function stat(row: SnapshotRow, key: string) {
  return n(row.stats_json?.[key]);
}

function values(rows: SnapshotRow[], key: string) {
  return rows.map((row) => stat(row, key)).filter((value): value is number => value != null).sort((a, b) => a - b);
}

function percentile(rows: SnapshotRow[], key: string, value: number | null, invert = false) {
  if (value == null) return null;
  const pool = values(rows, key);
  if (pool.length < 3) return null;
  const belowOrEqual = pool.filter((item) => item <= value).length;
  const pct = (belowOrEqual / pool.length) * 100;
  return invert ? 100 - pct : pct;
}

function avgNullable(valuesIn: Array<number | null>) {
  const real = valuesIn.filter((value): value is number => value != null && Number.isFinite(value));
  if (!real.length) return null;
  return real.reduce((sum, value) => sum + value, 0) / real.length;
}

function batterOutcomeScore(row: SnapshotRow, leagueRows: SnapshotRow[]) {
  return avgNullable([
    percentile(leagueRows, "woba", stat(row, "woba") ?? stat(row, "xwoba")),
    percentile(leagueRows, "xwoba", stat(row, "xwoba") ?? stat(row, "woba")),
    percentile(leagueRows, "obp", stat(row, "obp")),
    percentile(leagueRows, "slg", stat(row, "slg")),
    percentile(leagueRows, "iso", stat(row, "iso")),
    percentile(leagueRows, "kRate", stat(row, "kRate"), true),
    percentile(leagueRows, "bbRate", stat(row, "bbRate"))
  ]);
}

function pitcherOutcomeScore(row: SnapshotRow, leagueRows: SnapshotRow[]) {
  return avgNullable([
    percentile(leagueRows, "xera", stat(row, "xera") ?? stat(row, "era"), true),
    percentile(leagueRows, "fip", stat(row, "fip") ?? stat(row, "xfip"), true),
    percentile(leagueRows, "kMinusBbRate", stat(row, "kMinusBbRate")),
    percentile(leagueRows, "kRate", stat(row, "kRate")),
    percentile(leagueRows, "bbRate", stat(row, "bbRate"), true),
    percentile(leagueRows, "hrPer9", stat(row, "hrPer9"), true),
    percentile(leagueRows, "groundBallRate", stat(row, "groundBallRate"))
  ]);
}

function direction(error: number | null): MlbPlayerRatingBacktestRow["direction"] {
  if (error == null) return "PENDING";
  if (Math.abs(error) <= 5) return "ON_TARGET";
  return error > 0 ? "OVER_RATED" : "UNDER_RATED";
}

function sourceDate(row: RatingRow) {
  const raw = row.metrics_json?.sourceSnapshotDate;
  if (typeof raw === "string") return raw.slice(0, 10);
  return isoDate(row.snapshot_at);
}

function sampleSize(row: RatingRow) {
  const value = n(row.metrics_json?.sampleSize);
  return value == null ? null : round(value, 2);
}

function sampleWeight(row: RatingRow) {
  const value = n(row.metrics_json?.sampleWeight);
  return value == null ? null : round(value, 3);
}

function nextSnapshot(id: string, sourceSnapshotDate: string | null, rows: SnapshotRow[], idKey: "player_id" | "pitcher_id") {
  if (!sourceSnapshotDate) return null;
  const sourceTime = new Date(sourceSnapshotDate).getTime();
  return rows
    .filter((row) => row[idKey] === id && new Date(row.snapshot_date).getTime() > sourceTime)
    .sort((a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime())[0] ?? null;
}

async function ensureBacktestTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_player_rating_backtest_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      season INTEGER,
      graded INTEGER NOT NULL DEFAULT 0,
      pending INTEGER NOT NULL DEFAULT 0,
      mean_abs_error DOUBLE PRECISION,
      summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function ratingRows(source: string, season?: number | null) {
  const [hitters, pitchers] = await Promise.all([
    season ? prisma.$queryRaw<RatingRow[]>`
      SELECT DISTINCT ON (player_id) player_id, player_name, team, season, overall, metrics_json, source, snapshot_at
      FROM mlb_player_ratings
      WHERE source = ${source} AND season = ${season}
      ORDER BY player_id, snapshot_at DESC;
    ` : prisma.$queryRaw<RatingRow[]>`
      SELECT DISTINCT ON (player_id) player_id, player_name, team, season, overall, metrics_json, source, snapshot_at
      FROM mlb_player_ratings
      WHERE source = ${source}
      ORDER BY player_id, snapshot_at DESC;
    `,
    season ? prisma.$queryRaw<RatingRow[]>`
      SELECT DISTINCT ON (pitcher_id) pitcher_id, pitcher_name, team, season, overall, metrics_json, source, snapshot_at
      FROM mlb_pitcher_ratings
      WHERE source = ${source} AND season = ${season}
      ORDER BY pitcher_id, snapshot_at DESC;
    ` : prisma.$queryRaw<RatingRow[]>`
      SELECT DISTINCT ON (pitcher_id) pitcher_id, pitcher_name, team, season, overall, metrics_json, source, snapshot_at
      FROM mlb_pitcher_ratings
      WHERE source = ${source}
      ORDER BY pitcher_id, snapshot_at DESC;
    `
  ]);
  return { hitters, pitchers };
}

async function snapshotRows(season?: number | null) {
  const [batters, pitchers] = await Promise.all([
    season ? prisma.$queryRaw<SnapshotRow[]>`
      SELECT player_id, season, snapshot_date, stats_json
      FROM mlb_batter_stat_snapshots
      WHERE season = ${season}
      ORDER BY snapshot_date ASC;
    ` : prisma.$queryRaw<SnapshotRow[]>`
      SELECT player_id, season, snapshot_date, stats_json
      FROM mlb_batter_stat_snapshots
      ORDER BY snapshot_date ASC;
    `,
    season ? prisma.$queryRaw<SnapshotRow[]>`
      SELECT pitcher_id, season, snapshot_date, stats_json
      FROM mlb_pitcher_stat_snapshots
      WHERE season = ${season}
      ORDER BY snapshot_date ASC;
    ` : prisma.$queryRaw<SnapshotRow[]>`
      SELECT pitcher_id, season, snapshot_date, stats_json
      FROM mlb_pitcher_stat_snapshots
      ORDER BY snapshot_date ASC;
    `
  ]);
  return { batters, pitchers };
}

function summary(rows: MlbPlayerRatingBacktestRow[]) {
  const graded = rows.filter((row) => row.absError != null);
  const errors = graded.map((row) => row.error!).filter(Number.isFinite);
  const abs = graded.map((row) => row.absError!).filter(Number.isFinite);
  const meanAbsError = abs.length ? round(abs.reduce((sum, value) => sum + value, 0) / abs.length, 2) : null;
  const meanError = errors.length ? round(errors.reduce((sum, value) => sum + value, 0) / errors.length, 2) : null;
  const withinFivePct = graded.length ? round((graded.filter((row) => (row.absError ?? 999) <= 5).length / graded.length) * 100, 1) : null;
  const withinTenPct = graded.length ? round((graded.filter((row) => (row.absError ?? 999) <= 10).length / graded.length) * 100, 1) : null;
  return {
    graded: graded.length,
    pending: rows.length - graded.length,
    meanAbsError,
    meanError,
    withinFivePct,
    withinTenPct,
    overRated: rows.filter((row) => row.direction === "OVER_RATED").length,
    underRated: rows.filter((row) => row.direction === "UNDER_RATED").length,
    onTarget: rows.filter((row) => row.direction === "ON_TARGET").length
  };
}

function recommendations(summaryData: ReturnType<typeof summary>) {
  const out: MlbPlayerRatingBacktestResult["recommendations"] = [];
  if (summaryData.graded === 0) out.push({ key: "need_future_snapshots", label: "Need future outcome snapshots", detail: "Backtest needs at least two stat snapshots per player so ratings can be compared against later outcomes." });
  if ((summaryData.meanAbsError ?? 0) > 12) out.push({ key: "reduce_rating_spread", label: "Reduce rating spread", detail: "Mean absolute error is high. Increase sample shrinkage or lower trait weighting volatility." });
  if ((summaryData.meanError ?? 0) > 5) out.push({ key: "ratings_too_high", label: "Ratings too aggressive", detail: "Positive mean error means cards are over-rating players relative to later outcomes." });
  if ((summaryData.meanError ?? 0) < -5) out.push({ key: "ratings_too_low", label: "Ratings too conservative", detail: "Negative mean error means cards are under-rating players relative to later outcomes." });
  if ((summaryData.withinTenPct ?? 100) < 60) out.push({ key: "recalibrate_weights", label: "Recalibrate trait weights", detail: "Less than 60% of graded cards are within 10 points. Use errors by role/trait to tune weights." });
  return out;
}

export async function getMlbPlayerRatingBacktest(args: { source?: string | null; season?: number | null; limit?: number | null } = {}): Promise<MlbPlayerRatingBacktestResult> {
  const source = args.source?.trim() || "calibrated-stat-pipe-v1";
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, generatedAt: new Date().toISOString(), source, season: args.season ?? null, summary: { graded: 0, pending: 0, meanAbsError: null, meanError: null, withinFivePct: null, withinTenPct: null, overRated: 0, underRated: 0, onTarget: 0 }, rows: [], recommendations: [], warnings: ["No usable server database URL is configured."] };
  }
  await ensureMlbPlayerDataPipeTables();
  await ensureMlbRosterIntelligenceTables();
  await ensureBacktestTables();
  const [{ hitters, pitchers }, snapshots] = await Promise.all([ratingRows(source, args.season), snapshotRows(args.season)]);
  const rows: MlbPlayerRatingBacktestRow[] = [];
  for (const rating of hitters) {
    const id = String(rating.player_id);
    const sourceSnapshotDate = sourceDate(rating);
    const outcome = nextSnapshot(id, sourceSnapshotDate, snapshots.batters, "player_id");
    const actual = outcome ? batterOutcomeScore(outcome, snapshots.batters) : null;
    const predicted = rating.overall ?? 0;
    const error = actual == null ? null : round(predicted - actual, 2);
    rows.push({
      playerId: id,
      playerName: String(rating.player_name),
      team: rating.team,
      role: "BATTER",
      season: rating.season,
      source: rating.source,
      predictedOverall: round(predicted, 2),
      actualOutcomeScore: actual == null ? null : round(actual, 2),
      error,
      absError: error == null ? null : round(Math.abs(error), 2),
      direction: direction(error),
      sourceSnapshotDate,
      outcomeSnapshotDate: isoDate(outcome?.snapshot_date),
      sampleSize: sampleSize(rating),
      sampleWeight: sampleWeight(rating),
      metrics: rating.metrics_json ?? {}
    });
  }
  for (const rating of pitchers) {
    const id = String(rating.pitcher_id);
    const sourceSnapshotDate = sourceDate(rating);
    const outcome = nextSnapshot(id, sourceSnapshotDate, snapshots.pitchers, "pitcher_id");
    const actual = outcome ? pitcherOutcomeScore(outcome, snapshots.pitchers) : null;
    const predicted = rating.overall ?? 0;
    const error = actual == null ? null : round(predicted - actual, 2);
    rows.push({
      playerId: id,
      playerName: String(rating.pitcher_name),
      team: rating.team,
      role: "PITCHER",
      season: rating.season,
      source: rating.source,
      predictedOverall: round(predicted, 2),
      actualOutcomeScore: actual == null ? null : round(actual, 2),
      error,
      absError: error == null ? null : round(Math.abs(error), 2),
      direction: direction(error),
      sourceSnapshotDate,
      outcomeSnapshotDate: isoDate(outcome?.snapshot_date),
      sampleSize: sampleSize(rating),
      sampleWeight: sampleWeight(rating),
      metrics: rating.metrics_json ?? {}
    });
  }
  const sorted = rows.sort((a, b) => (b.absError ?? -1) - (a.absError ?? -1));
  const limited = sorted.slice(0, Math.max(1, Math.min(250, Math.round(args.limit ?? 80))));
  const summaryData = summary(rows);
  await prisma.$executeRaw`
    INSERT INTO mlb_player_rating_backtest_runs (id, source, season, graded, pending, mean_abs_error, summary_json)
    VALUES (${crypto.randomUUID()}, ${source}, ${args.season ?? null}, ${summaryData.graded}, ${summaryData.pending}, ${summaryData.meanAbsError}, ${JSON.stringify(summaryData)}::jsonb);
  `;
  const warnings: string[] = [];
  if (!hitters.length && !pitchers.length) warnings.push(`No calibrated rating rows found for source ${source}.`);
  if (!summaryData.graded) warnings.push("No rows graded yet. Add future stat snapshots after the calibration source snapshot date.");
  return { ok: Boolean(rows.length), generatedAt: new Date().toISOString(), source, season: args.season ?? null, summary: summaryData, rows: limited, recommendations: recommendations(summaryData), warnings };
}
