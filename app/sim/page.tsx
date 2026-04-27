import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";
import { getCachedMlbMlModel } from "@/services/simulation/mlb-ml-training-engine";
import { getCachedMlbCalibrationConformal } from "@/services/simulation/mlb-calibration-conformal";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = { league?: string | string[] };
type PageProps = { searchParams?: Promise<SearchParams> };
type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Projection = Awaited<ReturnType<typeof buildSimProjection>>;
type EdgeResult = Awaited<ReturnType<typeof buildMlbEdges>>["edges"][number];
type Row = { game: SimGame; projection: Projection; edge?: EdgeResult | null };

const LEAGUES: Array<{ key: "ALL" | LeagueKey; label: string; icon: string }> = [
  { key: "ALL", label: "All", icon: "◎" },
  { key: "MLB", label: "MLB", icon: "⚾" },
  { key: "NBA", label: "NBA", icon: "🏀" },
  { key: "NHL", label: "NHL", icon: "🏒" },
  { key: "NFL", label: "NFL", icon: "🏈" },
  { key: "NCAAF", label: "NCAAF", icon: "🏈" },
  { key: "UFC", label: "UFC", icon: "🥊" },
  { key: "BOXING", label: "Boxing", icon: "🥊" }
];

function selectedLeague(value: string | string[] | undefined): "ALL" | LeagueKey {
  const raw = Array.isArray(value) ? value[0] : value;
  const upper = String(raw ?? "ALL").toUpperCase();
  return LEAGUES.some((league) => league.key === upper) ? (upper as "ALL" | LeagueKey) : "ALL";
}
function flatten(sections: BoardSportSectionView[]): SimGame[] { return sections.flatMap((section) => section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))); }
function formatTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return "TBD"; return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); }
function tone(status: string) { if (status === "LIVE") return "success" as const; if (status === "FINAL") return "neutral" as const; if (status === "POSTPONED" || status === "CANCELED") return "danger" as const; return "muted" as const; }
function pct(value: number) { return `${(value * 100).toFixed(1)}%`; }
function plus(value: number) { return `${value > 0 ? "+" : ""}${Number(value).toFixed(Math.abs(value) < 1 ? 2 : 1)}`; }
function decision(row: Row) { const gov = row.projection.mlbIntel?.governor; if (row.game.leagueKey === "MLB") { if (gov?.noBet || gov?.tier === "pass") return { label: "PASS", cls: "border-red-400/30 bg-red-500/10 text-red-200" }; if (gov?.tier === "attack") return { label: "ATTACK", cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" }; return { label: "WATCH", cls: "border-amber-400/30 bg-amber-500/10 text-amber-200" }; } const edge = Math.abs(row.projection.distribution.homeWinPct - 0.5); return edge >= 0.08 ? { label: "ATTACK", cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" } : edge >= 0.045 ? { label: "WATCH", cls: "border-amber-400/30 bg-amber-500/10 text-amber-200" } : { label: "PASS", cls: "border-slate-500/30 bg-slate-500/10 text-slate-300" }; }
function americanToProbability(odds: number | null | undefined) { if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null; return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100); }
function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) { return <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 text-xl font-semibold text-white">{value}</div>{sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}</div>; }
function LeagueSwitcher({ active, counts }: { active: "ALL" | LeagueKey; counts: Record<string, number> }) { return <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40 p-2">{LEAGUES.map((league) => { const href = league.key === "ALL" ? "/sim" : `/sim?league=${league.key}`; const activeClass = active === league.key ? "border-sky-400/40 bg-sky-500/15 text-sky-100" : "border-white/10 bg-white/[0.025] text-slate-300 hover:border-sky-400/30"; return <Link key={league.key} href={href} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${activeClass}`}>{league.icon} {league.label} <span className="ml-1 text-slate-500">{counts[league.key] ?? 0}</span></Link>; })}</div>; }
function PipelinePanel({ mlRows, ece, rows }: { mlRows: number; ece: number | null; rows: Row[] }) { const attack = rows.filter((row) => decision(row).label === "ATTACK").length; const watch = rows.filter((row) => decision(row).label === "WATCH").length; const pass = rows.filter((row) => decision(row).label === "PASS").length; return <Card className="surface-panel p-5"><div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Sim hub state</div><div className="mt-4 grid gap-3 sm:grid-cols-5"><Tile label="Games" value={String(rows.length)} sub="Active slate" /><Tile label="Attack" value={String(attack)} sub="High conviction" /><Tile label="Watch" value={String(watch)} sub="Conditional" /><Tile label="Pass" value={String(pass)} sub="Filtered" /><Tile label="ML rows" value={String(mlRows)} sub={ece == null ? "Calibration pending" : `ECE ${ece.toFixed(3)}`} /></div></Card>; }
function MarketMini({ edge }: { edge?: EdgeResult | null }) { if (!edge) return <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100">No matched sportsbook line</div>; const homeMarket = americanToProbability(edge.market?.homeMoneyline); const best = edge.signal; return <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.055] p-3 text-xs text-slate-300"><div className="flex items-center justify-between gap-2"><span className="text-emerald-200">Market edge</span>{best ? <span className="font-semibold text-white">{best.strength.toUpperCase()}</span> : null}</div><div className="mt-2 grid gap-1"><div>Home ML {edge.market?.homeMoneyline ?? "—"}{homeMarket == null ? "" : ` · mkt ${pct(homeMarket)}`}</div><div>Home edge <span className={edge.edges.homeMoneyline && edge.edges.homeMoneyline > 0 ? "text-emerald-300" : "text-red-300"}>{edge.edges.homeMoneyline == null ? "—" : plus(edge.edges.homeMoneyline)}</span></div><div>Total edge <span className={edge.edges.totalRuns && edge.edges.totalRuns > 0 ? "text-emerald-300" : "text-red-300"}>{edge.edges.totalRuns == null ? "—" : plus(edge.edges.totalRuns)}</span></div></div></div>; }
function MatchupCard({ row }: { row: Row }) { const dec = decision(row); const { game, projection, edge } = row; const favorite = projection.distribution.homeWinPct >= projection.distribution.awayWinPct ? projection.matchup.home : projection.matchup.away; const favoritePct = Math.max(projection.distribution.homeWinPct, projection.distribution.awayWinPct); const intel = projection.mlbIntel; const detailHref = `/sim/${game.leagueKey.toLowerCase()}/${encodeURIComponent(game.id)}`; return <Card className="surface-panel p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{game.leagueKey} · {formatTime(game.startTime)}</div><div className="mt-2 text-lg font-semibold text-white">{projection.matchup.away} @ {projection.matchup.home}</div></div><div className="flex flex-col items-end gap-2"><Badge tone={tone(game.status)}>{game.status}</Badge><span className={`rounded-full border px-3 py-1 text-[10px] font-semibold tracking-[0.14em] ${dec.cls}`}>{dec.label}</span></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Tile label="Lean" value={favorite} sub={pct(favoritePct)} /><Tile label="Confidence" value={intel?.governor ? pct(intel.governor.confidence) : "—"} sub={intel?.governor?.noBet ? "No bet" : "Action gate"} /><Tile label="Total" value={String(intel?.projectedTotal ?? Number(projection.distribution.avgAway + projection.distribution.avgHome).toFixed(1))} sub={`${projection.distribution.avgAway} - ${projection.distribution.avgHome}`} /></div><div className="mt-4"><MarketMini edge={edge} /></div><div className="mt-4 flex items-center justify-between gap-3"><div className="text-xs text-slate-500">{projection.read.slice(0, 130)}{projection.read.length > 130 ? "…" : ""}</div><Link href={detailHref} className="shrink-0 rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-950 hover:bg-sky-400">Open</Link></div></Card>; }

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const active = selectedLeague(params?.league);
  const [sections, mlModel, calibration, edgeData] = await Promise.all([
    buildBoardSportSections({ selectedLeague: active, gamesByLeague: {}, maxScoreboardGames: null }),
    getCachedMlbMlModel(),
    getCachedMlbCalibrationConformal(),
    buildMlbEdges().catch(() => ({ edges: [] as EdgeResult[] }))
  ]);
  const allSections = active === "ALL" ? sections : await buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {}, maxScoreboardGames: null });
  const counts = allSections.reduce<Record<string, number>>((acc, section) => { acc[section.leagueKey] = section.scoreboard.length; acc.ALL = (acc.ALL ?? 0) + section.scoreboard.length; return acc; }, { ALL: 0 });
  const games = flatten(sections);
  const edgeByGame = new Map((edgeData.edges ?? []).map((edge) => [edge.gameId, edge]));
  const rows: Row[] = await Promise.all(games.map(async (game) => ({ game, projection: await buildSimProjection(game), edge: edgeByGame.get(game.id) ?? null })));

  return <div className="space-y-6"><section className="surface-panel-strong p-6"><div className="section-kicker">SharkEdge Sim Hub</div><div className="mt-3 max-w-4xl font-display text-4xl font-semibold tracking-tight text-white">Switch leagues, scan the slate, open a matchup.</div><div className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">This page is now a league-controlled command hub. Use the tabs to avoid doom scrolling, then open any matchup for the full sim engine data stack.</div><div className="mt-5"><LeagueSwitcher active={active} counts={counts} /></div></section><PipelinePanel mlRows={mlModel?.rows ?? 0} ece={calibration?.ok ? calibration.ece : null} rows={rows} /><section className="grid gap-4"><SectionTitle title={active === "ALL" ? "All active matchups" : `${active} matchups`} description="Compact cards show decision tier, confidence, market edge, and a link to the full matchup engine page." />{rows.length ? <div className="grid gap-4 xl:grid-cols-2">{rows.map((row) => <MatchupCard key={`${row.game.leagueKey}-${row.game.id}`} row={row} />)}</div> : <EmptyState title="No active games" description="No games are currently available from the scoreboard providers for this league." />}</section></div>;
}
