import { notFound } from "next/navigation";

import { FranchiseEmptyState, FranchiseTable } from "@/components/sim/mlb-franchise-primitives";
import { MlbFranchiseTabs } from "@/components/sim/mlb-franchise-tabs";
import { SimWorkspaceHeader } from "@/components/sim/sim-ui";
import { getMlbFranchiseGameCenter, type HitterProjection, type PitcherProjection } from "@/services/simulation/mlb-franchise-game-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function HitterTable({ title, rows }: { title: string; rows: HitterProjection[] }) {
  if (!rows.length) return <FranchiseEmptyState title={`${title} unavailable`} description="No linked hitter stat rows are available yet for this team." />;
  return (
    <FranchiseTable title={title} description="Projected hitter line from recent MLB player stat rows.">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-600"><tr><th className="px-4 py-3 text-left">Player</th><th className="px-3 py-3 text-right">Order</th><th className="px-3 py-3 text-right">PA</th><th className="px-3 py-3 text-right">H</th><th className="px-3 py-3 text-right">TB</th><th className="px-3 py-3 text-right">HR</th><th className="px-3 py-3 text-right">R</th><th className="px-3 py-3 text-right">RBI</th><th className="px-3 py-3 text-right">K</th><th className="px-3 py-3 text-right">SB chance</th></tr></thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row) => <tr key={row.playerId}><td className="px-4 py-3 font-semibold text-white">{row.name}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{row.battingOrder ?? "--"}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.plateAppearances)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.hits)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.totalBases)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.homeRuns, 2)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.runs)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.rbi)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.strikeouts)}</td><td className="px-3 py-3 text-right font-mono text-aqua">{num((row.stolenBaseChance ?? 0) * 100, 0)}%</td></tr>)}
        </tbody>
      </table>
    </FranchiseTable>
  );
}

function PitcherTable({ title, rows }: { title: string; rows: PitcherProjection[] }) {
  if (!rows.length) return <FranchiseEmptyState title={`${title} unavailable`} description="No linked pitcher stat rows are available yet for this team." />;
  return (
    <FranchiseTable title={title} description="Projected pitcher line from recent MLB pitcher stat rows.">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-600"><tr><th className="px-4 py-3 text-left">Pitcher</th><th className="px-3 py-3 text-right">IP</th><th className="px-3 py-3 text-right">Outs</th><th className="px-3 py-3 text-right">K</th><th className="px-3 py-3 text-right">ER</th><th className="px-3 py-3 text-right">H</th><th className="px-3 py-3 text-right">BB</th><th className="px-3 py-3 text-right">HR</th></tr></thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row) => <tr key={`${row.teamSide}:${row.playerId ?? row.name}`}><td className="px-4 py-3 font-semibold text-white">{row.name}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.innings)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.outs, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.strikeouts)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.earnedRuns)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.hitsAllowed)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.walks)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.homeRuns)}</td></tr>)}
        </tbody>
      </table>
    </FranchiseTable>
  );
}

export default async function MlbBoxScorePage({ params }: PageProps) {
  const { gameId } = await params;
  const game = await getMlbFranchiseGameCenter(decodeURIComponent(gameId));
  if (!game) notFound();
  const actualCount = [...game.hitters.away, ...game.hitters.home, ...game.pitchers.away, ...game.pitchers.home].filter((row) => row.actual).length;
  return (
    <div className="space-y-5">
      <SimWorkspaceHeader eyebrow="MLB Game Center" title="Projected Box Score" description={`${game.teams.away.name} @ ${game.teams.home.name} - ${game.cacheLabel}`} actions={[{ href: `/sim/mlb/${encodeURIComponent(game.gameId)}`, label: "Summary" }, { href: "/sim/mlb", label: "MLB Board", tone: "primary" }]} />
      <MlbFranchiseTabs gameId={game.gameId} active="box-score" />
      <PitcherTable title="Starting Pitchers" rows={[...game.pitchers.away.slice(0, 1), ...game.pitchers.home.slice(0, 1)]} />
      <HitterTable title={`${game.teams.away.name} Hitters`} rows={game.hitters.away} />
      <HitterTable title={`${game.teams.home.name} Hitters`} rows={game.hitters.home} />
      {actualCount ? <FranchiseEmptyState title="Tracked actuals available" description={`${actualCount} player rows have actual stat tracking linked to this game.`} /> : <FranchiseEmptyState title="Actuals not tracked yet" description="This page is showing projected box-score lines only. Official player-game actuals will appear once stat rows are linked to this game." />}
    </div>
  );
}
