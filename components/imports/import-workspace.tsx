"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SetupStateCard } from "@/components/ui/setup-state-card";
import { StatCard } from "@/components/ui/stat-card";
import type { ImportPageData, ImportProviderKey, ImportResultView } from "@/lib/types/product";

type ImportWorkspaceProps = ImportPageData;

export function ImportWorkspace({ setup, batches, supportedProviders, plan }: ImportWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [providerKey, setProviderKey] = useState<ImportProviderKey>("draftkings");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResultView | null>(null);

  async function handleImport() {
    setFeedback(null);
    setResult(null);
    const response = await fetch("/api/imports/csv", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        providerKey,
        fileName,
        csvText
      })
    });

    const payload = (await response.json().catch(() => ({}))) as ImportResultView & {
      error?: string;
    };

    if (!response.ok) {
      setFeedback(payload.error ?? "CSV import failed.");
      return;
    }

    setResult(payload);
    setCsvText("");
    setFileName("");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Recent Imports" value={`${batches.length}`} />
        <StatCard
          label="Imported Bets"
          value={`${batches.reduce((total, batch) => total + batch.importedCount, 0)}`}
        />
        <StatCard
          label="Duplicates"
          value={`${batches.reduce((total, batch) => total + batch.duplicateCount, 0)}`}
        />
        <StatCard
          label="Plan"
          value={plan.statusLabel}
          note={plan.isPremium ? "Full import history visible" : "Import foundation active"}
        />
      </div>

      {setup ? (
        <SetupStateCard title={setup.title} detail={setup.detail} steps={setup.steps} />
      ) : null}

      <Card className="p-5">
        <div className="font-display text-2xl font-semibold text-white">CSV Import</div>
        <div className="mt-2 text-sm leading-7 text-slate-400">
          Import-only this phase. SharkEdge normalizes CSV history into the real ledger and stores provider metadata so automated sportsbook sync can plug in later without rewriting bets.
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select
            value={providerKey}
            onChange={(event) => setProviderKey(event.target.value as ImportProviderKey)}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            {supportedProviders.map((provider) => (
              <option key={provider.key} value={provider.key}>
                {provider.label}
              </option>
            ))}
          </select>
          <input
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            placeholder="File name (optional)"
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          />
          <button
            type="button"
            disabled={isPending || !csvText.trim().length}
            onClick={handleImport}
            className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300 disabled:opacity-60"
          >
            {isPending ? "Importing..." : "Import CSV"}
          </button>
        </div>

        <textarea
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          placeholder="Paste sportsbook CSV content here."
          className="mt-4 min-h-64 w-full rounded-3xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        />

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {supportedProviders.map((provider) => (
            <div key={provider.key} className="rounded-2xl border border-line bg-slate-950/65 p-4 text-sm text-slate-300">
              <div className="font-medium text-white">{provider.label}</div>
              <div className="mt-2 leading-6 text-slate-400">{provider.note}</div>
            </div>
          ))}
        </div>
      </Card>

      {feedback ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {feedback}
        </div>
      ) : null}

      {result ? (
        <Card className="p-5">
          <div className="font-display text-2xl font-semibold text-white">Latest Import Result</div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <StatCard label="New" value={`${result.batch.summary.newBets}`} />
            <StatCard label="Duplicates" value={`${result.batch.summary.duplicates}`} />
            <StatCard label="Failed" value={`${result.batch.summary.failed}`} />
          </div>
          <div className="mt-4 grid gap-3">
            {result.outcomes.slice(0, 20).map((outcome) => (
              <div key={`${outcome.rowIndex}-${outcome.status}`} className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                Row {outcome.rowIndex} | {outcome.status} | {outcome.message}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {batches.length ? (
        <div className="grid gap-4">
          {batches.map((batch) => (
            <Card key={batch.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {batch.providerKey}
                  </div>
                  <div className="mt-2 font-display text-2xl font-semibold text-white">
                    {batch.fileName ?? "Imported batch"}
                  </div>
                  <div className="mt-2 text-sm text-slate-400">
                    {new Date(batch.createdAt).toLocaleString("en-US", {
                      dateStyle: "short",
                      timeStyle: "short"
                    })}
                  </div>
                </div>
                <div className="rounded-full border border-line px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
                  {batch.status}
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <StatCard label="Rows" value={`${batch.rowCount}`} />
                <StatCard label="Imported" value={`${batch.importedCount}`} />
                <StatCard label="Duplicates" value={`${batch.duplicateCount}`} />
                <StatCard label="Failed" value={`${batch.failedCount}`} />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No import history yet"
          description="Paste a DraftKings, FanDuel, or generic CSV export and SharkEdge will normalize it into the existing ledger with dedupe protection."
        />
      )}
    </div>
  );
}
