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
      "rounded-2xl border bg-slate-950/50 p-4",
      emphasis === "strong" ? "border-aqua/25 shadow-[0_0_30px_rgba(34,211,238,0.08)]" : "border-white/10",
      emphasis === "muted" && "opacity-75"
    )}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold leading-none tracking-tight text-white">{value}</div>
      {sub ? <div className="mt-2 text-xs leading-5 text-slate-400">{sub}</div> : null}
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
    <section className="surface-panel-strong overflow-hidden p-6">
      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
        <div>
          <div className="section-kicker">{eyebrow}</div>
          <h1 className="mt-3 max-w-5xl font-display text-4xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {actions.map((action) => (
            <Link
              key={`${action.href}:${action.label}`}
              href={action.href}
              className={cn(
                "rounded-md border px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition-colors",
                action.tone === "primary"
                  ? "border-aqua/35 bg-aqua/10 text-aqua hover:bg-aqua/15"
                  : "border-bone/[0.12] bg-panel text-bone/75 hover:border-bone/20 hover:text-bone"
              )}
            >
              {action.label}
            </Link>
          ))}
        </div>
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
    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div>
        {eyebrow ? <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{eyebrow}</div> : null}
        <div className="text-sm font-semibold text-white">{title}</div>
        {description ? <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function SimDataQualityBadges({
  playerSource,
  marketSource,
  calibrationSource
}: {
  playerSource?: "real" | "synthetic" | "unknown";
  marketSource?: "matched" | "missing" | "unknown";
  calibrationSource?: "calibrated" | "pending" | "unknown";
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {playerSource ? <Badge tone={playerSource === "real" ? "success" : playerSource === "synthetic" ? "premium" : "muted"}>players {playerSource}</Badge> : null}
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
