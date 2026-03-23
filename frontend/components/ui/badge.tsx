import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "brand" | "premium" | "success" | "danger" | "muted";
};

const toneClasses: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "border-line bg-slate-900 text-slate-200",
  brand: "border-sky-400/30 bg-sky-500/10 text-sky-300",
  premium: "border-amber-300/30 bg-amber-400/10 text-amber-200",
  success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  danger: "border-rose-400/30 bg-rose-500/10 text-rose-300",
  muted: "border-line/70 bg-slate-900/70 text-slate-400"
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        toneClasses[tone]
      )}
    >
      {children}
    </span>
  );
}
