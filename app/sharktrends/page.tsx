import { buildTrendsCenterSnapshot } from "@/services/trends/trends-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TileTone = "good" | "warn" | "bad" | "neutral";

function toneClass(tone: TileTone) {
  if (tone === "good") return "border-emerald-400/20 bg-emerald-400/7";
  if (tone === "warn") return "border-amber-300/25 bg-amber-300/7";
  if (tone === "bad") return "border-red-400/20 bg-red-400/7";
  return "border-white/10 bg-slate-950/60";
}

function Tile({ label, value, note, tone = "neutral" }: { label: string; value: string | number; note: string; tone?: TileTone }) {
  return (
    <div className={`rounded-2xl border p-4 ${toneClass(tone)}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function tierClass(tier: string) {
  if (tier === "promote") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (tier === "watch") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (tier === "verified-idle") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function distributionText(record: Record<string, number> | undefined, limit = 6) {
  const entries = Object.entries(record ?? {}).sort((left, right) => right[1] - left[1]).slice(0, limit);
  return entries.length ? entries.map(([key, value]) => `${key} ${value}`).join(" · ") : "none";
}

export default async function SharkTrendsPage() {
  const snapshot = await buildTrendsCenterSnapshot();
  const board = snapshot.promotionBoard ?? [];
  const queue = snapshot.commandQueue ?? [];
  const activeSystems = snapshot.activeSystems ?? [];
  const counts = snapshot.counts;
  const coverage = snapshot.coverage;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">SharkTrends</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Promotion board</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Published-system inventory ranked for promotion by live qualifiers, verification, action gate, saved-row freshness, and blockers. This is the control layer for turning trends into a real product board.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <a href="/trends" className="text-cyan-200 hover:text-cyan-100">Trends</a>
            <a href="/api/trends/sharktrends" className="text-cyan-200 hover:text-cyan-100">JSON</a>
            <a href="/api/trends/systems/cycle?inactive=true&limit=500" className="text-cyan-200 hover:text-cyan-100">Run cycle</a>
            <a href="/api/trends/historical-audit" className="text-cyan-200 hover:text-cyan-100">Historical audit</a>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Active published systems"
          value={`${counts.publishedActive}/${counts.publishedTotal}`}
          tone={counts.publishedActive ? "good" : "warn"}
          note={`${counts.activeMatches} active matches · ${coverage.publishedActivePct}% active coverage.`}
        />
        <Tile
          label="Promotion ready"
          value={`${counts.promotableSystems}/${counts.publishedTotal}`}
          tone={counts.promotableSystems ? "good" : counts.watchSystems ? "warn" : "neutral"}
          note={`${counts.watchSystems} watchlist · ${counts.benchSystems} bench · ${coverage.promotablePct}% promotable.`}
        />
        <Tile
          label="Verified published"
          value={`${counts.verifiedPublished}/${counts.publishedTotal}`}
          tone={counts.verifiedPublished ? "good" : "warn"}
          note={`${coverage.publishedVerifiedPct}% verified. Verified live systems get premium placement.`}
        />
        <Tile
          label="Saved rows"
          value={`${counts.savedActive}/${counts.savedTotal}`}
          tone={counts.stale || counts.neverRun ? "warn" : counts.savedActive ? "good" : "neutral"}
          note={`${counts.stale} stale · ${counts.neverRun} never-run · ${coverage.runCoveragePct}% recent run coverage.`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Promotion board</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Top systems for SharkTrends placement</h2>
            </div>
            <a href="/api/trends/sharktrends" className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 hover:text-cyan-100">Inspect JSON</a>
          </div>

          <div className="mt-4 grid gap-3">
            {board.length ? board.map((item, index) => (
              <a key={item.id} href={item.href} className="rounded-2xl border border-white/10 bg-black/25 p-4 hover:border-cyan-300/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">#{index + 1} {item.name}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-400">{item.reason}</div>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tierClass(item.tier)}`}>
                    {item.tier} · {item.score}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  <span>{item.league}</span>
                  <span>{item.market}</span>
                  <span>{item.category}</span>
                  <span>{item.activeMatches} live</span>
                  <span>{item.verified ? "verified" : "provisional"}</span>
                </div>
              </a>
            )) : (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/7 p-4 text-sm text-amber-100">
                No promotion board rows yet. Run the trend cycle and verify published system inventory.
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Command queue</div>
            <div className="mt-3 grid gap-2">
              {queue.length ? queue.map((item) => (
                <a key={`${item.reason}-${item.id}`} href={item.href} className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 hover:border-amber-200/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{item.name}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">{item.reason}</div>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">{item.note}</div>
                </a>
              )) : (
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3 text-xs leading-5 text-emerald-100/80">
                  No command blockers. Use promotion tier, proof grade, ROI, and live signal quality for placement.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Distribution</div>
            <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Leagues</span><span className="ml-2">{distributionText(snapshot.distribution.byLeague)}</span></div>
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Markets</span><span className="ml-2">{distributionText(snapshot.distribution.byMarket)}</span></div>
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Tiers</span><span className="ml-2">{distributionText(snapshot.distribution.byPromotionTier)}</span></div>
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Categories</span><span className="ml-2">{distributionText(snapshot.distribution.byCategory)}</span></div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Active systems</div>
            <div className="mt-3 grid gap-2">
              {activeSystems.length ? activeSystems.map((item) => (
                <a key={item.id} href={item.href} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs hover:border-cyan-300/25">
                  <span className="min-w-0 truncate text-slate-200">{item.name}</span>
                  <span className="shrink-0 text-slate-500">{item.league} · {item.market} · {item.activeMatches} live</span>
                </a>
              )) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">No active published systems right now.</div>}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-xs leading-5 text-slate-400">
        <span className="font-semibold uppercase tracking-[0.16em] text-cyan-300">Next action:</span> {snapshot.nextAction}
      </section>
    </main>
  );
}
