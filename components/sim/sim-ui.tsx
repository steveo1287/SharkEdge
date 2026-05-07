import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

export type SimDecisionTier = "attack" | "watch" | "pass" | "thin" | "neutral" | string | null | undefined;

type ActionLink = {
  href: string;
  label: string;
  tone?: "primary" | "secondary";
};

export function simDecisionTone(tier: SimDecisionTier): "success" | "premium" | "danger" | "muted" {
  if (tier === "attack") return "success";
  if (tier === "watch") return "premium";
  if (tier === "pass") return "danger";
  return "muted";
}

export function SimDecisionBadge({ tier, label }: { tier: SimDecisionTier; label?: string }) {
  const normalized = String(label ?? tier ?? "pass").toUpperCase();
  return <Badge tone={simDecisionTone(tier)}>{normalized}</Badge>;
}

export function SimStatusBadge({ status }: { status: string }) {
  const tone = status === "LIVE" ? "success" : status === "FINAL" ? "neutral" : status === "POSTPONED" || status === "CANCELED" ? "danger" : "muted";
  return <Badge tone={tone}>{status}</Badge>;
}

export function SimMetricTile({
  label,
  value,
  sub,
  emphasis = "normal"
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  emphasis?: "normal" | "strong" | "muted";
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-black/30 p-4",
      emphasis === "strong"
        ? "border-aqua/20 shadow-[0_0_24px_rgba(34,211,238,0.06)]"
        : "border-white/[0.08]",
      emphasis === "muted" && "opacity-60"
    )}>
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600">{label}</div>
      <div className="mt-2 font-display text-[22px] font-bold leading-none tracking-tight text-white">{value}</div>
      {sub ? <div className="mt-2 text-[11px] leading-5 text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function SimWorkspaceHeader({
  eyebrow,
  title,
  description,
  actions = [],
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ActionLink[];
  children?: ReactNode;
}) {
  return (
    <section className="surface-panel-strong overflow-hidden p-6 pb-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="section-kicker">{eyebrow}</div>
          <h1 className="mt-2 font-display text-[2.1rem] font-bold leading-none tracking-tight text-white">{title}</h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-6 text-slate-400">{description}</p>
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap items-start gap-2 pt-1">
            {actions.map((action) => (
              <Link
                key={`${action.href}:${action.label}`}
                href={action.href}
                className={cn(
                  "rounded border px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] transition-colors",
                  action.tone === "primary"
                    ? "border-aqua/35 bg-aqua/10 text-aqua hover:bg-aqua/15"
                    : "border-white/[0.10] bg-white/[0.03] text-slate-400 hover:border-white/[0.18] hover:text-slate-200"
                )}
              >
                {action.label}
              </Link>
            ))}
          </div>
        )}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}

export function SimCardHeader({
  eyebrow,
  title,
  description,
  right
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
      <div className="min-w-0">
        {eyebrow ? <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600">{eyebrow}</div> : null}
        <div className="mt-0.5 font-semibold text-white">{title}</div>
        {description ? <div className="mt-1 text-[11px] leading-5 text-slate-500">{description}</div> : null}
      </div>
      {right ? <div className="shrink-0 pt-0.5">{right}</div> : null}
    </div>
  );
}

export function SimDataQualityBadges({
  playerSource,
  marketSource,
  calibrationSource
}: {
  playerSource?: "real" | "estimated" | "synthetic" | "unknown";
  marketSource?: "matched" | "missing" | "unknown";
  calibrationSource?: "calibrated" | "pending" | "unknown";
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {playerSource ? <Badge tone={playerSource === "real" ? "success" : playerSource === "estimated" ? "muted" : playerSource === "synthetic" ? "premium" : "muted"}>players {playerSource}</Badge> : null}
      {marketSource ? <Badge tone={marketSource === "matched" ? "success" : marketSource === "missing" ? "premium" : "muted"}>lines {marketSource}</Badge> : null}
      {calibrationSource ? <Badge tone={calibrationSource === "calibrated" ? "success" : calibrationSource === "pending" ? "premium" : "muted"}>cal {calibrationSource}</Badge> : null}
    </div>
  );
}

export function SimTableShell({
  title,
  description,
  children,
  right
}: {
  title: string;
  description?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Card className="surface-panel overflow-hidden">
      <SimCardHeader title={title} description={description} right={right} />
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

export function SimSignalCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn("surface-panel p-4", className)}>{children}</Card>;
}
