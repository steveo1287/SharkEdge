"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useBetSlip } from "@/components/bets/bet-slip-provider";
import type { BetIntent } from "@/lib/types/bet-intelligence";
import { encodeBetIntent } from "@/lib/utils/bet-intelligence";
import { cn } from "@/lib/utils/cn";

type BetActionButtonProps = {
  intent: BetIntent;
  mode?: "slip" | "log";
  className?: string;
  children: ReactNode;
};

const baseClasses =
  "inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm font-medium transition-colors";

export function BetActionButton({
  intent,
  mode = "slip",
  className,
  children
}: BetActionButtonProps) {
  const { addIntent } = useBetSlip();

  if (mode === "log") {
    return (
      <Link
        href={`/bets?prefill=${encodeBetIntent(intent)}`}
        className={cn(
          baseClasses,
          "border-sky-400/30 bg-sky-500/10 text-sky-300",
          className
        )}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => addIntent(intent)}
      className={cn(baseClasses, "border-line bg-slate-900/80 text-slate-200", className)}
    >
      {children}
    </button>
  );
}
