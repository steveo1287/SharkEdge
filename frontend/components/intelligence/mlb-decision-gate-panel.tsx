type Gate = {
  decision?: string;
  gatedRankMultiplier?: number;
  rationale?: string;
};

export function MlbDecisionGatePanel({ gate }: { gate?: Gate | null }) {
  if (!gate) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#07111f] p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Decision gate</div>
      <h3 className="mt-1 text-xl font-semibold text-white">Selective rank discipline</h3>

      <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-white">
          {gate.decision ?? "pass"} · Multiplier {gate.gatedRankMultiplier?.toFixed?.(2) ?? "—"}
        </div>
        <div className="mt-2 text-xs text-slate-400">{gate.rationale ?? "—"}</div>
      </div>
    </section>
  );
}
