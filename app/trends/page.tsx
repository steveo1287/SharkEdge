import Link from "next/link";

import { readTrendRefreshStatus } from "@/services/trends/refresh-status";
import { readTrendSystemCycleStatus } from "@/services/trends/trend-system-cycle-status";
import { buildTrendsCenterSnapshot, type TrendsCenterSnapshot } from "@/services/trends/trends-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type Snapshot = TrendsCenterSnapshot;
type LaneKey = keyof Snapshot["placementLanes"];
type PromotionRow = Snapshot["allPromotionRows"][number];
type MatchupRow = Snapshot["matchupsByLeague"][number]["matchups"][number];
type TrendRow = MatchupRow["trends"][number];

const LANES: Array<{ key: LaneKey; label: string; note: string }> = [
  { key: "promote", label: "Promote", note: "Best verified and active systems first." },
  { key: "watch", label: "Watch", note: "Live or promising, but still needs proof or price." },
  { key: "verified-idle", label: "Verified idle", note: "Proven systems waiting for a current match." },
  { key: "bench", label: "Bench", note: "Blocked, weak, or research-only systems." }
];

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function clampLane(value: string | undefined): LaneKey {
  return LANES.some((lane) => lane.key === value) ? value as LaneKey : "promote";
}

function n(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pct(value: unknown) {
  return `${n(value).toFixed(1)}%`;
}

function signedPct(value: unknown) {
  const v = n(value);
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function units(value: unknown) {
  const v = n(value);
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}u`;
}

function time(value: string | null | undefined) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function actionTone(action: string | undefined) {
  const value = String(action ?? "").toUpperCase();
  if (value.includes("ACTION")) return "border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-100";
  if (value.includes("WATCH") || value.includes("WAIT")) return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
  if (value.includes("PASS") || value.includes("BLOCK")) return "border-red-300/20 bg-red-400/[0.07] text-red-100";
  return "border-sky-300/20 bg-sky-300/[0.07] text-sky-100";
}

function tileTone(kind: "good" | "warn" | "bad" | "neutral") {
  if (kind === "good") return "border-emerald-300/20 bg-emerald-400/[0.07]";
  if (kind === "warn") return "border-amber-300/25 bg-amber-300/[0.07]";
  if (kind === "bad") return "border-red-300/20 bg-red-400/[0.07]";
  return "border-white/10 bg-slate-950/60";
}

function MetricTile({ label, value, note, tone = "neutral" }: { label: string; value: string | number; note: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tileTone(tone)}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function StatusStrip({ snapshot, refreshStatus, cycleStatus }: { snapshot: Snapshot; refreshStatus: Awaited<ReturnType<typeof readTrendRefreshStatus>>; cycleStatus: Awaited<ReturnType<typeof readTrendSystemCycleStatus>> }) {
  const cycleRunning = Boolean(cycleStatus?.running);
  const refreshRunning = Boolean(refreshStatus?.running || refreshStatus?.queued);
  const ready = snapshot.counts.publishedActive > 0 || snapshot.counts.visiblePromotionRows > 0;
  const tone = ready ? "border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100" : "border-amber-300/25 bg-amber-300/[0.07] text-amber-100";
  return (
    <section className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-semibold uppercase tracking-[0.18em]">Trends Center status</span>
          <span className="ml-2 text-slate-300">generated {time(snapshot.generatedAt)} · {snapshot.counts.publishedActive} active systems · {snapshot.counts.matchupTiles} matchup tiles · {snapshot.counts.visiblePromotionRows}/{snapshot.counts.allPromotionRows} ranked systems visible</span>
          <div className="mt-1 text-slate-300">
            Cycle {cycleRunning ? "running" : cycleStatus?.ok ? "ok" : "idle"} · refresh {refreshRunning ? "running" : refreshStatus?.ok ? "ok" : "idle"} · last cycle success {time(cycleStatus?.lastSuccessAt)}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 font-semibold uppercase tracking-[0.14em]">
          <Link href="/api/trends/center" className="text-sky-200 hover:text-sky-100">Center JSON</Link>
          <Link href="/api/trends/systems/cycle?inactive=true&limit=500" className="text-sky-200 hover:text-sky-100">Run cycle</Link>
          <Link href="/sharktrends/mlb-warehouse" className="text-sky-200 hover:text-sky-100">Warehouse</Link>
        </div>
      </div>
    </section>
  );
}

function Hero({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-sky-300/15 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.20),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] p-6 shadow-[0_0_80px_rgba(14,165,233,0.12)]">
      <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-emerald-300/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-300">Trends Center App</div>
          <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold tracking-tight text-white md:text-6xl">A command desk for systems that are live, proven, and worth attention.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">The old Trends page buried signal under dashboard noise. This view starts with promotion lanes, matchup tiles, blockers, proof packets, and the exact next action.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-slate-300 lg:w-80">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Next move</div>
          <div className="mt-2 leading-6 text-white">{snapshot.nextAction}</div>
        </div>
      </div>
      <div className="relative mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Actionable systems" value={snapshot.counts.actionableSystems} tone={snapshot.counts.actionableSystems ? "good" : "warn"} note={`${snapshot.counts.promotableSystems} promotable · ${snapshot.counts.watchSystems} watch · ${snapshot.counts.benchSystems} bench.`} />
        <MetricTile label="Current matchups" value={snapshot.counts.matchupTiles} tone={snapshot.counts.matchupTiles ? "good" : "warn"} note={`${snapshot.counts.matchupTrendLinks} trend links attached across ${snapshot.counts.leagueMatchupGroups} leagues.`} />
        <MetricTile label="Verified published" value={`${snapshot.coverage.publishedVerifiedPct}%`} tone={snapshot.counts.verifiedPublished ? "good" : "warn"} note={`${snapshot.counts.verifiedPublished}/${snapshot.counts.publishedTotal} systems have proof packets.`} />
        <MetricTile label="Blocked systems" value={snapshot.counts.blockedSystems} tone={snapshot.counts.blockedSystems ? "warn" : "good"} note={`${snapshot.coverage.blockedPct}% blocked · ${snapshot.counts.stale} stale saved rows · ${snapshot.counts.neverRun} never run.`} />
      </div>
    </section>
  );
}

function LaneNav({ snapshot, activeLane }: { snapshot: Snapshot; activeLane: LaneKey }) {
  return (
    <section className="grid gap-3 md:grid-cols-4">
      {LANES.map((lane) => {
        const rows = snapshot.placementLanes[lane.key] ?? [];
        const active = lane.key === activeLane;
        return (
          <Link key={lane.key} href={`/trends?lane=${lane.key}`} className={`rounded-2xl border p-4 transition ${active ? "border-sky-300/40 bg-sky-300/[0.10]" : "border-white/10 bg-slate-950/55 hover:border-sky-300/25"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{lane.label}</div>
              <div className="rounded-full border border-white/10 px-2 py-1 text-xs text-white">{rows.length}</div>
            </div>
            <div className="mt-2 text-xs leading-5 text-slate-400">{lane.note}</div>
          </Link>
        );
      })}
    </section>
  );
}

function ProofLine({ row }: { row: Pick<PromotionRow | TrendRow, "proof" | "verified" | "blockers"> }) {
  return (
    <div className="mt-3 grid gap-2 text-[11px] leading-5 text-slate-400 sm:grid-cols-3">
      <div className="rounded-xl border border-white/10 bg-black/20 p-2"><span className="text-slate-500">Record</span><div className="font-semibold text-white">{row.proof.record}</div></div>
      <div className="rounded-xl border border-white/10 bg-black/20 p-2"><span className="text-slate-500">ROI</span><div className={n(row.proof.roiPct) > 0 ? "font-semibold text-emerald-300" : "font-semibold text-slate-300"}>{signedPct(row.proof.roiPct)} · {units(row.proof.profitUnits)}</div></div>
      <div className="rounded-xl border border-white/10 bg-black/20 p-2"><span className="text-slate-500">Proof</span><div className={row.verified ? "font-semibold text-emerald-300" : "font-semibold text-amber-200"}>{row.verified ? "Verified" : row.blockers.length ? "Blocked" : "Provisional"}</div></div>
    </div>
  );
}

function SystemCard({ row }: { row: PromotionRow }) {
  return (
    <Link href={row.href} className="block rounded-2xl border border-white/10 bg-slate-950/60 p-4 transition hover:border-sky-300/35 hover:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">#{row.rank}</span>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${actionTone(row.actionState)}`}>{row.actionLabel}</span>
            <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{row.league} · {row.market}</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold leading-tight text-white">{row.name}</h3>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{row.reason}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">SharkScore</div>
          <div className="font-display text-3xl font-semibold text-white">{row.sharkScore}</div>
        </div>
      </div>
      <ProofLine row={row} />
      {row.blockers.length ? <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-2 text-xs leading-5 text-amber-100/80">Blockers: {row.blockers.slice(0, 3).join(" · ")}</div> : null}
    </Link>
  );
}

function MatchupTrend({ trend }: { trend: TrendRow }) {
  return (
    <Link href={trend.href} className="block rounded-xl border border-white/10 bg-black/25 p-3 hover:border-sky-300/25">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white">{trend.name}</div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${actionTone(trend.actionState)}`}>{trend.actionLabel}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
        <span>{trend.market}</span>
        <span>{trend.side}</span>
        <span>edge {signedPct(trend.edgePct)}</span>
        <span>price {trend.price ?? "n/a"}</span>
        <span>score {trend.sharkScore}</span>
      </div>
    </Link>
  );
}

function MatchupCard({ matchup }: { matchup: MatchupRow }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{matchup.league} · {time(matchup.startTime)}</div>
          <Link href={matchup.href} className="mt-2 block text-lg font-semibold leading-tight text-white hover:text-sky-100">{matchup.eventLabel}</Link>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Top score</div>
          <div className="font-display text-2xl font-semibold text-white">{matchup.topScore}</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-4">
        <div>{matchup.trendCount} trends</div>
        <div>{matchup.actionableTrends} actionable</div>
        <div>{matchup.verifiedTrends} verified</div>
        <div>{matchup.blockedTrends} blocked</div>
      </div>
      <div className="mt-4 space-y-2">
        {matchup.trends.slice(0, 3).map((trend) => <MatchupTrend key={trend.id} trend={trend} />)}
      </div>
    </div>
  );
}

function CommandQueue({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Command queue</div>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white">Fix these before promotion</h2>
        </div>
        <Link href="/api/trends/systems/grade?inspect=true&limit=500" className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Grade queue</Link>
      </div>
      <div className="mt-4 space-y-2">
        {snapshot.commandQueue.length ? snapshot.commandQueue.map((item) => (
          <Link key={`${item.reason}-${item.id}`} href={item.href} className="block rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3 hover:border-amber-200/35">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white">{item.name}</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">{item.reason}</div>
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-400">{item.note}</div>
          </Link>
        )) : <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] p-3 text-xs leading-5 text-emerald-100/80">No command blockers. Sort the promotion lane by score, proof, ROI, and current market quality.</div>}
      </div>
    </section>
  );
}

function DistributionPanel({ snapshot }: { snapshot: Snapshot }) {
  const marketEntries = Object.entries(snapshot.distribution.byMarket ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const blockerEntries = Object.entries(snapshot.distribution.byBlocker ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">System map</div>
      <h2 className="mt-2 font-display text-2xl font-semibold text-white">What the inventory is made of</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Markets</div>
          <div className="mt-2 space-y-2">{marketEntries.map(([key, value]) => <div key={key} className="flex justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs"><span className="text-slate-300">{key}</span><span className="text-white">{value}</span></div>)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Blockers</div>
          <div className="mt-2 space-y-2">{blockerEntries.length ? blockerEntries.map(([key, value]) => <div key={key} className="flex justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs"><span className="text-slate-300">{key}</span><span className="text-white">{value}</span></div>) : <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-500">No blocker distribution.</div>}</div>
        </div>
      </div>
    </section>
  );
}

function EmptyCenter() {
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Trends Center unavailable</div>
      <h1 className="mt-2 font-display text-3xl font-semibold text-white">No snapshot could be generated.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">The page stayed up instead of crashing. Check database connectivity, trend system generation, or the cycle route.</p>
      <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
        <Link href="/api/trends/center" className="text-sky-200 hover:text-sky-100">Center JSON</Link>
        <Link href="/api/trends/systems/cycle-status" className="text-sky-200 hover:text-sky-100">Cycle status</Link>
      </div>
    </div>
  );
}

async function getSnapshot() {
  try {
    return await buildTrendsCenterSnapshot();
  } catch {
    return null;
  }
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const lane = clampLane(one(params.lane));
  const [snapshot, refreshStatus, cycleStatus] = await Promise.all([
    getSnapshot(),
    readTrendRefreshStatus().catch(() => null),
    readTrendSystemCycleStatus().catch(() => null)
  ]);

  if (!snapshot) return <EmptyCenter />;

  const laneRows = snapshot.placementLanes[lane] ?? [];
  const matchupRows = snapshot.matchupsByLeague.flatMap((group) => group.matchups).slice(0, 8);

  return (
    <div className="space-y-6">
      <StatusStrip snapshot={snapshot} refreshStatus={refreshStatus} cycleStatus={cycleStatus} />
      <Hero snapshot={snapshot} />
      <LaneNav snapshot={snapshot} activeLane={lane} />

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">{LANES.find((item) => item.key === lane)?.label} lane</div>
              <h2 className="mt-2 font-display text-3xl font-semibold text-white">Ranked system cards</h2>
            </div>
            <Link href="/sharktrends" className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Open MLB trend board</Link>
          </div>
          {laneRows.length ? laneRows.slice(0, 12).map((row) => <SystemCard key={row.id} row={row} />) : <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-6 text-sm text-slate-400">No systems in this lane yet.</div>}
        </div>
        <div className="space-y-4">
          <CommandQueue snapshot={snapshot} />
          <DistributionPanel snapshot={snapshot} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Current matchup rail</div>
            <h2 className="mt-2 font-display text-3xl font-semibold text-white">Games with attached trend systems</h2>
          </div>
          <Link href="/sharktrends/command-board-v2" className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Game-first command board</Link>
        </div>
        {matchupRows.length ? <div className="grid gap-4 lg:grid-cols-2">{matchupRows.map((matchup) => <MatchupCard key={matchup.id} matchup={matchup} />)}</div> : <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-6 text-sm text-slate-400">No current trend matchups. Run sim refresh, market refresh, and trend cycle.</div>}
      </section>

      <section className="flex flex-wrap gap-3 border-t border-white/10 pt-5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        <Link href="/sharktrends/verification" className="hover:text-sky-200">Verification</Link>
        <Link href="/sharktrends/market-intelligence" className="hover:text-sky-200">Market intelligence</Link>
        <Link href="/sharktrends/provider-trigger" className="hover:text-sky-200">Provider trigger</Link>
        <Link href="/sharktrends/proof-terminal" className="hover:text-sky-200">Proof terminal</Link>
        <Link href="/api/trends/systems/cycle?inactive=true&limit=500" className="hover:text-sky-200">Run cycle</Link>
      </section>
    </div>
  );
}
