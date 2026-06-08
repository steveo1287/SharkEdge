import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimMarketSnapshot,
  type SimPriorityRow,
  type SimPrioritySnapshot
} from "@/services/simulation/sim-snapshot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const DISPLAY_TIME_ZONE = "America/Chicago";

type MarketEdge = NonNullable<SimMarketSnapshot["edges"]>[number];

type SimGameCard = {
  key: string;
  row: SimPriorityRow;
  edge: MarketEdge | null;
};

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function dateFrom(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, weekday: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

function normalizeTeam(value: string | null | undefined) {
  return (value ?? "unknown").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function gameKey(row: SimPriorityRow) {
  return [row.leagueKey, row.startTime?.slice(0, 10), normalizeTeam(row.matchup.away), normalizeTeam(row.matchup.home)].join("::");
}

function rowScore(row: SimPriorityRow) {
  const tierScore = row.tier === "A" ? 4 : row.tier === "B" ? 3 : row.tier === "C" ? 2 : 1;
  const edgeScore = Math.abs(row.lean.edge ?? 0) * 100;
  const confidenceScore = (row.confidence ?? 0) * 10;
  return tierScore * 100 + edgeScore + confidenceScore;
}

function mlbOnlyPriority(priority: SimPrioritySnapshot | null): SimPrioritySnapshot | null {
  if (!priority) return null;
  const rows = priority.rows.filter((row) => row.leagueKey === "MLB");
  return { ...priority, rows, summary: { ...priority.summary, rowCount: rows.length, gameCount: rows.length, nbaCount: 0, mlbCount: rows.length } };
}

async function readData() {
  const [priority, market] = await Promise.all([
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market)
  ]);
  const mlbPriority = mlbOnlyPriority(priority);
  const edgeByGame = new Map((market?.edges ?? []).map((edge) => [edge.gameId, edge]));
  return buildCards(mlbPriority?.rows ?? [], edgeByGame);
}

function buildCards(rows: SimPriorityRow[], edgeByGame: Map<string, MarketEdge>): SimGameCard[] {
  const map = new Map<string, SimGameCard>();
  for (const row of rows) {
    const key = gameKey(row);
    const existing = map.get(key);
    if (!existing || rowScore(row) > rowScore(existing.row)) map.set(key, { key, row, edge: edgeByGame.get(row.id) ?? null });
  }
  return [...map.values()].sort((a, b) => rowScore(b.row) - rowScore(a.row));
}

function Badge({ label, tone = "slate" }: { label: string; tone?: "slate" | "aqua" | "green" | "amber" }) {
  const cls = tone === "green" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : tone === "amber" ? "border-amber-400/25 bg-amber-400/10 text-amber-200" : tone === "aqua" ? "border-aqua/25 bg-aqua/10 text-aqua" : "border-white/10 bg-white/[0.04] text-slate-300";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${cls}`}>{label}</span>;
}

function GameCard({ game }: { game: SimGameCard }) {
  const row = game.row;
  const market = game.edge?.signal?.market ?? null;
  const href = row.href ?? `/sim/mlb/${encodeURIComponent(row.id)}`;
  return (
    <Link href={href} className="rounded-[1.15rem] border border-white/10 bg-[#06101b]/82 p-4 transition hover:border-aqua/35 hover:bg-aqua/[0.045]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{formatTime(row.startTime)}</div>
          <div className="mt-1 font-display text-xl font-black tracking-tight text-white">{row.matchup.away} @ {row.matchup.home}</div>
        </div>
        <Badge label={row.tier === "attack" || row.tier === "A" ? "attack" : row.tier === "watch" || row.tier === "B" ? "watch" : "pass"} tone={row.tier === "attack" || row.tier === "A" ? "green" : row.tier === "watch" || row.tier === "B" ? "amber" : "slate"} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Lean</div><div className="mt-1 truncate font-semibold text-white">{row.lean.team}</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Win %</div><div className="mt-1 font-mono font-semibold text-aqua">{pct(row.lean.pct)}</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Edge</div><div className="mt-1 font-mono font-semibold text-white">{num(row.lean.edge)}</div></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><Badge label={row.leagueKey} tone="aqua" />{market ? <Badge label={String(market)} tone="green" /> : <Badge label="no line" />}</div>
    </Link>
  );
}

export default async function SimHubPage() {
  const games = await readData();
  const top = games.slice(0, 8);

  return top.length ? (
    <main className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {top.map((game) => <GameCard key={game.key} game={game} />)}
    </main>
  ) : <EmptyState eyebrow="SimHub" title="No MLB games available" description="Run the sim refresh job if the slate should be populated." />;
}
