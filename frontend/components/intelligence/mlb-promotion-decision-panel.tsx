type PromotionDecision = {
  finalPromotionScore?: number;
  tier?: string;
  isSuppressed?: boolean;
  marketDisagreement?: number;
  explanationConsistency?: number;
  certaintyScore?: number;
  rationale?: string[];
};

export function MlbPromotionDecisionPanel({ decision }: { decision?: PromotionDecision | null }) {
  if (!decision) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#07111f] p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Promotion decision</div>
      <h3 className="mt-1 text-xl font-semibold text-white">Final MLB surfacing decision</h3>

      <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-white">
          {decision.tier ?? "pass"} · Score {decision.finalPromotionScore?.toFixed?.(2) ?? "—"}
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Certainty {decision.certaintyScore?.toFixed?.(3) ?? "—"} · Consistency {decision.explanationConsistency?.toFixed?.(3) ?? "—"} · Market disagreement {decision.marketDisagreement?.toFixed?.(3) ?? "—"}
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        {(decision.rationale ?? []).map((item) => (
          <div key={item} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-xs text-slate-400">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
