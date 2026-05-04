"use client";

import { useState, useTransition } from "react";

import { runProviderDryTest, runProviderWriteIngestion, type ProviderTriggerState } from "./provider-trigger/actions";

function stat(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export default function InlineProviderTrigger() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ProviderTriggerState | null>(null);

  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Provider trigger</div>
        <div className="mt-1 text-xs leading-5 text-slate-300">Run the provider from this screen. The write run uses server-side config and does not expose credentials.</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => setResult(await runProviderDryTest()))}
          className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15 disabled:opacity-50"
        >
          Run dry test
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => setResult(await runProviderWriteIngestion()))}
          className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-50"
        >
          Run write ingestion
        </button>
      </div>
      {isPending ? <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-slate-300">Running provider trigger...</div> : null}
      {result ? (
        <div className={`rounded-xl border p-3 text-xs leading-5 ${result.ok ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-red-400/25 bg-red-400/10 text-red-100"}`}>
          <div className="font-semibold text-white">{result.ok ? "Trigger completed" : "Trigger needs attention"}</div>
          <div className="mt-1">{result.error ?? result.message}</div>
          <div className="mt-2 grid gap-1 sm:grid-cols-3">
            <span>Events {stat(result.stats?.providerEvents)}</span>
            <span>Matched {stat(result.stats?.matchedInternalEvents)}</span>
            <span>Odds {stat(result.stats?.oddsRows)}</span>
            <span>Snapshots {stat(result.stats?.snapshotsWritten)}</span>
            <span>Lines {stat(result.stats?.lineRowsWritten)}</span>
            <span>Skipped {stat(result.stats?.skippedOddsRows)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
