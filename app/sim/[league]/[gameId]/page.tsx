import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import type { LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ league: string; gameId: string }> };
type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Projection = Awaited<ReturnType<typeof buildSimProjection>>;
type EdgeResult = Awaited<ReturnType<typeof buildMlbEdges>>["edges"][number];
type DisplayFactor = { label: string; value: number; weight?: number; source?: string };

const VALID_LEAGUES: LeagueKey[] = ["MLB", "NBA", "NHL", "NFL", "NCAAF", "UFC", "BOXING"];

function decodeLeague(value: string): LeagueKey | null {
  const upper = value.toUpperCase();
  return VALID_LEAGUES.includes(upper as LeagueKey) ? (upper as LeagueKey) : null;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function plus(value: number) {
  return `${value > 0 ? "+" : ""}${Number(value).toFixed(Math.abs(value) < 1 ? 2 : 1)}`;
}

function tone(status: string) {
  if (status === "LIVE") return "success" as const;
  if (status === "FINAL") return "neutral" as const;
  if (status === "POSTPONED" || status === "CANCELED") return "danger" as const;
  return "muted" as const;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function barWidth(value: number) {
  return `${Math.max(2, Math.min(100, value * 100)).toFixed(1)}%`;
}

function factorClass(value: number) {
  return value >= 0 ? "text-emerald-300" : "text-red-300";
}

function americanToProbability(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function projectionConfidence(projection: Projection) {
  return projection.mlbIntel?.governor?.confidence ?? projection.nbaIntel?.confidence ?? projection.realityIntel?.confidence ?? null;
}

function decision(projection: Projection) {
  const gov = projection.mlbIntel?.governor;
  if (gov?.noBet || gov?.tier === "pass") return { label: "PASS", cls: "border-red-400/30 bg-red-500/10 text-red-200" };
  if (gov?.tier === "attack") return { label: "ATTACK", cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" };
  if (gov?.tier === "watch") return { label: "WATCH", cls: "border-amber-400/30 bg-amber-500/10 text-amber-200" };
  const confidence = projection.nbaIntel?.confidence ?? projection.realityIntel?.confidence ?? 0;
  const edge = Math.abs(projection.distribution.homeWinPct - 0.5);
  if (edge >= 0.08 && confidence >= 0.62) return { label: "ATTACK", cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" };
  if (edge >= 0.045 && confidence >= 0.55) return { label: "WATCH", cls: "border-amber-400/30 bg-amber-500/10 text-amber-200" };
  return { label: "PASS", cls: "border-slate-500/30 bg-slate-500/10 text-slate-300" };
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

function WinBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>{pct(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-sky-400" style={{ width: barWidth(value) }} />
      </div>
    </div>
  );
}

function Factor({ label, value, weight, source }: DisplayFactor) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-400">{label}</span>
        <span className={`font-semibold ${factorClass(value)}`}>{plus(value)}</span>
      </div>
      {typeof weight === "number" || source ? (
        <div className="mt-1 flex justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-slate-600">
          <span>{source ?? "model"}</span>
          {typeof weight === "number" ? <span>weight {(weight * 100).toFixed(0)}%</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function displayFactors(projection: Projection): DisplayFactor[] {
  const mlb = projection.mlbIntel?.factors ?? [];
  if (mlb.length) return mlb;
  return projection.realityIntel?.factors ?? [];
}

function GameStatSheetPanel({ projection }: { projection: Projection }) {
  const sheet = projection.statSheet;
  if (!sheet) return null;
  return (
    <Card className="surface-panel p-5">
      <SectionTitle title="Game Stat Sheet" description="Full team simulation output for projected game flow." />
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
        {sheet.pace != null ? <span>Pace {sheet.pace.toFixed(1)}</span> : null}
        {sheet.possessions != null ? <span>Possessions {sheet.possessions.toFixed(1)}</span> : null}
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/50">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-3 py-2">Stat</th>
              <th className="px-3 py-2">{sheet.awayTeam}</th>
              <th className="px-3 py-2">{sheet.homeTeam}</th>
              <th className="px-3 py-2">Diff</th>
            </tr>
          </thead>
          <tbody>
            {sheet.categories.map((row) => (
              <tr key={row.key} className="border-b border-white/5 last:border-none">
                <td className="px-3 py-2 text-slate-400">{row.label}</td>
                <td className="px-3 py-2 text-white">{row.away.toFixed(1)}</td>
                <td className="px-3 py-2 text-white">{row.home.toFixed(1)}</td>
                <td className={`px-3 py-2 ${row.home - row.away >= 0 ? "text-emerald-300" : "text-red-300"}`}>{plus(row.home - row.away)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.notes.length ? (
        <div className="mt-3 grid gap-2">
          {sheet.notes.map((note, index) => (
            <div key={`sheet-note-${index}`} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-slate-400">{note}</div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function NbaPlayerProjectionPanel({ projection }: { projection: Projection }) {
  const intel = projection.nbaIntel;
  const rows = intel?.playerStatProjections ?? [];
  if (!intel || !rows.length) return null;
  const bestLine = (row: typeof rows[number]) => row.propHitProbabilities.points ?? row.propHitProbabilities.assists ?? row.propHitProbabilities.rebounds ?? row.propHitProbabilities.threes ?? null;
  return (
    <Card className="surface-panel p-5">
      <SectionTitle title="Player Stat Sheets" description="10,000-run projections, floors/ceilings, and prop line hit probabilities." />
      <div className="mt-3 text-xs text-slate-400">
        Runs per player: {rows[0]?.simulationRuns?.toLocaleString() ?? "10,000"}
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/50">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Pts F/M/C</th>
              <th className="px-3 py-2">Reb F/M/C</th>
              <th className="px-3 py-2">Ast F/M/C</th>
              <th className="px-3 py-2">3PM F/M/C</th>
              <th className="px-3 py-2">Line Hit O/U</th>
              <th className="px-3 py-2">Conf</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((row) => {
              const line = bestLine(row);
              return (
                <tr key={`${row.teamName}:${row.playerName}`} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-white">{row.playerName}</div>
                    <div className="text-[10px] text-slate-500">{row.teamName} | {row.teamSide.toUpperCase()} | {row.status} | {row.projectedMinutes.toFixed(1)} min</div>
                  </td>
                  <td className="px-3 py-2 text-slate-200">{row.floor.points.toFixed(1)} / {row.projectedPoints.toFixed(1)} / {row.ceiling.points.toFixed(1)}</td>
                  <td className="px-3 py-2 text-slate-200">{row.floor.rebounds.toFixed(1)} / {row.projectedRebounds.toFixed(1)} / {row.ceiling.rebounds.toFixed(1)}</td>
                  <td className="px-3 py-2 text-slate-200">{row.floor.assists.toFixed(1)} / {row.projectedAssists.toFixed(1)} / {row.ceiling.assists.toFixed(1)}</td>
                  <td className="px-3 py-2 text-slate-200">{row.floor.threes.toFixed(1)} / {row.projectedThrees.toFixed(1)} / {row.ceiling.threes.toFixed(1)}</td>
                  <td className="px-3 py-2 text-slate-200">
                    {line ? (
                      <div>
                        <div>O {pct(line.overProbability)} / U {pct(line.underProbability)}</div>
                        <div className="text-[10px] text-slate-500">line {line.line.toFixed(1)} | {line.recommendedSide} | edge {plus(line.edgeToLine)}</div>
                      </div>
                    ) : "No line"}
                  </td>
                  <td className="px-3 py-2 text-slate-200">{pct(row.confidence)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {rows.slice(0, 6).map((row) => (
          <div key={`${row.playerName}-reason`} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-slate-300">
            <div className="mb-1 text-slate-100">{row.playerName}</div>
            <div>Hit: {row.whyLikely[0] ?? "Role and possession context support the median line."}</div>
            <div className="mt-1 text-slate-400">Miss: {row.whyNotLikely[0] ?? "No major downside flags from current context stack."}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RealityEnginePanel({ projection }: { projection: Projection }) {
  const intel = projection.realityIntel;
  if (!intel) return null;
  const strongest = [...intel.factors].sort((left, right) => Math.abs(right.value * right.weight) - Math.abs(left.value * left.weight)).slice(0, 8);
  return (
    <Card className="surface-panel p-5">
      <SectionTitle title="Reality Engine" description={`${intel.modelVersion} | ${intel.dataSource}`} />
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <Tile label="Home edge" value={plus(intel.homeEdge)} />
        <Tile label="Confidence" value={pct(intel.confidence)} />
        <Tile label="Volatility" value={String(intel.volatilityIndex)} />
        <Tile label="Projected total" value={String(intel.projectedTotal)} />
        <Tile label="Real modules" value={`${intel.modules.filter((item) => item.status === "real").length}/${intel.modules.length}`} />
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {strongest.map((factor) => (
          <Factor key={`${factor.label}:${factor.source}`} label={factor.label} value={factor.value} weight={factor.weight} source={factor.source} />
        ))}
      </div>
    </Card>
  );
}

function GovernorPanel({ projection }: { projection: Projection }) {
  const gov = projection.mlbIntel?.governor;
  const cal = projection.mlbIntel?.calibration;
  const unc = projection.mlbIntel?.uncertainty;
  if (!gov && !projection.nbaIntel) return null;
  return (
    <Card className="surface-panel p-5">
      <SectionTitle title="Decision Governor" description="Confidence gates and calibration checks." />
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Tile label="Tier" value={gov?.tier?.toUpperCase() ?? projection.nbaIntel?.tier.toUpperCase() ?? "WATCH"} />
        <Tile label="No Bet" value={String(gov?.noBet ?? projection.nbaIntel?.noBet ?? false).toUpperCase()} />
        <Tile label="Confidence" value={pct(gov?.confidence ?? projection.nbaIntel?.confidence ?? 0)} />
        <Tile label="Calibrated Home" value={cal ? pct(cal.calibratedHomeWinPct) : "--"} sub={cal ? `ECE ${cal.ece ?? "--"}` : "NBA uses direct confidence"} />
      </div>
      {unc?.interval ? (
        <div className="mt-4 rounded-xl border border-sky-400/15 bg-sky-500/[0.06] p-3 text-sm text-slate-300">
          80% total range: <span className="font-semibold text-white">{unc.interval.low} - {unc.interval.high}</span>
          <br />90% range: <span className="font-semibold text-white">{unc.interval.p90Low} - {unc.interval.p90High}</span>
        </div>
      ) : null}
      <div className="mt-4 grid gap-2">
        {(gov?.reasons ?? projection.nbaIntel?.reasons ?? []).map((reason, index) => (
          <div key={`reason-${index}`} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs leading-5 text-slate-400">{reason}</div>
        ))}
      </div>
    </Card>
  );
}

function MarketPanel({ edge }: { edge?: EdgeResult | null }) {
  if (!edge) return null;
  const homeMarket = americanToProbability(edge.market?.homeMoneyline);
  const awayMarket = americanToProbability(edge.market?.awayMoneyline);
  return (
    <Card className="surface-panel p-5">
      <SectionTitle title="Market Edge" description={`${edge.sportsbook} model vs market`} />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Tile label="Home ML" value={edge.market?.homeMoneyline == null ? "--" : String(edge.market.homeMoneyline)} sub={homeMarket == null ? "--" : `Market ${pct(homeMarket)}`} />
        <Tile label="Away ML" value={edge.market?.awayMoneyline == null ? "--" : String(edge.market.awayMoneyline)} sub={awayMarket == null ? "--" : `Market ${pct(awayMarket)}`} />
        <Tile label="Total edge" value={edge.edges.totalRuns == null ? "--" : plus(edge.edges.totalRuns)} />
      </div>
    </Card>
  );
}

export default async function SimMatchupPage({ params }: PageProps) {
  const resolved = await params;
  const league = decodeLeague(resolved.league);
  if (!league) notFound();
  const gameId = decodeURIComponent(resolved.gameId);
  const [sections, edgeData] = await Promise.all([
    buildBoardSportSections({ selectedLeague: league, gamesByLeague: {}, maxScoreboardGames: null }),
    league === "MLB" ? buildMlbEdges().catch(() => ({ edges: [] as EdgeResult[] })) : Promise.resolve({ edges: [] as EdgeResult[] })
  ]);
  const games: SimGame[] = sections.flatMap((section) => section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })));
  const game = games.find((item) => item.id === gameId);
  if (!game) notFound();
  const projection = await buildSimProjection(game);
  const edge = edgeData.edges.find((item) => item.gameId === game.id) ?? null;
  const dec = decision(projection);
  const modelVersion = projection.mlbIntel?.modelVersion ?? projection.realityIntel?.modelVersion ?? projection.nbaIntel?.modelVersion ?? "fallback";
  const dataSource = projection.mlbIntel?.dataSource ?? projection.realityIntel?.dataSource ?? projection.nbaIntel?.dataSource ?? "synthetic/fallback";
  const favorite = projection.distribution.homeWinPct >= projection.distribution.awayWinPct ? projection.matchup.home : projection.matchup.away;
  const favoritePct = Math.max(projection.distribution.homeWinPct, projection.distribution.awayWinPct);
  const factors = displayFactors(projection).sort((left, right) => Math.abs(right.value * (right.weight ?? 1)) - Math.abs(left.value * (left.weight ?? 1)));
  const confidence = projectionConfidence(projection);
  const projectedTotal = projection.mlbIntel?.projectedTotal ?? projection.nbaIntel?.projectedTotal ?? projection.realityIntel?.projectedTotal ?? Number(projection.distribution.avgAway + projection.distribution.avgHome).toFixed(1);

  return (
    <div className="space-y-6">
      <section className="surface-panel-strong p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="section-kicker">{league} matchup engine</div>
            <div className="mt-3 font-display text-4xl font-semibold tracking-tight text-white">{projection.matchup.away} @ {projection.matchup.home}</div>
            <div className="mt-3 text-sm text-slate-400">{formatTime(game.startTime)} | {modelVersion} | {dataSource}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={tone(game.status)}>{game.status}</Badge>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.14em] ${dec.cls}`}>{dec.label}</span>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/sim?league=${league}`} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">Back to {league}</Link>
          {league === "NBA" ? <Link href="/sim/players?league=NBA" className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">Player matchups</Link> : null}
          <Link href="/sim" className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">All leagues</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        <Tile label="Lean" value={favorite} sub={pct(favoritePct)} />
        <Tile label="Away projection" value={String(projection.distribution.avgAway)} sub={projection.matchup.away} />
        <Tile label="Home projection" value={String(projection.distribution.avgHome)} sub={projection.matchup.home} />
        <Tile label="Projected total" value={String(projectedTotal)} sub="Model output" />
        <Tile label="Confidence" value={confidence == null ? "--" : pct(confidence)} sub={projection.mlbIntel?.governor?.noBet ? "No bet" : "Action gate"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="surface-panel p-5">
          <SectionTitle title="Win distribution" description="Final model probability after available adjustments." />
          <div className="mt-4"><WinBar label={projection.matchup.home} value={projection.distribution.homeWinPct} /></div>
          <div className="mt-3"><WinBar label={projection.matchup.away} value={projection.distribution.awayWinPct} /></div>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm leading-6 text-slate-300">{projection.read}</div>
        </Card>
        <Card className="surface-panel p-5">
          <SectionTitle title="Factor stack" description="Full engine inputs sorted by weighted impact." />
          {factors.length ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {factors.map((factor) => <Factor key={`${factor.label}:${factor.source ?? "model"}`} label={factor.label} value={factor.value} weight={factor.weight} source={factor.source} />)}
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-400">No sport-specific factor stack is available for this league yet.</div>
          )}
        </Card>
      </section>

      <GameStatSheetPanel projection={projection} />
      {league === "NBA" ? <NbaPlayerProjectionPanel projection={projection} /> : null}
      <RealityEnginePanel projection={projection} />
      <GovernorPanel projection={projection} />
      {league === "MLB" ? <MarketPanel edge={edge} /> : null}
    </div>
  );
}
