import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

export function ConceptPageIntro({
  kicker,
  title,
  description,
  actions,
  className
}: {
  kicker: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("concept-page-intro", className)}>
      <div className="concept-kicker">{kicker}</div>
      <h1 className="concept-display">{title}</h1>
      <p className="concept-copy max-w-4xl">{description}</p>
      {actions ? <div className="mt-5 flex flex-wrap gap-3">{actions}</div> : null}
    </section>
  );
}

export function ConceptPanel({
  children,
  className,
  tone = "default"
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "accent" | "muted";
}) {
  return <section className={cn("concept-panel", `concept-panel-${tone}`, className)}>{children}</section>;
}

export function ConceptSectionHeader({
  label,
  title,
  detail,
  action
}: {
  label: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-2">
        <div className="concept-kicker">{label}</div>
        <h2 className="concept-heading">{title}</h2>
        {detail ? <p className="concept-copy max-w-3xl text-sm md:text-[0.95rem]">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ConceptMetaChip({
  children,
  tone = "muted",
  className
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "success" | "danger";
  className?: string;
}) {
  return <span className={cn("concept-chip", `concept-chip-${tone}`, className)}>{children}</span>;
}

export function ConceptMetric({
  label,
  value,
  note,
  className
}: {
  label: string;
  value: string;
  note?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("concept-metric", className)}>
      <div className="concept-meta">{label}</div>
      <div className="concept-metric-value">{value}</div>
      {note ? <div className="concept-metric-note">{note}</div> : null}
    </div>
  );
}

export function ConceptListRow({
  eyebrow,
  title,
  detail,
  aside,
  className
}: {
  eyebrow?: string;
  title: ReactNode;
  detail?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("concept-list-row", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="concept-meta">{eyebrow}</div> : null}
        <div className="mt-2 text-sm font-semibold text-white md:text-[0.96rem]">{title}</div>
        {detail ? <div className="mt-2 text-sm leading-6 text-slate-400">{detail}</div> : null}
      </div>
      {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
    </div>
  );
}

export function ConceptPhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="concept-phone-shell">
      <div className="concept-phone-notch" />
      <div className="concept-phone-screen">{children}</div>
    </div>
  );
}
