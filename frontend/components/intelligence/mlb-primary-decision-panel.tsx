type PrimaryDecision = {
  primaryScore?: number;
  promotionTier?: string;
  reason?: string;
};

export function MlbPrimaryDecisionPanel({ decision }: { decision?: PrimaryDecision | null }) {
  if (!decision) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#07111f] p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Primary decision signal</div>
      <h3 className="mt-1 text-xl font-semibold text-white">Calibrated MLB promotion score</h3>

      <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-white">
          {decision.promotionTier ?? "pass"} · Score {decision.primaryScore?.toFixed?.(2) ?? "—"}
        </div>
        <div className="mt-2 text-xs text-slate-400">{decision.reason ?? "—"}</div>
      </div>
    </section>
  );
}
