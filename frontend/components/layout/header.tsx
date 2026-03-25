"use client";

import type { ReactNode } from "react";

import { useBetSlip } from "@/components/bets/bet-slip-provider";
import { Badge } from "@/components/ui/badge";
import { brandKit } from "@/lib/brand/brand-kit";

const titles: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Odds Board",
    subtitle: "Scan pregame markets, compare books, and surface where price matters."
  },
  "/props": {
    title: "Props Explorer",
    subtitle: "Filter player markets, compare price, and log the best entry fast."
  },
  "/bets": {
    title: "Bet Tracker",
    subtitle: "Use the real ledger, manage straight bets and parlays, and keep active tickets tied to live event state."
  },
  "/performance": {
    title: "Performance",
    subtitle: "Review what is working, where the leaks are, and how the portfolio is trending."
  },
  "/trends": {
    title: "Trends Builder",
    subtitle: "Trend storage is in place now; the full query runner is the next layer on top."
  }
};

type HeaderProps = {
  pathname: string;
  toggleMobileNav?: ReactNode;
};

export function Header({ pathname, toggleMobileNav }: HeaderProps) {
  const active = titles[pathname] ?? titles["/"];
  const { entries, setOpen } = useBetSlip();

  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-slate-950/85 px-4 py-4 backdrop-blur xl:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {toggleMobileNav}
          <div>
            <div className="font-display text-2xl font-semibold tracking-tight text-white">
              {active.title}
            </div>
            <p className="mt-1 text-sm text-slate-400">{active.subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-line bg-slate-900/80 px-4 py-2 text-sm font-medium text-white"
          >
            Bet Slip
            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">
              {entries.length}
            </span>
          </button>
          <Badge tone="premium">{brandKit.headerBadges.premium}</Badge>
          <Badge tone="brand">{brandKit.headerBadges.brand}</Badge>
        </div>
      </div>
    </header>
  );
}
