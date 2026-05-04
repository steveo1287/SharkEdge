import Link from "next/link";

import { buildTrendFactoryPreview } from "@/services/trends/trend-factory";
import type { TrendCandidateSystem, TrendFactoryDepth, TrendFactoryLeague, TrendFactoryMarket } from "@/services/trends/trend-candidate-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const LEAGUES = new Set(["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"]);
const MARKETS = new Set(["ALL", "moneyline", "spread", "total", "player_prop", "fight_winner"]);
const DEPTHS = new Set(["core", "expanded", "debug"]);

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseLimit(value: string | undefined) {
  if (!value) return 150;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(25, Math.min(500, Math.floor(parsed))) : 150;
}

function chipClass(gate: string) {
  if (gate === "promote_candidate") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (gate === "watch_candidate") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (gate === "research_candidate") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-red-400/25 bg-red-400/10 text-red-200";
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: TrendCandidateSystem }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-semibold leading-5 text-white">{candidate.name}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{candidate.league} · {candidate.market} · {candidate.side}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${chipClass(candidate.qualityGate)}`}>{candidate.qualityGate.replace(/_/g, " ")}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">{candidate.description}</p>
      <div className="mt-3 grid gap-2">
        {candidate.conditions.length ? candidate.conditions.map((condition) => (
          <div key={`${candidate.id}:${condition.key}`} className="rounded-xl border border-white/10 bg-black/25 p-2 text-[11px] leading-5 text-slate-300">
            <span className="text-cyan-200">{condition.family}</span> · {condition.label}
          </div>
        )) : <div className="rounded-xl border border-white/10 bg-black/25 p-2 text-[11px] text-slate-500">Base candidate with no extra situational filters.</div>}
      </div>
      <div className="mt-3 grid gap-1 text-[11px] leading-5 text-slate-400">
        {candidate.gateReasons.slice(0, 3).map((reason) => <div key={reason}>+ {reason}</div>)}
        {candidate.blockers.slice(0, 3).map((blocker) => <div key={blocker} className="text-amber-100/80">- {blocker}</div>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {candidate.previewTags.map((tag) => <span key={tag} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-400">{tag}</span>)}
      </div>
      <div className="mt-3 text-[10px] leading-5 text-slate-500">dedupe: {candidate.dedupeKey}</div>
    </article>
  );
}

export default async function TrendFactoryPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const leagueParam = (readValue(resolved, "league") ?? "ALL").toUpperCase();
  const marketParam = (readValue(resolved, "market") ?? "ALL").toLowerCase();
  const depthParam = (readValue(resolved, "depth") ?? "core").toLowerCase();
  const limit = parseLimit(readValue(resolved, "limit"));
  const league = (LEAGUES.has(leagueParam) ? leagueParam : "ALL") as TrendFactoryLeague | "ALL";
  const market = (MARKETS.has(marketParam) ? marketParam : "ALL") as TrendFactoryMarket | "ALL";
  const depth = (DEPTHS.has(depthParam) ? depthParam : "core") as TrendFactoryDepth;
  const preview = buildTrendFactoryPreview({ league, market, depth, limit });

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Trend Factory</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Candidate system generator</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">PR #163 foundation: generate candidate systems, dedupe keys, related groups, and quality-gate labels. This page is a preview only. It does not backtest, persist, or promote systems to the main SharkTrends board.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">Command board</Link><Link href="/api/sharktrends/factory" className="text-cyan-200 hover:text-cyan-100">API</Link></div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span><select name="league" defaultValue={league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{Array.from(LEAGUES).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Market</span><select name="market" defaultValue={market} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{Array.from(MARKETS).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Depth</span><select name="depth" defaultValue={depth} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"><option value="core">core</option><option value="expanded">expanded</option><option value="debug">debug</option></select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Limit</span><input name="limit" defaultValue={String(limit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <button className="md:col-span-4 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Generate preview</button>
        </form>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Generated" value={preview.totalCandidates} note="Raw candidates before dedupe and limit." />
        <Metric label="Returned" value={preview.returnedCandidates} note="Preview candidates shown." />
        <Metric label="Promote" value={preview.gateCounts.promote_candidate} note="Candidates with model/CLV/movement style support." />
        <Metric label="Watch" value={preview.gateCounts.watch_candidate} note="Structured candidates needing backtest." />
        <Metric label="Research" value={preview.gateCounts.research_candidate} note="Candidates that should not be promoted yet." />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
        <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Notes</div>
        <div className="grid gap-2 text-sm leading-6 text-slate-400">{preview.notes.map((note) => <div key={note}>• {note}</div>)}</div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        {preview.candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} />)}
      </section>

      <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4">
        <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Related / dedupe groups</summary>
        <div className="mt-4 grid gap-2 text-xs leading-5 text-slate-400">
          {preview.dedupeGroups.length ? preview.dedupeGroups.map((group) => <div key={group.key} className="rounded-xl border border-white/10 bg-black/25 p-3"><span className="text-white">{group.count}</span> · {group.key} · {group.sampleIds.join(", ")}</div>) : <div>No related groups in this preview.</div>}
        </div>
      </details>
    </main>
  );
}
