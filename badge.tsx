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
        if (!active || payload.error) {
          return;
        }

        setSummary(payload as SummaryState);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href="/watchlist"
        className="inline-flex items-center gap-2 rounded-2xl border border-line bg-slate-900/80 px-4 py-2 text-sm font-medium text-white"
      >
        Watchlist
        <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-200">
          {summary?.watchlistCount ?? 0}
        </span>
      </Link>
      <Link
        href="/alerts"
        className="inline-flex items-center gap-2 rounded-2xl border border-line bg-slate-900/80 px-4 py-2 text-sm font-medium text-white"
      >
        Alerts
        <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">
          {summary?.unreadAlertCount ?? 0}
        </span>
      </Link>
      <div className="rounded-full border border-line px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
        {summary?.plan.statusLabel ?? "Free"}
      </div>
    </div>
  );
}
