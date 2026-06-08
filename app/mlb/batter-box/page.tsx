import Link from "next/link";

import { buildMlbV8PlayerImpactContext } from "@/services/simulation/mlb-v8-player-impact-model";
import {
  projectMlbPlayerStatsForGame,
  type MlbHitterPerGameProjection,
  type MlbPlayerStatProjectionGame,
  type MlbProjectionTeamContext
} from "@/services/simulation/mlb-player-stat-inning-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BatterBoxPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function textParam(search: Record<string, string | string[] | undefined>, key: string) {
  const value = search[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function numberParam(search: Record<string, string | string[] | undefined>, key: string, fallback: number) {
  const value = Number(textParam(search, key));
  return Number.isFinite(value) ? value : fallback;
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function american(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const cls =
    tone === "good"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
        : tone === "bad"
          ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
          : "border-white/10 bg-white/[0.045] text-slate-300";

  return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${cls}`}>{label}</span>;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-xl font-black tracking-tight text-white">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function confidenceTone(value: number) {
  if (value >= 0.75) return "good";
  if (value >= 0.55) return "warn";
  return "bad";
}

function hitterScore(row: MlbHitterPerGameProjection) {
  return row.expectedTotalBases * 0.32 + row.expectedHits * 0.28 + row.expectedHomeRuns * 1.2 + row.expectedRbi * 0.12 + row.expectedRuns * 0.1;
}

function topHitters(projection: MlbPlayerStatProjectionGame) {
  return [...projection.awayHitters, ...projection.homeHitters]
    .sort((a, b) => hitterScore(b) - hitterScore(a))
    .slice(0, 6);
}

function strongestProp(row: MlbHitterPerGameProjection) {
  return row.propSurface?.strongest?.[0] ?? null;
}

function HitterCard({ hitter }: { hitter: MlbHitterPerGameProjection }) {
  const strongest = strongestProp(hitter);
  const drivers = [...(hitter.batterStatProfile?.drivers ?? []), ...(hitter.advancedMatchup?.drivers ?? [])].slice(0, 5);
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-[#06101b]/84 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">#{hitter.battingOrder} · {hitter.team}</div>
          <h3 className="mt-1 font-display text-2xl font-black tracking-tight text-white">{hitter.playerName}</h3>
        </div>
        <Pill label={`${Math.round(hitter.confidence * 100)} conf`} tone={confidenceTone(hitter.confidence)} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <StatTile label="PA" value={num(hitter.expectedPlateAppearances, 2)} />
        <StatTile label="H" value={num(hitter.expectedHits, 3)} sub={pct(hitter.statDistribution.hit1PlusProbability)} />
        <StatTile label="TB" value={num(hitter.expectedTotalBases, 3)} sub={`2+ ${pct(hitter.statDistribution.totalBases2PlusProbability)}`} />
        <StatTile label="HR" value={num(hitter.expectedHomeRuns, 3)} sub={pct(hitter.statDistribution.homeRunProbability)} />
        <StatTile label="BB" value={num(hitter.expectedWalks, 3)} sub={pct(hitter.statDistribution.walk1PlusProbability)} />
        <StatTile label="K" value={num(hitter.expectedStrikeouts, 3)} sub={`2+ ${pct(hitter.statDistribution.strikeout2PlusProbability)}`} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Batter profile</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:grid-cols-4">
            <div>xAVG <span className="font-mono text-white">{num(hitter.batterStatProfile.xAvg, 3)}</span></div>
            <div>xSLG <span className="font-mono text-white">{num(hitter.batterStatProfile.xSlug, 3)}</span></div>
            <div>xwOBA <span className="font-mono text-white">{num(hitter.batterStatProfile.xWoba, 3)}</span></div>
            <div>ISO <span className="font-mono text-white">{num(hitter.batterStatProfile.iso, 3)}</span></div>
            <div>Barrel <span className="font-mono text-white">{pct(hitter.batterStatProfile.barrelRate)}</span></div>
            <div>HardHit <span className="font-mono text-white">{pct(hitter.batterStatProfile.hardHitRate)}</span></div>
            <div>EV <span className="font-mono text-white">{num(hitter.batterStatProfile.avgExitVelocity, 1)}</span></div>
            <div>Sample <span className="font-mono text-white">{hitter.batterStatProfile.plateAppearances}</span></div>
          </div>
        </div>

        <div className="rounded-2xl border border-aqua/15 bg-aqua/[0.045] p-3">
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-aqua">Top model prop</div>
          {strongest ? (
            <div className="mt-2">
              <div className="font-display text-lg font-black text-white">{strongest.market} {strongest.side} {strongest.line}</div>
              <div className="mt-1 text-xs text-slate-400">{pct(strongest.probability)} · fair {american(strongest.fairAmerican)}</div>
              <div className="mt-1 text-xs text-slate-500">Confidence {pct(strongest.confidence)}</div>
            </div>
          ) : <div className="mt-2 text-xs text-slate-500">No prop surface available.</div>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {drivers.length ? drivers.map((driver) => <Pill key={`${hitter.playerId}-${driver}`} label={driver.replace(/-/g, " ")} tone="neutral" />) : <Pill label="neutral profile" />}
      </div>
    </article>
  );
}

function TeamTable({ label, hitters }: { label: string; hitters: MlbHitterPerGameProjection[] }) {
  return (
    <section className="rounded-[1.45rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Batter box</div>
          <h2 className="font-display text-2xl font-black tracking-tight text-white">{label}</h2>
        </div>
        <Pill label={`${hitters.length} hitters`} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-xs">
          <thead className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <tr className="border-b border-white/10">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Player</th>
              <th className="py-2 pr-3 text-right">PA</th>
              <th className="py-2 pr-3 text-right">H</th>
              <th className="py-2 pr-3 text-right">TB</th>
              <th className="py-2 pr-3 text-right">HR</th>
              <th className="py-2 pr-3 text-right">R</th>
              <th className="py-2 pr-3 text-right">RBI</th>
              <th className="py-2 pr-3 text-right">BB</th>
              <th className="py-2 pr-3 text-right">K</th>
              <th className="py-2 pr-3 text-right">1+H</th>
              <th className="py-2 pr-3 text-right">2+TB</th>
              <th className="py-2 pr-3 text-right">HR%</th>
              <th className="py-2 text-right">Conf</th>
            </tr>
          </thead>
          <tbody>
            {hitters.map((hitter) => (
              <tr key={hitter.playerId} className="border-b border-white/[0.06] text-slate-300">
                <td className="py-2.5 pr-3 font-mono text-slate-500">{hitter.battingOrder}</td>
                <td className="py-2.5 pr-3 font-semibold text-white">{hitter.playerName}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expectedPlateAppearances, 2)}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expectedHits, 3)}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expectedTotalBases, 3)}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expectedHomeRuns, 3)}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expectedRuns, 3)}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expectedRbi, 3)}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expectedWalks, 3)}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expectedStrikeouts, 3)}</td>
                <td className="py-2.5 pr-3 text-right font-mono text-aqua">{pct(hitter.statDistribution.hit1PlusProbability)}</td>
                <td className="py-2.5 pr-3 text-right font-mono text-aqua">{pct(hitter.statDistribution.totalBases2PlusProbability)}</td>
                <td className="py-2.5 pr-3 text-right font-mono text-aqua">{pct(hitter.statDistribution.homeRunProbability)}</td>
                <td className="py-2.5 text-right font-mono">{pct(hitter.confidence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function loadProjection(search: Record<string, string | string[] | undefined>) {
  const gameId = textParam(search, "gameId");
  const awayTeam = textParam(search, "awayTeam").toUpperCase();
  const homeTeam = textParam(search, "homeTeam").toUpperCase();
  if (!gameId || !awayTeam || !homeTeam) return { projection: null as MlbPlayerStatProjectionGame | null, error: null as string | null, paramsReady: false };

  const context = await buildMlbV8PlayerImpactContext({ gameId, awayTeam, homeTeam });
  if (!context.available || !context.away || !context.home) {
    return { projection: null, error: context.reason ?? "Roster intelligence unavailable for this game.", paramsReady: true };
  }

  const projection = projectMlbPlayerStatsForGame({
    away: context.away as MlbProjectionTeamContext,
    home: context.home as MlbProjectionTeamContext,
    awayRuns: numberParam(search, "awayProjectedRuns", numberParam(search, "awayRuns", 4.3)),
    homeRuns: numberParam(search, "homeProjectedRuns", numberParam(search, "homeRuns", 4.5)),
    awayOffenseScore: numberParam(search, "awayOffenseScore", 70),
    homeOffenseScore: numberParam(search, "homeOffenseScore", 70),
    awayWinProbability: numberParam(search, "awayWinProbability", 0.5),
    homeWinProbability: numberParam(search, "homeWinProbability", 0.5)
  });

  return { projection, error: null, paramsReady: true };
}

export default async function MlbBatterBoxPage({ searchParams }: BatterBoxPageProps) {
  const search = (await searchParams) ?? {};
  const { projection, error, paramsReady } = await loadProjection(search);
  const leaders = projection ? topHitters(projection) : [];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02060b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(0,210,255,0.18),transparent_24rem),radial-gradient(circle_at_100%_10%,rgba(45,212,191,0.10),transparent_18rem),linear-gradient(180deg,#02060b_0%,#050b13_55%,#02060b_100%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-5 px-3 pb-24 pt-3 sm:px-5 md:pb-10">
        <header className="rounded-[1.35rem] border border-white/10 bg-[#06101b]/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.30)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-2xl border border-aqua/30 bg-aqua/10 font-display text-lg font-black text-aqua">S</span><span><span className="block text-[10px] font-black uppercase tracking-[0.28em] text-aqua">SharkEdge</span><span className="block text-[11px] text-slate-500">MLB batter box score</span></span></Link>
            <div className="flex flex-wrap items-center gap-2"><Link href="/sim" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 hover:text-aqua">SimHub</Link><Link href="/mlb/batter-box" className="rounded-full border border-aqua/25 bg-aqua/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-aqua">Batter Box</Link></div>
          </div>
        </header>

        <section className="rounded-[1.75rem] border border-aqua/25 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.20),transparent_18rem),linear-gradient(135deg,rgba(5,18,32,0.98),rgba(2,7,13,0.98))] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.36)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-aqua">Player-stat simulation</div>
              <h1 className="mt-3 max-w-4xl font-display text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white sm:text-6xl">MLB Batter Box Score</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">A projection-first box score for every hitter: expected PA, hits, total bases, HR, runs, RBI, walks, strikeouts, stat distributions, prop surface, and matchup drivers.</p>
            </div>
            {projection ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-right"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Matchup</div><div className="mt-1 font-display text-2xl font-black text-white">{projection.awayTeam} @ {projection.homeTeam}</div><div className="mt-1 text-xs text-slate-500">{projection.awayHitters.length + projection.homeHitters.length} hitters loaded</div></div> : null}
          </div>
        </section>

        {!paramsReady ? (
          <section className="rounded-[1.45rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Load a game</div>
            <h2 className="mt-2 font-display text-2xl font-black tracking-tight text-white">Provide game query params</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">Use this route with the game id and teams:</p>
            <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-slate-300">/mlb/batter-box?gameId=GAME_ID&amp;awayTeam=CHC&amp;homeTeam=STL&amp;awayProjectedRuns=4.3&amp;homeProjectedRuns=4.5</pre>
          </section>
        ) : error ? (
          <section className="rounded-[1.45rem] border border-amber-400/20 bg-amber-400/[0.06] p-5">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Unavailable</div>
            <h2 className="mt-2 font-display text-2xl font-black tracking-tight text-white">Batter box score could not load</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">{error}</p>
          </section>
        ) : projection ? (
          <>
            <section className="grid gap-4 lg:grid-cols-3">
              <StatTile label="Away hitters" value={String(projection.awayHitters.length)} sub={projection.awayTeam} />
              <StatTile label="Home hitters" value={String(projection.homeHitters.length)} sub={projection.homeTeam} />
              <StatTile label="Warnings" value={String(projection.warnings.length)} sub={projection.warnings[0] ?? "No projection warnings"} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              {leaders.map((hitter) => <HitterCard key={`leader-${hitter.playerId}`} hitter={hitter} />)}
            </section>

            <TeamTable label={projection.awayTeam} hitters={projection.awayHitters} />
            <TeamTable label={projection.homeTeam} hitters={projection.homeHitters} />
          </>
        ) : null}
      </div>
    </main>
  );
}
