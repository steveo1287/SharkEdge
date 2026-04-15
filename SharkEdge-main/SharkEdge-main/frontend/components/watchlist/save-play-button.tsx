"use client";

import { useState, type ReactNode } from "react";

import type { BetIntent } from "@/lib/types/bet-intelligence";
import { encodeBetIntent } from "@/lib/utils/bet-intelligence";
import { cn } from "@/lib/utils/cn";

type SavePlayButtonProps = {
  intent: BetIntent;
  className?: string;
  children?: ReactNode;
};

const baseClasses =
  "inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm font-medium transition-colors";

export function SavePlayButton({
  intent,
  className,
  children = "Save"
}: SavePlayButtonProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleSave() {
    setStatus("saving");

    const response = await fetch("/api/watchlist/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        intent: encodeBetIntent(intent)
      })
    });

    if (!response.ok) {
      setStatus("error");
      return;
    }

    setStatus("saved");
  }

  return (
    <button
      type="button"
      onClick={handleSave}
      className={cn(
        baseClasses,
        status === "saved"
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
          : status === "error"
            ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
            : "border-line bg-slate-900/80 text-slate-200",
        className
      )}
    >
      {status === "saving"
        ? "Saving..."
        : status === "saved"
          ? "Saved"
          : status === "error"
            ? "Retry save"
            : children}
    </button>
  );
}
