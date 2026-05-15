import Link from "next/link";

import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-cache";
import {
  buildSimCardViewModels,
  type SimCardViewModel
} from "@/services/simulation/build-sim-card-view-model";
import { SimHubClient } from "@/app/sim-fast/sim-hub-client";

// ISR: cached HTML served from CDN edge, re-generated in background every 2 min.
// SimHub is a reader only. Refresh/recompute work must stay in cron or /api/sim/refresh,
// never in the user page request.
export const revalidate = 120;
export const maxDuration = 35;

async function readAll() {
  return Promise.all([
    readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub).catch(() => null),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority).catch(() => null),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market).catch(() => null),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus).catch(() => null)
  ]);
}

async function readSnapshots() {
  const [hub, priority, market, status] = await readAll();
  return { hub, priority, market, status };
}

function FlagshipCard({ href, eyebrow, title, body, status, tone }: { href: string; eyebrow: string; title: string; body: string; status: string; tone: "cyan" | "emerald" | "amber" }) {
  const toneClass = tone === "emerald"
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
    : tone === "amber"
      ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
      : "border-cyan-300/25 bg-cyan-300/10 text-cyan-200";

  return (
    <Link href={href} className="group rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-cyan-950/20">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/75">{eyebrow}</div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${toneClass}`}>{status}</span>
      </div>
      <h2 className="mt-4 font-display text-2xl font-black tracking-[-0.05em] text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
      <div className="mt-5 border-t border-white/10 pt-4 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-300/80 group-hover:text-cyan-200">Open workspace →</div>
    </Link>
  );
}

function OperatingCard({ href, label, title, body, required }: { href: string; label: string; title: string; body: string; required: string }) {
  return (
    <Link href={href} className="group rounded-[1.15rem] border border-white/10 bg-black/20 p-4 transition hover:border-cyan-300/35 hover:bg-cyan-950/20">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 group-hover:text-cyan-300/80">{label}</div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{required}</span>
      </div>
      <h3 className="mt-3 font-display text-xl font-black tracking-[-0.04em] text-white">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">{body}</p>
    </Link>
  );
}

function APlusOperatingRail() {
  return (
    <div className="mt-5 rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/75">A+ operating system</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">Readiness before recommendations.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            SharkEdge should not show confidence until the lane proves its inputs. These gates are now first-class product surfaces, not hidden debugging pages.
          </p>
        </div>
        <Link href="/docs/SHARKEDGE_PRODUCT_DOCTRINE.md" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">Doctrine</Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OperatingCard
          href="/baseball/readiness"
          label="MLB gate"
          title="Baseball readiness"
          body="Checks active games, sim cache, odds cache, market join, fallback rows, no-bet gates, and warnings before the MLB board is trusted."
          required="new"
        />
        <OperatingCard
          href="/sim/ufc"
          label="MMA gate"
          title="Fight Lab readiness"
          body="Checks card inventory, feature hydration, sim coverage, source health, card readiness, and fight readiness before the MMA board is trusted."
          required="live"
        />
        <OperatingCard
          href="/accuracy"
          label="Proof"
          title="Accuracy ledger"
          body="A+ means the product can be wrong visibly, learn from settled outcomes, and avoid fake certainty."
          required="proof"
        />
        <OperatingCard
          href="/sharktrends"
          label="Parked"
          title="Trends cold storage"
          body="Trend mining remains preserved, but it is not an active product lane until paid historical data can make it credible."
          required="off"
        />
      </div>
    </div>
  );
}

function SimFlagshipRail({ mlbCount, marketLineCount, cacheEmpty }: { mlbCount: number; marketLineCount: number; cacheEmpty: boolean }) {
  return (
    <section className="mx-auto grid max-w-7xl gap-4 px-4 pt-6 sm:px-6 lg:px-8">
      <div className="rounded-[1.75rem] border border-cyan-400/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.92)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Simulator command center</div>
            <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Two flagship products. No trend bloat.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              SharkEdge is now focused on MLB simulation and MMA/UFC fight modeling. TrendsCenter-style mining is parked until paid historical data can support it honestly.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">MLB rows {mlbCount}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">Lines {marketLineCount}</span>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${cacheEmpty ? "border-amber-300/25 bg-amber-300/10 text-amber-200" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"}`}>{cacheEmpty ? "cache warming" : "cache ready"}</span>
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <FlagshipCard
            href="/baseball"
            eyebrow="MLB"
            title="MLB Sim Lab"
            body="Game projections, market edges, totals, pitcher context, bullpen fatigue, no-bet gates, and calibration proof."
            status="flagship"
            tone="cyan"
          />
          <FlagshipCard
            href="/sim/ufc"
            eyebrow="MMA"
            title="MMA / UFC Fight Lab"
            body="Fight-path modeling, method lanes, source audits, readiness gates, danger flags, and single-fight decision panels."
            status="flagship"
            tone="emerald"
          />
          <FlagshipCard
            href="/sharktrends"
            eyebrow="Research"
            title="Trends in cold storage"
            body="Historical trend mining is preserved for later, but it is not the active product until premium data makes the results credible."
            status="parked"
            tone="amber"
          />
        </div>
        <APlusOperatingRail />
      </div>
    </section>
  );
}

export default async function FastSimHubPage() {
  const { hub, priority, market, status } = await readSnapshots();

  const rows = priority?.rows ?? [];
  const marketEdges = (market?.edges ?? []) as Parameters<typeof buildSimCardViewModels>[1];
  const cacheEmpty = rows.length === 0 && !hub && !priority;

  let allModels: SimCardViewModel[] = [];
  try {
    allModels = buildSimCardViewModels(rows, marketEdges);
  } catch (err) {
    console.error("[sim-fast] buildSimCardViewModels failed:", err instanceof Error ? err.message : err);
  }

  const mlbCount = hub?.summary?.mlbCount ?? priority?.summary?.mlbCount ?? marketEdges.length;

  return (
    <>
      <SimFlagshipRail mlbCount={mlbCount} marketLineCount={market?.lineCount ?? 0} cacheEmpty={cacheEmpty} />
      <SimHubClient
        allModels={allModels}
        simAge={status?.lastSuccessAt ?? priority?.generatedAt ?? hub?.generatedAt ?? null}
        lineCount={market?.lineCount ?? 0}
        mlbCount={mlbCount}
        marketAge={market?.generatedAt ?? null}
        statusReason={status?.reason ?? null}
        cacheEmpty={cacheEmpty}
      />
    </>
  );
}
