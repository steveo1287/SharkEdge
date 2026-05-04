import Link from "next/link";

import { buildSystemBuilderResult, type SystemBuilderInput } from "@/services/trends/system-builder";
import type { TrendCandidateSystem, TrendFactoryDepth, TrendFactoryLeague, TrendFactoryMarket, TrendFactorySide } from "@/services/trends/trend-candidate-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const LEAGUES = ["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"] as const;
const MARKETS = ["ALL", "moneyline", "spread", "total", "player_prop", "fight_winner"] as const;
const SIDES = ["ALL", "home", "away", "favorite", "underdog", "over", "under", "fighter", "player_over", "player_under"] as const;
const DEPTHS = ["core", "expanded", "debug"] as const;

const VENUE_OPTIONS = [
  ["ALL", "Any venue"],
  ["home", "Home"],
  ["road", "Road"],
  ["neutral", "Neutral"]
] as const;

const PRICE_OPTIONS = [
  ["ALL", "Any price"],
  ["dog_100_180", "Dog +100 to +180"],
  ["fav_100_150", "Favorite -100 to -150"],
  ["fav_150_220", "Favorite -150 to -220"],
  ["any_plus_money", "Plus money"]
] as const;

const FORM_OPTIONS = [
  ["ALL", "Any form"],
  ["after_win", "After win"],
  ["after_loss", "After loss"],
  ["won_2_plus", "Won 2+"],
  ["lost_2_plus", "Lost 2+"]
] as const;

const REST_OPTIONS = [
  ["ALL", "Any rest"],
  ["rest_0", "0 days rest"],
  ["rest_1", "1 day rest"],
  ["rest_2_plus", "2+ days rest"],
  ["b2b", "Back-to-back"]
] as const;

const MARKET_CONTEXT_OPTIONS = [
  ["ALL", "Any market context"],
  ["model_agrees", "Model agrees"],
  ["line_moved_for", "Line moved for side"],
  ["line_moved_against", "Line moved against side"],
  ["positive_clv", "Positive CLV history"]
] as const;

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseEnum<T extends readonly string[]>(value: string | undefined, allowed: T, fallback: T[number]): T[number] {
  return allowed.includes((value ?? fallback) as T[number]) ? (value ?? fallback) as T[number] : fallback;
}

function parseLimit(value: string | undefined) {
  if (!value) return 24;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(6, Math.min(96, Math.floor(parsed))) : 24;
}

function buildInput(searchParams: Record<string, string | string[] | undefined>): SystemBuilderInput {
  return {
    league: parseEnum((readValue(searchParams, "league") ?? "ALL").toUpperCase(), LEAGUES, "ALL") as TrendFactoryLeague | "ALL",
    market: parseEnum((readValue(searchParams, "market") ?? "ALL").toLowerCase(), MARKETS, "ALL") as TrendFactoryMarket | "ALL",
    side: parseEnum((readValue(searchParams, "side") ?? "ALL").toLowerCase(), SIDES, "ALL") as TrendFactorySide | "ALL",
    venue: readValue(searchParams, "venue") ?? "ALL",
    price: readValue(searchParams, "price") ?? "ALL",
    form: readValue(searchParams, "form") ?? "ALL",
    rest: readValue(searchParams, "rest") ?? "ALL",
    marketContext: readValue(searchParams, "marketContext") ?? "ALL",
    depth: parseEnum((readValue(searchParams, "depth") ?? "core").toLowerCase(), DEPTHS, "core") as TrendFactoryDepth,
    limit: parseLimit(readValue(searchParams, "limit"))
  };
}

function gateClass(gate: string) {
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

function SelectField({ label, name, value, options }: { label: string; name: string; value: string; options: readonly (readonly [string, string])[] | readonly string[] }) {
  const normalized = options.map((option) => Array.isArray(option) ? option : [option, option]) as Array<[string, string]>;
  return (
    <label className="grid gap-1 text-xs text-slate-400">
      <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select name={name} defaultValue={value} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
        {normalized.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function CandidateCard({ candidate }: { candidate: TrendCandidateSystem }) {
  const backtestHref = `/sharktrends/backtest?league=${encodeURIComponent(candidate.league)}&market=${encodeURIComponent(candidate.market)}&limit=25`;
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-semibold leading-5 text-white">{candidate.name}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{candidate.league} · {candidate.market} · {candidate.side}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${gateClass(candidate.qualityGate)}`}>{candidate.qualityGate.replace(/_/g, " ")}</span>
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
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={backtestHref} className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan-100 hover:bg-cyan-300/15">Send to backtest preview</Link>
        <Link href="/sharktrends/generated-attachments" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-300 hover:border-cyan-300/25">Generated attachments</Link>
      </div>
    </article>
  );
}

export default async function SharkTrendsBuilderPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const input = buildInput(resolved);
  const result = buildSystemBuilderResult(input);

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">System Builder</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Build a generated trend system</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Choose league, market, side, and situation filters. The builder returns Trend Factory candidates that can be sent through backtest and persistence before ever touching the main command board.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">Command board</Link><Link href="/sharktrends/factory" className="text-cyan-200 hover:text-cyan-100">Factory</Link><Link href="/sharktrends/backtest" className="text-cyan-200 hover:text-cyan-100">Backtest</Link></div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <SelectField label="League" name="league" value={input.league} options={LEAGUES} />
          <SelectField label="Market" name="market" value={input.market} options={MARKETS} />
          <SelectField label="Side" name="side" value={input.side} options={SIDES} />
          <SelectField label="Venue" name="venue" value={input.venue} options={VENUE_OPTIONS} />
          <SelectField label="Price" name="price" value={input.price} options={PRICE_OPTIONS} />
          <SelectField label="Form" name="form" value={input.form} options={FORM_OPTIONS} />
          <SelectField label="Rest" name="rest" value={input.rest} options={REST_OPTIONS} />
          <SelectField label="Market context" name="marketContext" value={input.marketContext} options={MARKET_CONTEXT_OPTIONS} />
          <SelectField label="Depth" name="depth" value={input.depth} options={DEPTHS} />
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Limit</span><input name="limit" defaultValue={String(input.limit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <button className="md:col-span-3 xl:col-span-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Build candidate systems</button>
        </form>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Candidates" value={result.returnedCandidates} note="Builder candidates returned." />
        <Metric label="Factory base" value={result.totalFactoryCandidates} note="Raw factory candidates scanned." />
        <Metric label="Promote" value={result.readiness.promoteCandidates} note="Strong preview candidates." />
        <Metric label="Watch" value={result.readiness.watchCandidates} note="Structured but not verified." />
        <Metric label="Needs backtest" value={result.readiness.needsBacktest} note="All candidates need historical proof." />
        <Metric label="Needs source" value={result.readiness.needsSourceData} note="Historical rows required." />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Builder rules</div>
        <div className="grid gap-2 text-sm leading-6 text-slate-400">{result.notes.map((note) => <div key={note}>• {note}</div>)}</div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        {result.candidates.length ? result.candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} />) : <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">No candidates match these builder filters. Broaden side, venue, price, rest, or market context.</div>}
      </section>
    </main>
  );
}
