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
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-bone/[0.06] bg-ink/80 px-6 py-3 backdrop-blur-xl">
      {/* Left: page context */}
      <div className="flex min-w-0 items-center gap-3">
        {toggleMobileNav}
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-bone/55">
            {active.eyebrow}
          </div>
          <div className="mt-1 font-display text-[19px] font-semibold leading-none tracking-[-0.01em] text-text-primary">
            {active.title}
          </div>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden lg:block">
          <ShellSummary />
        </div>

        {/* Search (⌘K trigger — UI stub) */}
        <button
          type="button"
          aria-label="Search"
          className="flex h-8 items-center gap-2 rounded-md border border-bone/[0.08] bg-surface px-2.5 text-bone/60 transition-colors hover:border-bone/[0.14] hover:text-bone/90"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
            <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.25" />
            <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
          <kbd className="font-mono text-[10px] tracking-tight">⌘K</kbd>
        </button>

        {/* Alerts */}
        <Link
          href="/alerts"
          aria-label="Alerts"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-bone/[0.08] bg-surface text-bone/60 transition-colors hover:border-aqua/40 hover:text-aqua"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
            <path d="M8 2a3 3 0 00-3 3v2c0 .52-.15 1.03-.43 1.47L3.5 11h9l-1.07-2.53A3 3 0 0111 7V5a3 3 0 00-3-3z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
            <path d="M6.5 13a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
        </Link>

        {/* Bet slip */}
        {betSlip ? (
          <button
            type="button"
            onClick={() => betSlip.setOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-md border border-bone/[0.08] bg-surface px-3 text-[12px] font-medium text-bone/80 transition-colors hover:border-aqua/40 hover:bg-aqua/5 hover:text-aqua"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
              <rect x="2.5" y="4" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.25" />
              <path d="M2.5 7h11M6 10.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
            Slip
            {betSlip.entries.length > 0 && (
              <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-sm bg-aqua px-1 font-mono text-[10px] font-semibold text-ink">
                {betSlip.entries.length}
              </span>
            )}
          </button>
        ) : (
          <Link
            href="/bets"
            className="flex h-8 items-center gap-1.5 rounded-md border border-bone/[0.08] bg-surface px-3 text-[12px] font-medium text-bone/80 transition-colors hover:border-aqua/40 hover:bg-aqua/5 hover:text-aqua"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
              <rect x="2.5" y="4" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.25" />
              <path d="M2.5 7h11M6 10.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
            Book
          </Link>
        )}
      </div>
    </header>
  );
}
