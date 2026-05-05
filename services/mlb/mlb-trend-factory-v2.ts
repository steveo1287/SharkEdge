import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbBettingWarehouseTables } from "./mlb-betting-warehouse";

type SystemRow = {
  system_key: string;
  market_type: string;
  side: string;
  sample_size: number | bigint;
  wins: number | bigint;
  losses: number | bigint;
  pushes: number | bigint;
  units: number | string | null;
  last_seen_at: Date | string | null;
};

type StoredSystemRow = {
  system_key: string;
  title: string;
  market_type: string;
  side: string;
  sample_size: number | bigint;
  wins: number | bigint;
  losses: number | bigint;
  pushes: number | bigint;
  win_rate_pct: number | string | null;
  units: number | string | null;
  roi_pct: number | string | null;
  grade: string;
  active_today: boolean;
  blockers: string[] | null;
  updated_at: Date | string;
};

export type MlbTrendFactoryRun = {
  ok: boolean;
  generatedAt: string;
  sourceNote: string;
  stats: { sourceRows: number; systemsBuilt: number; visibleSystems: number; activeToday: number };
  error?: string;
};

export type MlbTrendFactoryHealth = {
  generatedAt: string;
  sourceNote: string;
  stats: { sourceRows: number; systems: number; visibleSystems: number; activeToday: number; latestUpdatedAt: string | null };
  systems: Array<{
    systemKey: string;
    title: string;
    marketType: string;
    side: string;
    sampleSize: number;
    record: string;
    winRatePct: number;
    units: number;
    roiPct: number;
    grade: string;
    activeToday: boolean;
    blockers: string[];
    updatedAt: string;
  }>;
  blockers: string[];
};

function n(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function iso(value: unknown) { if (!value) return null; const d = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
function pct(wins: number, losses: number) { const denom = wins + losses; return denom ? (wins / denom) * 100 : 0; }
function grade(sample: number, winRate: number, units: number) { if (sample >= 100 && units >= 10 && winRate >= 55) return "A"; if (sample >= 50 && units >= 5 && winRate >= 53) return "B"; if (sample >= 20 && units > 0) return "C"; if (sample >= 10) return "D"; return "F"; }
function titleFromKey(key: string) { return key.replace(/\|/g, " · ").replace(/_/g, " "); }
function blockers(sample: number, winRate: number, units: number) { const b: string[] = []; if (sample < 20) b.push("sample_below_20"); if (units <= 0) b.push("non_positive_units"); if (winRate < 52) b.push("win_rate_below_52"); return b; }

export async function ensureMlbTrendFactoryTables() {
  await ensureMlbBettingWarehouseTables();
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS mlb_generated_systems_v2 (system_key TEXT PRIMARY KEY, title TEXT NOT NULL, market_type TEXT NOT NULL, side TEXT NOT NULL, sample_size INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, pushes INTEGER NOT NULL DEFAULT 0, win_rate_pct DOUBLE PRECISION NOT NULL DEFAULT 0, units DOUBLE PRECISION NOT NULL DEFAULT 0, roi_pct DOUBLE PRECISION NOT NULL DEFAULT 0, grade TEXT NOT NULL DEFAULT 'F', visible BOOLEAN NOT NULL DEFAULT false, active_today BOOLEAN NOT NULL DEFAULT false, blockers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS mlb_generated_systems_v2_grade_idx ON mlb_generated_systems_v2 (visible, grade, updated_at DESC)`;
}

async function sourceCount() {
  const rows = await prisma.$queryRaw<Array<{ count: number | bigint }>>`SELECT COUNT(*) AS count FROM mlb_trend_rows`;
  return n(rows[0]?.count);
}

async function buildRows() {
  return prisma.$queryRaw<SystemRow[]>`
    SELECT trend_key AS system_key, market_type, side,
      COUNT(*) AS sample_size,
      COUNT(*) FILTER (WHERE result = 'win') AS wins,
      COUNT(*) FILTER (WHERE result = 'loss') AS losses,
      COUNT(*) FILTER (WHERE result NOT IN ('win','loss')) AS pushes,
      SUM(units) AS units,
      MAX(updated_at) AS last_seen_at
    FROM mlb_trend_rows
    GROUP BY trend_key, market_type, side
    ORDER BY sample_size DESC
  `;
}

export async function runMlbTrendFactoryV2(): Promise<MlbTrendFactoryRun> {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, generatedAt: new Date().toISOString(), sourceNote: "DATABASE_URL unavailable.", stats: { sourceRows: 0, systemsBuilt: 0, visibleSystems: 0, activeToday: 0 }, error: "DATABASE_URL unavailable." };
  try {
    await ensureMlbTrendFactoryTables();
    const rows = await buildRows();
    for (const row of rows) {
      const sample = n(row.sample_size); const wins = n(row.wins); const losses = n(row.losses); const pushes = n(row.pushes); const units = n(row.units);
      const winRate = pct(wins, losses); const roi = sample ? (units / sample) * 100 : 0; const g = grade(sample, winRate, units); const b = blockers(sample, winRate, units); const visible = ["A", "B", "C"].includes(g) && b.length === 0;
      await prisma.$executeRaw`INSERT INTO mlb_generated_systems_v2 (system_key, title, market_type, side, sample_size, wins, losses, pushes, win_rate_pct, units, roi_pct, grade, visible, active_today, blockers, updated_at) VALUES (${row.system_key}, ${titleFromKey(row.system_key)}, ${row.market_type}, ${row.side}, ${sample}, ${wins}, ${losses}, ${pushes}, ${winRate}, ${units}, ${roi}, ${g}, ${visible}, false, ${b}, now()) ON CONFLICT (system_key) DO UPDATE SET title = EXCLUDED.title, sample_size = EXCLUDED.sample_size, wins = EXCLUDED.wins, losses = EXCLUDED.losses, pushes = EXCLUDED.pushes, win_rate_pct = EXCLUDED.win_rate_pct, units = EXCLUDED.units, roi_pct = EXCLUDED.roi_pct, grade = EXCLUDED.grade, visible = EXCLUDED.visible, active_today = EXCLUDED.active_today, blockers = EXCLUDED.blockers, updated_at = now()`;
    }
    const health = await buildMlbTrendFactoryHealth();
    return { ok: true, generatedAt: new Date().toISOString(), sourceNote: "MLB trend factory grouped trend rows into generated systems.", stats: { sourceRows: health.stats.sourceRows, systemsBuilt: health.stats.systems, visibleSystems: health.stats.visibleSystems, activeToday: health.stats.activeToday } };
  } catch (error) {
    return { ok: false, generatedAt: new Date().toISOString(), sourceNote: "MLB trend factory failed.", stats: { sourceRows: 0, systemsBuilt: 0, visibleSystems: 0, activeToday: 0 }, error: error instanceof Error ? error.message : "Unknown trend factory error." };
  }
}

export async function buildMlbTrendFactoryHealth(): Promise<MlbTrendFactoryHealth> {
  if (!hasUsableServerDatabaseUrl()) return { generatedAt: new Date().toISOString(), sourceNote: "DATABASE_URL unavailable.", stats: { sourceRows: 0, systems: 0, visibleSystems: 0, activeToday: 0, latestUpdatedAt: null }, systems: [], blockers: ["DATABASE_URL unavailable."] };
  try {
    await ensureMlbTrendFactoryTables();
    const [sourceRows, counts, systems] = await Promise.all([
      sourceCount(),
      prisma.$queryRaw<Array<{ systems: number | bigint; visible_systems: number | bigint; active_today: number | bigint; latest_updated_at: Date | string | null }>>`SELECT COUNT(*) AS systems, COUNT(*) FILTER (WHERE visible = true) AS visible_systems, COUNT(*) FILTER (WHERE active_today = true) AS active_today, MAX(updated_at) AS latest_updated_at FROM mlb_generated_systems_v2`,
      prisma.$queryRaw<StoredSystemRow[]>`SELECT * FROM mlb_generated_systems_v2 ORDER BY visible DESC, grade ASC, sample_size DESC, units DESC LIMIT 20`
    ]);
    const c = counts[0]; const b: string[] = [];
    if (!sourceRows) b.push("No mlb_trend_rows available. Refresh MLB warehouse after final results exist.");
    if (!n(c?.systems)) b.push("No generated MLB systems built yet.");
    if (!n(c?.visible_systems)) b.push("No visible A/B/C MLB systems cleared gates yet.");
    return { generatedAt: new Date().toISOString(), sourceNote: "MLB Trend Factory v2 groups trend rows into scored systems with sample, record, win rate, units, ROI proxy, grade, and blockers.", stats: { sourceRows, systems: n(c?.systems), visibleSystems: n(c?.visible_systems), activeToday: n(c?.active_today), latestUpdatedAt: iso(c?.latest_updated_at) }, systems: systems.map((s) => ({ systemKey: s.system_key, title: s.title, marketType: s.market_type, side: s.side, sampleSize: n(s.sample_size), record: `${n(s.wins)}-${n(s.losses)}-${n(s.pushes)}`, winRatePct: n(s.win_rate_pct), units: n(s.units), roiPct: n(s.roi_pct), grade: s.grade, activeToday: Boolean(s.active_today), blockers: s.blockers ?? [], updatedAt: iso(s.updated_at) ?? String(s.updated_at) })), blockers: b };
  } catch (error) {
    return { generatedAt: new Date().toISOString(), sourceNote: "MLB trend factory health failed.", stats: { sourceRows: 0, systems: 0, visibleSystems: 0, activeToday: 0, latestUpdatedAt: null }, systems: [], blockers: [error instanceof Error ? error.message : "Unknown trend factory health error."] };
  }
}
