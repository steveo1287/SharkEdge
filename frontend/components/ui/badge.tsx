import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "brand" | "premium" | "success" | "danger" | "muted";
};

const toneClasses: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "border-line bg-slate-950/80 text-slate-200",
  brand: "border-sky-400/28 bg-sky-500/12 text-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
  premium: "border-amber-300/28 bg-amber-400/12 text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
  success: "border-emerald-400/28 bg-emerald-500/12 text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
  danger: "border-rose-400/28 bg-rose-500/12 text-rose-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
  muted: "border-line/80 bg-slate-950/72 text-slate-400"
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.18em]",
        toneClasses[tone]
      )}
    >
      {children}
    </span>
  );
}
