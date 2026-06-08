import type { MlbMatchupTraitEngine, MlbMatchupTraitRow } from "@/services/simulation/mlb-matchup-trait-engine";

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function toneForTrait(value: string): "neutral" | "good" | "warn" | "bad" {
  if (value === "ELITE_EDGE" || value === "ADVANTAGE") return "good";
  if (value === "RISK") return "warn";
  if (value === "AVOID") return "bad";
  return "neutral";
}

function Pill({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const cls = tone === "good"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : tone === "warn"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
      : tone === "bad"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
        : "border-white/10 bg-white/[0.045] text-slate-300";
  return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${cls}`}>{text}</span>;
}

function TraitCard({ row, title }: { row: MlbMatchupTraitRow; title: string }) {
  return (
    <article className="rounded-2xl border border-violet-400/15 bg-[#06101b]/90 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-violet-200">{title}</div>
          <div className="mt-1 font-display text-xl font-black text-white">{row.playerName}</div>
          <div className="mt-1 text-xs text-slate-500">{row.team} · #{row.battingOrder} · {row.batterHand} vs {row.opponentStarterHand}</div>
        </div>
        <Pill text={label(row.traitLabel)} tone={toneForTrait(row.traitLabel)} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-300">
        <div>Trait <span className="font-mono text-white">{num(row.traitScore, 1)}</span></div>
        <div>Pitch <span className="font-mono text-white">{num(row.pitchTypeScore, 1)}</span></div>
        <div>Platoon <span className="font-mono text-white">{num(row.platoonScore, 1)}</span></div>
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 text-slate-400">
        {label(row.batterTrait)} hitter vs {label(row.starterTrait)} starter · H {num(row.deltas.hits, 2)} · TB {num(row.deltas.totalBases, 2)} · HR {num(row.deltas.homeRuns, 2)} · K {num(row.deltas.strikeouts, 2)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {row.drivers.slice(0, 3).map((driver) => <Pill key={`${row.playerId}-${title}-${driver}`} text={driver} />)}
      </div>
    </article>
  );
}

function MiniList({ title, rows, tone }: { title: string; rows: MlbMatchupTraitRow[]; tone?: "neutral" | "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</div>
        <Pill text={String(rows.length)} tone={tone} />
      </div>
      <div className="grid gap-2">
        {rows.slice(0, 4).map((row) => (
          <div key={`${title}-${row.playerId}`} className="flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0"><span className="font-semibold text-white">{row.playerName}</span> <span className="text-slate-500">{row.team}</span></div>
            <div className="shrink-0 font-mono text-violet-200">{num(row.traitScore, 1)}</div>
          </div>
        ))}
        {!rows.length ? <div className="text-xs text-slate-500">No flagged spots.</div> : null}
      </div>
    </div>
  );
}

export function MatchupTraitStrip({ context }: { context: MlbMatchupTraitEngine }) {
  const top = context.topTraitAdvantages[0];
  const power = context.topPowerAdvantages[0];
  const contact = context.topContactAdvantages[0];
  const risk = context.topStrikeoutRisks[0];
  return (
    <section className="rounded-[1.45rem] border border-violet-400/20 bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.14),transparent_18rem),rgba(6,16,27,0.82)] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.24)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-200">Handedness · pitch mix · matchup traits</div>
          <h2 className="font-display text-3xl font-black tracking-tight text-white">Matchup Trait Edge</h2>
          <div className="mt-1 text-sm leading-6 text-slate-400">{context.summary}</div>
        </div>
        <div className="flex flex-wrap gap-2"><Pill text={`${context.awayTeam.team} vs ${context.awayTeam.opponentStarterHand}HP`} /><Pill text={`${context.homeTeam.team} vs ${context.homeTeam.opponentStarterHand}HP`} /></div>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {top ? <TraitCard row={top} title="Top trait edge" /> : null}
        {power ? <TraitCard row={power} title="Power trait" /> : null}
        {contact ? <TraitCard row={contact} title="Contact trait" /> : null}
        {risk ? <TraitCard row={risk} title="K-risk trait" /> : null}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <MiniList title="Pitch-mix edges" rows={context.topPitchMixEdges} tone="good" />
        <MiniList title="Platoon edges" rows={context.topPlatoonEdges} tone="good" />
        <MiniList title="Strikeout risks" rows={context.topStrikeoutRisks} tone="bad" />
        <MiniList title="Avoid spots" rows={context.avoidSpots} tone="warn" />
      </div>
    </section>
  );
}
