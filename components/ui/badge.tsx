import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "brand" | "premium" | "success" | "danger" | "muted";
};

/**
 * Badge — sharp (2px radius), uppercase, microlabel-sized, hairline-outlined.
 * No pills. Distinct systems:
 *   - brand = aqua          (primary signal, sparingly)
 *   - premium = bone        (warm premium thread)
 *   - success = mint        (positive delta)
 *   - danger = crimson      (negative/hot)
 *   - muted = bone @ low    (de-emphasized metadata)
 *   - neutral = plain       (default)
 */
const toneClasses: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "border-bone/[0.12] bg-panel text-text-primary",
  brand:   "border-aqua/25 bg-aqua/10 text-aqua",
  premium: "border-bone/25 bg-bone/[0.08] text-bone",
  success: "border-[rgba(74,227,181,0.28)] bg-[rgba(74,227,181,0.10)] text-mint",
  danger:  "border-[rgba(255,77,94,0.28)] bg-[rgba(255,77,94,0.10)] text-crimson",
  muted:   "border-bone/[0.08] bg-transparent text-bone/55"
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-sm border px-1.5 py-0.5 text-center text-[10.5px] font-semibold uppercase leading-none tracking-[0.08em]",
        toneClasses[tone]
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
