import { notFound } from "next/navigation";

import { buildTrendsCenterSnapshot } from "@/services/trends/trends-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function priceLabel(price: number | null | undefined) {
  if (typeof price !== "number" || !Number.isFinite(price)) return "price needed";
  return price > 0 ? `+${price}` : String(price);
}

function percentLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value}%`;
}

function actionClass(actionability: string | null | undefined) {
  const value = String(actionability ?? "").toUpperCase();
  if (value.includes("ACTIVE")) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value.includes("WATCH")) return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function blockerClass(blocker: string) {
  if (blocker.includes("price")) return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (blocker.includes("proof")) return "border-red-400/25 bg-red-400/10 text-red-100";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function DetailMetric({ label, value, note }: { label: string; value: string | number | null | undefined; note?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value ?? "—"}</div>
      {note ? <div className="mt-1 text-[11px] leading-5 text-slate-500">{note}</div> : null}
    </div>
  );
}

function findTrend(snapshot: Awaited<ReturnType<typeof buildTrendsCenterSnapshot>>, systemId: string | null, gameId: string | null) {
  const groups = snapshot.matchupsByLeague ?? [];
  for (const group of groups as any[]) {
    for (const matchup of group.matchups ?? []) {
      const trends = matchup.allTrends ?? matchup.trends ?? [];
      for (const trend of trends) {
        if (systemId && trend.systemId !== systemId) continue;
        if (gameId && trend.gameId !== gameId) continue;
        return { trend, matchup, group };
      }
    }
  }
  return null;
}

function findSystem(snapshot: Awaited<ReturnType<typeof buildTrendsCenterSnapshot>>, systemId: string | null) {
  if (!systemId) return null;
  return (snapshot.allPromotionRows ?? []).find((item: any) => item.id === systemId) ?? null;
}

export default async function SharkTrendsTrendDetailPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const systemId = readValue(resolved, "systemId")?.trim() ?? null;
  const gameId = readValue(resolved, "gameId")?.trim() ?? null;
  const snapshot = await buildTrendsCenterSnapshot();
  const result = findTrend(snapshot, systemId, gameId);
  const system = findSystem(snapshot, systemId);

  if (!result && !system) notFound();

  const trend = result?.trend ?? system;
  const matchup = result?.matchup ?? null;
  const league = result?.group?.league ?? trend?.league ?? readValue(resolved, "league") ?? "ALL";
  const blockers = trend?.blockers ?? [];
  const reasons = trend?.reasons ?? [];

  return (
    <main className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">SharkTrends detail</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">{trend.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {matchup ? `${matchup.eventLabel} · ${league}` : `${league} system detail`}. This view exposes the trend proof, price state, blockers, and the next action instead of hiding it inside a crowded card wall.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <a href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">SharkTrends</a>
            {matchup ? <a href={matchup.href} className="text-cyan-200 hover:text-cyan-100">Matchup</a> : null}
            {systemId ? <a href={`/trends?mode=power&league=${encodeURIComponent(String(league))}`} className="text-cyan-200 hover:text-cyan-100">League trends</a> : null}
            <a href="/api/trends/sharktrends" className="text-cyan-200 hover:text-cyan-100">JSON</a>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <DetailMetric label="Score" value={trend.score} note="SharkTrends ranking score." />
        <DetailMetric label="Actionability" value={trend.actionability ?? trend.tier ?? "—"} />
        <DetailMetric label="Price" value={priceLabel(trend.price)} />
        <DetailMetric label="Edge" value={percentLabel(trend.edgePct)} />
        <DetailMetric label="Confidence" value={percentLabel(trend.confidencePct)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Decision state</div>
              <h2 className="mt-1 text-xl font-semibold text-white">{trend.primaryAction ?? "review-trend"}</h2>
            </div>
            <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${actionClass(trend.actionability ?? trend.tier)}`}>{trend.actionability ?? trend.tier ?? "REVIEW"}</div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-300">
            {trend.reason ?? "Review the proof stack and blockers before promoting this trend."}
          </div>

          <div className="mt-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Blockers</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {blockers.length ? blockers.map((blocker: string) => <span key={blocker} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${blockerClass(blocker)}`}>{blocker}</span>) : <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100">clear</span>}
            </div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Proof summary</div>
          <div className="mt-4 grid gap-2">
            <DetailMetric label="Proof status" value={trend.verified ? "Verified" : "Provisional"} />
            <DetailMetric label="Market" value={trend.market ?? "—"} />
            <DetailMetric label="Side" value={trend.side ?? "—"} />
            <DetailMetric label="Fair probability" value={trend.fairProbability == null ? "TBD" : percentLabel(Number((trend.fairProbability * 100).toFixed(1)))} />
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Reason stack</div>
        <div className="mt-3 grid gap-2">
          {reasons.length ? reasons.map((reason: string, index: number) => (
            <div key={`${reason}-${index}`} className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm leading-6 text-slate-300">{reason}</div>
          )) : <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm leading-6 text-slate-400">No reason stack attached yet. Add richer proof from ledger/backtest/market snapshots next.</div>}
        </div>
      </section>
    </main>
  );
}
