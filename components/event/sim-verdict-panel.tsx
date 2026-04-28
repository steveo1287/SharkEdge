import type { GameSimVerdict, MarketVerdict, VerdictRating } from "@/services/simulation/sim-verdict-engine";

type Props = {
  verdict: GameSimVerdict;
};

const MIN_MONEYLINE_MODEL_EDGE = 0.04;
const MIN_EV_EDGE_PCT = 4;

const RATING_STYLES: Record<VerdictRating, { label: string; bg: string; text: string; border: string }> = {
  STRONG_BET: { label: "Strong Bet", bg: "bg-mint/[0.08]", text: "text-mint", border: "border-mint/25" },
  LEAN: { label: "Lean", bg: "bg-aqua/[0.07]", text: "text-aqua", border: "border-aqua/20" },
  NEUTRAL: { label: "Neutral", bg: "bg-bone/[0.05]", text: "text-bone/65", border: "border-bone/[0.09]" },
  FADE: { label: "Fade", bg: "bg-crimson/[0.06]", text: "text-crimson", border: "border-crimson/20" },
  TRAP: { label: "Trap", bg: "bg-orange-500/[0.08]", text: "text-orange-400", border: "border-orange-500/20" },
};

function RatingBadge({ rating }: { rating: VerdictRating }) {
  const s = RATING_STYLES[rating];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] ${s.bg} ${s.text} ${s.border}`}>
      {s.label}
    </span>
  );
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isActionable(v: MarketVerdict) {
  if (v.side === "NONE" || (v.rating !== "STRONG_BET" && v.rating !== "LEAN")) {
    return false;
  }

  if (v.market === "moneyline") {
    return typeof v.delta === "number" && v.delta >= MIN_MONEYLINE_MODEL_EDGE;
  }

  return typeof v.edgePct === "number" && v.edgePct >= MIN_EV_EDGE_PCT;
}

function getRecommendationLabel(verdict: GameSimVerdict, v: MarketVerdict) {
  const homeTeam = verdict.homeTeam;
  const awayTeam = verdict.awayTeam;

  if (!isActionable(v)) {
    if (v.market === "moneyline") return "Pass moneyline";
    if (v.market === "spread") return "Pass spread";
    if (v.market === "total") return "Pass total";
    return "Pass prop";
  }

  if (v.market === "moneyline") {
    return `Bet ${v.side === "HOME" ? homeTeam : awayTeam} moneyline`;
  }

  if (v.market === "spread") {
    if (typeof v.marketValue !== "number") {
      return `Bet ${v.side === "HOME" ? homeTeam : awayTeam} spread`;
    }
    const sideLine = v.side === "HOME" ? v.marketValue : -v.marketValue;
    const formattedLine = `${sideLine > 0 ? "+" : ""}${formatNumber(sideLine)}`;
    return `Bet ${v.side === "HOME" ? homeTeam : awayTeam} ${formattedLine}`;
  }

  if (v.market === "total") {
    return `Bet ${v.side.toLowerCase()} ${typeof v.marketValue === "number" ? formatNumber(v.marketValue) : "total"}`;
  }

  return `Bet ${v.side.toLowerCase()} prop`;
}

function getActionLabel(v: MarketVerdict) {
  if (!isActionable(v)) return "Pass — edge below threshold";
  if (v.actionState === "BET_NOW") return "Bet now";
  if (v.actionState === "WAIT") return "Wait for a better number";
  if (v.actionState === "WATCH") return "Watchlist only";
  return "Pass";
}

function MarketVerdictRow({ verdict, v, isBestBet }: { verdict: GameSimVerdict; v: MarketVerdict; isBestBet: boolean }) {
  const s = RATING_STYLES[v.rating];
  const recommendation = getRecommendationLabel(verdict, v);
  const actionLabel = getActionLabel(v);

  return (
    <div className={`rounded-lg border p-3 ${s.border} ${s.bg}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-bone/50">
          {v.market === "player_prop" ? "Prop" : v.market}
        </span>
        <div className="flex items-center gap-2">
          {isBestBet ? (
            <span className="inline-flex items-center rounded-full border border-aqua/25 bg-aqua/[0.08] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-aqua">
              Best edge
            </span>
          ) : null}
          <RatingBadge rating={v.rating} />
        </div>
      </div>

      <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-bone/45">
        Recommended play
      </div>
      <div className={`mt-1 font-display text-[16px] font-semibold leading-snug ${isActionable(v) ? s.text : "text-bone/55"}`}>
        {recommendation}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-bone/40">
        {actionLabel}
      </div>

      <div className={`mt-2 font-display text-[13px] font-semibold ${s.text}`}>
        {v.headline}
      </div>
      {v.edgePct !== null && (
        <div className="mt-1 font-mono text-[11px] tabular-nums text-bone/55">
          EV {v.edgePct > 0 ? "+" : ""}{v.edgePct}% · edge {v.edgeScore} · kelly {v.kellyPct}%
        </div>
      )}
      {v.market === "moneyline" && typeof v.delta === "number" ? (
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-bone/40">
          Model edge {(v.delta * 100).toFixed(1)}% · requires {(MIN_MONEYLINE_MODEL_EDGE * 100).toFixed(0)}%+
        </div>
      ) : null}
      <div className="mt-1 text-[10px] uppercase tracking-widest text-bone/40">
        {isActionable(v) ? (v.actionState === "BET_NOW" ? "Act now" : v.actionState === "WAIT" ? "Wait" : v.actionState === "WATCH" ? "Watch" : "Pass") : "Filtered"} · {v.timingState.replace(/_/g, " ").toLowerCase()}
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
  const s = verdict.simSummary;
  const bestBet = overall.bestBet && isActionable(overall.bestBet) ? overall.bestBet : null;
  const overallStyle = RATING_STYLES[bestBet?.rating ?? overall.rating];
  const bestBetRecommendation = bestBet ? getRecommendationLabel(verdict, bestBet) : "No playable edge right now";
  const bestBetActionLabel = bestBet ? getActionLabel(bestBet) : "Pass — wait for +4% model edge or +4% EV";

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

      <div className={`rounded-xl border p-4 ${overallStyle.border} ${overallStyle.bg}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <RatingBadge rating={bestBet?.rating ?? overall.rating} />
            <div className="mt-3 rounded-lg border border-bone/[0.08] bg-ink/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-bone/45">
                Best playable edge
              </div>
              <div className={`mt-1 font-display text-[18px] font-semibold leading-snug ${bestBet ? overallStyle.text : "text-bone/55"}`}>
                {bestBetRecommendation}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-widest text-bone/40">
                {bestBetActionLabel}
              </div>
            </div>
            <p className={`mt-3 font-display text-[15px] font-semibold leading-snug ${overallStyle.text}`}>
              {bestBet ? overall.summary : "Model has leans, but none clear the playable-edge threshold."}
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

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {verdict.verdicts.map((v, i) => (
          <MarketVerdictRow
            key={`${v.market}-${v.side}-${i}`}
            verdict={verdict}
            v={v}
            isBestBet={Boolean(
              bestBet &&
              bestBet.market === v.market &&
              bestBet.side === v.side &&
              bestBet.headline === v.headline
            )}
          />
        ))}
      </div>
    </section>
  );
}
