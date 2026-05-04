"use client";

import { useTransition, useState } from "react";
import { runProviderDryTest, runProviderWriteIngestion, type ProviderTriggerState } from "./actions";

function ResultBox({ result }: { result: ProviderTriggerState | null }) {
  if (!result) return null;
  return (
    <div className={`rounded-2xl border p-4 text-sm leading-6 ${result.ok ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-red-400/25 bg-red-400/10 text-red-100"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em]">Last trigger · {result.mode}</div>
      <div className="mt-2 font-semibold text-white">{result.ok ? "Completed" : "Needs attention"}</div>
      <div className="mt-1 text-slate-200">{result.error ?? result.message}</div>
      {result.stats ? (
        <div className="mt-3 grid gap-2 text-[11px] text-slate-200 sm:grid-cols-3 xl:grid-cols-6">
          <span>Events {result.stats.providerEvents}</span>
          <span>Matched {result.stats.matchedInternalEvents}</span>
          <span>Odds {result.stats.oddsRows}</span>
          <span>Snapshots {result.stats.snapshotsWritten}</span>
          <span>Lines {result.stats.lineRowsWritten}</span>
          <span>Skipped {result.stats.skippedOddsRows}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function ProviderTriggerForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ProviderTriggerState | null>(null);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <button
          disabled={isPending}
          onClick={() => startTransition(async () => setResult(await runProviderDryTest()))}
          className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-4 text-left text-sm font-semibold text-cyan-100 hover:bg-cyan-300/15 disabled:opacity-50"
        >
          <span className="block text-[10px] uppercase tracking-[0.18em] text-cyan-300">Safe test</span>
          Run MLB dry test
          <span className="mt-1 block text-xs font-normal leading-5 text-slate-400">Checks provider events and odds without writing market rows.</span>
        </button>
        <button
          disabled={isPending}
          onClick={() => startTransition(async () => setResult(await runProviderWriteIngestion()))}
          className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-4 text-left text-sm font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-50"
        >
          <span className="block text-[10px] uppercase tracking-[0.18em] text-emerald-300">Write rows</span>
          Run MLB write ingestion
          <span className="mt-1 block text-xs font-normal leading-5 text-slate-400">Uses server-side env config. No credential is shown in the browser.</span>
        </button>
      </div>
      {isPending ? <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-slate-300">Running provider trigger...</div> : null}
      <ResultBox result={result} />
    </div>
  );
}
