import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { cacheAgeLabel, readCachedMlbGameDetail } from "@/services/simulation/mlb-game-detail-cache";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import { buildMainSimProjection as buildSimProjection } from "@/services/simulation/main-sim-brain";

type LiveProjection = Awaited<ReturnType<typeof buildSimProjection>>;
type ProjectionView = Pick<LiveProjection, "matchup" | "distribution" | "read" | "statSheet" | "realityIntel" | "mlbIntel" | "nbaIntel">;
type EdgeResult = Awaited<ReturnType<typeof buildMlbEdges>>["edges"][number];
type Lock = NonNullable<NonNullable<ProjectionView["mlbIntel"]>["lock"]>;

type PageProps = { params: Promise<{ gameId: string }> };
type DecisionTier = "attack" | "watch" | "lean" | "pass";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function one(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function formatOdds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function edgeSignal(edge: EdgeResult | null | undefined) {
  return edge && "signal" in edge ? edge.signal : null;
}

function edgeTotals(edge: EdgeResult | null | undefined) {
  return edge && "edges" in edge ? edge.edges : null;
}

function winLean(projection: ProjectionView) {
  const home = projection.distribution.homeWinPct;
  const away = projection.distribution.awayWinPct;
  return home >= away
    ? { team: projection.matchup.home, pct: home, side: "HOME" as const }
    : { team: projection.matchup.away, pct: away, side: "AWAY" as const };
}

function projectedTotal(projection: ProjectionView) {
  return projection.mlbIntel?.projectedTotal
    ?? (projection.distribution.avgAway + projection.distribution.avgHome);
}

function decisionTier(projection: ProjectionView, edge?: EdgeResult | null): DecisionTier {
  const governor = projection.mlbIntel?.governor;
  if (!projection.mlbIntel || governor?.noBet || governor?.tier === "pass") return "pass";
  if (governor?.tier === "attack") return "attack";
  if (governor?.tier === "watch") return "watch";
  const signal = edgeSignal(edge);
  if (signal?.strength === "strong") return "watch";
  return "lean";
}

function decisionLabel(tier: DecisionTier) {
  if (tier === "attack") return "BEST";
  if (tier === "watch") return "WATCH";
  if (tier === "lean") return "LEAN";
  return "PASS";
}

function decisionTone(tier: DecisionTier) {
  if (tier === "attack") return "success" as const;
  if (tier === "watch" || tier === "lean") return "premium" as const;
  return "muted" as const;
}

function marketLabel(projection: ProjectionView, edge?: EdgeResult | null) {
  const signal = edgeSignal(edge);
  if (signal?.market === "home_ml") return `${projection.matchup.home} ML`;
  if (signal?.market === "away_ml") return `${projection.matchup.away} ML`;
  if (signal?.market === "over") return "Over";
  if (signal?.market === "under") return "Under";

  const runEdge = edgeTotals(edge)?.totalRuns;
  if (typeof runEdge === "number") return runEdge >= 0 ? "Over lean" : "Under lean";
  return "No market lean";
}

function cleanReasons(projection: ProjectionView, lock?: Lock | null) {
  const raw = [
    ...(projection.mlbIntel?.governor?.reasons ?? []),
    ...(lock?.notes ?? []),
    projection.read
  ].filter((reason): reason is string => typeof reason === "string" && reason.trim().length > 0);
  const seen = new Set<string>();
  return raw.filter((reason) => {
    const key = reason.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-3">
      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {sub ? <div className="mt-1 text-[0.68rem] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function WinChart({ projection }: { projection: ProjectionView }) {
  const awayPct = projection.distribution.awayWinPct;
  const homePct = projection.distribution.homeWinPct;
  const awayWidth = Math.max(5, Math.min(95, Math.round(awayPct * 100)));
  const homeWidth = Math.max(5, 100 - awayWidth);

  return (
    <Card className="surface-panel p-4">
      <div className="mb-2 flex items-center justify-between text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">
        <span>Win chance</span>
        <span>{pct(awayPct)} / {pct(homePct)}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/8">
        <div className="bg-sky-400/75" style={{ width: `${awayWidth}%` }} />
        <div className="bg-emerald-400/75" style={{ width: `${homeWidth}%` }} />
      </div>
      <div className="mt-2 flex justify-between gap-3 text-[11px] text-slate-400">
        <span className="truncate">{projection.matchup.away}</span>
        <span className="truncate text-right">{projection.matchup.home}</span>
      </div>
    </Card>
  );
}

function RunsChart({ projection }: { projection: ProjectionView }) {
  const away = projection.distribution.avgAway;
  const home = projection.distribution.avgHome;
  const max = Math.max(away, home, 1);
  return (
    <Card className="surface-panel p-4">
      <div className="mb-3 text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">Projected runs</div>
      {[
        { team: projection.matchup.away, runs: away },
        { team: projection.matchup.home, runs: home }
      ].map((item) => (
        <div key={item.team} className="mb-3 last:mb-0">
          <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-400">
            <span className="truncate">{item.team}</span>
            <span className="tabular-nums text-white">{one(item.runs)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-aqua/70" style={{ width: `${Math.max(8, Math.round((item.runs / max) * 100))}%` }} />
          </div>
        </div>
      ))}
    </Card>
  );
}

function PitcherCard({ label, team, name, throws }: { label: string; team: string; name?: string | null; throws?: string | null }) {
  return (
    <Card className="surface-panel p-4">
      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm text-slate-400">{team}</div>
      <div className="mt-1 font-display text-xl font-semibold text-white">{name ?? "Starter TBD"}</div>
      {throws ? <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">Throws {throws}</div> : null}
    </Card>
  );
}

function PitchersSection({ projection, lock }: { projection: ProjectionView; lock?: Lock | null }) {
  if (!lock) return null;
  return (
    <section className="grid gap-4">
      <SectionTitle title="Pitchers" description="Only the starting pitcher context needed for the read." />
      <div className="grid gap-4 md:grid-cols-2">
        <PitcherCard label="Away starter" team={projection.matchup.away} name={lock.awayStarterName} throws={lock.awayStarterThrows} />
        <PitcherCard label="Home starter" team={projection.matchup.home} name={lock.homeStarterName} throws={lock.homeStarterThrows} />
      </div>
      {(!lock.startersConfirmed || !lock.lineupsConfirmed) ? (
        <div className="rounded-2xl border border-amber-300/15 bg-amber-300/5 px-4 py-3 text-xs leading-5 text-amber-100/80">
          Starters or lineups are not fully confirmed yet. Treat the read as movable until lineups lock.
        </div>
      ) : null}
    </section>
  );
}

function WhySection({ reasons }: { reasons: string[] }) {
  return (
    <section className="grid gap-4">
      <SectionTitle title="Why" description="The short version. No factor dump." />
      <div className="grid gap-2">
        {(reasons.length ? reasons : ["No clean reason available yet."]).map((reason) => (
          <div key={reason} className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3 text-sm leading-6 text-slate-300">
            {reason}
          </div>
        ))}
      </div>
    </section>
  );
}

function AdvancedDetails({ projection, edge, cacheLabel }: { projection: ProjectionView; edge?: EdgeResult | null; cacheLabel: string }) {
  const factors = [...(projection.mlbIntel?.factors ?? [])]
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 6);

  return (
    <details className="group rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 marker:hidden hover:text-slate-300">
        <span>Advanced details</span>
        <span className="group-open:hidden">Show</span>
        <span className="hidden group-open:inline">Hide</span>
      </summary>
      <div className="mt-4 grid gap-3 text-sm text-slate-400 lg:grid-cols-3">
        <Stat label="Cache" value={cacheLabel} />
        <Stat label="Book" value={edge?.market?.sportsbook ?? "—"} />
        <Stat label="Market total" value={edge?.market?.total != null ? one(edge.market.total) : "—"} />
        <Stat label="Away ML" value={formatOdds(edge?.market?.awayMoneyline)} />
        <Stat label="Home ML" value={formatOdds(edge?.market?.homeMoneyline)} />
        <Stat label="Volatility" value={projection.mlbIntel?.volatilityIndex != null ? one(projection.mlbIntel.volatilityIndex) : "—"} />
      </div>
      {factors.length ? (
        <div className="mt-4 grid gap-2">
          {factors.map((factor) => (
            <div key={factor.label} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-slate-950/45 px-3 py-2 text-xs">
              <span className="truncate text-slate-300">{factor.label}</span>
              <span className="tabular-nums text-slate-400">{factor.value > 0 ? "+" : ""}{factor.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}

async function buildLiveFallback(gameId: string) {
  const [sections, edgeData] = await Promise.all([
    buildBoardSportSections({ selectedLeague: "MLB", gamesByLeague: {}, maxScoreboardGames: null }),
    buildMlbEdges().catch(() => ({ edges: [] as EdgeResult[] }))
  ]);
  const game = sections
    .flatMap((section) => section.scoreboard.map((item) => ({ ...item, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })))
    .find((item) => item.id === gameId);
  if (!game) return null;

  const projection = await buildSimProjection(game);
  return {
    game,
    projection: projection as ProjectionView,
    edge: edgeData.edges.find((item) => item.gameId === gameId) ?? null,
    cacheLabel: "live fallback"
  };
}

export default async function MlbGameDetailPage({ params }: PageProps) {
  const { gameId } = await params;
  const decodedId = decodeURIComponent(gameId);
  const cached = await readCachedMlbGameDetail(decodedId);
  const detail = cached
    ? {
      game: cached.row.game,
      projection: cached.row.projection as ProjectionView,
      edge: cached.edge as EdgeResult | null,
      cacheLabel: `${cacheAgeLabel(cached.generatedAt)}${cached.stale ? " · stale" : ""}`
    }
    : await buildLiveFallback(decodedId);

  if (!detail) notFound();

  const { game, projection, edge, cacheLabel } = detail;
  const lean = winLean(projection);
  const tier = decisionTier(projection, edge);
  const total = projectedTotal(projection);
  const lock = projection.mlbIntel?.lock;
  const reasons = cleanReasons(projection, lock);

  return (
    <div className="grid gap-6">
      <section className="surface-panel-strong p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="section-kicker">MLB game sim</div>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white">
              {projection.matchup.away} @ {projection.matchup.home}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {formatTime(game.startTime)} · simple read first, details only when opened.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={decisionTone(tier)}>{decisionLabel(tier)}</Badge>
            <Link href="/sim/mlb" className="rounded-sm border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-300 hover:border-sky-400/25 hover:text-white">
              MLB sim
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <Stat label="Pick" value={lean.team} sub={pct(lean.pct)} />
          <Stat label="Score" value={`${one(projection.distribution.avgAway)}-${one(projection.distribution.avgHome)}`} sub="away-home" />
          <Stat label="Total" value={one(total)} sub="projected runs" />
          <Stat label="Market" value={marketLabel(projection, edge)} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <WinChart projection={projection} />
        <RunsChart projection={projection} />
      </section>

      <PitchersSection projection={projection} lock={lock} />
      <WhySection reasons={reasons} />
      <AdvancedDetails projection={projection} edge={edge} cacheLabel={cacheLabel} />

      {!projection.mlbIntel ? (
        <EmptyState
          title="MLB intelligence unavailable"
          description="The basic projection loaded, but the MLB intelligence payload is missing for this game."
        />
      ) : null}
    </div>
  );
}
