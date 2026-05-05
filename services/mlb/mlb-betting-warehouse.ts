import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbSpineTables } from "./mlb-game-spine";

type CountRow = { betting_games: number | bigint; markets: number | bigint; grades: number | bigint; situations: number | bigint; trend_rows: number | bigint; latest_updated_at: Date | string | null };
type TrendRow = { id: string; game_pk: number | bigint; event_label: string | null; side: string | null; market_type: string | null; result: string | null; trend_key: string | null; updated_at: Date | string };

export type MlbBettingWarehouseRun = {
  ok: boolean;
  generatedAt: string;
  sourceNote: string;
  stats: { bettingGames: number; marketRows: number; gradeRows: number; situationRows: number; trendRows: number };
  error?: string;
};

export type MlbBettingWarehouseHealth = {
  generatedAt: string;
  sourceNote: string;
  stats: { bettingGames: number; marketRows: number; gradeRows: number; situationRows: number; trendRows: number; latestUpdatedAt: string | null };
  latestTrendRows: Array<{ id: string; gamePk: number; eventLabel: string; side: string; marketType: string; result: string; trendKey: string; updatedAt: string }>;
  blockers: string[];
};

function iso(value: unknown) { if (!value) return null; const parsed = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }
function n(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }

export async function ensureMlbBettingWarehouseTables() {
  await ensureMlbSpineTables();
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS mlb_betting_games (game_pk INTEGER PRIMARY KEY REFERENCES mlb_games(game_pk) ON DELETE CASCADE, event_label TEXT NOT NULL, official_date DATE, game_date TIMESTAMPTZ, home_team_id INTEGER, away_team_id INTEGER, home_team_name TEXT, away_team_name TEXT, home_score INTEGER, away_score INTEGER, total_runs INTEGER, winning_team_id INTEGER, losing_team_id INTEGER, is_final BOOLEAN NOT NULL DEFAULT false, home_result TEXT, away_result TEXT, source TEXT NOT NULL DEFAULT 'mlb-spine', updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS mlb_market_open_close (id TEXT PRIMARY KEY, game_pk INTEGER REFERENCES mlb_games(game_pk) ON DELETE CASCADE, event_id TEXT, market_type TEXT NOT NULL, side TEXT NOT NULL, selection TEXT, sportsbook_name TEXT, open_price DOUBLE PRECISION, close_price DOUBLE PRECISION, current_price DOUBLE PRECISION, open_point DOUBLE PRECISION, close_point DOUBLE PRECISION, current_point DOUBLE PRECISION, first_seen_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ, source TEXT NOT NULL DEFAULT 'market_line_history', updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS mlb_result_grades (id TEXT PRIMARY KEY, game_pk INTEGER REFERENCES mlb_games(game_pk) ON DELETE CASCADE, market_type TEXT NOT NULL, side TEXT NOT NULL, result TEXT NOT NULL, units DOUBLE PRECISION NOT NULL DEFAULT 0, closing_price DOUBLE PRECISION, closing_point DOUBLE PRECISION, grading_note TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS mlb_team_situations (id TEXT PRIMARY KEY, game_pk INTEGER REFERENCES mlb_games(game_pk) ON DELETE CASCADE, team_id INTEGER, opponent_team_id INTEGER, side TEXT NOT NULL, home_away TEXT NOT NULL, team_name TEXT, opponent_name TEXT, result TEXT, scored INTEGER, allowed INTEGER, total_runs INTEGER, is_favorite BOOLEAN, price_bucket TEXT, total_bucket TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS mlb_trend_rows (id TEXT PRIMARY KEY, game_pk INTEGER REFERENCES mlb_games(game_pk) ON DELETE CASCADE, team_id INTEGER, event_label TEXT, market_type TEXT NOT NULL, side TEXT NOT NULL, result TEXT NOT NULL, units DOUBLE PRECISION NOT NULL DEFAULT 0, price DOUBLE PRECISION, point DOUBLE PRECISION, trend_key TEXT NOT NULL, qualifiers JSONB NOT NULL DEFAULT '{}'::jsonb, source TEXT NOT NULL DEFAULT 'mlb-betting-warehouse', updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS mlb_trend_rows_key_idx ON mlb_trend_rows (trend_key, updated_at DESC)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS mlb_market_open_close_game_idx ON mlb_market_open_close (game_pk, market_type, side)`;
}

async function refreshBettingGames() {
  await prisma.$executeRaw`
    INSERT INTO mlb_betting_games (game_pk, event_label, official_date, game_date, home_team_id, away_team_id, home_team_name, away_team_name, home_score, away_score, total_runs, winning_team_id, losing_team_id, is_final, home_result, away_result, updated_at)
    SELECT g.game_pk, CONCAT(g.away_team_name, ' @ ', g.home_team_name), g.official_date, g.game_date, g.home_team_id, g.away_team_id, g.home_team_name, g.away_team_name, r.home_score, r.away_score,
      CASE WHEN r.home_score IS NULL OR r.away_score IS NULL THEN NULL ELSE r.home_score + r.away_score END,
      r.winning_team_id, r.losing_team_id, COALESCE(r.is_final, false),
      CASE WHEN r.is_final IS NOT TRUE OR r.winning_team_id IS NULL THEN 'pending' WHEN r.winning_team_id = g.home_team_id THEN 'win' ELSE 'loss' END,
      CASE WHEN r.is_final IS NOT TRUE OR r.winning_team_id IS NULL THEN 'pending' WHEN r.winning_team_id = g.away_team_id THEN 'win' ELSE 'loss' END,
      now()
    FROM mlb_games g
    LEFT JOIN mlb_game_results r ON r.game_pk = g.game_pk
    ON CONFLICT (game_pk) DO UPDATE SET event_label = EXCLUDED.event_label, official_date = EXCLUDED.official_date, game_date = EXCLUDED.game_date, home_team_id = EXCLUDED.home_team_id, away_team_id = EXCLUDED.away_team_id, home_team_name = EXCLUDED.home_team_name, away_team_name = EXCLUDED.away_team_name, home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score, total_runs = EXCLUDED.total_runs, winning_team_id = EXCLUDED.winning_team_id, losing_team_id = EXCLUDED.losing_team_id, is_final = EXCLUDED.is_final, home_result = EXCLUDED.home_result, away_result = EXCLUDED.away_result, updated_at = now()
  `;
}

async function refreshMarketOpenClose() {
  await prisma.$executeRaw`
    INSERT INTO mlb_market_open_close (id, game_pk, event_id, market_type, side, selection, sportsbook_name, open_price, close_price, current_price, open_point, close_point, current_point, first_seen_at, last_seen_at, source, updated_at)
    SELECT CONCAT('mlb-market:', e.id, ':', mlh.market_type, ':', mlh.side, ':', COALESCE(mlh.selection, ''), ':', COALESCE(mlh.sportsbook_name, 'book')),
      NULL, e.id, mlh.market_type, mlh.side, mlh.selection, mlh.sportsbook_name,
      first_row.price, latest_row.price, latest_row.price, first_row.point, latest_row.point, latest_row.point,
      MIN(mlh.captured_at), MAX(mlh.captured_at), 'market_line_history', now()
    FROM market_line_history mlh
    JOIN events e ON e.id = mlh.event_id
    JOIN leagues l ON l.id = e.league_id AND l.key = 'MLB'
    JOIN LATERAL (SELECT price, point FROM market_line_history x WHERE x.event_id = mlh.event_id AND x.market_type = mlh.market_type AND x.side = mlh.side AND COALESCE(x.selection, '') = COALESCE(mlh.selection, '') AND COALESCE(x.sportsbook_name, '') = COALESCE(mlh.sportsbook_name, '') ORDER BY x.captured_at ASC LIMIT 1) first_row ON TRUE
    JOIN LATERAL (SELECT price, point FROM market_line_history x WHERE x.event_id = mlh.event_id AND x.market_type = mlh.market_type AND x.side = mlh.side AND COALESCE(x.selection, '') = COALESCE(mlh.selection, '') AND COALESCE(x.sportsbook_name, '') = COALESCE(mlh.sportsbook_name, '') ORDER BY x.captured_at DESC LIMIT 1) latest_row ON TRUE
    GROUP BY e.id, mlh.market_type, mlh.side, mlh.selection, mlh.sportsbook_name, first_row.price, latest_row.price, first_row.point, latest_row.point
    ON CONFLICT (id) DO UPDATE SET open_price = EXCLUDED.open_price, close_price = EXCLUDED.close_price, current_price = EXCLUDED.current_price, open_point = EXCLUDED.open_point, close_point = EXCLUDED.close_point, current_point = EXCLUDED.current_point, first_seen_at = EXCLUDED.first_seen_at, last_seen_at = EXCLUDED.last_seen_at, updated_at = now()
  `;
}

async function refreshTeamSituations() {
  await prisma.$executeRaw`
    INSERT INTO mlb_team_situations (id, game_pk, team_id, opponent_team_id, side, home_away, team_name, opponent_name, result, scored, allowed, total_runs, updated_at)
    SELECT CONCAT(bg.game_pk, ':home'), bg.game_pk, bg.home_team_id, bg.away_team_id, 'home', 'home', bg.home_team_name, bg.away_team_name, bg.home_result, bg.home_score, bg.away_score, bg.total_runs, now() FROM mlb_betting_games bg
    ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result, scored = EXCLUDED.scored, allowed = EXCLUDED.allowed, total_runs = EXCLUDED.total_runs, updated_at = now()
  `;
  await prisma.$executeRaw`
    INSERT INTO mlb_team_situations (id, game_pk, team_id, opponent_team_id, side, home_away, team_name, opponent_name, result, scored, allowed, total_runs, updated_at)
    SELECT CONCAT(bg.game_pk, ':away'), bg.game_pk, bg.away_team_id, bg.home_team_id, 'away', 'away', bg.away_team_name, bg.home_team_name, bg.away_result, bg.away_score, bg.home_score, bg.total_runs, now() FROM mlb_betting_games bg
    ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result, scored = EXCLUDED.scored, allowed = EXCLUDED.allowed, total_runs = EXCLUDED.total_runs, updated_at = now()
  `;
}

async function refreshResultGradesAndTrendRows() {
  await prisma.$executeRaw`DELETE FROM mlb_result_grades WHERE source IS NULL OR source IS NOT NULL`;
  await prisma.$executeRaw`DELETE FROM mlb_trend_rows WHERE source = 'mlb-betting-warehouse'`;
  await prisma.$executeRaw`
    INSERT INTO mlb_result_grades (id, game_pk, market_type, side, result, units, grading_note, updated_at)
    SELECT CONCAT(bg.game_pk, ':moneyline:home'), bg.game_pk, 'moneyline', 'home', bg.home_result, CASE WHEN bg.home_result = 'win' THEN 1 WHEN bg.home_result = 'loss' THEN -1 ELSE 0 END, 'MLB spine moneyline grade without price.', now() FROM mlb_betting_games bg WHERE bg.is_final = true
  `;
  await prisma.$executeRaw`
    INSERT INTO mlb_result_grades (id, game_pk, market_type, side, result, units, grading_note, updated_at)
    SELECT CONCAT(bg.game_pk, ':moneyline:away'), bg.game_pk, 'moneyline', 'away', bg.away_result, CASE WHEN bg.away_result = 'win' THEN 1 WHEN bg.away_result = 'loss' THEN -1 ELSE 0 END, 'MLB spine moneyline grade without price.', now() FROM mlb_betting_games bg WHERE bg.is_final = true
  `;
  await prisma.$executeRaw`
    INSERT INTO mlb_trend_rows (id, game_pk, team_id, event_label, market_type, side, result, units, trend_key, qualifiers, updated_at)
    SELECT CONCAT('trend:', rg.id), rg.game_pk, s.team_id, bg.event_label, rg.market_type, rg.side, rg.result, rg.units,
      CONCAT('MLB|', rg.market_type, '|', rg.side, '|', s.home_away, '|runs_', CASE WHEN s.scored >= 5 THEN '5_plus' ELSE 'under_5' END),
      jsonb_build_object('homeAway', s.home_away, 'scored', s.scored, 'allowed', s.allowed, 'totalRuns', s.total_runs), now()
    FROM mlb_result_grades rg
    JOIN mlb_betting_games bg ON bg.game_pk = rg.game_pk
    JOIN mlb_team_situations s ON s.game_pk = rg.game_pk AND s.side = rg.side
  `;
}

export async function runMlbBettingWarehouseRefresh(): Promise<MlbBettingWarehouseRun> {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, generatedAt: new Date().toISOString(), sourceNote: 'DATABASE_URL unavailable.', stats: { bettingGames: 0, marketRows: 0, gradeRows: 0, situationRows: 0, trendRows: 0 }, error: 'DATABASE_URL unavailable.' };
  try {
    await ensureMlbBettingWarehouseTables();
    await refreshBettingGames();
    await refreshMarketOpenClose();
    await refreshTeamSituations();
    await refreshResultGradesAndTrendRows();
    const h = await buildMlbBettingWarehouseHealth();
    return { ok: true, generatedAt: new Date().toISOString(), sourceNote: 'MLB betting warehouse refreshed from game spine, results, and market rows.', stats: { bettingGames: h.stats.bettingGames, marketRows: h.stats.marketRows, gradeRows: h.stats.gradeRows, situationRows: h.stats.situationRows, trendRows: h.stats.trendRows } };
  } catch (error) {
    return { ok: false, generatedAt: new Date().toISOString(), sourceNote: 'MLB betting warehouse refresh failed.', stats: { bettingGames: 0, marketRows: 0, gradeRows: 0, situationRows: 0, trendRows: 0 }, error: error instanceof Error ? error.message : 'Unknown warehouse error.' };
  }
}

export async function buildMlbBettingWarehouseHealth(): Promise<MlbBettingWarehouseHealth> {
  if (!hasUsableServerDatabaseUrl()) return { generatedAt: new Date().toISOString(), sourceNote: 'DATABASE_URL unavailable.', stats: { bettingGames: 0, marketRows: 0, gradeRows: 0, situationRows: 0, trendRows: 0, latestUpdatedAt: null }, latestTrendRows: [], blockers: ['DATABASE_URL unavailable.'] };
  try {
    await ensureMlbBettingWarehouseTables();
    const [counts, rows] = await Promise.all([
      prisma.$queryRaw<CountRow[]>`SELECT (SELECT COUNT(*) FROM mlb_betting_games) AS betting_games, (SELECT COUNT(*) FROM mlb_market_open_close) AS markets, (SELECT COUNT(*) FROM mlb_result_grades) AS grades, (SELECT COUNT(*) FROM mlb_team_situations) AS situations, (SELECT COUNT(*) FROM mlb_trend_rows) AS trend_rows, (SELECT MAX(updated_at) FROM mlb_trend_rows) AS latest_updated_at`,
      prisma.$queryRaw<TrendRow[]>`SELECT id, game_pk, event_label, side, market_type, result, trend_key, updated_at FROM mlb_trend_rows ORDER BY updated_at DESC LIMIT 12`
    ]);
    const c = counts[0]; const blockers: string[] = [];
    if (!n(c?.betting_games)) blockers.push('No MLB betting game rows yet. Refresh MLB spine first.');
    if (!n(c?.trend_rows)) blockers.push('No MLB trend rows yet. Final results may not be available yet.');
    if (!n(c?.markets)) blockers.push('No MLB market open/close rows yet. Run provider odds ingestion.');
    return { generatedAt: new Date().toISOString(), sourceNote: 'MLB betting warehouse turns official MLB games/results and market rows into trend-ready betting rows.', stats: { bettingGames: n(c?.betting_games), marketRows: n(c?.markets), gradeRows: n(c?.grades), situationRows: n(c?.situations), trendRows: n(c?.trend_rows), latestUpdatedAt: iso(c?.latest_updated_at) }, latestTrendRows: rows.map((row) => ({ id: row.id, gamePk: Number(row.game_pk), eventLabel: row.event_label ?? 'MLB game', side: row.side ?? 'unknown', marketType: row.market_type ?? 'unknown', result: row.result ?? 'unknown', trendKey: row.trend_key ?? 'unknown', updatedAt: iso(row.updated_at) ?? String(row.updated_at) })), blockers };
  } catch (error) {
    return { generatedAt: new Date().toISOString(), sourceNote: 'MLB betting warehouse health failed.', stats: { bettingGames: 0, marketRows: 0, gradeRows: 0, situationRows: 0, trendRows: 0, latestUpdatedAt: null }, latestTrendRows: [], blockers: [error instanceof Error ? error.message : 'Unknown warehouse health error.'] };
  }
}
