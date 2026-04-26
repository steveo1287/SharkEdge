import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";

import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Row = { game: SimGame; projection: Awaited<ReturnType<typeof buildSimProjection>> };

const LEAGUE_ICONS: Record<LeagueKey, string> = { NBA: "🏀", MLB: "⚾", NHL: "🏒", NFL: "🏈", NCAAF: "🏈", UFC: "🥊", BOXING: "🥊" };
function flatten(sections: BoardSportSectionView[]): SimGame[] { return sections.flatMap((s) => s.scoreboard.map((g) => ({ ...g, leagueKey: s.leagueKey, leagueLabel: s.leagueLabel }))); }
function formatTime(v: string) { const d = new Date(v); if (isNaN(d.getTime())) return "TBD"; return new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(d); }
function tone(status: string) { if (status === "LIVE") return "success"; if (status === "FINAL") return "neutral"; return "muted"; }
function pctWidth(value: number) { return `${Math.max(2, Math.min(100, value * 100)).toFixed(1)}%`; }
function Bar({ label, value }: { label: string; value: number }) { return <div><div className="flex justify-between text-xs text-slate-400"><span>{label}</span><span>{(value * 100).toFixed(1)}%</span></div><div className="h-2 rounded bg-slate-800"><div className="h-full rounded bg-sky-400" style={{ width: pctWidth(value) }} /></div></div>; }
function FactorValue({ value }: { value: number }) { const sign = value > 0 ? "+" : ""; return <span className={value >= 0 ? "text-emerald-300" : "text-red-300"}>{sign}{value}</span>; }

function MlbIntelPanel({ projection }: { projection: Awaited<ReturnType<typeof buildSimProjection>> }) {
  const intel = projection.mlbIntel;
  if (!intel) return null;
  return <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4 space-y-3"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">MLB intel</div><div className="text-sm text-slate-300">{intel.modelVersion} · {intel.dataSource}</div></div><div className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">Vol {intel.volatilityIndex}</div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Home edge</div><div className="mt-1 text-lg font-semibold"><FactorValue value={intel.homeEdge} /></div></div><div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Projected total</div><div className="mt-1 text-lg font-semibold text-white">{intel.projectedTotal}</div></div></div><div className="grid gap-2">{intel.factors.slice(0, 9).map((factor) => <div key={factor.label} className="flex justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs"><span className="text-slate-400">{factor.label}</span><FactorValue value={factor.value} /></div>)}</div></div>;
}

function CardRow({ row }: { row: Row }) {
  const { game, projection } = row;
  const d = projection.distribution;
  const engine = projection.mlbIntel?.modelVersion || projection.nbaIntel?.modelVersion || "fallback";
  const source = projection.mlbIntel?.dataSource || projection.nbaIntel?.dataSource || "synthetic";
  return <Card className="p-5 space-y-4"><div className="flex justify-between"><div><div className="text-xs text-slate-500">{LEAGUE_ICONS[game.leagueKey]} {game.leagueKey}</div><div className="text-xl text-white font-semibold">{projection.matchup.away} @ {projection.matchup.home}</div><div className="text-sm text-slate-400">{formatTime(game.startTime)}</div></div><Badge tone={tone(game.status)}>{game.status}</Badge></div><div className="grid grid-cols-2 gap-3"><div><div className="text-xs text-slate-400">Away</div><div className="text-2xl text-white">{d.avgAway}</div></div><div><div className="text-xs text-slate-400">Home</div><div className="text-2xl text-white">{d.avgHome}</div></div></div><Bar label="Home Win" value={d.homeWinPct} /><Bar label="Away Win" value={d.awayWinPct} /><MlbIntelPanel projection={projection} /><div className="text-sm text-slate-300">{projection.read}</div><div className="text-xs text-slate-500">Engine: {engine} | Source: {source}</div><Link href={`/api/debug/nba-player-feed?team=${projection.matchup.home}`} className="text-xs text-sky-400">Debug data →</Link></Card>;
}

export default async function Page() {
  const sections = await buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {} });
  const games = flatten(sections);
  const rows: Row[] = await Promise.all(games.map(async (game) => ({ game, projection: await buildSimProjection(game) })));
  if (!rows.length) return <EmptyState title="No games" description="No data available" />;
  return <div className="space-y-6"><SectionTitle title="Simulation Engine" description="Powered by real player + intel model" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map((r) => <CardRow key={r.game.id} row={r} />)}</div></div>;
}
