"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { SetupStateCard } from "@/components/ui/setup-state-card";
import { StatCard } from "@/components/ui/stat-card";
import type { TrendCardView, TrendDashboardView, TrendFilters, TrendMode, TrendTableRow } from "@/lib/types/domain";
import { TREND_QUERY_EXAMPLES } from "@/services/trends/ai-query";

type TrendsDashboardV3Props = {
  data: TrendDashboardView;
};

const LEAGUES = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"];
const MARKETS = ["spread", "moneyline", "total", "player_points", "player_rebounds", "player_assists", "player_threes", "fight_winner"];

function buildTrendHref(
  filters: TrendFilters,
  mode: TrendMode,
  aiQuery: string,
  overrides?: Partial<Record<string, string | number | null | undefined>>
) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (aiQuery.trim()) params.set("q", aiQuery.trim());

  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || value === "ALL" || value === "all") continue;
    params.set(key, String(value));
  }

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === null || value === undefined || value === "") {
      params.delete(key);
      continue;
    }
    params.set(key, String(value));
  }

  return `/trends?${params.toString()}`;
}

function compactText(value: string | null | undefined, fallback = "N/A") {
  const text = value?.trim();
  return text ? text : fallback;
}

function stripAfter(value: string, marker: string) {
  const index = value.toLowerCase().indexOf(marker.toLowerCase());
  return index >= 0 ? value.slice(0, index).trim() : value.trim();
}

function firstSentence(value: string | null | undefined) {
  const text = compactText(value, "");
  if (!text) return "";
  const cleaned = stripAfter(text, "Action Gate:");
  return cleaned.split(".").map((part) => part.trim()).filter(Boolean)[0] ?? cleaned;
}

function extractLabel(text: string | null | undefined, label: string) {
  const source = text ?? "";
  const match = source.match(new RegExp(`${label}:?\\s*([^.|]+)`, "i"));
  return match?.[1]?.trim() ?? null;
}

function extractActionGate(card: TrendCardView) {
  const sources = [
    card.note,
    card.whyItMatters,
    card.caution,
    ...(card.todayMatches ?? []).map((match) => match.recommendedBetLabel ?? "")
  ];
  const joined = sources.filter(Boolean).join(" | ");
  const explicit = joined.match(/Action Gate:\s*([^.|]+)/i)?.[1]?.trim();
  if (explicit) return explicit;

  const liveGate = card.todayMatches?.find((match) => match.recommendedBetLabel)?.recommendedBetLabel;
  if (liveGate) return liveGate;

  if (card.tone === "success") return "REVIEW LIVE PRICE";
  if (card.tone === "brand" || card.tone === "premium") return "WATCH FOR PRICE";
  return "CONTEXT ONLY";
}

function extractPriceNeeded(card: TrendCardView) {
  const text = [
    card.note,
    card.whyItMatters,
    card.caution,
    ...(card.todayMatches ?? []).map((match) => match.oddsContext ?? "")
  ].filter(Boolean).join(" | ");
  const explicit = text.match(/Fair-price checkpoint:\s*([^|.]+)/i)?.[1]?.trim();
  if (explicit) return explicit;
  return card.roi
    ? `ROI checkpoint: ${card.roi}. Do not chase a worse number.`
    : "Verify current board price before using this trend.";
}

function extractKillSwitches(card: TrendCardView) {
  const explicit = card.caution?.replace(/^Kill switches:\s*/i, "").trim();
  if (explicit) return explicit;
  if ((card.todayMatches ?? []).length === 0) return "No current qualifier.";
  return "Stale price, injury/news change, lineup change, or odds moving through the price checkpoint.";
}

function extractConditionCount(card: TrendCardView) {
  const match = `${card.dateRange} ${card.whyItMatters ?? ""}`.match(/(\d+)\s+conditions/i);
  return match?.[1] ?? "—";
}

function gateClass(actionGate: string) {
  if (actionGate.includes("REVIEW")) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (actionGate.includes("WATCH")) return "border-sky-400/25 bg-sky-400/10 text-sky-100";
  if (actionGate.includes("CONTEXT")) return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-slate-500/25 bg-slate-500/10 text-slate-200";
}

function toneClass(tone: TrendCardView["tone"]) {
  if (tone === "success") return "border-emerald-400/25 bg-emerald-400/5";
  if (tone === "brand") return "border-sky-400/25 bg-sky-400/5";
  if (tone === "premium") return "border-amber-300/25 bg-amber-300/5";
  return "border-line bg-slate-950/70";
}

function SystemStat({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value ?? "—"}</div>
    </div>
  );
}

function ActiveGamesStrip({ card }: { card: TrendCardView }) {
  const matches = (card.todayMatches ?? []).slice(0, 3);
  if (!matches.length) return null;

  return (
    <div className="mt-4 rounded-3xl border border-cyan-400/12 bg-black/25 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/60">Active games</div>
        <div className="text-xs text-slate-500">{card.todayMatches?.length ?? 0} match{(card.todayMatches?.length ?? 0) === 1 ? "" : "es"}</div>
      </div>
      <div className="grid gap-2">
        {matches.map((match) => (
          <Link key={`${card.id}:${match.id}`} href={match.matchupHref || match.boardHref || "/trends"} className="rounded-2xl border border-white/8 bg-slate-950/55 p-3 transition hover:border-cyan-300/25">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{match.eventLabel}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{match.leagueKey} · {new Date(match.startTime).toLocaleString()}</div>
              </div>
              {match.recommendedBetLabel ? (
                <div className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${gateClass(match.recommendedBetLabel)}`}>
                  {match.recommendedBetLabel}
                </div>
              ) : null}
            </div>
            {match.oddsContext ? <div className="mt-2 truncate text-xs text-slate-400">{match.oddsContext}</div> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

function TrendCard({ card }: { card: TrendCardView }) {
  const actionGate = extractActionGate(card);
  const conditionCount = extractConditionCount(card);
  const last10 = extractLabel(card.note, "Last 10") ?? "—";
  const streak = extractLabel(card.note, "Streak") ?? "—";
  const years = extractLabel(card.note, "Years") ?? "—";
  const shortRead = firstSentence(card.note || card.whyItMatters || card.explanation);
  const priceNeeded = extractPriceNeeded(card);
  const killSwitches = extractKillSwitches(card);

  return (
    <Card className={`rounded-[30px] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.22)] ${toneClass(card.tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{card.dateRange}</div>
          <div className="mt-2 text-xl font-semibold leading-tight text-white">{card.title}</div>
        </div>
        <div className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${gateClass(actionGate)}`}>
          {actionGate}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SystemStat label="Profit" value={card.value} />
        <SystemStat label="Record" value={card.hitRate ? `Hit ${card.hitRate}` : `${card.sampleSize} games`} />
        <SystemStat label="ROI" value={card.roi ?? "Pending"} />
        <SystemStat label="Conditions" value={conditionCount} />
        <SystemStat label="Last 10" value={last10} />
        <SystemStat label="Streak" value={streak} />
        <SystemStat label="Games" value={card.sampleSize} />
        <SystemStat label="Years" value={years} />
      </div>

      <ActiveGamesStrip card={card} />

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-slate-950/50 p-3 lg:col-span-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">System read</div>
          <div className="mt-1 text-sm leading-6 text-slate-200">{shortRead}</div>
        </div>
        <div className="rounded-2xl border border-sky-400/15 bg-sky-400/5 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-sky-200/70">Price checkpoint</div>
          <div className="mt-1 text-sm leading-6 text-sky-100">{priceNeeded}</div>
        </div>
        <div className="rounded-2xl border border-amber-300/15 bg-amber-400/5 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-amber-200/70">Kill switches</div>
          <div className="mt-1 text-sm leading-6 text-amber-100">{killSwitches}</div>
        </div>
      </div>
    </Card>
  );
}

function MiniRows({ title, rows }: { title: string; rows: TrendTableRow[] }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-sky-300">{title}</div>
      <div className="mt-4 grid gap-3">
        {rows.slice(0, 12).map((row, index) => (
          <Link key={`${row.label}:${index}`} href={row.href ?? "/trends"} className="rounded-2xl border border-white/8 bg-slate-950/55 p-3 transition hover:border-sky-300/25">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-white">{row.label}</div>
              <div className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-sky-100">{row.movement}</div>
            </div>
            <div className="mt-2 text-xs leading-5 text-slate-400">{row.note}</div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function EmptyTrendState({ filters, mode, aiQuery }: { filters: TrendFilters; mode: TrendMode; aiQuery: string }) {
  return (
    <Card className="border-amber-300/25 bg-amber-400/5 p-6">
      <div className="text-xs uppercase tracking-[0.22em] text-amber-200/70">No trend cards matched</div>
      <div className="mt-2 font-display text-2xl font-semibold text-white">Widen the filter or inspect the signal feed</div>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-amber-100/90">
        The trends page rendered successfully, but this specific filter did not produce visible cards. Try all leagues/markets, or inspect the quality-gated signal feed directly.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="rounded-full border border-amber-200/25 bg-black/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100" href={buildTrendHref(filters, mode, aiQuery, { league: null, market: null, side: null })}>
          Clear filters
        </Link>
        <Link className="rounded-full border border-sky-300/25 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-100" href="/api/trends?mode=signals&debug=true">
          Debug signal feed
        </Link>
      </div>
    </Card>
  );
}

export function TrendsDashboardV3({ data }: TrendsDashboardV3Props) {
  if (data.setup) {
    return <SetupStateCard title={data.setup.title} detail={data.setup.detail} steps={data.setup.steps} />;
  }

  const displayCards = data.mode === "simple" ? data.cards.slice(0, 6) : data.cards;

  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Historical Intelligence</div>
            <div className="mt-2 font-display text-3xl font-semibold text-white">Trends command center</div>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">{data.sourceNote}</p>
          </div>
          <div className="inline-flex rounded-2xl border border-line bg-slate-950/80 p-1">
            <Link href={buildTrendHref(data.filters, "simple", data.aiQuery)} className={`rounded-xl px-4 py-2 text-sm ${data.mode === "simple" ? "bg-sky-500/15 text-sky-200" : "text-slate-400"}`}>Simple</Link>
            <Link href={buildTrendHref(data.filters, "power", data.aiQuery)} className={`rounded-xl px-4 py-2 text-sm ${data.mode === "power" ? "bg-sky-500/15 text-sky-200" : "text-slate-400"}`}>Power</Link>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <form action="/trends" method="get" className="grid gap-3">
          <input type="hidden" name="mode" value={data.mode} />
          <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Query Assistant</label>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <input name="q" defaultValue={data.aiQuery} placeholder="Show me MLB short dogs with positive units" className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <button type="submit" className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-5 py-3 text-sm font-medium text-sky-200">Run Query</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {TREND_QUERY_EXAMPLES.map((example) => (
              <Link key={example} href={buildTrendHref(data.filters, data.mode, example, { q: example })} className="rounded-full border border-line bg-slate-950/65 px-3 py-1.5 text-xs text-slate-300">
                {example}
              </Link>
            ))}
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <form action="/trends" method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input type="hidden" name="mode" value={data.mode} />
          {data.aiQuery ? <input type="hidden" name="q" value={data.aiQuery} /> : null}
          <select name="league" defaultValue={data.filters.league} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All leagues</option>
            {LEAGUES.map((league) => <option key={league} value={league}>{league}</option>)}
          </select>
          <select name="market" defaultValue={data.filters.market} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All markets</option>
            {MARKETS.map((market) => <option key={market} value={market}>{market}</option>)}
          </select>
          <select name="side" defaultValue={data.filters.side} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All sides</option>
            <option value="HOME">Home</option>
            <option value="AWAY">Away</option>
            <option value="OVER">Over</option>
            <option value="UNDER">Under</option>
            <option value="FAVORITE">Favorite</option>
            <option value="UNDERDOG">Underdog</option>
          </select>
          <select name="window" defaultValue={data.filters.window} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="30d">30d</option>
            <option value="90d">90d</option>
            <option value="365d">365d</option>
            <option value="all">All history</option>
          </select>
          <button type="submit" className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-200">Refine</button>
        </form>
      </Card>

      {data.explanation ? (
        <Card className="p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-sky-300">Trend Read</div>
          <div className="mt-3 font-display text-2xl font-semibold text-white">{data.explanation.headline}</div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Why it matters</div><div className="mt-2 text-sm leading-6 text-slate-300">{data.explanation.whyItMatters}</div></div>
            <div><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Use with caution</div><div className="mt-2 text-sm leading-6 text-amber-100">{data.explanation.caution}</div></div>
            <div><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Query logic</div><div className="mt-2 text-sm leading-6 text-slate-300">{data.explanation.queryLogic}</div></div>
          </div>
        </Card>
      ) : null}

      {data.sampleNote ? <Card className="border-amber-300/25 bg-amber-400/5 p-4 text-sm leading-7 text-amber-100">{data.sampleNote}</Card> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => <StatCard key={metric.label} label={metric.label} value={metric.value} note={metric.note} />)}
      </div>

      {displayCards.length ? (
        <div className="grid gap-4">
          {displayCards.map((card) => <TrendCard key={card.id} card={card} />)}
        </div>
      ) : (
        <EmptyTrendState filters={data.filters} mode={data.mode} aiQuery={data.aiQuery} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <MiniRows title="System index" rows={data.movementRows} />
        <MiniRows title="Conditions / game history" rows={data.segmentRows} />
      </div>
    </div>
  );
}
