import Link from "next/link";

import { PitchingSnapshot } from "@/app/mlb/batter-box/PitchingSnapshot";
import { PlateAppearanceSnapshot, PlateAppearanceSummaryStrip } from "@/app/mlb/batter-box/PlateAppearanceSnapshot";
import { loadMlbBatterBoxProjection, type MlbBatterBoxDiagnostics } from "@/services/simulation/mlb-batter-box-loader";
import { buildMlbPlateAppearanceGameScript } from "@/services/simulation/mlb-plate-appearance-game-script";
import {
  buildMlbSimulatedBoxScore,
  type MlbSimulatedGameBoxScore,
  type MlbSimulatedHitterBoxScore,
  type MlbSimulatedTeamBoxScore
} from "@/services/simulation/mlb-simulated-box-score";
import { buildMlbSimulatedPitchingBoxScores } from "@/services/simulation/mlb-simulated-pitching-box-score";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BatterBoxPageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
type Tone = "neutral" | "good" | "warn" | "bad";

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function toneForLabel(value: string): Tone {
  if (value === "HIGH") return "good";
  if (value === "MEDIUM") return "warn";
  return "bad";
}

function toneForTier(value: string): Tone {
  if (value === "ALPHA" || value === "PLUS") return "good";
  if (value === "VOLATILE") return "warn";
  if (value === "LOW_SIGNAL") return "bad";
  return "neutral";
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const cls = tone === "good"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : tone === "warn"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
      : tone === "bad"
        ? "border-rose-400/25 bg-rose-400/[0.10] text-rose-200"
        : "border-white/10 bg-white/[0.045] text-slate-300";
  return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${cls}`}>{label}</span>;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-xl font-black tracking-tight text-white">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function optionHref(option: { gameId: string; awayTeam: string; homeTeam: string }) {
  return `/mlb/batter-box?gameId=${encodeURIComponent(option.gameId)}&awayTeam=${encodeURIComponent(option.awayTeam)}&homeTeam=${encodeURIComponent(option.homeTeam)}`;
}

function lineText(row: MlbSimulatedHitterBoxScore) {
  return `${row.likelyLine.atBats}-${row.likelyLine.hits}, ${row.likelyLine.totalBases} TB, ${row.likelyLine.runs} R, ${row.likelyLine.rbi} RBI, ${row.likelyLine.walks} BB, ${row.likelyLine.strikeouts} K`;
}

function rangeText(row: MlbSimulatedHitterBoxScore) {
  return `H ${num(row.range.floor.hits, 1)}-${num(row.range.ceiling.hits, 1)} · TB ${num(row.range.floor.totalBases, 1)}-${num(row.range.ceiling.totalBases, 1)} · HR ${num(row.range.floor.homeRuns, 2)}-${num(row.range.ceiling.homeRuns, 2)}`;
}

function GameSelector({ diagnostics }: { diagnostics: MlbBatterBoxDiagnostics }) {
  if (!diagnostics.gameOptions.length) return null;
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Auto-discovered games</div>
          <h2 className="font-display text-2xl font-black tracking-tight text-white">Simulation Matchups</h2>
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
  const c = diagnostics.counts;
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
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
        <Tile label="Away hitters" value={String(c.awayHitters)} sub={diagnostics.searched.awayTeam ?? "—"} />
        <Tile label="Home hitters" value={String(c.homeHitters)} sub={diagnostics.searched.homeTeam ?? "—"} />
        <Tile label="Away pitchers" value={String(c.awayPitchers)} sub={diagnostics.searched.awayTeam ?? "—"} />
        <Tile label="Home pitchers" value={String(c.homePitchers)} sub={diagnostics.searched.homeTeam ?? "—"} />
        <Tile label="Away lineup" value={String(c.awayLineups)} sub={diagnostics.searched.gameId ?? "—"} />
        <Tile label="Home lineup" value={String(c.homeLineups)} sub={diagnostics.searched.gameId ?? "—"} />
      </div>
      {error ? <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-3 text-sm leading-6 text-rose-100">{error}</div> : null}
      {diagnostics.warnings.length ? (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-sm leading-6 text-amber-100">
          {diagnostics.warnings.map((warning) => <div key={warning}>• {warning}</div>)}
        </div>
      ) : null}
    </section>
  );
}

function GameSummary({ boxScore }: { boxScore: MlbSimulatedGameBoxScore }) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <Tile label="Projected runs" value={num(boxScore.gameTotals.projectedRuns, 2)} sub={`${boxScore.awayTeam.team} ${num(boxScore.awayTeam.totals.projectedRuns, 2)} · ${boxScore.homeTeam.team} ${num(boxScore.homeTeam.totals.projectedRuns, 2)}`} />
      <Tile label="Projected hits" value={num(boxScore.gameTotals.projectedHits, 2)} sub={`${boxScore.gameScript.contactEnvironment.toLowerCase()} contact`} />
      <Tile label="Total bases" value={num(boxScore.gameTotals.projectedTotalBases, 2)} sub={`${boxScore.gameScript.powerEnvironment.toLowerCase()} power`} />
      <Tile label="Home runs" value={num(boxScore.gameTotals.projectedHomeRuns, 2)} sub="simulation mean" />
      <Tile label="Walks" value={num(boxScore.gameTotals.projectedWalks, 2)} sub="plate discipline" />
      <Tile label="Strikeouts" value={num(boxScore.gameTotals.projectedStrikeouts, 2)} sub={`${boxScore.gameScript.strikeoutEnvironment.toLowerCase()} K pressure`} />
    </section>
  );
}

function GameScriptPanel({ boxScore }: { boxScore: MlbSimulatedGameBoxScore }) {
  return (
    <section className="rounded-[1.35rem] border border-aqua/20 bg-aqua/[0.045] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Game script</div>
          <h2 className="font-display text-2xl font-black tracking-tight text-white">Simulation Read</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill label={`scoring ${boxScore.gameScript.scoringEnvironment}`} tone={toneForLabel(boxScore.gameScript.scoringEnvironment)} />
          <Pill label={`power ${boxScore.gameScript.powerEnvironment}`} tone={toneForLabel(boxScore.gameScript.powerEnvironment)} />
          <Pill label={`vol ${boxScore.gameScript.volatilityEnvironment}`} tone={toneForLabel(boxScore.gameScript.volatilityEnvironment)} />
        </div>
      </div>
      <div className="text-sm leading-7 text-slate-300">{boxScore.gameScript.summary}</div>
    </section>
  );
}

function TeamSummary({ team }: { team: MlbSimulatedTeamBoxScore }) {
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Projected team line</div>
          <h2 className="font-display text-2xl font-black tracking-tight text-white">{team.team}</h2>
        </div>
        <Pill label={`${num(team.totals.projectedRuns, 2)} runs`} tone={toneForLabel(team.profile.runEnvironment)} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Tile label="H" value={num(team.totals.hits, 2)} sub={team.profile.contactGrade.toLowerCase()} />
        <Tile label="TB" value={num(team.totals.totalBases, 2)} sub={team.profile.powerGrade.toLowerCase()} />
        <Tile label="HR" value={num(team.totals.homeRuns, 2)} />
        <Tile label="BB" value={num(team.totals.walks, 2)} />
        <Tile label="K" value={num(team.totals.strikeouts, 2)} sub={`${team.profile.strikeoutRisk.toLowerCase()} risk`} />
        <Tile label="Conf" value={pct(team.profile.averageConfidence)} />
      </div>
      <div className="mt-3 text-xs leading-6 text-slate-400">{team.profile.gameScript}</div>
    </section>
  );
}

function HitterCard({ hitter }: { hitter: MlbSimulatedHitterBoxScore }) {
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-[#06101b]/84 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">#{hitter.battingOrder} · {hitter.team}</div>
          <h3 className="mt-1 font-display text-2xl font-black tracking-tight text-white">{hitter.playerName}</h3>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Pill label={titleCase(hitter.tier)} tone={toneForTier(hitter.tier)} />
          <Pill label={`${Math.round(hitter.confidence * 100)} conf`} tone={hitter.confidence >= 0.75 ? "good" : hitter.confidence >= 0.55 ? "warn" : "bad"} />
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-aqua/15 bg-aqua/[0.045] p-3">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-aqua">Likely simulated line</div>
        <div className="mt-1 font-display text-xl font-black text-white">{lineText(hitter)}</div>
        <div className="mt-1 text-xs text-slate-400">{hitter.summary}</div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Tile label="PA" value={num(hitter.expected.plateAppearances, 2)} />
        <Tile label="H" value={num(hitter.expected.hits, 3)} sub={pct(hitter.probabilities.hit1Plus)} />
        <Tile label="TB" value={num(hitter.expected.totalBases, 3)} sub={`2+ ${pct(hitter.probabilities.totalBases2Plus)}`} />
        <Tile label="HR" value={num(hitter.expected.homeRuns, 3)} sub={pct(hitter.probabilities.homeRun)} />
        <Tile label="BB" value={num(hitter.expected.walks, 3)} sub={pct(hitter.probabilities.walk1Plus)} />
        <Tile label="K" value={num(hitter.expected.strikeouts, 3)} sub={`2+ ${pct(hitter.probabilities.strikeout2Plus)}`} />
      </div>
      <div className="mt-3 text-xs leading-6 text-slate-400">{rangeText(hitter)} · matchup edge {num(hitter.matchupEdge, 1)} · volatility {hitter.volatilityLabel}</div>
    </article>
  );
}

function HitterStrip({ sectionTitle, hitters, empty }: { sectionTitle: string; hitters: MlbSimulatedHitterBoxScore[]; empty: string }) {
  const alphaSection = sectionTitle === "Alpha bats";
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Elite grouping</div>
          <h2 className="font-display text-2xl font-black tracking-tight text-white">{sectionTitle}</h2>
        </div>
        <Pill label={`${hitters.length} hitters`} />
      </div>
      {hitters.length ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {hitters.slice(0, 8).map((hitter) => (
            <div key={`${sectionTitle}-${hitter.playerId}`} className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-white">{hitter.playerName}</div>
                <Pill label={alphaSection ? titleCase(hitter.tier) : hitter.volatilityLabel} tone={alphaSection ? toneForTier(hitter.tier) : toneForLabel(hitter.volatilityLabel)} />
              </div>
              <div className="mt-1 text-xs text-slate-400">{hitter.team} · {lineText(hitter)}</div>
              <div className="mt-1 text-xs text-slate-500">{rangeText(hitter)}</div>
            </div>
          ))}
        </div>
      ) : <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-slate-400">{empty}</div>}
    </section>
  );
}

function TeamTable({ team }: { team: MlbSimulatedTeamBoxScore }) {
  return (
    <section className="rounded-[1.45rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Simulated box score</div>
          <h2 className="font-display text-2xl font-black tracking-tight text-white">{team.team}</h2>
        </div>
        <Pill label={`${team.hitters.length} hitters`} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1320px] w-full text-left text-xs">
          <thead className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <tr className="border-b border-white/10"><th className="py-2 pr-3">#</th><th className="py-2 pr-3">Player</th><th className="py-2 pr-3">Tier</th><th className="py-2 pr-3">Likely line</th><th className="py-2 pr-3">Range</th><th className="py-2 pr-3 text-right">PA</th><th className="py-2 pr-3 text-right">AB</th><th className="py-2 pr-3 text-right">H</th><th className="py-2 pr-3 text-right">TB</th><th className="py-2 pr-3 text-right">HR</th><th className="py-2 pr-3 text-right">R</th><th className="py-2 pr-3 text-right">RBI</th><th className="py-2 pr-3 text-right">BB</th><th className="py-2 pr-3 text-right">K</th><th className="py-2 pr-3 text-right">1+H</th><th className="py-2 pr-3 text-right">2+TB</th><th className="py-2 pr-3 text-right">HR%</th><th className="py-2 text-right">Conf</th></tr>
          </thead>
          <tbody>
            {team.hitters.map((hitter) => (
              <tr key={hitter.playerId} className="border-b border-white/[0.06] text-slate-300"><td className="py-2.5 pr-3 font-mono text-slate-500">{hitter.battingOrder}</td><td className="py-2.5 pr-3 font-semibold text-white">{hitter.playerName}</td><td className="py-2.5 pr-3"><Pill label={titleCase(hitter.tier)} tone={toneForTier(hitter.tier)} /></td><td className="py-2.5 pr-3 text-slate-400">{lineText(hitter)}</td><td className="py-2.5 pr-3 text-slate-500">{rangeText(hitter)}</td><td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expected.plateAppearances, 2)}</td><td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expected.atBats, 2)}</td><td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expected.hits, 3)}</td><td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expected.totalBases, 3)}</td><td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expected.homeRuns, 3)}</td><td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expected.runs, 3)}</td><td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expected.rbi, 3)}</td><td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expected.walks, 3)}</td><td className="py-2.5 pr-3 text-right font-mono">{num(hitter.expected.strikeouts, 3)}</td><td className="py-2.5 pr-3 text-right font-mono text-aqua">{pct(hitter.probabilities.hit1Plus)}</td><td className="py-2.5 pr-3 text-right font-mono text-aqua">{pct(hitter.probabilities.totalBases2Plus)}</td><td className="py-2.5 pr-3 text-right font-mono text-aqua">{pct(hitter.probabilities.homeRun)}</td><td className="py-2.5 text-right font-mono">{pct(hitter.confidence)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function offenseForPitching(team: MlbSimulatedTeamBoxScore) {
  return { team: team.team, projectedRuns: team.totals.projectedRuns, plateAppearances: team.totals.plateAppearances, hits: team.totals.hits, totalBases: team.totals.totalBases, homeRuns: team.totals.homeRuns, walks: team.totals.walks, strikeouts: team.totals.strikeouts };
}

export default async function MlbBatterBoxPage({ searchParams }: BatterBoxPageProps) {
  const search = (await searchParams) ?? {};
  const { projection, diagnostics, error } = await loadMlbBatterBoxProjection(search);
  const boxScore = projection ? buildMlbSimulatedBoxScore(projection) : null;
  const pitching = projection && boxScore ? buildMlbSimulatedPitchingBoxScores({ projection, awayOffense: offenseForPitching(boxScore.awayTeam), homeOffense: offenseForPitching(boxScore.homeTeam) }) : null;
  const plateAppearanceScript = projection && boxScore && pitching ? buildMlbPlateAppearanceGameScript({ projection, boxScore, awayPitching: pitching.awayPitching, homePitching: pitching.homePitching }) : null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02060b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(0,210,255,0.18),transparent_24rem),radial-gradient(circle_at_100%_10%,rgba(45,212,191,0.10),transparent_18rem),linear-gradient(180deg,#02060b_0%,#050b13_55%,#02060b_100%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-5 px-3 pb-24 pt-3 sm:px-5 md:pb-10">
        <header className="rounded-[1.35rem] border border-white/10 bg-[#06101b]/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.30)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-2xl border border-aqua/30 bg-aqua/10 font-display text-lg font-black text-aqua">S</span><span><span className="block text-[10px] font-black uppercase tracking-[0.28em] text-aqua">SharkEdge</span><span className="block text-[11px] text-slate-500">MLB simulated box score</span></span></Link>
            <div className="flex flex-wrap items-center gap-2"><Link href="/sim" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 hover:text-aqua">SimHub</Link><Link href="/mlb/batter-box" className="rounded-full border border-aqua/25 bg-aqua/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-aqua">Batter Box</Link></div>
          </div>
        </header>

        <section className="rounded-[1.75rem] border border-aqua/25 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.20),transparent_18rem),linear-gradient(135deg,rgba(5,18,32,0.98),rgba(2,7,13,0.98))] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.36)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-aqua">Simulation-only prediction</div>
              <h1 className="mt-3 max-w-4xl font-display text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white sm:text-6xl">MLB Simulated Box Score</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">Projected batter and pitching stat lines from the simulation engine. The plate-appearance window layer is now surfaced directly in the box-score summary.</p>
            </div>
            {diagnostics.selectedGame ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-right"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Selected</div><div className="mt-1 font-display text-2xl font-black text-white">{diagnostics.selectedGame.awayTeam} @ {diagnostics.selectedGame.homeTeam}</div><div className="mt-1 text-xs text-slate-500">{diagnostics.selectedGame.source} · {boxScore ? `${boxScore.alphaHitters.length} alpha/plus bats` : "not loaded"}</div></div> : null}
          </div>
        </section>

        <GameSelector diagnostics={diagnostics} />
        <DiagnosticsPanel diagnostics={diagnostics} error={error} />

        {boxScore ? (
          <>
            <GameScriptPanel boxScore={boxScore} />
            <GameSummary boxScore={boxScore} />
            {plateAppearanceScript ? <PlateAppearanceSummaryStrip script={plateAppearanceScript} /> : null}
            <section className="grid gap-4 lg:grid-cols-2"><TeamSummary team={boxScore.awayTeam} /><TeamSummary team={boxScore.homeTeam} /></section>
            {pitching ? <PitchingSnapshot awayPitching={pitching.awayPitching} homePitching={pitching.homePitching} matchup={pitching.pitchingMatchup} reconciliation={pitching.reconciliation} /> : null}
            <HitterStrip sectionTitle="Alpha bats" hitters={boxScore.alphaHitters} empty="No alpha/plus hitters in this simulation." />
            <HitterStrip sectionTitle="Volatile ceiling bats" hitters={boxScore.volatileCeilingHitters} empty="No high-volatility ceiling hitters in this simulation." />
            <section className="grid gap-4 lg:grid-cols-2">{boxScore.topProjectedHitters.slice(0, 6).map((hitter) => <HitterCard key={`leader-${hitter.playerId}`} hitter={hitter} />)}</section>
            {plateAppearanceScript ? <PlateAppearanceSnapshot script={plateAppearanceScript} /> : null}
            <TeamTable team={boxScore.awayTeam} />
            <TeamTable team={boxScore.homeTeam} />
            <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-slate-400"><div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Model notes</div>{boxScore.notes.map((note) => <div key={note}>• {note}</div>)}{projection?.warnings.map((warning) => <div key={warning}>• {warning}</div>)}</section>
          </>
        ) : null}
      </div>
    </main>
  );
}
