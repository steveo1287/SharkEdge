import { Badge } from "@/components/ui/badge";

type DeskCardTone = "default" | "success" | "premium" | "danger";

export function getStatusTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "FINAL") {
    return "neutral" as const;
  }

  if (status === "POSTPONED" || status === "CANCELED") {
    return "danger" as const;
  }

  return "muted" as const;
}

export function getSupportTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

export function getProviderHealthTone(state: string) {
  if (state === "HEALTHY") {
    return "success" as const;
  }

  if (state === "DEGRADED") {
    return "premium" as const;
  }

  if (state === "OFFLINE") {
    return "danger" as const;
  }

  return "muted" as const;
}

export function getOpportunityTone(actionState: string) {
  if (actionState === "BET_NOW") {
    return "success" as const;
  }

  if (actionState === "WAIT") {
    return "brand" as const;
  }

  if (actionState === "WATCH") {
    return "premium" as const;
  }

  return "muted" as const;
}

export function QuickJump({
  href,
  label,
  emphasis = false
}: {
  href: string;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <a
      href={href}
      className={
        emphasis
          ? "inline-flex min-h-10 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200 sm:text-xs sm:tracking-[0.22em]"
          : "inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200 sm:text-xs sm:tracking-[0.22em]"
      }
    >
      {label}
    </a>
  );
}

export function MetricTile({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric-tile rounded-[1.2rem] border border-white/8 bg-slate-950/60 px-4 py-4">
      <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 font-display text-2xl font-semibold text-white sm:text-3xl">
        {value}
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </div>
  );
}

export function HubTab({
  href,
  label,
  active,
  count
}: {
  href: string;
  label: string;
  active: boolean;
  count?: number | null;
}) {
  return (
    <a
      href={href}
      className={
        active
          ? "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/10 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200 sm:text-xs sm:tracking-[0.22em]"
          : "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-xs sm:tracking-[0.22em]"
      }
    >
      <span>{label}</span>
      {typeof count === "number" && count > 0 ? (
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] text-white">
          {count}
        </span>
      ) : null}
    </a>
  );
}

export function DeskCard({
  title,
  value,
  note,
  tone = "default"
}: {
  title: string;
  value: string;
  note: string;
  tone?: DeskCardTone;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-500/8"
      : tone === "premium"
        ? "border-amber-300/20 bg-amber-400/8"
        : tone === "danger"
          ? "border-rose-400/20 bg-rose-500/8"
          : "border-white/8 bg-slate-950/60";

  return (
    <div className={`rounded-[1.25rem] border px-4 py-4 ${toneClass}`}>
      <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-lg font-semibold text-white sm:text-xl">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </div>
  );
}

export function OpportunityStateBadge({
  actionState,
  label
}: {
  actionState: string;
  label: string;
}) {
  return <Badge tone={getOpportunityTone(actionState)}>{label}</Badge>;
}