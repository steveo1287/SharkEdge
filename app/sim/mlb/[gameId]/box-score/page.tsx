import { notFound } from "next/navigation";

import { FranchiseEmptyState, FranchiseTable } from "@/components/sim/mlb-franchise-primitives";
import { MlbFranchiseTabs } from "@/components/sim/mlb-franchise-tabs";
import { SimWorkspaceHeader } from "@/components/sim/sim-ui";
import { getMlbFranchiseGameCenter, type HitterProjection, type PitcherProjection } from "@/services/simulation/mlb-franchise-game-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };
type EliteGrade = "A+" | "A" | "B+" | "B" | "Watch" | "Fade";
type EliteBatter = HitterProjection & { eliteScore: number; grade: EliteGrade; tags: string[]; warning: string | null };

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function grade(score: number, warning: string | null): EliteGrade {
  if (warning && score < 58) return "Fade";
  if (score >= 86) return "A+";
  if (score >= 78) return "A";
  if (score >= 68) return "B+";
  if (score >= 58) return "B";
  return warning ? "Fade" : "Watch";
}

function gradeClass(value: EliteGrade) {
  if (value === "A+" || value === "A") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value === "Fade") return "border-rose-400/25 bg-rose-400/10 text-rose-200";
  return "border-amber-400/25 bg-amber-400/10 text-amber-200";
}

function eliteTags(row: HitterProjection, warning: string | null) {
  const tags: string[] = [];
  if ((row.homeRuns ?? 0) >= 0.14 || (row.totalBases ?? 0) >= 1.8) tags.push("Power ceiling");
  if ((row.hits ?? 0) >= 1 || (row.strikeouts ?? 99) <= 0.75) tags.push("Contact floor");
  if ((row.runs ?? 0) + (row.rbi ?? 0) >= 1.05) tags.push("Run/RBI engine");
  if ((row.battingOrder ?? 9) <= 4) tags.push("Top-order PA");
  if (warning) tags.push("Risk trap");
  return tags.length ? tags : ["Watch list"];
}

function eliteScore(row: HitterProjection) {
  const order = row.battingOrder ?? 9;
  const topOrderBoost = order <= 2 ? 8 : order <= 5 ? 5 : order <= 7 ? 2 : 0;
  const score = 36
    + (row.hits ?? 0) * 14
    + (row.totalBases ?? 0) * 8
    + (row.homeRuns ?? 0) * 68
    + (row.runs ?? 0) * 7
    + (row.rbi ?? 0) * 8
    + (row.plateAppearances ?? 0) * 2.2
    + topOrderBoost
    - (row.strikeouts ?? 0) * 4.5;
  return Number(clamp(score, 0, 100).toFixed(1));
}

function buildEliteBatters(rows: HitterProjection[]): EliteBatter[] {
  return rows.map((row) => {
    const warning = (row.strikeouts ?? 0) >= 1.35 && (row.hits ?? 0) < 0.9 ? "K risk / thin contact floor" : null;
    const score = eliteScore(row) - (warning ? 7 : 0);
    const bounded = Number(clamp(score, 0, 100).toFixed(1));
    return { ...row, eliteScore: bounded, grade: grade(bounded, warning), tags: eliteTags(row, warning), warning };
  }).sort((left, right) => right.eliteScore - left.eliteScore || (left.battingOrder ?? 99) - (right.battingOrder ?? 99));
}

function EliteBatterBoard({ rows }: { rows: HitterProjection[] }) {
  const elite = buildEliteBatters(rows);
  if (!elite.length) return <FranchiseEmptyState title="Elite Batter Board unavailable" description="No projected hitter rows are available yet for this game box score." />;
  const core = elite.filter((row) => row.grade === "A+" || row.grade === "A").length;
  const traps = elite.filter((row) => row.warning).length;
  return (
    <FranchiseTable title="Elite Batter Board" description={`Fused hitter ranking for this game summary box score. ${core} core bats, ${traps} risk traps flagged.`}>
      <table className="min-w-[1040px] w-full text-sm">
        <thead className="bg-emerald-400/[0.04] text-[10px] uppercase tracking-[0.14em] text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">Rank</th>
            <th className="px-4 py-3 text-left">Player</th>
            <th className="px-3 py-3 text-left">Team</th>
            <th className="px-3 py-3 text-right">Score</th>
            <th className="px-3 py-3 text-center">Grade</th>
            <th className="px-3 py-3 text-right">H</th>
            <th className="px-3 py-3 text-right">TB</th>
            <th className="px-3 py-3 text-right">HR</th>
            <th className="px-3 py-3 text-right">R/RBI</th>
            <th className="px-3 py-3 text-left">Tags</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {elite.slice(0, 10).map((row, index) => (
            <tr key={`${row.teamSide}:${row.playerId}`}>
              <td className="px-4 py-3 font-mono text-slate-500">#{index + 1}</td>
              <td className="px-4 py-3 font-semibold text-white">{row.name}</td>
              <td className="px-3 py-3 text-slate-400">{row.team}</td>
              <td className="px-3 py-3 text-right font-mono text-emerald-200">{num(row.eliteScore, 1)}</td>
              <td className="px-3 py-3 text-center"><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${gradeClass(row.grade)}`}>{row.grade}</span></td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.hits)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.totalBases)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.homeRuns, 2)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num((row.runs ?? 0) + (row.rbi ?? 0), 1)}</td>
              <td className="px-3 py-3 text-xs text-slate-400">{row.tags.slice(0, 3).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </FranchiseTable>
  );
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
      <EliteBatterBoard rows={[...game.hitters.away, ...game.hitters.home]} />
      <HitterTable title={`${game.teams.away.name} Hitters`} rows={game.hitters.away} />
      <HitterTable title={`${game.teams.home.name} Hitters`} rows={game.hitters.home} />
      {actualCount ? <FranchiseEmptyState title="Tracked actuals available" description={`${actualCount} player rows have actual stat tracking linked to this game.`} /> : <FranchiseEmptyState title="Actuals not tracked yet" description="This page is showing projected box-score lines only. Official player-game actuals will appear once stat rows are linked to this game." />}
    </div>
  );
}
