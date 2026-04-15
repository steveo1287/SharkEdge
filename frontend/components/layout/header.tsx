"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useOptionalBetSlip } from "@/components/bets/bet-slip-provider";
import { ShellSummary } from "@/components/layout/shell-summary";
import { getRouteMeta } from "@/components/layout/navigation";

type HeaderProps = {
  pathname: string;
  toggleMobileNav?: ReactNode;
};

export function Header({ pathname, toggleMobileNav }: HeaderProps) {
  const active = getRouteMeta(pathname);
  const betSlip = useOptionalBetSlip();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-zinc-800/60 bg-[#0f1014]/95 px-6 py-3 backdrop-blur-xl">
      {/* Left: page context */}
      <div className="flex min-w-0 items-center gap-3">
        {toggleMobileNav}
        <div className="min-w-0">
          <div className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            {active.eyebrow}
          </div>
          <div className="font-display text-[1.05rem] font-semibold leading-tight tracking-tight text-white">
            {active.title}
          </div>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Shell summary (market status chip) */}
        <div className="hidden lg:block">
          <ShellSummary />
        </div>

        {/* Search — placeholder */}
        <button
          type="button"
          aria-label="Search"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700/50 bg-zinc-800/40 text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
            <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

        {/* Alerts */}
        <Link
          href="/alerts"
          aria-label="Alerts"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700/50 bg-zinc-800/40 text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
            <path d="M8 2a3 3 0 00-3 3v2c0 .52-.15 1.03-.43 1.47L3.5 11h9l-1.07-2.53A3 3 0 0111 7V5a3 3 0 00-3-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M6.5 13a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </Link>

        {/* Bet slip */}
        {betSlip ? (
          <button
            type="button"
            onClick={() => betSlip.setOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-1.5 text-[0.75rem] font-medium text-zinc-300 transition hover:border-blue-500/40 hover:bg-blue-500/8 hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
              <rect x="2.5" y="4" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M2.5 7h11M6 10.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Slip
            {betSlip.entries.length > 0 && (
              <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-500 px-1 text-[0.6rem] font-bold text-white">
                {betSlip.entries.length}
              </span>
            )}
          </button>
        ) : (
          <Link
            href="/bets"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-1.5 text-[0.75rem] font-medium text-zinc-300 transition hover:border-blue-500/40 hover:bg-blue-500/8 hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
              <rect x="2.5" y="4" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M2.5 7h11M6 10.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            My Bets
          </Link>
        )}
      </div>
    </header>
  );
}
