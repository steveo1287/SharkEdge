import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { FranchiseEmptyState, FranchiseTable } from "@/components/sim/mlb-franchise-primitives";
import { MlbFranchiseTabs } from "@/components/sim/mlb-franchise-tabs";
import { SimWorkspaceHeader } from "@/components/sim/sim-ui";
import { buildMlbRatingBackedBoxScore } from "@/services/simulation/mlb-box-score-rating-fallback";
import { normalizeMlbFranchiseHitterRows, normalizeMlbFranchisePitcherRows, resolveMlbSimScoreTargets } from "@/services/simulation/mlb-franchise-boxscore-normalizer";
import { buildFranchiseEliteBatters, type FranchiseEliteBatterGrade } from "@/services/simulation/mlb-franchise-elite-batter-board";
import { buildSimulatedFranchiseHitters, buildSimulatedFranchisePitchers } from "@/services/simulation/mlb-franchise-sim-boxscore";
import { getMlbFranchiseGameCenter, type HitterProjection, type PitcherProjection } from "@/services/simulation/mlb-franchise-game-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };
type RosterPlayer = { id: string; name: string; position: string | null };

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}
function near(value: number | null | undefined, target: number, tolerance: number) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value - target) <= tolerance;
}
function sum<T>(rows: T[], read: (row: T) => number | null | undefined) {
  return rows.reduce((acc, row) => acc + (read(row) ?? 0), 0);
}
function gradeClass(value: FranchiseEliteBatterGrade) {
  if (value === "A+" || value === "A") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value === "Fade") return "border-rose-400/25 bg-rose-400/10 text-rose-200";
  return "border-amber-400/25 bg-amber-400/10 text-amber-200";
}
function projectionSignature(row: HitterProjection) {
  return [row.plateAppearances, row.hits, row.totalBases, row.homeRuns, row.runs, row.rbi, row.strikeouts, row.stolenBaseChance]
    .map((value) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "x")
    .join("|");
}
function hasUsefulHitterDiversity(rows: HitterProjection[]) {
  if (rows.length < 9) return false;
  const uniqueLines = new Set(rows.map(projectionSignature)).size;
  const uniqueNames = new Set(rows.map((row) => row.name.trim().toLowerCase()).filter(Boolean)).size;
  return uniqueNames >= 9 && uniqueLines >= 5;
}
function chooseHitterRows(args: { label: string; primary: HitterProjection[]; fallback: HitterProjection[]; fallbackLabel: string; warnings: string[] }) {
  if (hasUsefulHitterDiversity(args.primary)) return args.primary;
  if (hasUsefulHitterDiversity(args.fallback)) {
    args.warnings.push(`${args.label} hitter box score is using ${args.fallbackLabel} rows because linked/cached rows were incomplete or lacked player-level diversity.`);
    return args.fallback;
  }
  if (args.primary.length) {
    args.warnings.push(`${args.label} hitter box score is partial; franchise sim roster rows were not available.`);
    return args.primary;
  }
  return args.fallback;
}
function pitcherStatCount(row: PitcherProjection) {
  return [row.innings, row.outs, row.strikeouts, row.earnedRuns, row.hitsAllowed, row.walks, row.homeRuns]
    .filter((value) => typeof value === "number" && Number.isFinite(value)).length;
}
function isGenericStarterProjection(row: PitcherProjection) {
  const defaultStarterCluster = near(row.innings, 5.1, 0.3) && (near(row.outs, 15, 1) || near(row.outs, 16, 1)) && (near(row.strikeouts, 5.1, 0.25) || near(row.strikeouts, 5.2, 0.25)) && (near(row.walks, 1.7, 0.25) || near(row.walks, 1.8, 0.25));
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
function hasCompletePitchingStaff(rows: PitcherProjection[]) {
  if (!hasUsefulPitcherRows(rows)) return false;
  const outs = sum(rows, (row) => row.outs);
  return rows.length >= 2 && outs >= 24;
}
function choosePitcherRows(args: { label: string; primary: PitcherProjection[]; fallback: PitcherProjection[]; fallbackLabel: string; warnings: string[] }) {
  if (hasCompletePitchingStaff(args.primary)) return args.primary;
  if (hasCompletePitchingStaff(args.fallback)) {
    args.warnings.push(`${args.label} pitching staff is using ${args.fallbackLabel} rows so the box score has a full starter/bullpen line.`);
    return args.fallback;
  }
  if (hasUsefulPitcherRows(args.primary)) return args.primary;
  if (hasUsefulPitcherRows(args.fallback)) return args.fallback;
  return args.primary.length ? args.primary : args.fallback;
}
function sourceLabel<T>(selected: T[], primary: T[], franchise: T[], rating: T[]) {
  if (selected === primary && selected.length) return "linked/cached";
  if (selected === franchise && selected.length) return "franchise-sim";
  if (selected === rating && selected.length) return "rating-backed";
  return "unavailable";
}
function BoxScoreWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return <section className="rounded-[1.25rem] border border-amber-400/20 bg-amber-400/[0.045] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">Box-score projection status</div><div className="mt-2 grid gap-1 text-xs leading-5 text-amber-100/85">{warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div></section>;
}
function TeamTotalsTable({ awayHitters, homeHitters, awayPitchers, homePitchers, awayName, homeName }: { awayHitters: HitterProjection[]; homeHitters: HitterProjection[]; awayPitchers: PitcherProjection[]; homePitchers: PitcherProjection[]; awayName: string; homeName: string }) {
  const rows = [{ name: awayName, hitters: awayHitters, pitchers: homePitchers }, { name: homeName, hitters: homeHitters, pitchers: awayPitchers }];
  return <FranchiseTable title="Sim Team Box Score" description="Team totals reconciled to a baseball-valid simulated score. PA is now based on outs + hits + walks/misc runners, not inflated prop-card math."><table className="min-w-[920px] w-full text-sm"><thead className="bg-cyan-400/[0.04] text-[10px] uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-4 py-3 text-left">Team</th><th className="px-3 py-3 text-right">R</th><th className="px-3 py-3 text-right">H</th><th className="px-3 py-3 text-right">TB</th><th className="px-3 py-3 text-right">HR</th><th className="px-3 py-3 text-right">PA</th><th className="px-3 py-3 text-right">Bat K</th><th className="px-3 py-3 text-right">Opp K</th><th className="px-3 py-3 text-right">Opp ER</th><th className="px-3 py-3 text-right">Opp BB</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{rows.map((row) => <tr key={row.name}><td className="px-4 py-3 font-semibold text-white">{row.name}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.runs), 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.hits), 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.totalBases), 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.homeRuns), 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.plateAppearances), 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.strikeouts), 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.pitchers, (item) => item.strikeouts), 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.pitchers, (item) => item.earnedRuns), 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.pitchers, (item) => item.walks), 0)}</td></tr>)}</tbody></table></FranchiseTable>;
}
function EliteBatterBoard({ rows }: { rows: HitterProjection[] }) {
  const elite = buildFranchiseEliteBatters(rows);
  if (!elite.length) return <FranchiseEmptyState title="Elite Batter Board unavailable" description="No projected hitter rows are available yet from linked rows, cached sim rows, or franchise sim box-score rows." />;
  const core = elite.filter((row) => row.grade === "A+" || row.grade === "A").length;
  const traps = elite.filter((row) => row.warning).length;
  return <FranchiseTable title="Elite Batter Board" description={`Fused hitter ranking for this game summary box score. ${core} core bats, ${traps} risk traps flagged.`}><table className="min-w-[1040px] w-full text-sm"><thead className="bg-emerald-400/[0.04] text-[10px] uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-4 py-3 text-left">Rank</th><th className="px-4 py-3 text-left">Player</th><th className="px-3 py-3 text-left">Team</th><th className="px-3 py-3 text-right">Score</th><th className="px-3 py-3 text-center">Grade</th><th className="px-3 py-3 text-right">H</th><th className="px-3 py-3 text-right">TB</th><th className="px-3 py-3 text-right">HR</th><th className="px-3 py-3 text-right">R/RBI</th><th className="px-3 py-3 text-left">Tags</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{elite.slice(0, 10).map((row, index) => <tr key={`${row.teamSide}:${row.playerId}`}><td className="px-4 py-3 font-mono text-slate-500">#{index + 1}</td><td className="px-4 py-3 font-semibold text-white">{row.name}</td><td className="px-3 py-3 text-slate-400">{row.team}</td><td className="px-3 py-3 text-right font-mono text-emerald-200">{num(row.eliteScore, 1)}</td><td className="px-3 py-3 text-center"><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${gradeClass(row.grade)}`}>{row.grade}</span></td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.hits, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.totalBases, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.homeRuns, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num((row.runs ?? 0) + (row.rbi ?? 0), 0)}</td><td className="px-3 py-3 text-xs text-slate-400">{row.tags.slice(0, 3).join(" · ")}</td></tr>)}</tbody></table></FranchiseTable>;
}
function HitterTable({ title, rows }: { title: string; rows: HitterProjection[] }) {
  if (!rows.length) return <FranchiseEmptyState title={`${title} unavailable`} description="No linked, cached sim, rating-backed, or franchise simulated hitter rows are available yet for this team." />;
  return <FranchiseTable title={title} description="Complete simulated hitter line normalized to projected team runs and plausible team hit/power totals."><table className="min-w-[900px] w-full text-sm"><thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-600"><tr><th className="px-4 py-3 text-left">Player</th><th className="px-3 py-3 text-right">Order</th><th className="px-3 py-3 text-right">PA</th><th className="px-3 py-3 text-right">H</th><th className="px-3 py-3 text-right">TB</th><th className="px-3 py-3 text-right">HR</th><th className="px-3 py-3 text-right">R</th><th className="px-3 py-3 text-right">RBI</th><th className="px-3 py-3 text-right">K</th><th className="px-3 py-3 text-right">SB chance</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{rows.map((row) => <tr key={`${row.teamSide}:${row.playerId}`}><td className="px-4 py-3 font-semibold text-white">{row.name}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{row.battingOrder ?? "--"}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.plateAppearances, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.hits, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.totalBases, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.homeRuns, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.runs, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.rbi, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.strikeouts, 0)}</td><td className="px-3 py-3 text-right font-mono text-aqua">{num((row.stolenBaseChance ?? 0) * 100, 0)}%</td></tr>)}</tbody></table></FranchiseTable>;
}
function PitcherTable({ title, rows }: { title: string; rows: PitcherProjection[] }) {
  if (!rows.length) return <FranchiseEmptyState title={`${title} unavailable`} description="No linked, cached sim, rating-backed, or franchise simulated pitcher rows are available yet for this team." />;
  return <FranchiseTable title={title} description="Pitching staff normalized so outs reach 27 and ER/H/HR allowed reconcile to opposing hitter totals."><table className="min-w-[760px] w-full text-sm"><thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-600"><tr><th className="px-4 py-3 text-left">Pitcher</th><th className="px-3 py-3 text-right">IP</th><th className="px-3 py-3 text-right">Outs</th><th className="px-3 py-3 text-right">K</th><th className="px-3 py-3 text-right">ER</th><th className="px-3 py-3 text-right">H</th><th className="px-3 py-3 text-right">BB</th><th className="px-3 py-3 text-right">HR</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{rows.map((row) => <tr key={`${row.teamSide}:${row.playerId ?? row.name}`}><td className="px-4 py-3 font-semibold text-white">{row.name}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.innings)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.outs, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.strikeouts, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.earnedRuns, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.hitsAllowed, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.walks, 0)}</td><td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.homeRuns, 0)}</td></tr>)}</tbody></table></FranchiseTable>;
}
async function roster(teamId: string | null): Promise<RosterPlayer[]> {
  if (!teamId) return [];
  return prisma.player.findMany({ where: { teamId }, select: { id: true, name: true, position: true }, orderBy: { name: "asc" } });
}
function simStarter(row: PitcherProjection | null): (PitcherProjection & { actual: null }) | null {
  if (!row) return null;
  return { ...row, actual: null };
}

export default async function MlbBoxScorePage({ params }: PageProps) {
  const { gameId } = await params;
  const game = await getMlbFranchiseGameCenter(decodeURIComponent(gameId));
  if (!game) notFound();

  const scoreTargets = resolveMlbSimScoreTargets({
    awayProjectedRuns: game.teams.away.projectedRuns,
    homeProjectedRuns: game.teams.home.projectedRuns,
    awayName: game.teams.away.name,
    homeName: game.teams.home.name
  });

  const [ratingFallback, awayRoster, homeRoster] = await Promise.all([
    buildMlbRatingBackedBoxScore({
      away: { name: game.teams.away.name, abbreviation: game.teams.away.abbreviation, projectedRuns: scoreTargets.awayRuns },
      home: { name: game.teams.home.name, abbreviation: game.teams.home.abbreviation, projectedRuns: scoreTargets.homeRuns }
    }).catch(() => ({ hitters: { away: [], home: [] }, starters: { away: null, home: null }, warnings: ["Rating-backed box-score fallback failed."] })),
    roster(game.teams.away.teamId),
    roster(game.teams.home.teamId)
  ]);

  const warnings = Array.from(new Set([...game.warnings, ...ratingFallback.warnings]));
  warnings.push(`Sim final score target: ${game.teams.away.name} ${scoreTargets.awayRuns}, ${game.teams.home.name} ${scoreTargets.homeRuns} (${scoreTargets.reason}).`);
  const ratingAwayHitters = ratingFallback.hitters.away as HitterProjection[];
  const ratingHomeHitters = ratingFallback.hitters.home as HitterProjection[];
  const ratingAwayPitchers = ratingFallback.starters.away ? [ratingFallback.starters.away as PitcherProjection] : [];
  const ratingHomePitchers = ratingFallback.starters.home ? [ratingFallback.starters.home as PitcherProjection] : [];

  const franchiseAwayHitters = buildSimulatedFranchiseHitters({ players: awayRoster, teamName: game.teams.away.name, teamSide: "away", projectedRuns: scoreTargets.awayRuns }) as HitterProjection[];
  const franchiseHomeHitters = buildSimulatedFranchiseHitters({ players: homeRoster, teamName: game.teams.home.name, teamSide: "home", projectedRuns: scoreTargets.homeRuns }) as HitterProjection[];
  const franchiseAwayPitchers = buildSimulatedFranchisePitchers({ players: awayRoster, teamName: game.teams.away.name, teamSide: "away", starter: simStarter(game.teams.away.starter ?? game.pitchers.away[0] ?? null), opponentProjectedRuns: scoreTargets.homeRuns, opponentProjectedHits: game.lineScore.home.hits }) as PitcherProjection[];
  const franchiseHomePitchers = buildSimulatedFranchisePitchers({ players: homeRoster, teamName: game.teams.home.name, teamSide: "home", starter: simStarter(game.teams.home.starter ?? game.pitchers.home[0] ?? null), opponentProjectedRuns: scoreTargets.awayRuns, opponentProjectedHits: game.lineScore.away.hits }) as PitcherProjection[];

  const awayHitterFallback = hasUsefulHitterDiversity(franchiseAwayHitters) ? franchiseAwayHitters : ratingAwayHitters;
  const homeHitterFallback = hasUsefulHitterDiversity(franchiseHomeHitters) ? franchiseHomeHitters : ratingHomeHitters;
  const awayPitcherFallback = hasCompletePitchingStaff(franchiseAwayPitchers) ? franchiseAwayPitchers : ratingAwayPitchers;
  const homePitcherFallback = hasCompletePitchingStaff(franchiseHomePitchers) ? franchiseHomePitchers : ratingHomePitchers;

  const selectedAwayHitters = chooseHitterRows({ label: game.teams.away.name, primary: game.hitters.away, fallback: awayHitterFallback, fallbackLabel: awayHitterFallback === franchiseAwayHitters ? "franchise-sim box-score" : "rating-backed player-card", warnings });
  const selectedHomeHitters = chooseHitterRows({ label: game.teams.home.name, primary: game.hitters.home, fallback: homeHitterFallback, fallbackLabel: homeHitterFallback === franchiseHomeHitters ? "franchise-sim box-score" : "rating-backed player-card", warnings });
  const awayHitters = normalizeMlbFranchiseHitterRows(selectedAwayHitters, scoreTargets.awayRuns) as HitterProjection[];
  const homeHitters = normalizeMlbFranchiseHitterRows(selectedHomeHitters, scoreTargets.homeRuns) as HitterProjection[];

  const selectedAwayPitchers = choosePitcherRows({ label: game.teams.away.name, primary: game.pitchers.away, fallback: awayPitcherFallback, fallbackLabel: awayPitcherFallback === franchiseAwayPitchers ? "franchise-sim pitching staff" : "rating-backed starter", warnings });
  const selectedHomePitchers = choosePitcherRows({ label: game.teams.home.name, primary: game.pitchers.home, fallback: homePitcherFallback, fallbackLabel: homePitcherFallback === franchiseHomePitchers ? "franchise-sim pitching staff" : "rating-backed starter", warnings });
  const awayPitchers = normalizeMlbFranchisePitcherRows(selectedAwayPitchers, homeHitters, scoreTargets.homeRuns) as PitcherProjection[];
  const homePitchers = normalizeMlbFranchisePitcherRows(selectedHomePitchers, awayHitters, scoreTargets.awayRuns) as PitcherProjection[];
  warnings.push("Box-score normalizer active: PA uses outs + hits + walks/misc runners; hitter totals reconcile to a valid simulated score; pitcher totals reconcile to opposing hitter totals.");
  warnings.push(`Projection source: ${game.teams.away.name} hitters=${sourceLabel(selectedAwayHitters, game.hitters.away, franchiseAwayHitters, ratingAwayHitters)}, pitchers=${sourceLabel(selectedAwayPitchers, game.pitchers.away, franchiseAwayPitchers, ratingAwayPitchers)}; ${game.teams.home.name} hitters=${sourceLabel(selectedHomeHitters, game.hitters.home, franchiseHomeHitters, ratingHomeHitters)}, pitchers=${sourceLabel(selectedHomePitchers, game.pitchers.home, franchiseHomePitchers, ratingHomePitchers)}.`);

  const actualCount = [...awayHitters, ...homeHitters, ...awayPitchers, ...homePitchers].filter((row) => row.actual).length;

  return <div className="space-y-5"><SimWorkspaceHeader eyebrow="MLB Game Center" title="Franchise Sim Box Score" description={`${game.teams.away.name} @ ${game.teams.home.name} - ${game.cacheLabel}`} actions={[{ href: `/sim/mlb/${encodeURIComponent(game.gameId)}`, label: "Summary" }, { href: "/sim/mlb", label: "MLB Board", tone: "primary" }]} /><MlbFranchiseTabs gameId={game.gameId} active="box-score" /><BoxScoreWarnings warnings={Array.from(new Set(warnings))} /><TeamTotalsTable awayHitters={awayHitters} homeHitters={homeHitters} awayPitchers={awayPitchers} homePitchers={homePitchers} awayName={game.teams.away.name} homeName={game.teams.home.name} /><PitcherTable title="Pitching Staff" rows={[...awayPitchers, ...homePitchers]} /><EliteBatterBoard rows={[...awayHitters, ...homeHitters]} /><HitterTable title={`${game.teams.away.name} Hitters`} rows={awayHitters} /><HitterTable title={`${game.teams.home.name} Hitters`} rows={homeHitters} />{actualCount ? <FranchiseEmptyState title="Tracked actuals available" description={`${actualCount} player rows have actual stat tracking linked to this game.`} /> : <FranchiseEmptyState title="Franchise sim mode" description="This page is showing a normalized simulated box score. Official player-game actuals will replace simulated rows once stat rows are linked after settlement." />}</div>;
}
