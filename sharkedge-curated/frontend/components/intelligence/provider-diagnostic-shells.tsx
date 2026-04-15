import type { ReactNode } from "react";

import { ProviderHealthBadge } from "@/components/intelligence/provider-status-badges";
import { Card } from "@/components/ui/card";

export function DiagnosticMetaStrip({
  items,
  className = "flex flex-wrap gap-2 text-[0.66rem] uppercase tracking-[0.18em] text-slate-500"
}: {
  items: Array<string | null | undefined>;
  className?: string;
}) {
  const visibleItems = items.filter((item): item is string => Boolean(item));

  if (!visibleItems.length) {
    return null;
  }

  return (
    <div className={className}>
      {visibleItems.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

export function ProviderHealthSummaryPanel({
  title = "Provider health",
  state,
  label,
  summary,
  badges,
  asOfLabel,
  metaItems
}: {
  title?: string;
  state: string;
  label: string;
  summary: string;
  badges?: ReactNode[];
  asOfLabel?: string | null;
  metaItems?: Array<string | null | undefined>;
}) {
  const extraBadges = (badges ?? []).filter(Boolean);

  return (
    <Card className="surface-panel p-5">
      <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
        {title}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ProviderHealthBadge state={state} label={label} />
        {extraBadges}
      </div>
      <div className="mt-4 text-sm leading-7 text-slate-300">{summary}</div>
      {asOfLabel ? (
        <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
          {asOfLabel}
        </div>
      ) : null}
      {metaItems?.length ? (
        <div className="mt-3">
          <DiagnosticMetaStrip items={metaItems} />
        </div>
      ) : null}
    </Card>
  );
}

export function DiagnosticNotesPanel({
  title = "Desk notes",
  notes,
  emptyMessage
}: {
  title?: string;
  notes: string[];
  emptyMessage: string;
}) {
  return (
    <Card className="surface-panel p-5">
      <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
        {title}
      </div>
      <div className="mt-4 grid gap-3">
        {notes.length ? (
          notes.map((note) => (
            <div
              key={note}
              className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300"
            >
              {note}
            </div>
          ))
        ) : (
          <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-400">
            {emptyMessage}
          </div>
        )}
      </div>
    </Card>
  );
}

export function RawProviderDetailsDisclosure({
  title = "Raw provider details",
  items
}: {
  title?: string;
  items: Array<{ label: string; value: string | null | undefined; breakMode?: "words" | "all" }>;
}) {
  const visibleItems = items.filter((item) => Boolean(item.value));

  if (!visibleItems.length) {
    return null;
  }

  return (
    <details className="rounded-[1.1rem] border border-white/8 bg-slate-950/50 px-4 py-3">
      <summary className="cursor-pointer text-xs uppercase tracking-[0.18em] text-slate-500">
        {title}
      </summary>
      <div className="mt-3 grid gap-3 text-xs leading-6 text-slate-400">
        {visibleItems.map((item) => (
          <div key={item.label} className="grid gap-1">
            <div className="uppercase tracking-[0.18em] text-slate-500">{item.label}</div>
            <div
              className={
                item.breakMode === "all"
                  ? "break-all overflow-hidden whitespace-pre-wrap"
                  : "break-words overflow-hidden whitespace-pre-wrap"
              }
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}