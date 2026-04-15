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
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#070910]/88 px-5 py-4 backdrop-blur-2xl xl:px-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {toggleMobileNav}
          <div className="min-w-0">
            <div className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-cyan-300">
              {active.eyebrow}
            </div>
            <div className="mt-1 font-display text-[1.55rem] font-semibold tracking-tight text-white xl:text-[1.9rem]">
              {active.title}
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{active.subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden xl:block">
            <ShellSummary />
          </div>
          {betSlip ? (
            <button
              type="button"
              onClick={() => betSlip.setOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/[0.12]"
            >
              Slip
              <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] text-cyan-200">
                {betSlip.entries.length}
              </span>
            </button>
          ) : (
            <Link
              href="/bets"
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-cyan-400/25 hover:bg-white/[0.06]"
            >
              Portfolio
            </Link>
          )}
        </div>
      </div>

      <div className="mt-3 xl:hidden">
        <ShellSummary />
      </div>
    </header>
  );
}
