import { notFound } from "next/navigation";

import { FranchiseEmptyState, FranchiseTable } from "@/components/sim/mlb-franchise-primitives";
import { MlbFranchiseTabs } from "@/components/sim/mlb-franchise-tabs";
import { SimWorkspaceHeader } from "@/components/sim/sim-ui";
import { buildMlbRatingBackedBoxScore } from "@/services/simulation/mlb-box-score-rating-fallback";
import { buildFranchiseEliteBatters, type FranchiseEliteBatterGrade } from "@/services/simulation/mlb-franchise-elite-batter-board";
import { getMlbFranchiseGameCenter, type HitterProjection, type PitcherProjection } from "@/services/simulation/mlb-franchise-game-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function near(value: number | null | undefined, target: number, tolerance: number) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value - target) <= tolerance;
}

function gradeClass(value: FranchiseEliteBatterGrade) {
  if (value === "A+" || value === "A") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value === "Fade") return "border-rose-400/25 bg-rose-400/10 text-rose-200";
  return "border-amber-400/25 bg-amber-400/10 text-amber-200";
}

function projectionSignature(row: HitterProjection) {
  return [
    row.plateAppearances,
    row.hits,
    row.totalBases,
    row.homeRuns,
    row.runs,
    row.rbi,
    row.strikeouts,
    row.stolenBaseChance
  ].map((value) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "x").join("|");
}

function hasUsefulHitterDiversity(rows: HitterProjection[]) {
  if (rows.length < 5) return false;
  const uniqueLines = new Set(rows.map(projectionSignature)).size;
  const uniqueNames = new Set(rows.map((row) => row.name.trim().toLowerCase()).filter(Boolean)).size;
  return uniqueNames >= 5 && uniqueLines >= Math.min(4, Math.ceil(rows.length * 0.35));
}

function chooseHitterRows(args: {
  label: string;
  primary: HitterProjection[];
  fallback: HitterProjection[];
  warnings: string[];
}) {
  if (hasUsefulHitterDiversity(args.primary)) return args.primary;
  if (hasUsefulHitterDiversity(args.fallback)) {
    args.warnings.push(`${args.label} hitter projections were replaced with rating-backed player-card rows because the cached/linked rows lacked player-level stat diversity.`);
    return args.fallback;
  }
  if (args.primary.length) {
    args.warnings.push(`${args.label} hitter projections have low player-level stat diversity; refresh the local MLB sim worker/player-rating feed.`);
    return args.primary;
  }
  return args.fallback;
}

function pitcherStatCount(row: PitcherProjection) {
  return [row.innings, row.outs, row.strikeouts, row.earnedRuns, row.hitsAllowed, row.walks, row.homeRuns]
    .filter((value) => typeof value === "number" && Number.isFinite(value)).length;
}

function isGenericStarterProjection(row: PitcherProjection) {
  const defaultStarterCluster =
    near(row.innings, 5.1, 0.3) &&
    (near(row.outs, 15, 1) || near(row.outs, 16, 1)) &&
    (near(row.strikeouts, 5.1, 0.25) || near(row.strikeouts, 5.2, 0.25)) &&
    (near(row.walks, 1.7, 0.25) || near(row.walks, 1.8, 0.25));
  const genericName = /^projected .* starter$/i.test(row.name.trim()) || /generic|fallback starter/i.test(row.name);
  return genericName || (row.playerId == null && defaultStarterCluster) || defaultStarterCluster;
}

function hasUsefulPitcherRows(rows: PitcherProjection[]) {
  if (!rows.length) return false;
  const starter = rows[0];
  if (!starter.name.trim()) return false;
  if (isGenericStarterProjection(starter)) return false;
  return pitcherStatCount(starter) >= 4;
}

function choosePitcherRows(args: {
  label: string;
  primary: PitcherProjection[];
  fallback: PitcherProjection[];
  warnings: string[];
}) {
  if (hasUsefulPitcherRows(args.primary)) return args.primary;
  if (hasUsefulPitcherRows(args.fallback)) {
    args.warnings.push(`${args.label} starter projection was replaced with rating-backed pitcher-card rows because the cached/linked starter looked generic.`);
    return args.fallback;
  }
  if (args.primary.length) {
    args.warnings.push(`${args.label} starter projection still looks generic; no usable rating-backed pitcher row was available.`);
    return args.primary;
  }
  return args.fallback;
}

function sourceLabel<T>(selected: T[], primary: T[], fallback: T[]) {
  if (selected === primary && selected.length) return "linked/cached";
  if (selected === fallback && selected.length) return "rating-backed";
  return "unavailable";
}

function BoxScoreWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <section className="rounded-[1.25rem] border border-amber-400/20 bg-amber-400/[0.045] p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">Box-score projection status</div>
      <div className="mt-2 grid gap-1 text-xs leading-5 text-amber-100/85">
        {warnings.map((warning) => <p key={warning}>• {warning}</p>)}
      </div>
    </section>
  );
}

function EliteBatterBoard({ rows }: { rows: HitterProjection[] }) {
  const elite = buildFranchiseEliteBatters(rows);
  if (!elite.length) return <FranchiseEmptyState title="Elite Batter Board unavailable" description="No projected hitter rows are available yet from linked player-game rows, cached sim player-stat projections, or rating-backed fallback projections." />;
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
  if (!rows.length) return <FranchiseEmptyState title={`${title} unavailable`} description="No linked, cached sim, or rating-backed hitter projections are available yet for this team." />;
  return (
    <FranchiseTable title={title} description="Projected hitter line from linked player-game rows, cached MLB sim player-stat rows, or rating-backed player cards.">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left">Player</th>
            <th className="px-3 py-3 text-right">Order</th>
            <th className="px-3 py-3 text-right">PA</th>
            <th className="px-3 py-3 text-right">H</th>
            <th className="px-3 py-3 text-right">TB</th>
            <th className="px-3 py-3 text-right">HR</th>
            <th className="px-3 py-3 text-right">R</th>
            <th className="px-3 py-3 text-right">RBI</th>
            <th className="px-3 py-3 text-right">K</th>
            <th className="px-3 py-3 text-right">SB chance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row) => (
            <tr key={`${row.teamSide}:${row.playerId}`}>
              <td className="px-4 py-3 font-semibold text-white">{row.name}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{row.battingOrder ?? "--"}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.plateAppearances)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.hits)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.totalBases)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.homeRuns, 2)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.runs)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.rbi)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.strikeouts)}</td>
              <td className="px-3 py-3 text-right font-mono text-aqua">{num((row.stolenBaseChance ?? 0) * 100, 0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </FranchiseTable>
  );
}

function PitcherTable({ title, rows }: { title: string; rows: PitcherProjection[] }) {
  if (!rows.length) return <FranchiseEmptyState title={`${title} unavailable`} description="No linked, cached sim, or rating-backed pitcher projections are available yet for this team." />;
  return (
    <FranchiseTable title={title} description="Projected pitcher line from starter diversity, linked pitcher rows, cached sim starter rows, or rating-backed player cards.">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left">Pitcher</th>
            <th className="px-3 py-3 text-right">IP</th>
            <th className="px-3 py-3 text-right">Outs</th>
            <th className="px-3 py-3 text-right">K</th>
            <th className="px-3 py-3 text-right">ER</th>
            <th className="px-3 py-3 text-right">H</th>
            <th className="px-3 py-3 text-right">BB</th>
            <th className="px-3 py-3 text-right">HR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row) => (
            <tr key={`${row.teamSide}:${row.playerId ?? row.name}`}>
              <td className="px-4 py-3 font-semibold text-white">{row.name}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.innings)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.outs, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.strikeouts)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.earnedRuns)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.hitsAllowed)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.walks)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.homeRuns)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </FranchiseTable>
  );
}

export default async function MlbBoxScorePage({ params }: PageProps) {
  const { gameId } = await params;
  const game = await getMlbFranchiseGameCenter(decodeURIComponent(gameId));
  if (!game) notFound();

  const ratingFallback = await buildMlbRatingBackedBoxScore({
    away: { name: game.teams.away.name, abbreviation: game.teams.away.abbreviation, projectedRuns: game.teams.away.projectedRuns },
    home: { name: game.teams.home.name, abbreviation: game.teams.home.abbreviation, projectedRuns: game.teams.home.projectedRuns }
  }).catch(() => ({ hitters: { away: [], home: [] }, starters: { away: null, home: null }, warnings: ["Rating-backed box-score fallback failed."] }));

  const warnings = Array.from(new Set([...game.warnings, ...ratingFallback.warnings]));
  const ratingAwayHitters = ratingFallback.hitters.away as HitterProjection[];
  const ratingHomeHitters = ratingFallback.hitters.home as HitterProjection[];
  const ratingAwayPitchers = ratingFallback.starters.away ? [ratingFallback.starters.away as PitcherProjection] : [];
  const ratingHomePitchers = ratingFallback.starters.home ? [ratingFallback.starters.home as PitcherProjection] : [];

  const awayHitters = chooseHitterRows({ label: game.teams.away.name, primary: game.hitters.away, fallback: ratingAwayHitters, warnings });
  const homeHitters = chooseHitterRows({ label: game.teams.home.name, primary: game.hitters.home, fallback: ratingHomeHitters, warnings });
  const awayPitchers = choosePitcherRows({ label: game.teams.away.name, primary: game.pitchers.away, fallback: ratingAwayPitchers, warnings });
  const homePitchers = choosePitcherRows({ label: game.teams.home.name, primary: game.pitchers.home, fallback: ratingHomePitchers, warnings });
  warnings.push(`Projection source: ${game.teams.away.name} hitters=${sourceLabel(awayHitters, game.hitters.away, ratingAwayHitters)}, starter=${sourceLabel(awayPitchers, game.pitchers.away, ratingAwayPitchers)}; ${game.teams.home.name} hitters=${sourceLabel(homeHitters, game.hitters.home, ratingHomeHitters)}, starter=${sourceLabel(homePitchers, game.pitchers.home, ratingHomePitchers)}.`);

  const actualCount = [...awayHitters, ...homeHitters, ...awayPitchers, ...homePitchers].filter((row) => row.actual).length;

  return (
    <div className="space-y-5">
      <SimWorkspaceHeader eyebrow="MLB Game Center" title="Projected Box Score" description={`${game.teams.away.name} @ ${game.teams.home.name} - ${game.cacheLabel}`} actions={[{ href: `/sim/mlb/${encodeURIComponent(game.gameId)}`, label: "Summary" }, { href: "/sim/mlb", label: "MLB Board", tone: "primary" }]} />
      <MlbFranchiseTabs gameId={game.gameId} active="box-score" />
      <BoxScoreWarnings warnings={Array.from(new Set(warnings))} />
      <PitcherTable title="Starting Pitchers" rows={[...awayPitchers.slice(0, 1), ...homePitchers.slice(0, 1)]} />
      <EliteBatterBoard rows={[...awayHitters, ...homeHitters]} />
      <HitterTable title={`${game.teams.away.name} Hitters`} rows={awayHitters} />
      <HitterTable title={`${game.teams.home.name} Hitters`} rows={homeHitters} />
      {actualCount ? <FranchiseEmptyState title="Tracked actuals available" description={`${actualCount} player rows have actual stat tracking linked to this game.`} /> : <FranchiseEmptyState title="Actuals not tracked yet" description="This page is showing projected box-score lines. Official player-game actuals will appear once stat rows are linked to this game." />}
    </div>
  );
}
