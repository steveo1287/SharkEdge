type Envelope = {
  winProbabilityBand?: { low?: number; median?: number; high?: number };
  runTotalBand?: { low?: number; median?: number; high?: number };
  explanationStability?: number;
  uncertaintyPenalty?: number;
  selectiveQualification?: { qualifies?: boolean; reason?: string; confidenceTier?: string };
};

export function MlbIntelligenceEnvelopePanel({ envelope }: { envelope?: Envelope | null }) {
  if (!envelope) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#07111f] p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Intelligence envelope</div>
      <h3 className="mt-1 text-xl font-semibold text-white">Selective prediction and uncertainty</h3>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Win probability band</div>
          <div className="mt-2 text-sm text-slate-300">
            {envelope.winProbabilityBand?.low?.toFixed?.(3) ?? "—"} / {envelope.winProbabilityBand?.median?.toFixed?.(3) ?? "—"} / {envelope.winProbabilityBand?.high?.toFixed?.(3) ?? "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Run total band</div>
          <div className="mt-2 text-sm text-slate-300">
            {envelope.runTotalBand?.low?.toFixed?.(2) ?? "—"} / {envelope.runTotalBand?.median?.toFixed?.(2) ?? "—"} / {envelope.runTotalBand?.high?.toFixed?.(2) ?? "—"}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Qualification</div>
        <div className="mt-2 text-sm font-semibold text-white">
          {envelope.selectiveQualification?.confidenceTier ?? "pass"} · {envelope.selectiveQualification?.qualifies ? "Qualified" : "Not qualified"}
        </div>
        <div className="mt-1 text-xs text-slate-400">{envelope.selectiveQualification?.reason ?? "—"}</div>
        <div className="mt-3 text-xs text-slate-400">
          Stability {envelope.explanationStability?.toFixed?.(3) ?? "—"} · Uncertainty penalty {envelope.uncertaintyPenalty?.toFixed?.(3) ?? "—"}
        </div>
      </div>
    </section>
  );
}
