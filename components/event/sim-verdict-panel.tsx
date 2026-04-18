import type { GameSimVerdict, MarketVerdict, VerdictRating } from "@/services/simulation/sim-verdict-engine";

type Props = {
  verdict: GameSimVerdict;
};

const RATING_STYLES: Record<VerdictRating, { label: string; bg: string; text: string; border: string }> = {
  STRONG_BET: { label: "Strong Bet", bg: "bg-mint/[0.08]", text: "text-mint", border: "border-mint/25" },
  LEAN:       { label: "Lean",       bg: "bg-aqua/[0.07]", text: "text-aqua", border: "border-aqua/20" },
  NEUTRAL:    { label: "Neutral",    bg: "bg-bone/[0.05]", text: "text-bone/65", border: "border-bone/[0.09]" },
  FADE:       { label: "Fade",       bg: "bg-crimson/[0.06]", text: "text-crimson", border: "border-crimson/20" },
  TRAP:       { label: "Trap",       bg: "bg-orange-500/[0.08]", text: "text-orange-400", border: "border-orange-500/20" },
};

function RatingBadge({ rating }: { rating: VerdictRating }) {
  const s = RATING_STYLES[rating];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] ${s.bg} ${s.text} ${s.border}`}>
      {s.label}
    </span>
  );
}

function MarketVerdictRow({ v }: { v: MarketVerdict }) {
  const s = RATING_STYLES[v.rating];
  return (
    <div className={`rounded-lg border p-3 ${s.border} ${s.bg}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-bone/50">
          {v.market === "player_prop" ? "Prop" : v.market}
        </span>
        <RatingBadge rating={v.rating} />
      </div>
      <div className={`mt-1.5 font-display text-[13px] font-semibold ${s.text}`}>
        {v.headline}
      </div>
      {v.edgePct !== null && (
        <div className="mt-1 font-mono text-[11px] tabular-nums text-bone/55">
          EV {v.edgePct > 0 ? "+" : ""}{v.edgePct}% · edge {v.edgeScore} · kelly {v.kellyPct}%
        </div>
      )}
      <div className="mt-1 text-[10px] uppercase tracking-widest text-bone/40">
        {v.actionState === "BET_NOW" ? "🔴 Act now" : v.actionState === "WAIT" ? "⏱️ Wait" : v.actionState === "WATCH" ? "👁️ Watch" : "⏸️ Pass"} · {v.timingState.replace(/_/g, " ").toLowerCase()}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-[1.5] text-bone/65">{v.explanation}</p>
      {v.trapFlags.length > 0 && v.trapExplanation && (
        <div className="mt-2 rounded border border-orange-500/20 bg-orange-500/[0.06] px-2.5 py-1.5 text-[11px] text-orange-400">
          <span className="font-semibold">Trap flags:</span> {v.trapExplanation}
        </div>
      )}
    </div>
  );
}

export function SimVerdictPanel({ verdict }: Props) {
  const overall = verdict.overallVerdict;
  const overallStyle = RATING_STYLES[overall.rating];
  const s = verdict.simSummary;

  return (
    <section className="grid gap-4">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">
          Sim Verdict Engine
        </div>
        <h2 className="mt-1 font-display text-[20px] font-semibold tracking-[-0.01em] text-text-primary">
          Model Analysis
        </h2>
      </div>

      {/* Overall verdict card */}
      <div className={`rounded-xl border p-4 ${overallStyle.border} ${overallStyle.bg}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <RatingBadge rating={overall.rating} />
            <p className={`mt-2 font-display text-[15px] font-semibold leading-snug ${overallStyle.text}`}>
              {overall.summary}
            </p>
            <p className="mt-1 text-[12.5px] text-bone/60">{overall.actionNote}</p>
          </div>
          <div className="shrink-0 rounded-lg border border-bone/[0.08] bg-ink/40 px-3 py-2 text-center">
            <div className="font-mono text-[11px] text-bone/40 uppercase tracking-widest">Projected</div>
            <div className="mt-1 font-display text-[14px] font-semibold text-text-primary">{s.projectedScore}</div>
            <div className="mt-1 font-mono text-[11px] tabular-nums text-bone/55">
              Home {(s.winProbHome * 100).toFixed(1)}% · Away {(s.winProbAway * 100).toFixed(1)}%
            </div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-aqua">
              Total {s.projectedTotal} (P10 {s.p10Total.toFixed(1)}–P90 {s.p90Total.toFixed(1)})
            </div>
          </div>
        </div>
      </div>

      {/* Individual market verdicts */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {verdict.verdicts.map((v, i) => (
          <MarketVerdictRow key={`${v.market}-${v.side}-${i}`} v={v} />
        ))}
      </div>
    </section>
  );
}
