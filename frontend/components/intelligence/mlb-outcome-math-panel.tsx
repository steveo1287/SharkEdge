type OutcomeMath = {
  raw?: {
    homeWinProb?: number;
    awayWinProb?: number;
    overProb?: number;
    underProb?: number;
    expectedMargin?: number;
    expectedTotal?: number;
  };
  calibrated?: {
    homeWinProb?: number;
    awayWinProb?: number;
    overProb?: number;
    underProb?: number;
    expectedMargin?: number;
    expectedTotal?: number;
  };
  calibrationPenalty?: number;
  marketAgreement?: number;
  decisionScore?: number;
};

export function MlbOutcomeMathPanel({ outcome }: { outcome?: OutcomeMath | null }) {
  if (!outcome) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#07111f] p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Outcome math</div>
      <h3 className="mt-1 text-xl font-semibold text-white">Calibrated probability conversion</h3>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Raw</div>
          <div className="mt-2 text-sm text-slate-300">
            Home {outcome.raw?.homeWinProb?.toFixed?.(3) ?? "—"} · Away {outcome.raw?.awayWinProb?.toFixed?.(3) ?? "—"}
          </div>
          <div className="mt-1 text-sm text-slate-300">
            Over {outcome.raw?.overProb?.toFixed?.(3) ?? "—"} · Under {outcome.raw?.underProb?.toFixed?.(3) ?? "—"}
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Calibrated</div>
          <div className="mt-2 text-sm text-slate-300">
            Home {outcome.calibrated?.homeWinProb?.toFixed?.(3) ?? "—"} · Away {outcome.calibrated?.awayWinProb?.toFixed?.(3) ?? "—"}
          </div>
          <div className="mt-1 text-sm text-slate-300">
            Over {outcome.calibrated?.overProb?.toFixed?.(3) ?? "—"} · Under {outcome.calibrated?.underProb?.toFixed?.(3) ?? "—"}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-xs text-slate-400">
        Calibration penalty {outcome.calibrationPenalty?.toFixed?.(3) ?? "—"} · Market agreement {outcome.marketAgreement?.toFixed?.(3) ?? "—"} · Decision score {outcome.decisionScore?.toFixed?.(2) ?? "—"}
      </div>
    </section>
  );
}
