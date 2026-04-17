"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SummaryState = {
  watchlistCount: number;
  unreadAlertCount: number;
  plan: {
    statusLabel: string;
    isPremium: boolean;
  };
};

export function ShellSummary() {
  const [summary, setSummary] = useState<SummaryState | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/product/summary", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active || payload.error) return;
        setSummary(payload as SummaryState);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/watchlist"
        className="group flex items-center gap-2 rounded-md border border-bone/[0.08] bg-surface px-3 py-1.5 transition-colors hover:border-bone/[0.14]"
      >
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.10em] text-bone/55 group-hover:text-bone/80">
          Watchlist
        </span>
        <span className="font-mono text-[12px] font-semibold tabular-nums text-text-primary">
          {summary?.watchlistCount ?? 0}
        </span>
      </Link>

      <Link
        href="/alerts"
        className="group flex items-center gap-2 rounded-md border border-bone/[0.08] bg-surface px-3 py-1.5 transition-colors hover:border-aqua/40"
      >
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.10em] text-bone/55 group-hover:text-aqua">
          Alerts
        </span>
        <span className="font-mono text-[12px] font-semibold tabular-nums text-aqua">
          {summary?.unreadAlertCount ?? 0}
        </span>
      </Link>

      <div className="flex items-center gap-2 rounded-md border border-bone/[0.10] bg-surface px-3 py-1.5">
        <span className="live-dot" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.10em] text-bone/75">
          {summary?.plan.statusLabel ?? "Live"}
        </span>
      </div>
    </div>
  );
}
