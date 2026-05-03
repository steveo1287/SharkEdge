"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { SetupStateCard } from "@/components/ui/setup-state-card";
import type { TrendCardView, TrendDashboardView, TrendFilters, TrendMode, TrendTableRow } from "@/lib/types/domain";
import { TREND_QUERY_EXAMPLES } from "@/services/trends/ai-query";

type Props = { data: TrendDashboardView };
type Tone = "sky" | "emerald" | "amber" | "cyan";
type LaneGroups = { props: TrendCardView[]; movers: TrendCardView[]; splits: TrendCardView[]; model: TrendCardView[]; watch: TrendCardView[] };

const LEAGUES = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"];
const MARKETS = ["spread", "moneyline", "total", "player_points", "player_rebounds", "player_assists", "player_threes", "player_pitcher_outs", "player_pitcher_strikeouts", "fight_winner"];
const LIMIT = 5;

function trendHref(filters: TrendFilters, mode: TrendMode, q: string, overrides?: Partial<Record<string, string | number | null | undefined>>) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (q.trim()) params.set("q", q.trim());
  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || value === "ALL" || value === "all") continue;
    params.set(key, String(value));
  }
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  return `/trends?${params.toString()}`;
}

function words(card: TrendCardView) {
  return [card.title, card.value, card.description, card.note, card.explanation, card.whyItMatters, card.caution, card.priceCheckpoint, card.betType, card.market].filter(Boolean).join(" ").toUpperCase();
}
function has(card: TrendCardView, pattern: RegExp) { return pattern.test(words(card)); }
function percent(value: string | null | undefined) { const n = Number(String(value ?? "").replace(/[^0-9.-]+/g, "")); return Number.isFinite(n) ? n : 0; }
function verified(card: TrendCardView) { return has(card, /SAVED LEDGER VERIFIED|EVENTMARKET BACKTEST|LEDGER VERIFIED|\b\d+\s+GRADED\b/); }
function needsProof(card: TrendCardView) { return has(card, /SEED STARTER|SEEDED|NO GRADED LEDGER|PRICE NEEDED|CURRENT PRICE REQUIRED|NO CURRENT QUALIFYING PRICE|OPEN ROWS|NO GRADE/); }
function priced(card: TrendCardView) { return Boolean(card.priceCheckpoint) || has(card, /PRICE ATTACHED|MARKET-EDGE|REVIEW LIVE PRICE|FAIR \+|-?\d{3}/); }
function current(card: TrendCardView) { return has(card, /CURRENT SIGNAL|SIM-ENGINE|MARKET-EDGE|REAL CURRENT/); }
function prop(card: TrendCardView) { return /player_|prop|strikeout|rebounds|assists|points|threes|total bases|fight|round|method/i.test(`${card.market ?? ""} ${card.betType ?? ""} ${card.title ?? ""}`); }
function mover(card: TrendCardView) { return !prop(card) && has(card, /STEAM|MOVE|MOVED|MOVEMENT|REPRICE|LINE|PRICE|BEST PRICE|MARKET-EDGE|CLV|COPY/); }
function split(card: TrendCardView) { return has(card, /PUBLIC|BETS|HANDLE|MONEY %|TICKET|SPLIT|REVERSE LINE/); }
function reviewGate(card: TrendCardView) { return (card.actionGate ?? "").toUpperCase().includes("REVIEW"); }
function watchGate(card: TrendCardView) { return (card.actionGate ?? "").toUpperCase().includes("WATCH"); }
function rank(card: TrendCardView) {
  let score = 0;
  if (verified(card)) score += 500;
  if (priced(card)) score += 120;
  if (current(card)) score += 45;
  if (card.todayMatches?.length) score += 90 + card.todayMatches.length * 12;
  if (reviewGate(card)) score += 80;
  if (watchGate(card)) score += 35;
  score += Math.min(card.sampleSize ?? 0, 150) * 0.8;
  score += Math.max(-50, Math.min(50, percent(card.roi ?? card.value))) * 2;
  score += Math.max(0, Math.min(100, percent(card.winRate ?? card.hitRate))) * 0.4;
  if (needsProof(card)) score -= 110;
  return score;
}
function market(value: string | null | undefined) { return value ? value.replace(/_/g, " ") : "market"; }
function units(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(1)}u` : "—"; }
function blurb(card: TrendCardView) {
  const raw = (card.description || card.note || card.explanation || card.whyItMatters || "").replace(/Action Gate:[^.]+\./gi, "").replace(/SmartScore\s*\d+\.?/gi, "").replace(/Fair-price checkpoint:[^.]+\./gi, "").trim();
  return raw.length > 170 ? `${raw.slice(0, 169)}…` : raw;
}

function ToneText({ tone, label }: { tone: Tone; label: string }) {
  const cls = { sky: "text-sky-300", emerald: "text-emerald-300", amber: "text-amber-300", cyan: "text-cyan-300" }[tone];
  return <div className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${cls}`}>{label}</div>;
}
function Pill({ label, kind = "muted" }: { label: string; kind?: "good" | "warn" | "info" | "muted" }) {
  const cls = { good: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200", warn: "border-amber-300/25 bg-amber-300/10 text-amber-200", info: "border-sky-400/25 bg-sky-400/10 text-sky-200", muted: "border-slate-500/25 bg-slate-800/60 text-slate-300" }[kind];
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${cls}`}>{label}</span>;
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/6 bg-black/30 px-2 py-2 text-center"><div className="text-xs font-semibold tabular-nums text-white">{value}</div><div className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</div></div>;
}

function FilterDock({ data }: Props) {
  return <Card className="sticky top-3 z-20 border-sky-300/15 bg-slate-950/90 p-4 backdrop-blur-xl"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><ToneText tone="cyan" label="Trends Command Center" /><h1 className="mt-1 font-display text-2xl font-semibold text-white sm:text-3xl">What is moving, why it matters, and whether SharkEdge agrees.</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{data.sourceNote}</p></div><div className="inline-flex self-start rounded-2xl border border-line bg-slate-950/80 p-1"><Link href={trendHref(data.filters, "simple", data.aiQuery)} className={`rounded-xl px-4 py-2 text-sm ${data.mode === "simple" ? "bg-sky-500/15 text-sky-200" : "text-slate-400"}`}>Simple</Link><Link href={trendHref(data.filters, "power", data.aiQuery)} className={`rounded-xl px-4 py-2 text-sm ${data.mode === "power" ? "bg-sky-500/15 text-sky-200" : "text-slate-400"}`}>Power</Link></div></div><form action="/trends" method="get" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]"><input type="hidden" name="mode" value={data.mode} />{data.aiQuery ? <input type="hidden" name="q" value={data.aiQuery} /> : null}<select name="league" defaultValue={data.filters.league} className="rounded-xl border border-line bg-slate-950 px-3 py-2.5 text-sm text-white"><option value="ALL">All leagues</option>{LEAGUES.map((league) => <option key={league} value={league}>{league}</option>)}</select><select name="market" defaultValue={data.filters.market} className="rounded-xl border border-line bg-slate-950 px-3 py-2.5 text-sm text-white"><option value="ALL">All markets</option>{MARKETS.map((item) => <option key={item} value={item}>{item}</option>)}</select><select name="side" defaultValue={data.filters.side} className="rounded-xl border border-line bg-slate-950 px-3 py-2.5 text-sm text-white"><option value="ALL">All sides</option><option value="HOME">Home</option><option value="AWAY">Away</option><option value="OVER">Over</option><option value="UNDER">Under</option><option value="FAVORITE">Favorite</option><option value="UNDERDOG">Underdog</option></select><select name="window" defaultValue={data.filters.window} className="rounded-xl border border-line bg-slate-950 px-3 py-2.5 text-sm text-white"><option value="30d">30d</option><option value="90d">90d</option><option value="365d">365d</option><option value="all">All history</option></select><button type="submit" className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-200">Refine</button></form><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">{[["Pulse", "pulse"], ["Movers", "market-movers"], ["Splits", "public-splits"], ["Model", "model-edge"], ["Props", "props"], ["Live", "live"], ["Systems", "systems"], ["Watch", "watchlist"]].map(([label, id]) => <a key={id} href={`#${id}`} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-400 hover:border-sky-300/25 hover:text-sky-200">{label}</a>)}</div></Card>;
}
function QueryBox({ data }: Props) {
  return <Card className="p-4"><form action="/trends" method="get" className="grid gap-2 sm:grid-cols-[1fr_auto]"><input type="hidden" name="mode" value={data.mode} /><input name="q" defaultValue={data.aiQuery} placeholder='Ask: "MLB road underdogs after a loss"' className="rounded-xl border border-line bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500" /><button type="submit" className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-200">Run Query</button></form><div className="mt-2 flex flex-wrap gap-1.5">{TREND_QUERY_EXAMPLES.slice(0, 4).map((example) => <Link key={example} href={trendHref(data.filters, data.mode, example, { q: example })} className="rounded-full border border-line bg-slate-950/65 px-2.5 py-1 text-[11px] text-slate-400 hover:text-slate-200">{example}</Link>)}</div></Card>;
}
function SignalCard({ card }: { card: TrendCardView }) {
  const body = <Card className="h-full rounded-[1.35rem] border-white/8 bg-slate-950/70 p-4 transition hover:border-sky-300/25"><div className="flex flex-wrap items-start justify-between gap-2"><div className="flex flex-wrap gap-1.5"><Pill label={verified(card) ? "verified" : needsProof(card) ? "needs proof" : "context"} kind={verified(card) ? "good" : needsProof(card) ? "warn" : "muted"} /><Pill label={`${card.league ?? "ALL"} · ${market(card.market)}`} kind="info" /></div><Pill label={card.actionGate ?? "RESEARCH ONLY"} kind={reviewGate(card) ? "good" : watchGate(card) ? "info" : "muted"} /></div><div className="mt-3 text-base font-semibold leading-snug text-white">{card.title}</div><div className="mt-2 flex flex-wrap gap-1.5">{priced(card) ? <Pill label="price proof" kind="good" /> : null}{current(card) ? <Pill label="current signal" kind="info" /> : null}{card.todayMatches?.length ? <Pill label={`${card.todayMatches.length} live`} kind="info" /> : null}</div>{blurb(card) ? <p className="mt-3 text-xs leading-5 text-slate-400">{blurb(card)}</p> : null}<div className="mt-4 grid grid-cols-5 gap-2"><Mini label="ROI" value={card.roi ?? "—"} /><Mini label="Win" value={card.winRate ?? card.hitRate ?? "—"} /><Mini label="Units" value={units(card.profitUnits)} /><Mini label="Sample" value={card.sampleSize ? String(card.sampleSize) : "—"} /><Mini label="Live" value={String(card.todayMatches?.length ?? 0)} /></div>{card.priceCheckpoint || card.warnings?.[0] ? <div className="mt-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-400">{card.priceCheckpoint ? <div><span className="text-amber-200">Price:</span> {card.priceCheckpoint}</div> : null}{card.warnings?.[0] ? <div><span className="text-red-200">Warning:</span> {card.warnings[0]}</div> : null}</div> : null}</Card>;
  return card.href ? <Link href={card.href}>{body}</Link> : body;
}

function Pulse({ data, cards }: { data: TrendDashboardView; cards: TrendCardView[] }) {
  const top = cards[0];
  const tiles = [{ label: "Top Signal", value: top?.title ?? "No signal", note: top ? `Rank ${Math.round(rank(top))} · ${top.league ?? "ALL"} · ${market(top.market)}` : "Nothing passed the filters." }, { label: "Review Gates", value: String(cards.filter(reviewGate).length), note: "Cards strong enough to review first." }, { label: "Price Proof", value: String(cards.filter(priced).length), note: "Current price, checkpoint, or market-edge proof." }, { label: "Live Qualifiers", value: String(data.todayMatches.length), note: "Current games attached to trend systems." }, { label: "Verified", value: String(cards.filter(verified).length), note: "Ledger or backtest-backed systems." }];
  return <section id="pulse" className="scroll-mt-28 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{tiles.map((tile) => <Card key={tile.label} className="min-h-36 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{tile.label}</div><div className="mt-2 line-clamp-3 text-lg font-semibold leading-snug text-white">{tile.value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{tile.note}</div></Card>)}</section>;
}
function Row({ row }: { row: TrendTableRow }) {
  const body = <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4 transition hover:border-sky-300/25"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="text-sm font-semibold text-white">{row.label}</div><div className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-sky-100">{row.movement}</div></div>{row.note ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{row.note}</div> : null}</div>;
  return row.href ? <Link href={row.href}>{body}</Link> : body;
}
function Lane({ id, title, subtitle, cards, rows = [], empty, tone }: { id: string; title: string; subtitle: string; cards: TrendCardView[]; rows?: TrendTableRow[]; empty: string; tone: Tone }) {
  const shownCards = cards.slice(0, LIMIT);
  const shownRows = rows.slice(0, Math.max(0, LIMIT - shownCards.length));
  return <section id={id} className="scroll-mt-28"><div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><ToneText tone={tone} label={title} /><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{subtitle}</p></div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Showing {shownCards.length + shownRows.length} of {cards.length + rows.length}</div></div>{shownCards.length || shownRows.length ? <div className="grid gap-4 xl:grid-cols-2">{shownCards.map((card) => <SignalCard key={`${id}:${card.id}`} card={card} />)}{shownRows.map((row, index) => <Row key={`${id}:${row.label}:${index}`} row={row} />)}</div> : <div className="rounded-2xl border border-white/8 bg-slate-950/50 p-4 text-sm leading-6 text-slate-400">{empty}</div>}</section>;
}
function Live({ data }: Props) {
  return <section id="live" className="scroll-mt-28"><div className="mb-3"><ToneText tone="emerald" label="Live Qualifiers Today" /><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">Current games attached to trend systems. This is the shortest path from trend research to matchup review.</p></div>{data.todayMatches.length ? <div className="grid gap-3 lg:grid-cols-2">{data.todayMatches.slice(0, 8).map((match) => <div key={match.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/10 bg-black/25 px-3 py-2.5"><div className="min-w-0"><div className="truncate text-sm font-medium text-white">{match.eventLabel}</div><div className="text-[11px] text-slate-500">{match.leagueKey}</div></div><div className="flex shrink-0 gap-2">{match.matchupHref ? <Link href={match.matchupHref} className="text-[11px] text-sky-300 hover:underline">Matchup</Link> : null}{match.boardHref ? <Link href={match.boardHref} className="text-[11px] text-sky-300 hover:underline">Board</Link> : null}</div></div>)}</div> : <div className="rounded-2xl border border-white/8 bg-slate-950/50 p-4 text-sm text-slate-400">No current games qualify under these filters.</div>}</section>;
}
function Metrics({ data }: Props) { return data.metrics.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{data.metrics.slice(0, 4).map((metric) => <Card key={metric.label} className="p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{metric.label}</div><div className="mt-2 font-display text-2xl font-semibold text-white">{metric.value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{metric.note}</div></Card>)}</div> : null; }

function addToLane(lanes: LaneGroups, lane: keyof LaneGroups, card: TrendCardView, used: Set<string>) {
  if (used.has(card.id)) return;
  lanes[lane].push(card);
  used.add(card.id);
}

function group(cards: TrendCardView[]): LaneGroups {
  const lanes: LaneGroups = { props: [], movers: [], splits: [], model: [], watch: [] };
  const used = new Set<string>();

  for (const card of cards) {
    if (prop(card)) addToLane(lanes, "props", card, used);
    else if (split(card)) addToLane(lanes, "splits", card, used);
    else if (needsProof(card) || watchGate(card)) addToLane(lanes, "watch", card, used);
    else if (mover(card)) addToLane(lanes, "movers", card, used);
    else if (priced(card) || current(card) || reviewGate(card)) addToLane(lanes, "model", card, used);
    else addToLane(lanes, "watch", card, used);
  }

  // Keep the first scan useful even when the current payload lacks a dedicated mover/model signal type.
  for (const card of cards) {
    if (!lanes.movers.length && !prop(card)) addToLane(lanes, "movers", card, used);
    if (!lanes.model.length && (priced(card) || current(card) || reviewGate(card) || verified(card))) addToLane(lanes, "model", card, used);
  }

  return lanes;
}

export function TrendsCommandCenterFlow({ data }: Props) {
  if (data.setup) return <SetupStateCard title={data.setup.title} detail={data.setup.detail} steps={data.setup.steps} />;
  const cards = [...data.cards].sort((a, b) => rank(b) - rank(a));
  const lanes = group(cards);
  return <div className="grid gap-5"><FilterDock data={data} /><QueryBox data={data} />{data.sampleNote ? <div className="rounded-2xl border border-amber-300/20 bg-amber-400/5 px-4 py-3 text-sm leading-6 text-amber-100">{data.sampleNote}</div> : null}<Pulse data={data} cards={cards} /><Metrics data={data} /><Lane id="market-movers" title="Market Movers" subtitle="Price movement, reprice signals, stale-copy opportunities, and cards where the market changed enough to deserve attention." cards={lanes.movers} rows={data.movementRows} empty="No market movement cards are available for the selected filters." tone="sky" /><Lane id="public-splits" title="Public vs Money" subtitle="Ticket/handle split signals and reverse-line-movement candidates. This lane is the destination for bets %, handle %, differential, and RLM cards." cards={lanes.splits} rows={data.segmentRows} empty="No public split data is currently available." tone="amber" /><Lane id="model-edge" title="Model Edge" subtitle="Cards where SharkEdge has price proof, current signal support, or a review gate strong enough to inspect first." cards={lanes.model} empty="No model-edge cards passed the current filters." tone="emerald" /><Lane id="props" title="Prop Movers" subtitle="Player, fighter, and derivative markets stay separate from full-game markets so props do not get buried in the main board." cards={lanes.props} empty="No prop trend cards are available for the selected filters." tone="cyan" /><Live data={data} />{data.mode === "power" ? <Lane id="systems" title="System Board" subtitle="Power mode shows verified/backtested systems first." cards={cards.filter(verified)} empty="No verified systems found for this filter." tone="cyan" /> : null}<Lane id="watchlist" title="Watchlist / Needs Proof" subtitle="Lower-confidence cards: watch gates, seeded systems, missing prices, open rows, or anything that should not be presented as premium yet." cards={lanes.watch} empty="No watchlist or proof-blocked trend cards are available." tone="amber" /></div>;
}
