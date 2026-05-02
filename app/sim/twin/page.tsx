import Link from "next/link";

import { listSimTwins } from "@/services/sim/sim-twin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function pctRaw(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function fmtDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time TBD";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function trustClass(grade: string) {
  if (grade === "A") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (grade === "B") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  if (grade === "C") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (grade === "D") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-red-400/25 bg-red-400/10 text-red-200";
}

function leverageClass(label: string) {
  if (label === "EXTREME") return "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100";
  if (label === "HIGH") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (label === "MEDIUM") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function commandClass(state: string) {
  if (state === "PRIORITY_REVIEW") return "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100";
  if (state === "MODEL_EDGE") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (state === "SCENARIO_SWING") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  if (state === "WATCH") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function QueueItem({ item }: { item: any }) {
  return (
    <Link href={item.href} className="block rounded-2xl border border-white/10 bg-black/25 p-3 hover:border-cyan-300/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">#{item.rank} · {item.league}</div>
          <div className="mt-1 text-sm font-semibold text-white">{item.eventLabel}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${commandClass(item.commandState)}`}>{item.commandLabel}</span>
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-100">{item.commandScore}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400 md:grid-cols-4">
        <span>Trust {item.trustGrade}</span>
        <span>Lev {item.leverageScore}</span>
        <span>Edge {pctRaw(item.marketEdgePct)}</span>
        <span>Swing {num(item.scenarioSwingPct)}</span>
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{item.reasons?.[0] ?? "Queued for review."}</div>
      {item.blockers?.length ? <div className="mt-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">{item.blockers.join(" · ")}</div> : null}
    </Link>
  );
}

function TwinCard({ twin }: { twin: any }) {
  return (
    <Link href={twin.href} className="block rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 hover:border-cyan-300/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{twin.league}</div>
          <h2 className="mt-1 text-xl font-semibold text-white">{twin.eventLabel}</h2>
          <div className="mt-1 text-xs leading-5 text-slate-500">{fmtDate(twin.startTime)} · {twin.status}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${trustClass(twin.trust.grade)}`}>Trust {twin.trust.grade}</div>
          <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${leverageClass(twin.seasonImpact?.leverageLabel)}`}>Leverage {twin.seasonImpact?.leverageScore ?? "--"}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Home win</div>
          <div className="mt-1 font-mono text-xl font-bold text-white">{pct(twin.base.homeWinPct)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Spread</div>
          <div className="mt-1 font-mono text-xl font-bold text-white">{num(twin.base.projectedSpread)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Total</div>
          <div className="mt-1 font-mono text-xl font-bold text-white">{num(twin.base.projectedTotal)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Edge</div>
          <div className="mt-1 font-mono text-xl font-bold text-white">{pctRaw(twin.market.edgePct)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Path swing</div>
          <div className="mt-1 font-mono text-xl font-bold text-white">{pctRaw(twin.seasonImpact?.volatility?.swingPct)}</div>
        </div>
      </div>

      <div className="mt-3 text-xs leading-5 text-slate-400">{twin.base.read}</div>
      {twin.seasonImpact?.leverageReasons?.[0] ? (
        <div className="mt-2 text-xs leading-5 text-cyan-100/75">{twin.seasonImpact.leverageReasons[0]}</div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5 text-[9px] uppercase tracking-[0.12em] text-slate-500">
        <span>{twin.scenarios.length} scenarios</span>
        <span>· {twin.market.verdict}</span>
        <span>· {twin.seasonImpact?.leverageLabel ?? "LOW"} leverage</span>
        <span>· {twin.source.projectionModelVersion}</span>
      </div>
    </Link>
  );
}

export default async function SimTwinPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const league = readValue(resolved, "league") ?? "ALL";
  const result = await listSimTwins({ league, limit: 24 });
  const queue = result.commandQueue;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Sim Twin</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Interactive scenario simulator</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Current game twins with base simulation, market comparison, model trust grade, uncertainty range, scenario deltas, season-impact leverage, and a command queue.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim" className="text-cyan-200 hover:text-cyan-100">Sim Hub</Link>
            <Link href="/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">Accuracy</Link>
            <Link href="/sim/edge-lab" className="text-cyan-200 hover:text-cyan-100">Edge Lab</Link>
            <Link href="/api/sim/twin" className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          </div>
        </div>
      </section>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span>
          <select name="league" defaultValue={String(league).toUpperCase()} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            {['ALL', 'NBA', 'MLB', 'NHL', 'NFL'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Apply</button>
        <Link href="/sim/twin" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Reset</Link>
      </form>

      <section className="rounded-[1.5rem] border border-cyan-300/15 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Command queue</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Review targets ranked by trust, leverage, edge, and scenario swing</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-400 sm:grid-cols-5">
            <span>Priority {queue.priorityReviewCount}</span>
            <span>Edge {queue.modelEdgeCount}</span>
            <span>Swing {queue.scenarioSwingCount}</span>
            <span>Watch {queue.watchCount}</span>
            <span>Low {queue.lowPriorityCount}</span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {queue.items.length ? queue.items.slice(0, 6).map((item: any) => <QueueItem key={item.id} item={item} />) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No command queue items available.</div>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {result.twins.length ? result.twins.map((twin) => <TwinCard key={`${twin.league}:${twin.gameId}`} twin={twin} />) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-6 text-sm text-slate-400">No current games available for Sim Twin.</div>
        )}
      </section>
    </main>
  );
}
