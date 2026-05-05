import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";
import { buildMlbIntelV7Probability, calculateProbabilityClvPct } from "@/services/simulation/mlb-intel-v7-probability";

type SimGame = {
  id: string;
  label: string;
  startTime: string;
  status: string;
  leagueKey: LeagueKey;
  leagueLabel: string;
  scoreboard?: string | null;
};

type ScoreResult = {
  homeScore: number;
  awayScore: number;
  finalTotal: number;
  finalMargin: number;
  homeWon: boolean;
};

type RuntimeMlbIntel = {
  modelVersion?: string | null;
  dataSource?: string | null;
  market?: {
    homeNoVigProbability?: number | null;
    homeOddsAmerican?: number | null;
    awayOddsAmerican?: number | null;
    totalLine?: number | null;
    source?: string | null;
  } | null;
  governor?: {
    confidence?: number | null;
    tier?: string | null;
    noBet?: boolean | null;
    reasons?: string[] | null;
  } | null;
  calibration?: unknown;
  uncertainty?: unknown;
  lock?: unknown;
  runModel?: unknown;
  factors?: unknown;
  features?: unknown;
};

type V7LedgerRow = {
  id: string;
  game_id: string;
  market: string;
  side: "HOME" | "AWAY";
  calibrated_probability: number;
  market_no_vig_probability: number | null;
  closing_probability: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
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
  return { homeScore, awayScore, finalTotal: homeScore + awayScore, finalMargin: homeScore - awayScore, homeWon: homeScore > awayScore };
}

function probabilityLogLoss(probability: number, outcome: 0 | 1) {
  const p = clamp(probability, 0.001, 0.999);
  return outcome === 1 ? -Math.log(p) : -Math.log(1 - p);
}

function brier(probability: number, outcome: 0 | 1) {
  return (probability - outcome) ** 2;
}

function rowOutcome(side: "HOME" | "AWAY", result: ScoreResult) {
  if (result.homeScore === result.awayScore) return null;
  return side === "HOME" ? (result.homeWon ? 1 : 0) : (result.homeWon ? 0 : 1);
}

function sideProbabilityFromHome(side: "HOME" | "AWAY", homeProbability: number) {
  return side === "HOME" ? homeProbability : 1 - homeProbability;
}

async function fetchMlbGames() {
  const sections = await buildBoardSportSections({ selectedLeague: "MLB", gamesByLeague: {}, maxScoreboardGames: null });
  return sections.flatMap((section) => section.leagueKey === "MLB"
    ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))
    : []) as SimGame[];
}

async function finalScoreMap() {
  const games = await fetchMlbGames();
  const map = new Map<string, ScoreResult>();
  for (const game of games) {
    if (game.status !== "FINAL") continue;
    const result = parseScoreboard(game.scoreboard);
    if (result) map.set(game.id, result);
  }
  return map;
}

export async function ensureMlbIntelV7Ledgers() {
  if (!hasUsableServerDatabaseUrl()) return false;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_model_snapshot_ledger (
      id TEXT PRIMARY KEY,
      snapshot_key TEXT NOT NULL UNIQUE,
      game_id TEXT NOT NULL,
      event_label TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_team TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      market TEXT NOT NULL DEFAULT 'moneyline',
      side TEXT NOT NULL,
      model_version TEXT NOT NULL DEFAULT 'mlb-intel-v7',
      captured_at TIMESTAMPTZ NOT NULL,
      released_at TIMESTAMPTZ,
      raw_probability DOUBLE PRECISION NOT NULL,
      calibrated_probability DOUBLE PRECISION NOT NULL,
      market_open_odds DOUBLE PRECISION,
      market_close_odds DOUBLE PRECISION,
      market_no_vig_probability DOUBLE PRECISION,
      closing_probability DOUBLE PRECISION,
      edge DOUBLE PRECISION,
      result TEXT NOT NULL DEFAULT 'PENDING',
      final_home_score DOUBLE PRECISION,
      final_away_score DOUBLE PRECISION,
      brier DOUBLE PRECISION,
      log_loss DOUBLE PRECISION,
      clv DOUBLE PRECISION,
      roi DOUBLE PRECISION,
      prediction_json JSONB,
      result_json JSONB,
      graded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_official_pick_ledger (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      event_label TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_team TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      market TEXT NOT NULL DEFAULT 'moneyline',
      side TEXT NOT NULL,
      model_version TEXT NOT NULL DEFAULT 'mlb-intel-v7',
      captured_at TIMESTAMPTZ NOT NULL,
      released_at TIMESTAMPTZ NOT NULL,
      raw_probability DOUBLE PRECISION NOT NULL,
      calibrated_probability DOUBLE PRECISION NOT NULL,
      market_open_odds DOUBLE PRECISION,
      market_close_odds DOUBLE PRECISION,
      market_no_vig_probability DOUBLE PRECISION,
      closing_probability DOUBLE PRECISION,
      edge DOUBLE PRECISION,
      stake DOUBLE PRECISION NOT NULL DEFAULT 1,
      result TEXT NOT NULL DEFAULT 'PENDING',
      final_home_score DOUBLE PRECISION,
      final_away_score DOUBLE PRECISION,
      brier DOUBLE PRECISION,
      log_loss DOUBLE PRECISION,
      clv DOUBLE PRECISION,
      roi DOUBLE PRECISION,
      profit_loss DOUBLE PRECISION,
      prediction_json JSONB,
      result_json JSONB,
      graded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (game_id, market, side, model_version)
    );
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_model_snapshot_ledger_game_idx ON mlb_model_snapshot_ledger (game_id, captured_at DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_model_snapshot_ledger_model_idx ON mlb_model_snapshot_ledger (model_version, market, captured_at DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_official_pick_ledger_game_idx ON mlb_official_pick_ledger (game_id, released_at DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_official_pick_ledger_model_idx ON mlb_official_pick_ledger (model_version, market, released_at DESC);`);
  return true;
}

async function insertSnapshot(args: {
  game: SimGame;
  side: "HOME" | "AWAY";
  rawSideProbability: number;
  calibratedSideProbability: number;
  marketSideProbability: number | null;
  edge: number | null;
  predictionJson: Record<string, unknown>;
}) {
  const matchup = parseMatchup(args.game.label);
  const capturedAt = new Date();
  const snapshotKey = `MLB:${args.game.id}:moneyline:mlb-intel-v7:${capturedAt.toISOString().slice(0, 13)}`;
  await prisma.$executeRaw`
    INSERT INTO mlb_model_snapshot_ledger (
      id, snapshot_key, game_id, event_label, away_team, home_team, start_time, market, side, model_version,
      captured_at, raw_probability, calibrated_probability, market_no_vig_probability, edge, prediction_json
    ) VALUES (
      ${crypto.randomUUID()}, ${snapshotKey}, ${args.game.id}, ${args.game.label}, ${matchup.away}, ${matchup.home}, ${new Date(args.game.startTime)}, 'moneyline', ${args.side}, 'mlb-intel-v7',
      ${capturedAt}, ${args.rawSideProbability}, ${args.calibratedSideProbability}, ${args.marketSideProbability}, ${args.edge}, ${safeJson(args.predictionJson)}::jsonb
    )
    ON CONFLICT (snapshot_key) DO UPDATE SET
      captured_at = EXCLUDED.captured_at,
      raw_probability = EXCLUDED.raw_probability,
      calibrated_probability = EXCLUDED.calibrated_probability,
      market_no_vig_probability = EXCLUDED.market_no_vig_probability,
      edge = EXCLUDED.edge,
      prediction_json = EXCLUDED.prediction_json,
      updated_at = now();
  `;
}

async function insertOfficialPick(args: {
  game: SimGame;
  side: "HOME" | "AWAY";
  rawSideProbability: number;
  calibratedSideProbability: number;
  marketSideProbability: number | null;
  edge: number | null;
  predictionJson: Record<string, unknown>;
}) {
  const matchup = parseMatchup(args.game.label);
  const capturedAt = new Date();
  await prisma.$executeRaw`
    INSERT INTO mlb_official_pick_ledger (
      id, game_id, event_label, away_team, home_team, start_time, market, side, model_version,
      captured_at, released_at, raw_probability, calibrated_probability, market_no_vig_probability, edge, prediction_json
    ) VALUES (
      ${crypto.randomUUID()}, ${args.game.id}, ${args.game.label}, ${matchup.away}, ${matchup.home}, ${new Date(args.game.startTime)}, 'moneyline', ${args.side}, 'mlb-intel-v7',
      ${capturedAt}, ${capturedAt}, ${args.rawSideProbability}, ${args.calibratedSideProbability}, ${args.marketSideProbability}, ${args.edge}, ${safeJson(args.predictionJson)}::jsonb
    )
    ON CONFLICT (game_id, market, side, model_version) DO UPDATE SET
      captured_at = EXCLUDED.captured_at,
      raw_probability = EXCLUDED.raw_probability,
      calibrated_probability = EXCLUDED.calibrated_probability,
      market_no_vig_probability = EXCLUDED.market_no_vig_probability,
      edge = EXCLUDED.edge,
      prediction_json = EXCLUDED.prediction_json,
      updated_at = now();
  `;
}

export async function captureCurrentMlbIntelV7Ledgers() {
  const databaseReady = await ensureMlbIntelV7Ledgers();
  if (!databaseReady) return { ok: false, databaseReady, capturedSnapshots: 0, officialPicks: 0, skipped: 0, error: "No usable server database URL is configured." };

  const games = await fetchMlbGames();
  let capturedSnapshots = 0;
  let officialPicks = 0;
  let skipped = 0;

  for (const game of games) {
    if (game.status === "FINAL" || game.status === "POSTPONED" || game.status === "CANCELED") {
      skipped += 1;
      continue;
    }

    const projection = await buildSimProjection(game);
    const mlbIntel = (projection.mlbIntel ?? null) as RuntimeMlbIntel | null;
    const v7 = buildMlbIntelV7Probability({
      rawHomeWinPct: projection.distribution.homeWinPct,
      marketHomeNoVigProbability: mlbIntel?.market?.homeNoVigProbability ?? null,
      existingConfidence: mlbIntel?.governor?.confidence ?? null,
      existingTier: mlbIntel?.governor?.tier ?? null
    });
    const snapshotSide: "HOME" | "AWAY" = v7.finalHomeWinPct >= 0.5 ? "HOME" : "AWAY";
    const rawSideProbability = sideProbabilityFromHome(snapshotSide, projection.distribution.homeWinPct);
    const calibratedSideProbability = sideProbabilityFromHome(snapshotSide, v7.finalHomeWinPct);
    const marketSideProbability = v7.marketHomeNoVigProbability == null ? null : sideProbabilityFromHome(snapshotSide, v7.marketHomeNoVigProbability);
    const edge = marketSideProbability == null ? null : round(calibratedSideProbability - marketSideProbability, 4);
    const predictionJson = {
      version: "mlb-intel-v7",
      gameId: game.id,
      eventLabel: game.label,
      matchup: projection.matchup,
      rawDistribution: projection.distribution,
      v7,
      mlbIntel: {
        previousModelVersion: mlbIntel?.modelVersion ?? null,
        dataSource: mlbIntel?.dataSource ?? null,
        market: mlbIntel?.market ?? null,
        governor: mlbIntel?.governor ?? null,
        calibration: mlbIntel?.calibration ?? null,
        uncertainty: mlbIntel?.uncertainty ?? null,
        lock: mlbIntel?.lock ?? null,
        runModel: mlbIntel?.runModel ?? null,
        factors: mlbIntel?.factors ?? null,
        features: mlbIntel?.features ?? null
      }
    };

    await insertSnapshot({ game, side: snapshotSide, rawSideProbability, calibratedSideProbability, marketSideProbability, edge, predictionJson });
    capturedSnapshots += 1;

    if (v7.pickSide) {
      const officialSide = v7.pickSide;
      const officialRawProbability = sideProbabilityFromHome(officialSide, projection.distribution.homeWinPct);
      const officialCalibratedProbability = sideProbabilityFromHome(officialSide, v7.finalHomeWinPct);
      const officialMarketProbability = v7.marketHomeNoVigProbability == null ? null : sideProbabilityFromHome(officialSide, v7.marketHomeNoVigProbability);
      const officialEdge = officialMarketProbability == null ? null : round(officialCalibratedProbability - officialMarketProbability, 4);
      await insertOfficialPick({ game, side: officialSide, rawSideProbability: officialRawProbability, calibratedSideProbability: officialCalibratedProbability, marketSideProbability: officialMarketProbability, edge: officialEdge, predictionJson });
      officialPicks += 1;
    }
  }

  return { ok: true, databaseReady, capturedSnapshots, officialPicks, skipped };
}

async function gradeTable(tableName: "mlb_model_snapshot_ledger" | "mlb_official_pick_ledger") {
  const finals = await finalScoreMap();
  const rows = await prisma.$queryRawUnsafe<V7LedgerRow[]>(`
    SELECT id, game_id, market, side, calibrated_probability, market_no_vig_probability, closing_probability
    FROM ${tableName}
    WHERE graded_at IS NULL
    ORDER BY captured_at ASC
    LIMIT 1000;
  `);
  let graded = 0;

  for (const row of rows) {
    const result = finals.get(row.game_id);
    if (!result) continue;
    const outcome = rowOutcome(row.side, result);
    const resultLabel = outcome == null ? "PUSH" : outcome === 1 ? "WIN" : "LOSS";
    const rowBrier = outcome == null ? null : brier(row.calibrated_probability, outcome);
    const rowLogLoss = outcome == null ? null : probabilityLogLoss(row.calibrated_probability, outcome);
    const closeHomeProbability = row.closing_probability ?? row.market_no_vig_probability;
    const clv = calculateProbabilityClvPct({
      side: row.side,
      openHomeNoVigProbability: row.side === "HOME" ? row.market_no_vig_probability : row.market_no_vig_probability == null ? null : 1 - row.market_no_vig_probability,
      closeHomeNoVigProbability: row.side === "HOME" ? closeHomeProbability : closeHomeProbability == null ? null : 1 - closeHomeProbability
    });
    await prisma.$executeRawUnsafe(`
      UPDATE ${tableName}
      SET result = $1,
        final_home_score = $2,
        final_away_score = $3,
        brier = $4,
        log_loss = $5,
        clv = $6,
        result_json = $7::jsonb,
        graded_at = now(),
        updated_at = now()
      WHERE id = $8;
    `, resultLabel, result.homeScore, result.awayScore, rowBrier, rowLogLoss, clv, safeJson(result), row.id);
    graded += 1;
  }

  return graded;
}

export async function gradeMlbIntelV7Ledgers() {
  const databaseReady = await ensureMlbIntelV7Ledgers();
  if (!databaseReady) return { ok: false, databaseReady, gradedSnapshots: 0, gradedOfficialPicks: 0, error: "No usable server database URL is configured." };
  const [gradedSnapshots, gradedOfficialPicks] = await Promise.all([
    gradeTable("mlb_model_snapshot_ledger"),
    gradeTable("mlb_official_pick_ledger")
  ]);
  return { ok: true, databaseReady, gradedSnapshots, gradedOfficialPicks };
}

export async function getMlbIntelV7LedgerSummary(windowDays = 90) {
  const databaseReady = await ensureMlbIntelV7Ledgers();
  if (!databaseReady) return { ok: false, databaseReady, error: "No usable server database URL is configured." };
  const since = new Date(Date.now() - Math.max(1, Math.min(3650, Math.round(windowDays))) * 24 * 60 * 60 * 1000);
  const [snapshotRows, pickRows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint; settled: bigint; pending: bigint; wins: bigint; losses: bigint; brier: number | null; log_loss: number | null; clv: number | null }>>`
      SELECT COUNT(*)::bigint AS total, COUNT(graded_at)::bigint AS settled,
        SUM(CASE WHEN result = 'PENDING' THEN 1 ELSE 0 END)::bigint AS pending,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END)::bigint AS wins,
        SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END)::bigint AS losses,
        AVG(brier) AS brier, AVG(log_loss) AS log_loss, AVG(clv) AS clv
      FROM mlb_model_snapshot_ledger
      WHERE captured_at >= ${since};
    `,
    prisma.$queryRaw<Array<{ total: bigint; settled: bigint; pending: bigint; wins: bigint; losses: bigint; brier: number | null; log_loss: number | null; clv: number | null; roi: number | null }>>`
      SELECT COUNT(*)::bigint AS total, COUNT(graded_at)::bigint AS settled,
        SUM(CASE WHEN result = 'PENDING' THEN 1 ELSE 0 END)::bigint AS pending,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END)::bigint AS wins,
        SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END)::bigint AS losses,
        AVG(brier) AS brier, AVG(log_loss) AS log_loss, AVG(clv) AS clv, AVG(roi) AS roi
      FROM mlb_official_pick_ledger
      WHERE released_at >= ${since};
    `
  ]);
  const snapshot = snapshotRows[0];
  const picks = pickRows[0];
  const pickWins = Number(picks?.wins ?? 0);
  const pickLosses = Number(picks?.losses ?? 0);
  return {
    ok: true,
    databaseReady,
    windowDays,
    snapshotLedger: {
      total: Number(snapshot?.total ?? 0),
      settled: Number(snapshot?.settled ?? 0),
      pending: Number(snapshot?.pending ?? 0),
      wins: Number(snapshot?.wins ?? 0),
      losses: Number(snapshot?.losses ?? 0),
      brier: round(snapshot?.brier),
      logLoss: round(snapshot?.log_loss),
      clv: round(snapshot?.clv, 3)
    },
    officialPickLedger: {
      total: Number(picks?.total ?? 0),
      settled: Number(picks?.settled ?? 0),
      pending: Number(picks?.pending ?? 0),
      wins: pickWins,
      losses: pickLosses,
      winRate: pickWins + pickLosses > 0 ? round(pickWins / (pickWins + pickLosses), 3) : null,
      brier: round(picks?.brier),
      logLoss: round(picks?.log_loss),
      clv: round(picks?.clv, 3),
      roi: round(picks?.roi, 3)
    },
    neutralBaselines: { brier: 0.25, logLoss: round(Math.log(2), 4) }
  };
}
