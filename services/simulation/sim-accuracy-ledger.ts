import { Prisma } from "@prisma/client";
import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type SupportedAccuracyLeague = Extract<LeagueKey, "NBA" | "MLB">;
type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string; scoreboard?: string | null };
type Projection = Awaited<ReturnType<typeof buildSimProjection>>;
type EdgeResult = Awaited<ReturnType<typeof buildMlbEdges>>["edges"][number];

type ScoreResult = {
  homeScore: number;
  awayScore: number;
  finalTotal: number;
  finalMargin: number;
  homeWon: boolean;
};

export type SimAccuracyRecord = {
  key: "last7" | "last15" | "allTime";
  label: string;
  snapshots: number;
  graded: number;
  wins: number;
  losses: number;
  pushes: number;
  winPct: number | null;
  brier: number | null;
  logLoss: number | null;
  spreadMae: number | null;
  totalMae: number | null;
  avgConfidence: number | null;
};

export type SimAccuracySummary = {
  ok: boolean;
  databaseReady: boolean;
  totalSnapshots: number;
  gradedSnapshots: number;
  ungradedSnapshots: number;
  history: SimAccuracyRecord[];
  byLeague: Array<{
    league: string;
    snapshots: number;
    graded: number;
    wins: number;
    losses: number;
    pushes: number;
    winPct: number | null;
    brier: number | null;
    logLoss: number | null;
    spreadMae: number | null;
    totalMae: number | null;
    avgConfidence: number | null;
    calibrationBuckets: Array<{ bucket: string; count: number; avgPredicted: number; actualRate: number; brier: number }>;
  }>;
  recent: Array<{
    id: string;
    league: string;
    gameId: string;
    eventLabel: string;
    capturedAt: string;
    status: string;
    tier: string | null;
    confidence: number | null;
    modelHomeWinPct: number;
    modelPick: "HOME" | "AWAY";
    modelPickLabel: string;
    pickResult: "win" | "loss" | "push" | "pending";
    finalHomeScore: number | null;
    finalAwayScore: number | null;
    brier: number | null;
    spreadError: number | null;
    totalError: number | null;
  }>;
  error?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function nowBucket(date = new Date()) {
  return date.toISOString().slice(0, 13);
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseMatchup(label: string) {
  const atSplit = label.split(" @ ");
  if (atSplit.length === 2) return { away: atSplit[0]?.trim() || "Away", home: atSplit[1]?.trim() || "Home" };
  const vsSplit = label.split(" vs ");
  if (vsSplit.length === 2) return { away: vsSplit[0]?.trim() || "Away", home: vsSplit[1]?.trim() || "Home" };
  return { away: "Away", home: "Home" };
}

function parseScoreboard(scoreboard: string | null | undefined): ScoreResult | null {
  if (!scoreboard) return null;
  const [awayPart, homePart] = scoreboard.split(" - ");
  if (!awayPart || !homePart) return null;
  const awayMatch = awayPart.match(/(-?\d+(?:\.\d+)?)\s*$/);
  const homeMatch = homePart.match(/(-?\d+(?:\.\d+)?)\s*$/);
  const awayScore = awayMatch ? Number(awayMatch[1]) : NaN;
  const homeScore = homeMatch ? Number(homeMatch[1]) : NaN;
  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) return null;
  return {
    homeScore,
    awayScore,
    finalTotal: homeScore + awayScore,
    finalMargin: homeScore - awayScore,
    homeWon: homeScore > awayScore
  };
}

function probabilityLogLoss(probability: number, outcome: 0 | 1) {
  const p = clamp(probability, 0.001, 0.999);
  return outcome === 1 ? -Math.log(p) : -Math.log(1 - p);
}

function brier(probability: number, outcome: 0 | 1) {
  return (probability - outcome) ** 2;
}

function projectionMeta(projection: Projection, league: LeagueKey) {
  if (league === "NBA" && projection.nbaIntel) {
    return {
      modelVersion: projection.nbaIntel.modelVersion,
      dataSource: projection.nbaIntel.dataSource,
      tier: projection.nbaIntel.tier,
      noBet: projection.nbaIntel.noBet,
      confidence: projection.nbaIntel.confidence,
      projectedTotal: projection.nbaIntel.projectedTotal
    };
  }

  if (league === "MLB" && projection.mlbIntel) {
    return {
      modelVersion: projection.mlbIntel.modelVersion,
      dataSource: projection.mlbIntel.dataSource,
      tier: projection.mlbIntel.governor?.tier ?? null,
      noBet: projection.mlbIntel.governor?.noBet ?? false,
      confidence: projection.mlbIntel.governor?.confidence ?? null,
      projectedTotal: projection.mlbIntel.projectedTotal
    };
  }

  return {
    modelVersion: "sim-projection-engine",
    dataSource: "fallback",
    tier: "pass",
    noBet: true,
    confidence: null,
    projectedTotal: projection.distribution.avgAway + projection.distribution.avgHome
  };
}

function bucketFor(probability: number) {
  const lower = Math.floor(clamp(probability, 0, 0.999) * 10) * 10;
  return `${lower}-${lower + 10}%`;
}

async function ensureAccuracyTable() {
  if (!hasUsableServerDatabaseUrl()) return false;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sim_prediction_snapshots (
      id TEXT PRIMARY KEY,
      snapshot_key TEXT NOT NULL UNIQUE,
      league TEXT NOT NULL,
      game_id TEXT NOT NULL,
      event_label TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_team TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL,
      model_version TEXT,
      data_source TEXT,
      tier TEXT,
      no_bet BOOLEAN DEFAULT FALSE,
      confidence DOUBLE PRECISION,
      model_home_win_pct DOUBLE PRECISION NOT NULL,
      model_away_win_pct DOUBLE PRECISION NOT NULL,
      model_spread DOUBLE PRECISION NOT NULL,
      model_total DOUBLE PRECISION NOT NULL,
      model_home_score DOUBLE PRECISION NOT NULL,
      model_away_score DOUBLE PRECISION NOT NULL,
      market_home_win_pct DOUBLE PRECISION,
      market_spread DOUBLE PRECISION,
      market_total DOUBLE PRECISION,
      final_home_score DOUBLE PRECISION,
      final_away_score DOUBLE PRECISION,
      final_margin DOUBLE PRECISION,
      final_total DOUBLE PRECISION,
      home_won BOOLEAN,
      brier DOUBLE PRECISION,
      log_loss DOUBLE PRECISION,
      spread_error DOUBLE PRECISION,
      total_error DOUBLE PRECISION,
      calibration_bucket TEXT,
      prediction_json JSONB,
      result_json JSONB,
      graded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sim_prediction_snapshots_league_captured_idx ON sim_prediction_snapshots (league, captured_at DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sim_prediction_snapshots_game_idx ON sim_prediction_snapshots (league, game_id);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sim_prediction_snapshots_graded_idx ON sim_prediction_snapshots (graded_at, start_time);`);
  return true;
}

async function insertOrUpdateSnapshot(args: {
  game: SimGame;
  projection: Projection;
  edge?: EdgeResult | null;
}) {
  const { game, projection, edge } = args;
  const matchup = parseMatchup(game.label);
  const meta = projectionMeta(projection, game.leagueKey);
  const capturedAt = new Date();
  const modelHomeScore = projection.distribution.avgHome;
  const modelAwayScore = projection.distribution.avgAway;
  const modelSpread = modelHomeScore - modelAwayScore;
  const modelTotal = meta.projectedTotal ?? modelHomeScore + modelAwayScore;
  const id = crypto.randomUUID();
  const snapshotKey = `${game.leagueKey}:${game.id}:${nowBucket(capturedAt)}`;
  const marketTotal = edge?.market?.total ?? null;
  const predictionJson = {
    matchup: projection.matchup,
    distribution: projection.distribution,
    read: projection.read,
    statSheet: projection.statSheet,
    nbaIntel: projection.nbaIntel ? {
      modelVersion: projection.nbaIntel.modelVersion,
      tier: projection.nbaIntel.tier,
      confidence: projection.nbaIntel.confidence,
      noBet: projection.nbaIntel.noBet,
      dataSource: projection.nbaIntel.dataSource,
      projectedTotal: projection.nbaIntel.projectedTotal,
      volatilityIndex: projection.nbaIntel.volatilityIndex
    } : null,
    mlbIntel: projection.mlbIntel ? {
      modelVersion: projection.mlbIntel.modelVersion,
      dataSource: projection.mlbIntel.dataSource,
      homeEdge: projection.mlbIntel.homeEdge,
      projectedTotal: projection.mlbIntel.projectedTotal,
      volatilityIndex: projection.mlbIntel.volatilityIndex,
      governor: projection.mlbIntel.governor,
      calibration: projection.mlbIntel.calibration,
      uncertainty: projection.mlbIntel.uncertainty
    } : null,
    market: edge?.market ?? null
  };

  await prisma.$executeRaw`
    INSERT INTO sim_prediction_snapshots (
      id, snapshot_key, league, game_id, event_label, away_team, home_team, start_time, status, captured_at,
      model_version, data_source, tier, no_bet, confidence,
      model_home_win_pct, model_away_win_pct, model_spread, model_total, model_home_score, model_away_score,
      market_home_win_pct, market_spread, market_total, calibration_bucket, prediction_json
    ) VALUES (
      ${id}, ${snapshotKey}, ${game.leagueKey}, ${game.id}, ${game.label}, ${matchup.away}, ${matchup.home}, ${new Date(game.startTime)}, ${game.status}, ${capturedAt},
      ${meta.modelVersion}, ${meta.dataSource}, ${meta.tier}, ${meta.noBet}, ${meta.confidence},
      ${projection.distribution.homeWinPct}, ${projection.distribution.awayWinPct}, ${modelSpread}, ${modelTotal}, ${modelHomeScore}, ${modelAwayScore},
      ${null}, ${null}, ${marketTotal}, ${bucketFor(projection.distribution.homeWinPct)}, ${safeJson(predictionJson)}::jsonb
    )
    ON CONFLICT (snapshot_key) DO UPDATE SET
      status = EXCLUDED.status,
      captured_at = EXCLUDED.captured_at,
      model_version = EXCLUDED.model_version,
      data_source = EXCLUDED.data_source,
      tier = EXCLUDED.tier,
      no_bet = EXCLUDED.no_bet,
      confidence = EXCLUDED.confidence,
      model_home_win_pct = EXCLUDED.model_home_win_pct,
      model_away_win_pct = EXCLUDED.model_away_win_pct,
      model_spread = EXCLUDED.model_spread,
      model_total = EXCLUDED.model_total,
      model_home_score = EXCLUDED.model_home_score,
      model_away_score = EXCLUDED.model_away_score,
      market_total = EXCLUDED.market_total,
      calibration_bucket = EXCLUDED.calibration_bucket,
      prediction_json = EXCLUDED.prediction_json,
      updated_at = now();
  `;
}

async function fetchSimGames(leagues: SupportedAccuracyLeague[]) {
  const sections = await buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {}, maxScoreboardGames: null });
  return sections.flatMap((section) =>
    leagues.includes(section.leagueKey as SupportedAccuracyLeague)
      ? section.scoreboard.map((game) => ({
        ...game,
        leagueKey: section.leagueKey,
        leagueLabel: section.leagueLabel
      }))
      : []
  ) as SimGame[];
}

export async function captureCurrentSimPredictionSnapshots(leagues: SupportedAccuracyLeague[] = ["NBA", "MLB"]) {
  const databaseReady = await ensureAccuracyTable();
  if (!databaseReady) {
    return { ok: false, databaseReady, captured: 0, skipped: 0, error: "No usable server database URL is configured." };
  }

  const [games, edgeData] = await Promise.all([
    fetchSimGames(leagues),
    leagues.includes("MLB") ? buildMlbEdges().catch(() => ({ edges: [] as EdgeResult[] })) : Promise.resolve({ edges: [] as EdgeResult[] })
  ]);
  const edgeByGame = new Map((edgeData.edges ?? []).map((edge) => [edge.gameId, edge]));
  let captured = 0;
  let skipped = 0;

  for (const game of games) {
    if (game.status === "FINAL" || game.status === "POSTPONED" || game.status === "CANCELED") {
      skipped += 1;
      continue;
    }
    const projection = await buildSimProjection(game);
    await insertOrUpdateSnapshot({ game, projection, edge: edgeByGame.get(game.id) ?? null });
    captured += 1;
  }

  return { ok: true, databaseReady, captured, skipped };
}

async function finalScoreMap(leagues: SupportedAccuracyLeague[]) {
  const games = await fetchSimGames(leagues);
  const map = new Map<string, ScoreResult>();
  for (const game of games) {
    if (game.status !== "FINAL") continue;
    const result = parseScoreboard(game.scoreboard);
    if (result) map.set(`${game.leagueKey}:${game.id}`, result);
  }
  return map;
}

export async function gradeFinalSimPredictionSnapshots(leagues: SupportedAccuracyLeague[] = ["NBA", "MLB"]) {
  const databaseReady = await ensureAccuracyTable();
  if (!databaseReady) {
    return { ok: false, databaseReady, graded: 0, availableFinals: 0, error: "No usable server database URL is configured." };
  }

  const finals = await finalScoreMap(leagues);
  let graded = 0;

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    league: string;
    game_id: string;
    model_home_win_pct: number;
    model_spread: number;
    model_total: number;
  }>>`
    SELECT id, league, game_id, model_home_win_pct, model_spread, model_total
    FROM sim_prediction_snapshots
    WHERE graded_at IS NULL
      AND league IN ('NBA', 'MLB')
    ORDER BY captured_at ASC
    LIMIT 500;
  `;

  for (const row of rows) {
    const result = finals.get(`${row.league}:${row.game_id}`);
    if (!result) continue;
    const outcome = result.homeWon ? 1 : 0;
    const rowBrier = brier(row.model_home_win_pct, outcome);
    const rowLogLoss = probabilityLogLoss(row.model_home_win_pct, outcome);
    const spreadError = Math.abs(row.model_spread - result.finalMargin);
    const totalError = Math.abs(row.model_total - result.finalTotal);
    await prisma.$executeRaw`
      UPDATE sim_prediction_snapshots
      SET
        status = 'FINAL',
        final_home_score = ${result.homeScore},
        final_away_score = ${result.awayScore},
        final_margin = ${result.finalMargin},
        final_total = ${result.finalTotal},
        home_won = ${result.homeWon},
        brier = ${rowBrier},
        log_loss = ${rowLogLoss},
        spread_error = ${spreadError},
        total_error = ${totalError},
        result_json = ${safeJson(result)}::jsonb,
        graded_at = now(),
        updated_at = now()
      WHERE id = ${row.id};
    `;
    graded += 1;
  }

  return { ok: true, databaseReady, graded, availableFinals: finals.size };
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function winPct(wins: number, losses: number) {
  const decisions = wins + losses;
  if (decisions <= 0) return null;
  return wins / decisions;
}

function pickResult(row: { model_home_win_pct: number; home_won: boolean | null; final_home_score: number | null; final_away_score: number | null }) {
  if (row.home_won == null || row.final_home_score == null || row.final_away_score == null) return "pending" as const;
  if (row.final_home_score === row.final_away_score) return "push" as const;
  const pickedHome = row.model_home_win_pct >= 0.5;
  return pickedHome === row.home_won ? "win" as const : "loss" as const;
}

export async function getSimAccuracySummary(limit = 20): Promise<SimAccuracySummary> {
  const databaseReady = await ensureAccuracyTable();
  if (!databaseReady) {
    return { ok: false, databaseReady, totalSnapshots: 0, gradedSnapshots: 0, ungradedSnapshots: 0, history: [], byLeague: [], recent: [], error: "No usable server database URL is configured." };
  }

  const totals = await prisma.$queryRaw<Array<{ total: bigint; graded: bigint }>>`
    SELECT COUNT(*)::bigint AS total, COUNT(graded_at)::bigint AS graded
    FROM sim_prediction_snapshots;
  `;
  const totalSnapshots = Number(totals[0]?.total ?? 0);
  const gradedSnapshots = Number(totals[0]?.graded ?? 0);

  const historyRows = await prisma.$queryRaw<Array<{
    window_key: "last7" | "last15" | "allTime";
    label: string;
    snapshots: bigint;
    graded: bigint;
    wins: bigint;
    losses: bigint;
    pushes: bigint;
    brier: number | null;
    log_loss: number | null;
    spread_mae: number | null;
    total_mae: number | null;
    avg_confidence: number | null;
  }>>`
    WITH windows AS (
      SELECT 'last7'::text AS window_key, 'Last 7 days'::text AS label, now() - interval '7 days' AS starts_at, 1 AS sort_order
      UNION ALL
      SELECT 'last15'::text AS window_key, 'Last 15 days'::text AS label, now() - interval '15 days' AS starts_at, 2 AS sort_order
      UNION ALL
      SELECT 'allTime'::text AS window_key, 'All time'::text AS label, NULL::timestamptz AS starts_at, 3 AS sort_order
    )
    SELECT
      windows.window_key,
      windows.label,
      COUNT(s.id)::bigint AS snapshots,
      COUNT(s.graded_at)::bigint AS graded,
      SUM(CASE
        WHEN s.graded_at IS NOT NULL
          AND s.final_home_score <> s.final_away_score
          AND ((s.model_home_win_pct >= 0.5 AND s.home_won = TRUE) OR (s.model_home_win_pct < 0.5 AND s.home_won = FALSE))
        THEN 1 ELSE 0 END)::bigint AS wins,
      SUM(CASE
        WHEN s.graded_at IS NOT NULL
          AND s.final_home_score <> s.final_away_score
          AND NOT ((s.model_home_win_pct >= 0.5 AND s.home_won = TRUE) OR (s.model_home_win_pct < 0.5 AND s.home_won = FALSE))
        THEN 1 ELSE 0 END)::bigint AS losses,
      SUM(CASE WHEN s.graded_at IS NOT NULL AND s.final_home_score = s.final_away_score THEN 1 ELSE 0 END)::bigint AS pushes,
      AVG(s.brier) AS brier,
      AVG(s.log_loss) AS log_loss,
      AVG(s.spread_error) AS spread_mae,
      AVG(s.total_error) AS total_mae,
      AVG(s.confidence) AS avg_confidence
    FROM windows
    LEFT JOIN sim_prediction_snapshots s ON windows.starts_at IS NULL OR s.captured_at >= windows.starts_at
    GROUP BY windows.window_key, windows.label, windows.sort_order
    ORDER BY windows.sort_order;
  `;

  const leagueRows = await prisma.$queryRaw<Array<{
    league: string;
    snapshots: bigint;
    graded: bigint;
    wins: bigint;
    losses: bigint;
    pushes: bigint;
    brier: number | null;
    log_loss: number | null;
    spread_mae: number | null;
    total_mae: number | null;
    avg_confidence: number | null;
  }>>`
    SELECT league,
      COUNT(*)::bigint AS snapshots,
      COUNT(graded_at)::bigint AS graded,
      SUM(CASE
        WHEN graded_at IS NOT NULL
          AND final_home_score <> final_away_score
          AND ((model_home_win_pct >= 0.5 AND home_won = TRUE) OR (model_home_win_pct < 0.5 AND home_won = FALSE))
        THEN 1 ELSE 0 END)::bigint AS wins,
      SUM(CASE
        WHEN graded_at IS NOT NULL
          AND final_home_score <> final_away_score
          AND NOT ((model_home_win_pct >= 0.5 AND home_won = TRUE) OR (model_home_win_pct < 0.5 AND home_won = FALSE))
        THEN 1 ELSE 0 END)::bigint AS losses,
      SUM(CASE WHEN graded_at IS NOT NULL AND final_home_score = final_away_score THEN 1 ELSE 0 END)::bigint AS pushes,
      AVG(brier) AS brier,
      AVG(log_loss) AS log_loss,
      AVG(spread_error) AS spread_mae,
      AVG(total_error) AS total_mae,
      AVG(confidence) AS avg_confidence
    FROM sim_prediction_snapshots
    GROUP BY league
    ORDER BY league;
  `;

  const bucketRows = await prisma.$queryRaw<Array<{
    league: string;
    calibration_bucket: string;
    count: bigint;
    avg_predicted: number;
    actual_rate: number;
    brier: number;
  }>>`
    SELECT league, calibration_bucket,
      COUNT(*)::bigint AS count,
      AVG(model_home_win_pct) AS avg_predicted,
      AVG(CASE WHEN home_won THEN 1.0 ELSE 0.0 END) AS actual_rate,
      AVG(brier) AS brier
    FROM sim_prediction_snapshots
    WHERE graded_at IS NOT NULL
    GROUP BY league, calibration_bucket
    ORDER BY league, calibration_bucket;
  `;

  const recentRows = await prisma.$queryRaw<Array<{
    id: string;
    league: string;
    game_id: string;
    event_label: string;
    away_team: string;
    home_team: string;
    captured_at: Date;
    status: string;
    tier: string | null;
    confidence: number | null;
    model_home_win_pct: number;
    home_won: boolean | null;
    final_home_score: number | null;
    final_away_score: number | null;
    brier: number | null;
    spread_error: number | null;
    total_error: number | null;
  }>>`
    SELECT id, league, game_id, event_label, away_team, home_team, captured_at, status, tier, confidence, model_home_win_pct,
      home_won, final_home_score, final_away_score, brier, spread_error, total_error
    FROM sim_prediction_snapshots
    ORDER BY captured_at DESC
    LIMIT ${limit};
  `;

  return {
    ok: true,
    databaseReady,
    totalSnapshots,
    gradedSnapshots,
    ungradedSnapshots: Math.max(0, totalSnapshots - gradedSnapshots),
    history: historyRows.map((row) => {
      const wins = Number(row.wins);
      const losses = Number(row.losses);
      return {
        key: row.window_key,
        label: row.label,
        snapshots: Number(row.snapshots),
        graded: Number(row.graded),
        wins,
        losses,
        pushes: Number(row.pushes),
        winPct: round(winPct(wins, losses), 3),
        brier: round(normalizeNumber(row.brier)),
        logLoss: round(normalizeNumber(row.log_loss)),
        spreadMae: round(normalizeNumber(row.spread_mae), 2),
        totalMae: round(normalizeNumber(row.total_mae), 2),
        avgConfidence: round(normalizeNumber(row.avg_confidence), 3)
      };
    }),
    byLeague: leagueRows.map((row) => {
      const wins = Number(row.wins);
      const losses = Number(row.losses);
      return {
        league: row.league,
        snapshots: Number(row.snapshots),
        graded: Number(row.graded),
        wins,
        losses,
        pushes: Number(row.pushes),
        winPct: round(winPct(wins, losses), 3),
        brier: round(normalizeNumber(row.brier)),
        logLoss: round(normalizeNumber(row.log_loss)),
        spreadMae: round(normalizeNumber(row.spread_mae), 2),
        totalMae: round(normalizeNumber(row.total_mae), 2),
        avgConfidence: round(normalizeNumber(row.avg_confidence), 3),
        calibrationBuckets: bucketRows
          .filter((bucket) => bucket.league === row.league)
          .map((bucket) => ({
            bucket: bucket.calibration_bucket,
            count: Number(bucket.count),
            avgPredicted: round(normalizeNumber(bucket.avg_predicted), 3) ?? 0,
            actualRate: round(normalizeNumber(bucket.actual_rate), 3) ?? 0,
            brier: round(normalizeNumber(bucket.brier), 4) ?? 0
          }))
      };
    }),
    recent: recentRows.map((row) => {
      const pickedHome = row.model_home_win_pct >= 0.5;
      return {
        id: row.id,
        league: row.league,
        gameId: row.game_id,
        eventLabel: row.event_label,
        capturedAt: row.captured_at.toISOString(),
        status: row.status,
        tier: row.tier,
        confidence: round(normalizeNumber(row.confidence), 3),
        modelHomeWinPct: round(row.model_home_win_pct, 3) ?? row.model_home_win_pct,
        modelPick: pickedHome ? "HOME" : "AWAY",
        modelPickLabel: pickedHome ? row.home_team : row.away_team,
        pickResult: pickResult(row),
        finalHomeScore: round(normalizeNumber(row.final_home_score), 2),
        finalAwayScore: round(normalizeNumber(row.final_away_score), 2),
        brier: round(normalizeNumber(row.brier), 4),
        spreadError: round(normalizeNumber(row.spread_error), 2),
        totalError: round(normalizeNumber(row.total_error), 2)
      };
    })
  };
}

export async function runSimAccuracyLedgerJob() {
  const capture = await captureCurrentSimPredictionSnapshots();
  const grade = await gradeFinalSimPredictionSnapshots();
  const summary = await getSimAccuracySummary(12);
  return { ok: capture.ok && grade.ok && summary.ok, capture, grade, summary };
}
