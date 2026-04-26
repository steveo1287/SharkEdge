import type {
  SharkVerdict,
  SharkMarketSignal
} from "@/services/verdict/shark-verdict-service";
import type { VerdictRating, ActionState } from "@/services/simulation/sim-verdict-engine";

// ─── Rating / action helpers ─────────────────────────────────────────────────

const RATING_STYLES: Record<VerdictRating, { label: string; bg: string; text: string; border: string }> = {
  STRONG_BET: { label: "Strong Bet", bg: "bg-mint/[0.08]",       text: "text-mint",       border: "border-mint/25" },
  LEAN:       { label: "Lean",        bg: "bg-aqua/[0.07]",       text: "text-aqua",       border: "border-aqua/20" },
  NEUTRAL:    { label: "Neutral",     bg: "bg-bone/[0.05]",       text: "text-bone/65",    border: "border-bone/[0.09]" },
  FADE:       { label: "Fade",        bg: "bg-crimson/[0.06]",    text: "text-crimson",    border: "border-crimson/20" },
  TRAP:       { label: "Trap",        bg: "bg-orange-500/[0.08]", text: "text-orange-400", border: "border-orange-500/20" }
};

const ACTION_LABELS: Record<ActionState, string> = {
  BET_NOW: "Act now",
  WAIT:    "Wait for a better number",
  WATCH:   "Watch only",
  PASS:    "Pass"
};

function RatingBadge({ rating }: { rating: VerdictRating }) {
  const s = RATING_STYLES[rating];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] ${s.bg} ${s.text} ${s.border}`}>
      {s.label}
    </span>
  );
}

function SourceBadge({ source }: { source: SharkVerdict["source"] }) {
  if (source === "model+market") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-mint/20 bg-mint/[0.06] px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-mint">
        Monte Carlo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400">
      Market consensus
    </span>
  );
}

function FreshnessPip({ freshness }: { freshness: SharkVerdict["freshness"] }) {
  if (freshness === "fresh") return <span className="h-1.5 w-1.5 rounded-full bg-mint" />;
  if (freshness === "stale") return <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-bone/30" />;
}

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : String(odds);
}

function formatEv(ev: number | null): string {
  if (ev == null) return "—";
  return `${ev > 0 ? "+" : ""}${ev.toFixed(1)}%`;
}

function formatProb(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}

// ─── Market signal row ───────────────────────────────────────────────────────

function MarketSignalRow({ m, verdict }: { m: SharkMarketSignal; verdict: SharkVerdict }) {
  const s = RATING_STYLES[m.rating];
  const sideStr = m.bestSide ?? "—";
  const teamLabel =
    sideStr === "home" ? verdict.homeTeam
    : sideStr === "away" ? verdict.awayTeam
    : sideStr === "over" ? "Over"
    : sideStr === "under" ? "Under"
    : "—";

  const lineStr =
    m.marketType !== "moneyline" && m.lineValue != null
      ? ` ${m.lineValue > 0 ? "+" : ""}${m.lineValue}`
      : "";

  return (
    <div className={`rounded-lg border p-3 ${s.border} ${s.bg}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-bone/50">
          {m.marketType}
        </span>
        <RatingBadge rating={m.rating} />
      </div>

      <div className={`mt-2 font-display text-[16px] font-semibold leading-snug ${s.text}`}>
        {teamLabel}{lineStr}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-bone/40">
        {ACTION_LABELS[m.actionState]}
      </div>

      <p className="mt-1.5 text-[11px] leading-[1.5] text-bone/60">{m.headline}</p>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-bone/55">
        {m.bestEv !== null && (
          <span>EV <span className={m.bestEv > 0 ? "text-mint" : "text-crimson"}>{formatEv(m.bestEv)}</span></span>
        )}
        {m.bestEdgeScore !== null && (
          <span>Edge <span className="text-text-primary">{m.bestEdgeScore.toFixed(0)}</span></span>
        )}
        {m.bestKelly !== null && m.bestKelly > 0 && (
          <span>Kelly <span className="text-text-primary">{m.bestKelly.toFixed(1)}%</span></span>
        )}
        {m.offeredOdds != null && (
          <span>Best <span className="text-aqua">{formatOdds(m.offeredOdds)}</span></span>
        )}
      </div>
    </div>
  );
}

// ─── Sim signal rows (when model ran) ────────────────────────────────────────

function SimMarketRow({ v, verdict }: {
  v: import("@/services/simulation/sim-verdict-engine").MarketVerdict;
  verdict: SharkVerdict;
  isBestBet: boolean;
}) {
  const s = RATING_STYLES[v.rating];
  const side = v.side.toLowerCase();
  const teamLabel =
    side === "home" ? verdict.homeTeam
    : side === "away" ? verdict.awayTeam
    : side === "over" ? "Over"
    : side === "under" ? "Under"
    : "—";

  const lineStr =
    v.market !== "moneyline" && v.marketValue != null
      ? ` ${v.marketValue > 0 ? "+" : ""}${typeof v.marketValue === "number" ? v.marketValue.toFixed(1) : v.marketValue}`
      : "";

  return (
    <div className={`rounded-lg border p-3 ${s.border} ${s.bg}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-bone/50">
          {v.market}
        </span>
        <RatingBadge rating={v.rating} />
      </div>

      <div className={`mt-2 font-display text-[16px] font-semibold leading-snug ${s.text}`}>
        {v.side !== "NONE" ? `${teamLabel}${lineStr}` : "No play"}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-bone/40">
        {ACTION_LABELS[v.actionState]}
      </div>

      <div className={`mt-1 font-display text-[12.5px] font-semibold ${s.text}`}>{v.headline}</div>
      <p className="mt-1 text-[11px] leading-[1.5] text-bone/60">{v.explanation}</p>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-bone/55">
        {v.edgePct !== null && (
          <span>EV <span className={v.edgePct > 0 ? "text-mint" : "text-crimson"}>{formatEv(v.edgePct)}</span></span>
        )}
        <span>Edge <span className="text-text-primary">{v.edgeScore}</span></span>
        {v.kellyPct > 0 && (
          <span>Kelly <span className="text-text-primary">{v.kellyPct.toFixed(1)}%</span></span>
        )}
      </div>

      {v.trapFlags.length > 0 && v.trapExplanation && (
        <div className="mt-2 rounded border border-orange-500/20 bg-orange-500/[0.06] px-2 py-1.5 text-[10.5px] text-orange-400">
          <span className="font-semibold">Trap: </span>{v.trapExplanation}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function SharkVerdictPanel({ verdict }: { verdict: SharkVerdict }) {
  const overallStyle = RATING_STYLES[verdict.overallRating];
  const hasSimData = verdict.source === "model+market" && verdict.simSummary != null;
  const s = verdict.simSummary;
  const bestBet = verdict.bestBet;

  const bestBetLabel = bestBet
    ? `${bestBet.sideLabel} ${bestBet.marketType}`
    : "No material edge right now";
  const bestBetAction = bestBet ? ACTION_LABELS[bestBet.actionState] : "Pass";

  return (
    <section className="grid gap-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">
            Shark Verdict
          </div>
          <SourceBadge source={verdict.source} />
          <div className="flex items-center gap-1.5">
            <FreshnessPip freshness={verdict.freshness} />
            <span className="text-[10px] text-bone/40">
              {verdict.freshness === "fresh" ? "Fresh" : verdict.freshness === "stale" ? "Stale" : ""}
            </span>
          </div>
        </div>
        <h2 className="mt-1 font-display text-[20px] font-semibold tracking-[-0.01em] text-text-primary">
          {verdict.awayTeam} @ {verdict.homeTeam}
        </h2>
        <p className="mt-0.5 text-[11px] text-bone/40">{verdict.sourceLabel}</p>
      </div>

      {/* Overall verdict + best bet */}
      <div className={`rounded-xl border p-4 ${overallStyle.border} ${overallStyle.bg}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <RatingBadge rating={verdict.overallRating} />

            <div className="mt-3 rounded-lg border border-bone/[0.08] bg-ink/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-bone/45">
                Best bet right now
              </div>
              <div className={`mt-1 font-display text-[18px] font-semibold leading-snug ${overallStyle.text}`}>
                {bestBetLabel}
              </div>
              {bestBet && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums text-bone/50">
                  <span>EV <span className={bestBet.ev > 0 ? "text-mint" : "text-crimson"}>{formatEv(bestBet.ev)}</span></span>
                  {bestBet.kelly > 0 && <span>Kelly {bestBet.kelly.toFixed(1)}%</span>}
                  <span>Best odds <span className="text-aqua">{formatOdds(bestBet.offeredOdds)}</span></span>
                </div>
              )}
              <div className="mt-1 text-[10px] uppercase tracking-widest text-bone/35">{bestBetAction}</div>
            </div>

            <p className={`mt-3 font-display text-[14px] font-semibold leading-snug ${overallStyle.text}`}>
              {verdict.summary}
            </p>
          </div>

          {/* Sim projection box — only when Monte Carlo ran */}
          {hasSimData && s && (
            <div className="shrink-0 rounded-lg border border-bone/[0.08] bg-ink/40 px-3 py-2 text-center">
              <div className="font-mono text-[10px] uppercase tracking-widest text-bone/40">Projected</div>
              <div className="mt-1 font-display text-[14px] font-semibold text-text-primary">
                {s.projectedScore}
              </div>
              <div className="mt-1 font-mono text-[11px] tabular-nums text-bone/55">
                {verdict.homeTeam} {formatProb(s.winProbHome)} · {verdict.awayTeam} {formatProb(s.winProbAway)}
              </div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums text-aqua">
                O/U {s.projectedTotal} (P10 {s.p10Total.toFixed(1)}–P90 {s.p90Total.toFixed(1)})
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per-market signals */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {/* When sim ran — use rich sim verdicts */}
        {hasSimData && verdict.simVerdicts.length > 0 && verdict.simVerdicts
          .filter((v) => v.market !== "player_prop")
          .map((v, i) => (
            <SimMarketRow
              key={`${v.market}-${v.side}-${i}`}
              v={v}
              verdict={verdict}
              isBestBet={Boolean(
                verdict.bestBet &&
                verdict.bestBet.marketType === v.market &&
                verdict.bestBet.side === v.side.toLowerCase()
              )}
            />
          ))}

        {/* When no sim — use edge signal market rows */}
        {!hasSimData && verdict.markets.map((m, i) => (
          <MarketSignalRow key={`${m.marketType}-${i}`} m={m} verdict={verdict} />
        ))}
      </div>

      {/* Footer: books + source note */}
      <div className="flex items-center gap-3 rounded-xl border border-bone/[0.06] bg-surface px-4 py-2.5">
        <FreshnessPip freshness={verdict.freshness} />
        <span className="text-[11px] text-bone/45">
          {verdict.booksCount > 0 && (
            <>{verdict.booksCount} book{verdict.booksCount !== 1 ? "s" : ""} in consensus · </>
          )}
          {verdict.source === "model+market"
            ? "Monte Carlo sim ran — probabilities are model-derived"
            : "No model data — probabilities are no-vig market consensus only"}
          {verdict.updatedAt && (
            <> · Updated {new Date(verdict.updatedAt).toLocaleTimeString()}</>
          )}
        </span>
      </div>
    </section>
  );
}
