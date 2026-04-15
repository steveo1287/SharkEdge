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
    <header className="sticky top-0 z-20 border-b border-white/8 bg-[#07111c]/90 px-5 py-4 backdrop-blur-xl xl:px-8">
      <div className="flex items-center justify-between gap-4">
        {/* Left: mobile hamburger + page title */}
        <div className="flex min-w-0 items-center gap-3">
          {toggleMobileNav}
          <div className="min-w-0">
            <div className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-sky-400">
              {active.eyebrow}
            </div>
            <div className="mt-0.5 font-display text-xl font-semibold tracking-tight text-white">
              {active.title}
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden xl:block">
            <ShellSummary />
          </div>
          {betSlip ? (
            <button
              type="button"
              onClick={() => betSlip.setOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25 hover:bg-sky-500/10"
            >
              Slip
              {betSlip.entries.length > 0 && (
                <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">
                  {betSlip.entries.length}
                </span>
              )}
            </button>
          ) : (
            <Link
              href="/bets"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25 hover:bg-sky-500/10"
            >
              Bets
            </Link>
          )}
        </div>
      </div>

      {/* Subtitle — only on desktop where there's room */}
      {active.subtitle && (
        <p className="mt-1.5 hidden max-w-2xl text-sm leading-6 text-slate-500 xl:block">
          {active.subtitle}
        </p>
      )}

      <div className="mt-3 xl:hidden">
        <ShellSummary />
      </div>
    </header>
  );
}
