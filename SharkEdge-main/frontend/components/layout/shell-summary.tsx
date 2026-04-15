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
    <div className="flex flex-wrap items-center gap-2.5">
      <Link
        href="/watchlist"
        className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-white"
      >
        Watchlist
        <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] text-amber-200">
          {summary?.watchlistCount ?? 0}
        </span>
      </Link>
      <Link
        href="/alerts"
        className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-white"
      >
        Alerts
        <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] text-cyan-200">
          {summary?.unreadAlertCount ?? 0}
        </span>
      </Link>
      <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
        {summary?.plan.statusLabel ?? "Free"}
      </div>
    </div>
  );
}
