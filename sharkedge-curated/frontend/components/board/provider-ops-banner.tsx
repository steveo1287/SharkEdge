import { getProviderHealthTone } from "@/components/intelligence/provider-status-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type {
  ProviderReadinessEntry,
  ProviderReadinessView
} from "@/services/current-odds/provider-readiness-service";

function getReadinessTone(state: ProviderReadinessEntry["state"]) {
  if (state === "HEALTHY" || state === "READY") {
    return "brand" as const;
  }
  if (state === "NOT_CONFIGURED") {
    return "muted" as const;
  }
  return getProviderHealthTone(state === "ERROR" ? "OFFLINE" : state);
}

function formatFreshness(minutes: number | null) {
  if (minutes === null) return "No successful refresh yet";
  if (minutes <= 1) return "Fresh";
  return `${minutes}m ago`;
}

function ProviderTile({ entry }: { entry: ProviderReadinessEntry }) {
  return (
    <Card className="surface-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            {entry.label}
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">{entry.summary}</div>
        </div>
        <Badge tone={getReadinessTone(entry.state)}>{entry.state.replaceAll("_", " ")}</Badge>
      </div>

      <div className="mt-3 text-xs leading-6 text-slate-400">{entry.detail}</div>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
        <span>Freshness: {formatFreshness(entry.freshnessMinutes)}</span>
        {entry.workerOnly ? <span>Worker only</span> : <span>Board path</span>}
        {entry.booksIncluded.length ? <span>Books: {entry.booksIncluded.join(", ")}</span> : null}
      </div>

      {entry.warnings.length ? (
        <ul className="mt-3 grid gap-1 text-xs leading-5 text-amber-200/90">
          {entry.warnings.slice(0, 3).map((warning) => (
            <li key={warning}>- {warning}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

export function ProviderOpsBanner({ readiness }: { readiness: ProviderReadinessView }) {
  const dkOrFdOnBoard = readiness.booksOnBoard.filter(
    (book) => book === "draftkings" || book === "fanduel"
  );

  return (
    <section className="grid gap-4 rounded-[1.6rem] border border-white/8 bg-[#09131f]/88 p-5 xl:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <div className="text-[0.66rem] uppercase tracking-[0.24em] text-slate-500">
            Live provider truth
          </div>
          <div className="text-xl font-semibold text-white xl:text-2xl">{readiness.label}</div>
          <div className="max-w-4xl text-sm leading-7 text-slate-300">{readiness.summary}</div>
        </div>
        <Badge tone={getReadinessTone(readiness.state)}>{readiness.label}</Badge>
      </div>

      <div className="rounded-[1.15rem] border border-sky-400/20 bg-sky-500/8 px-4 py-4 text-sm leading-7 text-slate-200">
        <div className="font-semibold text-white">IP-safe routing</div>
        <div className="mt-1">{readiness.safePathSummary}</div>
        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
          {dkOrFdOnBoard.length
            ? `Confirmed on board now: ${dkOrFdOnBoard.join(", ")}`
            : "DraftKings / FanDuel not confirmed on the current backend board snapshot."}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {readiness.entries.map((entry) => (
          <ProviderTile key={entry.key} entry={entry} />
        ))}
      </div>

      {readiness.warnings.length ? (
        <div className="rounded-[1.1rem] border border-amber-300/20 bg-amber-400/8 px-4 py-4 text-sm leading-7 text-amber-100">
          <div className="font-semibold text-white">Current cautions</div>
          <ul className="mt-2 grid gap-1">
            {readiness.warnings.slice(0, 4).map((warning) => (
              <li key={warning}>- {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
