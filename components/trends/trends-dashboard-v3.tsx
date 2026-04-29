"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { SetupStateCard } from "@/components/ui/setup-state-card";
import { StatCard } from "@/components/ui/stat-card";
import type { TrendCardView, TrendDashboardView, TrendFilters, TrendMatchView, TrendMode, TrendTableRow } from "@/lib/types/domain";
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
    if (value === null || value === undefined || value === "") { params.delete(key); continue; }
    params.set(key, String(value));
  }
  return `/trends?${params.toString()}`;
}

function gateVariant(gate: string | undefined): "review" | "watch" | "context" | "research" {
  if (!gate) return "research";
  const g = gate.toUpperCase();
  if (g.includes("REVIEW")) return "review";
  if (g.includes("WATCH")) return "watch";
  if (g.includes("CONTEXT")) return "context";
  return "research";
}

function GatePill({ gate }: { gate: string | undefined }) {
  const v = gateVariant(gate);
  const cls = {
    review: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200",
    watch: "border-sky-400/40 bg-sky-400/15 text-sky-200",
    context: "border-amber-300/35 bg-amber-300/10 text-amber-200",
    research: "border-slate-500/30 bg-slate-800/60 text-slate-300",
  }[v];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] ${cls}`}>
      {gate ?? "RESEARCH ONLY"}
    </span>
  );
}

function LeaguePill({ league, market }: { league?: string; market?: string }) {
  const label = [league, market].filter(Boolean).join(" · ");
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/8 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">
      {label}
    </span>
  );
}

function toneClass(tone: TrendCardView["tone"]) {
  if (tone === "success") return "border-emerald-400/20 bg-emerald-400/4";
  if (tone === "brand") return "border-sky-400/20 bg-sky-400/4";
  if (tone === "premium") return "border-amber-300/20 bg-amber-300/4";
  return "border-white/8 bg-slate-950/70";
}

// ─── Stats grid ────────────────────────────────────────────────────────────

type StatItem = { label: string; value: string; muted?: boolean };

function StatsGrid({ items }: { items: StatItem[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-white/6 bg-black/30 px-2 py-2.5 text-center">
          <div className={`text-sm font-semibold tabular-nums ${item.muted ? "text-slate-400" : "text-white"}`}>
            {item.value}
          </div>
          <div className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-500">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function buildStatItems(card: TrendCardView): StatItem[] {
  return [
    {
      label: "Record",
      value: card.record ?? (typeof card.wins === "number" ? `${card.wins}-${card.losses ?? 0}` : "Pending"),
      muted: !card.record && typeof card.wins !== "number",
    },
    {
      label: "ROI",
      value: card.roi ?? "Pending",
      muted: !card.roi,
    },
    {
      label: "Win %",
      value: card.winRate ?? card.hitRate ?? "Pending",
      muted: !card.winRate && !card.hitRate,
    },
    {
      label: "Units",
      value: typeof card.profitUnits === "number"
        ? `${card.profitUnits > 0 ? "+" : ""}${card.profitUnits.toFixed(1)}u`
        : "Pending",
      muted: typeof card.profitUnits !== "number",
    },
    {
      label: "Streak",
      value: card.streak ?? "—",
      muted: !card.streak,
    },
    {
      label: "Sample",
      value: card.sampleSize > 0 ? String(card.sampleSize) : "Pending",
      muted: card.sampleSize === 0,
    },
  ];
}

// ─── Active games ──────────────────────────────────────────────────────────

function formatMatchTime(startTime: string) {
  try {
    const d = new Date(startTime);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return startTime.slice(0, 10);
  }
}

function ActiveGameRow({ match, gate }: { match: TrendMatchView; gate: string | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-black/30 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{match.eventLabel}</div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {match.leagueKey} · {formatMatchTime(match.startTime)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <GatePill gate={gate} />
        {match.matchupHref ? (
          <Link href={match.matchupHref} className="rounded-full border border-line px-2.5 py-1 text-[10px] text-sky-300 hover:border-sky-400/40">
            →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

// ─── Risk row ─────────────────────────────────────────────────────────────

function RiskRow({ card }: { card: TrendCardView }) {
  const hasPrice = Boolean(card.priceCheckpoint);
  const hasWarnings = card.warnings && card.warnings.length > 0;
  const killSwitches = card.killSwitchList ?? [];

  return (
    <div className="mt-3 rounded-xl border border-amber-300/12 bg-amber-400/4 px-3 py-2.5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {hasPrice ? (
          <div className="min-w-0">
            <span className="text-[9px] uppercase tracking-[0.18em] text-amber-300/60">Price checkpoint · </span>
            <span className="text-xs text-amber-100">{card.priceCheckpoint}</span>
          </div>
        ) : null}
        {hasWarnings ? (
          <div className="min-w-0">
            <span className="text-[9px] uppercase tracking-[0.18em] text-red-400/60">Warning · </span>
            <span className="text-xs text-red-200">{card.warnings![0]}</span>
          </div>
        ) : null}
        {killSwitches.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {killSwitches.slice(0, 3).map((sw, i) => (
              <span key={i} className="rounded-full border border-amber-300/15 bg-amber-400/8 px-2 py-0.5 text-[10px] text-amber-200/70">
                {sw}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main trend card ───────────────────────────────────────────────────────

function TrendCard({ card }: { card: TrendCardView }) {
  const matches = card.todayMatches ?? [];
  const statItems = buildStatItems(card);
  const gate = card.actionGate;
  // Short description: strip any long quality text, max 120 chars
  const desc = (card.description || card.note || "").replace(/Action Gate:[^.]+\./gi, "").replace(/SmartScore\s*\d+\.?/gi, "").replace(/Fair-price checkpoint:[^.]+\./gi, "").trim().slice(0, 140);

  return (
    <Card className={`rounded-[28px] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.20)] ${toneClass(card.tone)}`}>
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <LeaguePill league={card.league} market={card.market} />
          {card.betType ? (
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{card.betType}</span>
          ) : null}
        </div>
        <GatePill gate={gate} />
      </div>

      <div className="mt-3">
        <div className="text-base font-semibold leading-snug text-white">{card.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          {card.conditionCount ? <span>{card.conditionCount} condition{card.conditionCount !== 1 ? "s" : ""}</span> : null}
          {matches.length > 0 ? (
            <span className="font-medium text-emerald-400/90">{matches.length} active game{matches.length !== 1 ? "s" : ""}</span>
          ) : (
            <span>No games today</span>
          )}
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="mt-4">
        <StatsGrid items={statItems} />
      </div>

      {/* ── Active games ── */}
      {matches.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/70">
            Active Games
          </div>
          <div className="grid gap-2">
            {matches.slice(0, 3).map((match) => (
              <ActiveGameRow key={match.id} match={match} gate={gate} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Short description ── */}
      {desc ? (
        <p className="mt-3 text-xs leading-5 text-slate-400">{desc}</p>
      ) : null}

      {/* ── Risk row ── */}
      <RiskRow card={card} />
    </Card>
  );
}

// ─── Movement/segment mini rows ────────────────────────────────────────────

function MiniRows({ title, rows }: { title: string; rows: TrendTableRow[] }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-sky-300">{title}</div>
      <div className="mt-4 grid gap-3">
        {rows.slice(0, 8).map((row, index) => (
          <Link key={`${row.label}:${index}`} href={row.href ?? "/trends"} className="rounded-2xl border border-white/8 bg-slate-950/55 p-3 transition hover:border-sky-300/25">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-white">{row.label}</div>
              <div className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-sky-100">{row.movement}</div>
            </div>
            {row.note ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{row.note}</div> : null}
          </Link>
        ))}
      </div>
    </Card>
  );
}

// ─── Today matches banner ──────────────────────────────────────────────────

function TodayMatchesBanner({ matches }: { matches: TrendMatchView[] }) {
  if (!matches.length) return null;
  return (
    <Card className="border-emerald-400/15 bg-emerald-400/5 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
          {matches.length} Live Qualifier{matches.length !== 1 ? "s" : ""} Today
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {matches.slice(0, 4).map((match) => (
          <div key={match.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/10 bg-black/25 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white">{match.eventLabel}</div>
              <div className="text-[11px] text-slate-500">{match.leagueKey} · {formatMatchTime(match.startTime)}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              {match.matchupHref ? <Link href={match.matchupHref} className="text-[11px] text-sky-300 hover:underline">Matchup</Link> : null}
              {match.boardHref ? <Link href={match.boardHref} className="text-[11px] text-sky-300 hover:underline">Board</Link> : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function TrendsDashboardV3({ data }: TrendsDashboardV3Props) {
  if (data.setup) {
    return <SetupStateCard title={data.setup.title} detail={data.setup.detail} steps={data.setup.steps} />;
  }

  const displayCards = data.mode === "simple" ? data.cards.slice(0, 6) : data.cards;

  return (
    <div className="grid gap-5">
      {/* ── Page header ── */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.26em] text-cyan-300/70">Historical Intelligence</div>
            <div className="mt-1.5 font-display text-2xl font-semibold text-white sm:text-3xl">Trends</div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">{data.sourceNote}</p>
          </div>
          <div className="inline-flex self-start rounded-2xl border border-line bg-slate-950/80 p-1">
            <Link href={buildTrendHref(data.filters, "simple", data.aiQuery)} className={`rounded-xl px-4 py-2 text-sm ${data.mode === "simple" ? "bg-sky-500/15 text-sky-200" : "text-slate-400"}`}>Simple</Link>
            <Link href={buildTrendHref(data.filters, "power", data.aiQuery)} className={`rounded-xl px-4 py-2 text-sm ${data.mode === "power" ? "bg-sky-500/15 text-sky-200" : "text-slate-400"}`}>Power</Link>
          </div>
        </div>
      </Card>

      {/* ── Filters ── */}
      <Card className="p-4">
        <form action="/trends" method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <input type="hidden" name="mode" value={data.mode} />
          {data.aiQuery ? <input type="hidden" name="q" value={data.aiQuery} /> : null}
          <select name="league" defaultValue={data.filters.league} className="rounded-xl border border-line bg-slate-950 px-3 py-2.5 text-sm text-white">
            <option value="ALL">All leagues</option>
            {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select name="market" defaultValue={data.filters.market} className="rounded-xl border border-line bg-slate-950 px-3 py-2.5 text-sm text-white">
            <option value="ALL">All markets</option>
            {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select name="side" defaultValue={data.filters.side} className="rounded-xl border border-line bg-slate-950 px-3 py-2.5 text-sm text-white">
            <option value="ALL">All sides</option>
            <option value="HOME">Home</option>
            <option value="AWAY">Away</option>
            <option value="OVER">Over</option>
            <option value="UNDER">Under</option>
            <option value="FAVORITE">Favorite</option>
            <option value="UNDERDOG">Underdog</option>
          </select>
          <select name="window" defaultValue={data.filters.window} className="rounded-xl border border-line bg-slate-950 px-3 py-2.5 text-sm text-white">
            <option value="30d">30d</option>
            <option value="90d">90d</option>
            <option value="365d">365d</option>
            <option value="all">All history</option>
          </select>
          <button type="submit" className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-200">Refine</button>
        </form>
        {/* Query bar */}
        <form action="/trends" method="get" className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="mode" value={data.mode} />
          <input name="q" defaultValue={data.aiQuery} placeholder='e.g. "MLB road underdogs after a loss"' className="rounded-xl border border-line bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500" />
          <button type="submit" className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-200">Run Query</button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TREND_QUERY_EXAMPLES.slice(0, 4).map((ex) => (
            <Link key={ex} href={buildTrendHref(data.filters, data.mode, ex, { q: ex })} className="rounded-full border border-line bg-slate-950/65 px-2.5 py-1 text-[11px] text-slate-400 hover:text-slate-200">
              {ex}
            </Link>
          ))}
        </div>
      </Card>

      {/* ── Alert banners ── */}
      {data.sampleNote ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/5 px-4 py-3 text-sm leading-6 text-amber-100">
          {data.sampleNote}
        </div>
      ) : null}

      {/* ── Summary metrics ── */}
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => <StatCard key={metric.label} label={metric.label} value={metric.value} note={metric.note} />)}
      </div>

      {/* ── Today live qualifiers ── */}
      {data.todayMatches.length > 0 ? <TodayMatchesBanner matches={data.todayMatches} /> : null}

      {/* ── Trend system cards ── */}
      <div className="grid gap-4 xl:grid-cols-2">
        {displayCards.map((card) => <TrendCard key={card.id} card={card} />)}
      </div>

      {/* ── Movement / segment rows ── */}
      {(data.movementRows.length > 0 || data.segmentRows.length > 0) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.movementRows.length > 0 ? <MiniRows title="Action gates" rows={data.movementRows} /> : null}
          {data.segmentRows.length > 0 ? <MiniRows title="Trend segments" rows={data.segmentRows} /> : null}
        </div>
      ) : null}
    </div>
  );
}
