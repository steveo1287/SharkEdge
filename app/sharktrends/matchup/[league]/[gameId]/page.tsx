import { notFound } from "next/navigation";

import { buildTrendsCenterSnapshot } from "@/services/trends/trends-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{
    league: string;
    gameId: string;
  }>;
};

function formatTime(value: string | null | undefined) {
  if (!value) return "time TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function priceLabel(price: number | null | undefined) {
  if (typeof price !== "number" || !Number.isFinite(price)) return "price needed";
  return price > 0 ? `+${price}` : String(price);
}

function actionClass(actionability: string | null | undefined) {
  const value = String(actionability ?? "").toUpperCase();
  if (value.includes("ACTIVE")) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value.includes("WATCH")) return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function DetailMetric({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value ?? "—"}</div>
    </div>
  );
}

function TrendCard({ trend }: { trend: any }) {
  return (
    <a href={trend.href} className="block rounded-[1.25rem] border border-white/10 bg-black/25 p-4 hover:border-cyan-300/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-white">{trend.name}</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">{trend.market} · {trend.side} · {priceLabel(trend.price)}</div>
        </div>
        <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${actionClass(trend.actionability)}`}>{trend.actionability}</div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <DetailMetric label="Score" value={trend.score} />
        <DetailMetric label="Edge" value={trend.edgePct == null ? "TBD" : `${trend.edgePct}%`} />
        <DetailMetric label="Confidence" value={trend.confidencePct == null ? "TBD" : `${trend.confidencePct}%`} />
        <DetailMetric label="Proof" value={trend.verified ? "Verified" : "Provisional"} />
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-400">
        <span className="font-semibold uppercase tracking-[0.14em] text-cyan-300">Primary action:</span> {trend.primaryAction}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {trend.blockers?.length ? trend.blockers.map((blocker: string) => <span key={blocker} className="rounded-full border border-amber-300/20 bg-amber-300/[0.05] px-2 py-1 text-amber-100/80">{blocker}</span>) : <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.05] px-2 py-1 text-emerald-100/80">clear</span>}
      </div>
    </a>
  );
}

export default async function SharkTrendsMatchupPage({ params }: PageProps) {
  const resolved = await params;
  const league = decodeURIComponent(resolved.league).toUpperCase();
  const gameId = decodeURIComponent(resolved.gameId);
  const snapshot = await buildTrendsCenterSnapshot();
  const group = (snapshot.matchupsByLeague ?? []).find((item: any) => String(item.league).toUpperCase() === league);
  const matchup = group?.matchups?.find((item: any) => item.gameId === gameId);

  if (!matchup) notFound();

  const allTrends = matchup.allTrends ?? matchup.trends ?? [];

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">SharkTrends matchup</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">{matchup.eventLabel}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {league} · {formatTime(matchup.startTime)} · {matchup.status}. This page groups every SharkTrends signal attached to this matchup so users inspect the game first, then drill into individual trend proof.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <a href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">SharkTrends</a>
            <a href={`/trends?league=${encodeURIComponent(league)}&mode=power`} className="text-cyan-200 hover:text-cyan-100">League trends</a>
            <a href="/api/trends/sharktrends" className="text-cyan-200 hover:text-cyan-100">JSON</a>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <DetailMetric label="Trends" value={matchup.trendCount} />
        <DetailMetric label="Active" value={matchup.activeTrends} />
        <DetailMetric label="Verified" value={matchup.verifiedTrends} />
        <DetailMetric label="Blocked" value={matchup.blockedTrends} />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Attached trend links</div>
            <h2 className="mt-1 text-xl font-semibold text-white">{allTrends.length} trend{allTrends.length === 1 ? "" : "s"} for this matchup</h2>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          {allTrends.length ? allTrends.map((trend: any) => <TrendCard key={trend.id} trend={trend} />) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No trends attached to this matchup.</div>}
        </div>
      </section>
    </main>
  );
}
