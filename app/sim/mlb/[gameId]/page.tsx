import { notFound } from "next/navigation";

import {
  SimDecisionBadge,
  SimMetricTile,
  SimSignalCard,
  SimTableShell,
  SimWorkspaceHeader
} from "@/components/sim/sim-ui";
import { cn } from "@/lib/utils/cn";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { cacheAgeLabel, readCachedMlbGameDetail } from "@/services/simulation/mlb-game-detail-cache";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import { buildMainSimProjection as buildSimProjection, mainBrainLabel } from "@/services/simulation/main-sim-brain";

type LiveProjection = Awaited<ReturnType<typeof buildSimProjection>>;
type ProjectionView = Pick<LiveProjection, "matchup" | "distribution" | "read" | "statSheet" | "realityIntel" | "mlbIntel" | "nbaIntel">;
type EdgeResult = Awaited<ReturnType<typeof buildMlbEdges>>["edges"][number];
type Lock = NonNullable<NonNullable<ProjectionView["mlbIntel"]>["lock"]>;
type Governor = NonNullable<NonNullable<ProjectionView["mlbIntel"]>["governor"]>;
type Uncertainty = NonNullable<NonNullable<ProjectionView["mlbIntel"]>["uncertainty"]>;

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function plus(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function americanImplied(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v === 0) return null;
  return v > 0 ? 100 / (v + 100) : Math.abs(v) / (Math.abs(v) + 100);
}

function noVigProbs(home: number | null | undefined, away: number | null | undefined) {
  const h = americanImplied(home);
  const a = americanImplied(away);
  if (h == null || a == null) return null;
  const hold = h + a;
  if (hold <= 0) return null;
  return { home: h / hold, away: a / hold };
}

function fmtOdds(v: number | null | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "--";
  const r = Math.round(v);
  return r > 0 ? `+${r}` : String(r);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
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

function winLean(projection: ProjectionView) {
  const home = projection.distribution.homeWinPct;
  const away = projection.distribution.awayWinPct;
  return home >= away
    ? { team: projection.matchup.home, pct: home }
    : { team: projection.matchup.away, pct: away };
}

function fatigueTag(score: number): { label: string; color: string } {
  if (score < 0.25) return { label: "Fresh", color: "text-mint" };
  if (score < 0.5) return { label: "Moderate", color: "text-slate-300" };
  if (score < 0.75) return { label: "Heavy", color: "text-amber-300" };
  return { label: "Taxed", color: "text-crimson" };
}

function dedupeNotes(arrays: (string[] | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const arr of arrays) {
    for (const note of arr ?? []) {
      const key = note.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(note.trim());
      }
    }
  }
  return out;
}

// ─── Win probability bar ──────────────────────────────────────────────────────

function WinProbSection({ projection, edge }: { projection: ProjectionView; edge?: EdgeResult | null }) {
  const rawHome = projection.distribution.homeWinPct ?? 0.5;
  const rawAway = projection.distribution.awayWinPct ?? (1 - rawHome);
  const total = rawHome + rawAway;
  const homePct = (rawHome / total) * 100;
  const awayPct = 100 - homePct;
  const homeFav = homePct >= awayPct;

  const mkt = edge?.market ? noVigProbs(edge.market.homeMoneyline, edge.market.awayMoneyline) : null;
  const betSide = edge?.signal?.market === "home_ml" ? "home"
    : edge?.signal?.market === "away_ml" ? "away"
    : null;

  const awayRuns = projection.distribution.avgAway;
  const homeRuns = projection.distribution.avgHome;
  const projTotal = typeof awayRuns === "number" && typeof homeRuns === "number"
    ? awayRuns + homeRuns : null;
  const awayWins = (awayRuns ?? 0) > (homeRuns ?? 0);

  return (
    <SimSignalCard>
      {/* Probability bar */}
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">Win Probability</div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className={cn("text-xs font-semibold leading-tight", !homeFav ? "text-white" : "text-slate-500")}>
            {projection.matchup.away}
            {betSide === "away" ? <span className="ml-1.5 text-[9px] text-cyan-400">← BET</span> : null}
          </div>
          <div className={cn("mt-0.5 font-mono text-3xl font-bold tabular-nums", !homeFav ? "text-cyan-300" : "text-slate-500")}>
            {awayPct.toFixed(1)}%
          </div>
          {mkt ? <div className="text-[10px] text-slate-600">{(mkt.away * 100).toFixed(1)}% market</div> : null}
        </div>
        <div className="px-4 text-center">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-700">Model</div>
        </div>
        <div className="text-right">
          <div className={cn("text-xs font-semibold leading-tight", homeFav ? "text-white" : "text-slate-500")}>
            {projection.matchup.home}
            {betSide === "home" ? <span className="ml-1.5 text-[9px] text-violet-400">BET →</span> : null}
          </div>
          <div className={cn("mt-0.5 font-mono text-3xl font-bold tabular-nums", homeFav ? "text-violet-300" : "text-slate-500")}>
            {homePct.toFixed(1)}%
          </div>
          {mkt ? <div className="text-[10px] text-slate-600">{(mkt.home * 100).toFixed(1)}% market</div> : null}
        </div>
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-800/80">
        <div style={{ width: `${awayPct}%` }} className="bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500" />
        <div style={{ width: `${homePct}%` }} className="bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-500" />
      </div>
      <div className="mt-1 flex justify-between text-[8px] font-medium uppercase tracking-[0.18em] text-slate-700">
        <span>Away</span>
        <span>Home</span>
      </div>

      {/* Score prediction */}
      {awayRuns != null && homeRuns != null ? (
        <div className="mt-5 border-t border-white/[0.05] pt-4">
          <div className="mb-3 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">Model Score Projection</div>
          <div className="flex items-center justify-between">
            <div>
              <div className={cn("text-[10px] font-semibold", awayWins ? "text-slate-300" : "text-slate-600")}>{projection.matchup.away}</div>
              <div className={cn("font-mono text-4xl font-bold tabular-nums", awayWins ? "text-cyan-300" : "text-slate-600")}>{awayRuns.toFixed(1)}</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-sm text-slate-700">vs</div>
              {projTotal != null ? (
                <div className="mt-1 text-[10px] text-slate-600">= {projTotal.toFixed(1)} runs</div>
              ) : null}
            </div>
            <div className="text-right">
              <div className={cn("text-[10px] font-semibold", !awayWins ? "text-slate-300" : "text-slate-600")}>{projection.matchup.home}</div>
              <div className={cn("font-mono text-4xl font-bold tabular-nums", !awayWins ? "text-violet-300" : "text-slate-600")}>{homeRuns.toFixed(1)}</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Totals comparison */}
      {edge?.market?.total != null && projTotal != null ? (
        <div className="mt-4 border-t border-white/[0.05] pt-4">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">Over / Under</div>
          {(() => {
            const mktTotal = edge.market!.total as number;
            const runEdge = projTotal - mktTotal;
            const favOver = runEdge > 0;
            const overMktProb = edge.market?.overPrice ? americanImplied(edge.market.overPrice as number) : null;
            const underMktProb = overMktProb != null ? 1 - overMktProb : null;
            return (
              <>
                <div className="flex items-end justify-between">
                  <div>
                    <div className={cn("text-xs font-semibold", favOver ? "text-white" : "text-slate-500")}>
                      Over {mktTotal.toFixed(1)}
                    </div>
                    <div className={cn("font-mono text-2xl font-bold tabular-nums mt-0.5", favOver ? "text-emerald-300" : "text-slate-500")}>
                      {favOver ? "+" : ""}{runEdge.toFixed(1)}
                    </div>
                    {overMktProb ? <div className="text-[10px] text-slate-600">{(overMktProb * 100).toFixed(1)}% market</div> : null}
                  </div>
                  <div className="px-4 text-center">
                    <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-700">Run edge</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Line {mktTotal.toFixed(1)} · Proj {projTotal.toFixed(1)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-xs font-semibold", !favOver ? "text-white" : "text-slate-500")}>
                      Under {mktTotal.toFixed(1)}
                    </div>
                    <div className={cn("font-mono text-2xl font-bold tabular-nums mt-0.5", !favOver ? "text-amber-300" : "text-slate-500")}>
                      {!favOver ? "" : "-"}{Math.abs(runEdge).toFixed(1)}
                    </div>
                    {underMktProb ? <div className="text-[10px] text-slate-600">{(underMktProb * 100).toFixed(1)}% market</div> : null}
                  </div>
                </div>
                <div className="mt-2.5 flex h-3 overflow-hidden rounded-full bg-slate-800/80">
                  <div style={{ width: `${Math.min(100, Math.max(0, (projTotal / (mktTotal * 1.4)) * 100))}%` }}
                    className={cn("transition-all duration-500", favOver ? "bg-gradient-to-r from-emerald-600 to-emerald-400" : "bg-gradient-to-r from-amber-600 to-amber-400")} />
                </div>
                <div className="mt-1 flex justify-between text-[8px] font-medium uppercase tracking-[0.18em] text-slate-700">
                  <span>← Under</span>
                  <span>Over →</span>
                </div>
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Moneyline odds row */}
      {edge?.market && (edge.market.homeMoneyline != null || edge.market.awayMoneyline != null) ? (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.05] pt-4">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Away ML</div>
            <div className="mt-1 font-mono text-lg font-bold text-white">{fmtOdds(edge.market.awayMoneyline)}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Total</div>
            <div className="mt-1 font-mono text-lg font-bold text-white">{edge.market.total?.toFixed(1) ?? "--"}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Home ML</div>
            <div className="mt-1 font-mono text-lg font-bold text-white">{fmtOdds(edge.market.homeMoneyline)}</div>
          </div>
        </div>
      ) : null}
    </SimSignalCard>
  );
}

// ─── Market panel ─────────────────────────────────────────────────────────────

function MarketPanel({ edge }: { edge?: EdgeResult | null }) {
  if (!edge?.market) {
    return (
      <SimSignalCard className="border-amber-400/20 bg-amber-500/[0.045]">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <p className="text-sm text-amber-100/80">
            No matched sportsbook line for this game yet. Model read is available but market edge should be treated as incomplete.
          </p>
        </div>
      </SimSignalCard>
    );
  }
  return (
    <SimSignalCard>
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Matched market line</div>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <SimMetricTile label="Home ML" value={String(edge.market.homeMoneyline ?? "--")} sub={edge.edges.homeMoneyline == null ? "No edge" : `edge ${plus(edge.edges.homeMoneyline)}`} />
        <SimMetricTile label="Away ML" value={String(edge.market.awayMoneyline ?? "--")} sub={edge.edges.awayMoneyline == null ? "No edge" : `edge ${plus(edge.edges.awayMoneyline)}`} />
        <SimMetricTile label="Total" value={String(edge.market.total ?? "--")} sub={edge.edges.totalRuns == null ? "No edge" : `runs edge ${plus(edge.edges.totalRuns)}`} emphasis="strong" />
        <SimMetricTile label="Book" value={edge.market.sportsbook ?? "unknown"} sub={edge.signal ? `${edge.signal.market} · ${edge.signal.strength}` : "no signal"} />
      </div>
    </SimSignalCard>
  );
}

// ─── Lineup & starters panel ──────────────────────────────────────────────────

function BullpenBar({ label, usage }: { label: string; usage: Lock["awayBullpenUsage"] }) {
  const tag = fatigueTag(usage.fatigueScore ?? 0);
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">{label}</span>
        <span className={cn("text-[11px] font-semibold", tag.color)}>{tag.label}</span>
      </div>
      <div className="mt-1.5 text-[11px] tabular-nums text-slate-600">
        {num(usage.inningsLast1, 1)} IP yesterday · {num(usage.inningsLast3, 1)} last 3d · {num(usage.inningsLast5, 1)} last 5d
      </div>
    </div>
  );
}

function StarterCard({
  side,
  teamName,
  starterName,
  throws,
  scratches
}: {
  side: "away" | "home";
  teamName: string;
  starterName?: string | null;
  throws?: string;
  scratches: string[];
}) {
  const confirmed = Boolean(starterName);
  return (
    <div className="rounded-xl border border-white/[0.09] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          {side === "away" ? "Away" : "Home"} · {teamName}
        </div>
        <span className={cn(
          "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.08em]",
          confirmed
            ? "border border-mint/25 bg-mint/10 text-mint"
            : "border border-amber-400/25 bg-amber-400/10 text-amber-300"
        )}>
          {confirmed ? "Confirmed" : "TBD"}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={cn("text-base font-semibold", confirmed ? "text-white" : "text-slate-500")}>
          {starterName ?? "Starter TBD"}
        </span>
        {throws && (
          <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-500">{throws}HP</span>
        )}
      </div>
      {scratches.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span className="text-[11px] text-amber-300">Late scratch{scratches.length !== 1 ? "es" : ""}: {scratches.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

function LineupPanel({ lock, matchup }: { lock: Lock; matchup: { away: string; home: string } }) {
  const hasScratches = lock.awayLateScratches.length > 0 || lock.homeLateScratches.length > 0;
  const allLocked = lock.startersConfirmed && lock.lineupsConfirmed;
  const neitherLocked = !lock.startersConfirmed && !lock.lineupsConfirmed;

  return (
    <SimSignalCard className={cn(
      neitherLocked ? "border-amber-400/20 bg-amber-500/[0.03]" : undefined
    )}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Starting Pitchers</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.12em]",
            lock.startersConfirmed ? "text-mint" : "text-amber-300"
          )}>
            {lock.startersConfirmed ? "Starters locked" : "Starters unconfirmed"}
          </span>
          <span className="text-slate-700">·</span>
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.12em]",
            lock.lineupsConfirmed ? "text-mint" : "text-amber-300"
          )}>
            {lock.lineupsConfirmed ? "Lineups locked" : "Lineups pending"}
          </span>
          {allLocked && (
            <span className="rounded-sm border border-mint/20 bg-mint/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-mint">
              Full lock
            </span>
          )}
        </div>
      </div>

      {neitherLocked && (
        <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-500/[0.04] px-3 py-2 text-xs text-amber-200/80">
          Official lineups not yet released — this projection uses pre-game estimates. Confidence may shift once starters and batting orders are confirmed.
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <StarterCard
          side="away"
          teamName={matchup.away}
          starterName={lock.awayStarterName}
          throws={lock.awayStarterThrows}
          scratches={lock.awayLateScratches}
        />
        <StarterCard
          side="home"
          teamName={matchup.home}
          starterName={lock.homeStarterName}
          throws={lock.homeStarterThrows}
          scratches={lock.homeLateScratches}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <BullpenBar label={`${matchup.away} bullpen`} usage={lock.awayBullpenUsage} />
        <BullpenBar label={`${matchup.home} bullpen`} usage={lock.homeBullpenUsage} />
      </div>

      {hasScratches && (
        <p className="mt-2 text-[11px] text-amber-300/70">
          Late scratches detected — model may not yet reflect full roster impact.
        </p>
      )}
    </SimSignalCard>
  );
}

// ─── Game intelligence card (replaces Governor notes) ─────────────────────────

function GameIntelCard({
  governor,
  lockNotes,
  read
}: {
  governor: Governor | null | undefined;
  lockNotes: string[];
  read: string;
}) {
  const notes = dedupeNotes([governor?.reasons, lockNotes, [read]]);
  const headline = notes[0];
  const rest = notes.slice(1);

  return (
    <SimSignalCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Game Intelligence</div>
        <div className="flex flex-wrap items-center gap-2">
          {governor?.noBet && (
            <span className="rounded-sm border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-300">
              No-bet
            </span>
          )}
          {governor?.tier && <SimDecisionBadge tier={governor.tier} />}
        </div>
      </div>

      {headline && (
        <div className="mt-3 rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white">
          {headline}
        </div>
      )}

      {rest.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-[11px] text-slate-600 hover:text-slate-400">
            <span className="group-open:hidden">{rest.length} more signal{rest.length !== 1 ? "s" : ""} ↓</span>
            <span className="hidden group-open:inline">Collapse ↑</span>
          </summary>
          <div className="mt-2 grid gap-1.5">
            {rest.map((note, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-2 text-xs leading-5 text-slate-400">
                {note}
              </div>
            ))}
          </div>
        </details>
      )}
    </SimSignalCard>
  );
}

// ─── Model risk / uncertainty module ─────────────────────────────────────────

function ModelRiskModule({
  uncertainty,
  volatilityIndex
}: {
  uncertainty: Uncertainty | null | undefined;
  volatilityIndex: number | undefined;
}) {
  if (!uncertainty && !volatilityIndex) return null;
  const highVolatility = volatilityIndex != null && volatilityIndex > 1.2;
  const hasInterval = uncertainty?.interval != null;

  return (
    <SimSignalCard className={cn(
      highVolatility || (uncertainty?.penalty ?? 0) > 0.05
        ? "border-amber-400/15 bg-amber-500/[0.03]"
        : "border-white/[0.06]"
    )}>
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Model Risk</div>
      <div className={cn("mt-3 grid gap-3", hasInterval ? "sm:grid-cols-4" : "sm:grid-cols-2")}>
        {volatilityIndex != null && (
          <SimMetricTile
            label="Volatility index"
            value={`${num(volatilityIndex, 2)}×`}
            sub={highVolatility ? "Elevated variance" : "Normal range"}
            emphasis={highVolatility ? "normal" : "muted"}
          />
        )}
        {uncertainty && (
          <SimMetricTile
            label="Uncertainty penalty"
            value={`−${pct(uncertainty.penalty)}`}
            sub="Applied to confidence"
            emphasis={(uncertainty.penalty ?? 0) > 0.05 ? "normal" : "muted"}
          />
        )}
        {hasInterval && uncertainty?.interval && (
          <>
            <SimMetricTile
              label="80% score band"
              value={`${num(uncertainty.interval.low, 1)} – ${num(uncertainty.interval.high, 1)}`}
              sub="Projected run range"
            />
            <SimMetricTile
              label="90% score band"
              value={`${num(uncertainty.interval.p90Low, 1)} – ${num(uncertainty.interval.p90High, 1)}`}
              sub="Wide interval"
            />
          </>
        )}
      </div>
      {uncertainty?.reason && (
        <p className="mt-3 text-[11px] leading-5 text-slate-600">{uncertainty.reason}</p>
      )}
    </SimSignalCard>
  );
}

// ─── Data fetch helpers ───────────────────────────────────────────────────────

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
    cacheLabel: "live fallback",
    stale: false
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MlbGameDetailPage({ params }: PageProps) {
  const { gameId } = await params;
  const decodedId = decodeURIComponent(gameId);
  const cached = await readCachedMlbGameDetail(decodedId);
  const detail = cached
    ? {
      game: cached.row.game,
      projection: cached.row.projection as ProjectionView,
      edge: cached.edge as EdgeResult | null,
      cacheLabel: `${cacheAgeLabel(cached.generatedAt)}${cached.stale ? " · stale" : ""}`,
      stale: cached.stale
    }
    : await buildLiveFallback(decodedId);

  if (!detail) notFound();

  const { game, projection, edge, cacheLabel } = detail;
  const lean = winLean(projection);
  const mlbIntel = projection.mlbIntel;
  const governor = mlbIntel?.governor;
  const lock = mlbIntel?.lock;
  const uncertainty = mlbIntel?.uncertainty;
  const factors = [...(mlbIntel?.factors ?? [])].sort((l, r) => Math.abs(r.value) - Math.abs(l.value)).slice(0, 12);
  const brain = mainBrainLabel("MLB");

  const lineupStatus = lock
    ? lock.startersConfirmed && lock.lineupsConfirmed
      ? "Full lock"
      : lock.startersConfirmed
        ? "Starters only"
        : "Pre-game estimates"
    : null;

  return (
    <div className="space-y-5">
      <SimWorkspaceHeader
        eyebrow="MLB Game Sim"
        title={`${projection.matchup.away} @ ${projection.matchup.home}`}
        description={`${formatTime(game.startTime)} · ${brain} · ${cacheLabel}${lineupStatus ? ` · ${lineupStatus}` : ""}`}
        actions={[
          { href: "/sim/mlb", label: "MLB Board" },
          { href: "/sim/mlb/v7/live", label: "V8 Live" },
          { href: "/sim/mlb/calibration-lab", label: "Calibration Lab" },
          { href: "/mlb-edge", label: "MLB Edge", tone: "primary" }
        ]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <SimDecisionBadge tier={governor?.tier ?? "pass"} />
          {governor?.noBet && (
            <span className="rounded-sm border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-300">
              No-bet active
            </span>
          )}
          {lock && !lock.startersConfirmed && (
            <span className="rounded-sm border border-amber-400/20 bg-amber-500/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-300">
              Lineups estimated
            </span>
          )}
        </div>
      </SimWorkspaceHeader>

      {/* Win probability + score + totals */}
      <WinProbSection projection={projection} edge={edge} />

      {/* Supporting metrics row */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <SimMetricTile label="Home edge" value={plus(mlbIntel?.homeEdge)} sub="Model signal" />
        <SimMetricTile label="Proj total" value={num(mlbIntel?.projectedTotal)} sub="Projected runs" />
        <SimMetricTile
          label="Confidence"
          value={pct(governor?.confidence, 0)}
          sub={governor?.noBet ? "No-bet active" : "Model eligible"}
          emphasis={governor?.noBet ? "muted" : "normal"}
        />
        <SimMetricTile label="Sportsbook" value={edge?.market?.sportsbook ?? "--"} sub={edge?.signal ? `${edge.signal.market} · ${edge.signal.strength}` : "no signal"} emphasis="muted" />
      </section>

      {/* Starters + lineup lock */}
      {lock && <LineupPanel lock={lock} matchup={projection.matchup} />}

      {/* Game intelligence (replaces governor notes) */}
      <GameIntelCard
        governor={governor}
        lockNotes={lock?.notes ?? []}
        read={projection.read}
      />

      {/* Market line */}
      <MarketPanel edge={edge} />

      {/* Model risk */}
      <ModelRiskModule uncertainty={uncertainty} volatilityIndex={mlbIntel?.volatilityIndex} />

      {/* Factor table */}
      {factors.length > 0 && (
        <SimTableShell
          title="Model factors"
          description={`Top ${factors.length} drivers ranked by absolute impact`}
        >
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/[0.08] bg-white/[0.02]">
              <tr>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Factor</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {factors.map((factor) => (
                <tr key={factor.label} className="hover:bg-white/[0.01]">
                  <td className="px-4 py-2.5 text-slate-200">{factor.label}</td>
                  <td className={cn(
                    "px-4 py-2.5 text-right font-mono text-sm tabular-nums",
                    factor.value >= 0 ? "text-mint" : "text-crimson"
                  )}>
                    {plus(factor.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SimTableShell>
      )}
    </div>
  );
}
