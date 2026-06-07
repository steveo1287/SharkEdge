import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import type { LeagueKey } from "@/lib/types/domain";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type CachedSimProjection,
  type SimBoardSnapshot,
  type SimMarketSnapshot
} from "@/services/simulation/sim-snapshot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 20;

type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Projection = CachedSimProjection;
type EdgeResult = SimMarketSnapshot["edges"][number];
type Row = { game: SimGame; projection: Projection; edge?: EdgeResult | null };
type DecisionTier = "attack" | "watch" | "pass" | "thin";

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function one(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function edgeSignal(edge: EdgeResult | null | undefined) {
  return edge && "signal" in edge ? edge.signal : null;
}

function edgeTotals(edge: EdgeResult | null | undefined) {
  return edge && "edges" in edge ? edge.edges : null;
}

function bestMarket(row: Row) {
  const signal = edgeSignal(row.edge);
  if (signal) return signal;
  const total = edgeTotals(row.edge)?.totalRuns;
  if (typeof total === "number") {
    return {
      market: total > 0 ? "over" : "under",
      edge: Math.abs(total),
      strength: Math.abs(total) >= 1 ? "strong" : Math.abs(total) >= 0.45 ? "watch" : "thin"
    };
  }
  return null;
}

function decisionTier(row: Row): DecisionTier {
  const governor = row.projection.mlbIntel?.governor;
  if (!row.projection.mlbIntel || governor?.noBet || governor?.tier === "pass") return "pass";
  if (governor?.tier === "attack") return "attack";
  if (governor?.tier === "watch") return "watch";
  if (bestMarket(row)?.strength === "strong") return "watch";
  if (bestMarket(row)?.strength === "thin") return "thin";
  return "thin";
}

function tierRank(tier: DecisionTier) {
  if (tier === "attack") return 4;
  if (tier === "watch") return 3;
  if (tier === "thin") return 2;
  return 1;
}

function decisionLabel(tier: DecisionTier) {
  if (tier === "attack") return "BEST";
  if (tier === "watch") return "WATCH";
  if (tier === "thin") return "LEAN";
  return "PASS";
}

function decisionTone(tier: DecisionTier) {
  if (tier === "attack") return "success" as const;
  if (tier === "watch" || tier === "thin") return "premium" as const;
  return "muted" as const;
}

function winLean(projection: Projection) {
  const home = projection.distribution.homeWinPct;
  const away = projection.distribution.awayWinPct;
  return home >= away
    ? { team: projection.matchup.home, pct: home, otherTeam: projection.matchup.away, otherPct: away }
    : { team: projection.matchup.away, pct: away, otherTeam: projection.matchup.home, otherPct: home };
}

function reasons(row: Row) {
  const governorReasons = row.projection.mlbIntel?.governor?.reasons ?? [];
  const read = row.projection.read ? [row.projection.read] : [];
  return [...governorReasons, ...read]
    .filter(Boolean)
    .filter((reason, index, arr) => arr.indexOf(reason) === index)
    .slice(0, 3);
}

function sortRows(rows: Row[]) {
  return [...rows].sort((left, right) => {
    const leftTier = tierRank(decisionTier(left));
    const rightTier = tierRank(decisionTier(right));
    if (leftTier !== rightTier) return rightTier - leftTier;
    const leftChance = winLean(left.projection).pct;
    const rightChance = winLean(right.projection).pct;
    return rightChance - leftChance;
  });
}

function marketLabel(row: Row) {
  const market = bestMarket(row);
  if (!market) return "No market signal";
  const name = String(market.market).replaceAll("_", " ").toUpperCase();
  if (name === "OVER" || name === "UNDER") return name;
  if (name === "HOME ML") return `${row.projection.matchup.home} ML`;
  if (name === "AWAY ML") return `${row.projection.matchup.away} ML`;
  return name;
}

function projectedTotal(row: Row) {
  return row.projection.mlbIntel?.projectedTotal
    ?? (row.projection.distribution.avgAway + row.projection.distribution.avgHome);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-3">
      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {sub ? <div className="mt-1 text-[0.68rem] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function WinChart({ row }: { row: Row }) {
  const homePct = row.projection.distribution.homeWinPct;
  const awayPct = row.projection.distribution.awayWinPct;
  const homeWidth = Math.max(5, Math.min(95, Math.round(homePct * 100)));
  const awayWidth = Math.max(5, 100 - homeWidth);

  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-3">
      <div className="mb-2 flex items-center justify-between text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">
        <span>Win chart</span>
        <span>{pct(awayPct)} / {pct(homePct)}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/8">
        <div className="bg-sky-400/75" style={{ width: `${awayWidth}%` }} />
        <div className="bg-emerald-400/75" style={{ width: `${homeWidth}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>{row.projection.matchup.away}</span>
        <span>{row.projection.matchup.home}</span>
      </div>
    </div>
  );
}

function RunsChart({ row }: { row: Row }) {
  const away = row.projection.distribution.avgAway;
  const home = row.projection.distribution.avgHome;
  const max = Math.max(away, home, 1);

  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-3">
      <div className="mb-3 text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">Projected runs</div>
      {[
        { team: row.projection.matchup.away, runs: away },
        { team: row.projection.matchup.home, runs: home }
      ].map((item) => (
        <div key={item.team} className="mb-2 last:mb-0">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
            <span className="truncate pr-2">{item.team}</span>
            <span className="tabular-nums text-white">{one(item.runs)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-aqua/70" style={{ width: `${Math.max(8, Math.round((item.runs / max) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function GameCard({ row, compact = false }: { row: Row; compact?: boolean }) {
  const tier = decisionTier(row);
  const lean = winLean(row.projection);
  const why = reasons(row);
  const total = projectedTotal(row);

  return (
    <Card className="surface-panel h-full p-5 transition hover:border-aqua/25 hover:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">
            <span>{formatTime(row.game.startTime)}</span>
            <span>·</span>
            <span>{row.game.status}</span>
          </div>
          <div className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">
            {row.projection.matchup.away} @ {row.projection.matchup.home}
          </div>
        </div>
        <Badge tone={decisionTone(tier)}>{decisionLabel(tier)}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Pick" value={lean.team} sub={pct(lean.pct)} />
        <Stat label="Score" value={`${one(row.projection.distribution.avgAway)}-${one(row.projection.distribution.avgHome)}`} sub="away-home" />
        <Stat label="Market" value={marketLabel(row)} sub={`total ${one(total)}`} />
      </div>

      {!compact ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <WinChart row={row} />
          <RunsChart row={row} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-2">
        {(why.length ? why : ["No clean reason available yet."]).map((reason) => (
          <div key={reason} className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-xs leading-5 text-slate-400">
            {reason}
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end border-t border-white/8 pt-4">
        <Link
          href={`/sim/mlb/${encodeURIComponent(row.game.id)}`}
          className="rounded-full border border-aqua/30 bg-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-aqua transition hover:bg-aqua/15"
        >
          Open details
        </Link>
      </div>
    </Card>
  );
}

function CompactRow({ row }: { row: Row }) {
  const tier = decisionTier(row);
  const lean = winLean(row.projection);
  return (
    <Link
      href={`/sim/mlb/${encodeURIComponent(row.game.id)}`}
      className="grid gap-3 border-b border-white/8 px-4 py-3 text-sm transition last:border-none hover:bg-white/[0.03] md:grid-cols-[1.4fr_0.7fr_0.6fr_0.6fr_auto] md:items-center"
    >
      <div>
        <div className="font-semibold text-white">{row.projection.matchup.away} @ {row.projection.matchup.home}</div>
        <div className="mt-1 text-[11px] text-slate-500">{formatTime(row.game.startTime)}</div>
      </div>
      <div className="text-slate-300">{lean.team}</div>
      <div className="tabular-nums text-white">{pct(lean.pct)}</div>
      <div className="tabular-nums text-slate-300">{one(row.projection.distribution.avgAway)}-{one(row.projection.distribution.avgHome)}</div>
      <div className="md:justify-self-end"><Badge tone={decisionTone(tier)}>{decisionLabel(tier)}</Badge></div>
    </Link>
  );
}

async function loadMlbRows() {
  const [mlbBoard, market] = await Promise.all([
    readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market)
  ]);

  if (!mlbBoard?.games?.length) return { rows: [] as Row[], source: "missing-cache" as const };
  const edgeByGame = new Map((market?.edges ?? []).map((edge) => [edge.gameId, edge]));
  return {
    rows: mlbBoard.games.map((item) => ({ game: item.game, projection: item.projection, edge: edgeByGame.get(item.game.id) ?? null })),
    source: mlbBoard.stale ? "stale-cache" as const : "cache" as const
  };
}

export default async function MlbSimPage() {
  const { rows, source } = await loadMlbRows();
  const ordered = sortRows(rows);
  const best = ordered.filter((row) => decisionTier(row) === "attack");
  const watch = ordered.filter((row) => decisionTier(row) === "watch" || decisionTier(row) === "thin");
  const top = best[0] ?? watch[0] ?? ordered[0] ?? null;
  const mainCards = (best.length ? best : watch.length ? watch : ordered).slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="surface-panel-strong p-6">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div>
            <div className="section-kicker">MLB sim</div>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Simple reads. No clutter.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              The sim board shows the pick, win chance, projected score, two small charts, and the short reason. Full model detail stays behind the game page.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/games" className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400">
                Games
              </Link>
              <Link href="/mlb/player-markets" className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25">
                Player markets
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5">
            <Stat label="Games" value={String(rows.length)} sub={source.replace("-", " ")} />
            <Stat label="Best" value={String(best.length)} sub="green-light" />
            <Stat label="Watch" value={String(watch.length)} sub="near edge" />
          </div>
        </div>
      </section>

      {top ? (
        <section className="grid gap-4">
          <SectionTitle title="Top read" description="Start here. This is the cleanest current MLB sim read." />
          <GameCard row={top} />
        </section>
      ) : null}

      {mainCards.length ? (
        <section className="grid gap-4">
          <SectionTitle title="Best current reads" description="Only the useful card-level information: pick, probability, score, market, and reason." />
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {mainCards.map((row) => <GameCard key={row.game.id} row={row} compact />)}
          </div>
        </section>
      ) : null}

      {ordered.length ? (
        <section className="grid gap-4">
          <SectionTitle title="Full slate" description="Compact list for scanning the rest. Open a game only when you need more." />
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">
            {ordered.map((row) => <CompactRow key={`row:${row.game.id}`} row={row} />)}
          </div>
        </section>
      ) : (
        <EmptyState
          title="No MLB sim rows available"
          description="The MLB sim cache is empty. Run the Railway sim refresh worker and reload this page."
        />
      )}
    </div>
  );
}
