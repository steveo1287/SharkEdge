import Link from "next/link";

import { loadMlbBatterBoxProjection, type MlbBatterBoxDiagnostics } from "@/services/simulation/mlb-batter-box-loader";
import type { MlbHitterPerGameProjection, MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BatterBoxPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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

function countTone(value: number, min: number) {
  if (value >= min) return "good";
  if (value > 0) return "warn";
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

function optionHref(option: { gameId: string; awayTeam: string; homeTeam: string }) {
  return `/mlb/batter-box?gameId=${encodeURIComponent(option.gameId)}&awayTeam=${encodeURIComponent(option.awayTeam)}&homeTeam=${encodeURIComponent(option.homeTeam)}`;
}

function GameSelector({ diagnostics }: { diagnostics: MlbBatterBoxDiagnostics }) {
  if (!diagnostics.gameOptions.length) return null;
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Auto-discovered games</div>
          <h2 className="font-display text-2xl font-black tracking-tight text-white">Batter Box Matchups</h2>
        </div>
        <Pill label={`${diagnostics.gameOptions.length} options`} />
      </div>
      <div className="flex flex-wrap gap-2">
        {diagnostics.gameOptions.map((option) => {
          const selected = diagnostics.selectedGame?.gameId === option.gameId && diagnostics.selectedGame?.awayTeam === option.awayTeam && diagnostics.selectedGame?.homeTeam === option.homeTeam;
          return (
            <Link key={`${option.gameId}-${option.awayTeam}-${option.homeTeam}`} href={optionHref(option)} className={`rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] ${selected ? "border-aqua/40 bg-aqua/15 text-aqua" : "border-white/10 bg-black/20 text-slate-300 hover:text-aqua"}`}>
              {option.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function DiagnosticsPanel({ diagnostics, error }: { diagnostics: MlbBatterBoxDiagnostics; error: string | null }) {
  const counts = diagnostics.counts;
  return (
    <section className="rounded-[1.45rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Railway data diagnostics</div>
          <h2 className="font-display text-2xl font-black tracking-tight text-white">Population Status</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill label={diagnostics.databaseReady ? "DB connected" : "DB missing"} tone={diagnostics.databaseReady ? "good" : "bad"} />
          <Pill label={diagnostics.selectedGame?.source ?? "no game"} tone={diagnostics.selectedGame ? "good" : "bad"} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Away hitters" value={String(counts.awayHitters)} sub={diagnostics.searched.awayTeam ?? "—"} />
        <StatTile label="Home hitters" value={String(counts.homeHitters)} sub={diagnostics.searched.homeTeam ?? "—"} />
        <StatTile label="Away pitchers" value={String(counts.awayPitchers)} sub={diagnostics.searched.awayTeam ?? "—"} />
        <StatTile label="Home pitchers" value={String(counts.homePitchers)} sub={diagnostics.searched.homeTeam ?? "—"} />
        <StatTile label="Away lineup" value={String(counts.awayLineups)} sub={diagnostics.searched.gameId ?? "—"} />
        <StatTile label="Home lineup" value={String(counts.homeLineups)} sub={diagnostics.searched.gameId ?? "—"} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Pill label={`away hitters ${counts.awayHitters}`} tone={countTone(counts.awayHitters, 5)} />
        <Pill label={`home hitters ${counts.homeHitters}`} tone={countTone(counts.homeHitters, 5)} />
        <Pill label={`away pitchers ${counts.awayPitchers}`} tone={countTone(counts.awayPitchers, 1)} />
        <Pill label={`home pitchers ${counts.homePitchers}`} tone={countTone(counts.homePitchers, 1)} />
        <Pill label={`away lineup ${counts.awayLineups}`} tone={counts.awayLineups > 0 ? "good" : "warn"} />
        <Pill label={`home lineup ${counts.homeLineups}`} tone={counts.homeLineups > 0 ? "good" : "warn"} />
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-3 text-sm leading-6 text-rose-100">{error}</div> : null}
      {diagnostics.warnings.length ? (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-sm leading-6 text-amber-100">
          {diagnostics.warnings.map((warning) => <div key={warning}>• {warning}</div>)}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm leading-6 text-emerald-100">Required hitter and pitcher rating rows are available. Lineup rows improve order/starter confidence but are not required for ratings-order fallback.</div>
      )}
    </section>
  );
}

function HitterCard({ hitter }: { hitter: MlbHitterPerGameProjection }) {
  const strongest = strongestProp(hitter);
  const drivers = [...(hitter.batterStatProfile?.drivers ?? []), ...(hitter.advancedMatchup?.drivers ?? []), ...(hitter.eliteContext?.drivers ?? [])].slice(0, 7);
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
              <th className="py-2 pr-3">#</th><th className="py-2 pr-3">Player</th><th className="py-2 pr-3 text-right">PA</th><th className="py-2 pr-3 text-right">H</th><th className="py-2 pr-3 text-right">TB</th><th className="py-2 pr-3 text-right">HR</th><th className="py-2 pr-3 text-right">R</th><th className="py-2 pr-3 text-right">RBI</th><th className="py-2 pr-3 text-right">BB</th><th className="py-2 pr-3 text-right">K</th><th className="py-2 pr-3 text-right">1+H</th><th className="py-2 pr-3 text-right">2+TB</th><th className="py-2 pr-3 text-right">HR%</th><th className="py-2 text-right">Conf</th>
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

export default async function MlbBatterBoxPage({ searchParams }: BatterBoxPageProps) {
  const search = (await searchParams) ?? {};
  const { projection, diagnostics, error } = await loadMlbBatterBoxProjection(search);
  const leaders = projection ? topHitters(projection) : [];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02060b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(0,210,255,0.18),transparent_24rem),radial-gradient(circle_at_100%_10%,rgba(45,212,191,0.10),transparent_18rem),linear-gradient(180deg,#02060b_0%,#050b13_55%,#02060b_100%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-5 px-3 pb-24 pt-3 sm:px-5 md:pb-10">
        <header className="rounded-[1.35rem] border border-white/10 bg-[#06101b]/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.30)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-2xl border border-aqua/30 bg-aqua/10 font-display text-lg font-black text-aqua">S</span><span><span className="block text-[10px] font-black uppercase tracking-[0.28em] text-aqua">SharkEdge</span><span className="block text-[11px] text-slate-500">MLB batter box score</span></span></Link>
            <div className="flex flex-wrap items-center gap-2"><Link href="/sim" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 hover:text-aqua">SimHub</Link><Link href="/mlb/player-prop-calibration" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 hover:text-aqua">Calibration</Link><Link href="/mlb/batter-box" className="rounded-full border border-aqua/25 bg-aqua/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-aqua">Batter Box</Link></div>
          </div>
        </header>

        <section className="rounded-[1.75rem] border border-aqua/25 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.20),transparent_18rem),linear-gradient(135deg,rgba(5,18,32,0.98),rgba(2,7,13,0.98))] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.36)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-aqua">Player-stat simulation</div>
              <h1 className="mt-3 max-w-4xl font-display text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white sm:text-6xl">MLB Batter Box Score</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">Auto-loads the best available MLB matchup from Railway data. If lineup snapshots are missing, it falls back to rating-derived batting order so the projection table still populates.</p>
            </div>
            {diagnostics.selectedGame ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-right"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Selected</div><div className="mt-1 font-display text-2xl font-black text-white">{diagnostics.selectedGame.awayTeam} @ {diagnostics.selectedGame.homeTeam}</div><div className="mt-1 text-xs text-slate-500">{diagnostics.selectedGame.source} · {projection ? `${projection.awayHitters.length + projection.homeHitters.length} hitters loaded` : "not loaded"}</div></div> : null}
          </div>
        </section>

        <GameSelector diagnostics={diagnostics} />
        <DiagnosticsPanel diagnostics={diagnostics} error={error} />

        {projection ? (
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
