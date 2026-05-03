import type { UfcCardSourceConsensus } from "@/services/ufc/source-consensus";

function tone(grade: string) {
  if (grade === "HIGH") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  if (grade === "MEDIUM") return "border-aqua/25 bg-aqua/10 text-aqua";
  if (grade === "LOW") return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  return "border-rose-300/25 bg-rose-300/10 text-rose-200";
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#06101b]/70 p-3">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-2xl font-black tracking-[-0.04em] text-white">{value}</div>
      {sub ? <div className="mt-1 text-[11px] leading-4 text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function UfcSourceConsensusPanel({ consensus }: { consensus: UfcCardSourceConsensus }) {
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,194,82,0.10),transparent_18rem),rgba(255,255,255,0.04)] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Source consensus</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">Matchup stability check</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Checks whether providers agree on fighters, weight class, card section, and whether a bout is official, cross-checked, early-only, or stale.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tone(consensus.overallGrade)}`}>{consensus.overallGrade}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="High" value={consensus.highCount} sub="official + cross-checked" />
        <Metric label="Medium" value={consensus.mediumCount} sub="usable but thinner" />
        <Metric label="Low" value={consensus.lowCount} sub="early or stale" />
        <Metric label="Review" value={consensus.reviewCount} sub="disagreement found" />
        <Metric label="Disagreements" value={consensus.disagreementCount} sub="name/weight/section" />
        <Metric label="Early only" value={consensus.earlyOnlyCount} sub="no official source" />
        <Metric label="Stale" value={consensus.staleCount} sub="older than 48h" />
        <Metric label="Fights checked" value={consensus.fightCount} sub="source groups" />
      </div>
      <div className="mt-4 grid gap-2">
        {consensus.fights.length ? consensus.fights.slice(0, 18).map((fight) => (
          <div key={fight.fightKey} className="rounded-2xl border border-white/10 bg-[#06101b]/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-display text-lg font-black tracking-[-0.04em] text-white">{fight.displayLabel}</div>
                <div className="mt-1 text-xs text-slate-500">{fight.sourceNames.join(" / ") || "no source"} · {fight.sourceCount} rows</div>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${tone(fight.confidenceGrade)}`}>{fight.confidenceGrade}</span>
            </div>
            {fight.reviewFlags.length ? <div className="mt-2 flex flex-wrap gap-1.5">{fight.reviewFlags.map((flag) => <span key={flag} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300">{flag}</span>)}</div> : null}
          </div>
        )) : <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-sm text-slate-400">No source rows yet. Load upcoming cards to produce consensus checks.</div>}
      </div>
    </section>
  );
}
