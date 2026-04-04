"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useOptionalBetSlip } from "@/components/bets/bet-slip-provider";
import { ShellSummary } from "@/components/layout/shell-summary";
import {
  MAIN_NAV_ITEMS,
  getRouteMeta,
  isActivePath
} from "@/components/layout/navigation";

type HeaderProps = {
  pathname: string;
  toggleMobileNav?: ReactNode;
};

function getDeskStatus(pathname: string) {
  if (
    pathname === "/" ||
    isActivePath(pathname, "/board") ||
    isActivePath(pathname, "/games") ||
    pathname.startsWith("/game/") ||
    isActivePath(pathname, "/props")
  ) {
    return {
      label: "Core workflow",
      className:
        "rounded-full border border-emerald-400/15 bg-emerald-400/8 px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-emerald-300"
    };
  }

  if (
    isActivePath(pathname, "/players") ||
    isActivePath(pathname, "/teams") ||
    isActivePath(pathname, "/trends") ||
    isActivePath(pathname, "/content")
  ) {
    return {
      label: "Research beta",
      className:
        "rounded-full border border-amber-400/15 bg-amber-400/8 px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-amber-200"
    };
  }

  return {
    label: "Workflow beta",
    className:
      "rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-slate-300"
  };
}

export function Header({ pathname, toggleMobileNav }: HeaderProps) {
  const active = getRouteMeta(pathname);
  const betSlip = useOptionalBetSlip();
  const deskStatus = getDeskStatus(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_20%),rgba(7,17,28,0.9)] px-4 py-4 backdrop-blur-xl xl:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {toggleMobileNav}
          <div className="min-w-0">
            <div className="text-[0.64rem] font-semibold uppercase tracking-[0.32em] text-sky-300">
              {active.eyebrow}
            </div>
            <div className="mt-2 font-display text-[1.9rem] font-semibold tracking-tight text-white md:text-[2.15rem]">
              {active.title}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 md:text-[0.95rem]">
              {active.subtitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="hidden xl:block">
            <ShellSummary />
          </div>
          {betSlip ? (
            <button
              type="button"
              onClick={() => betSlip.setOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:border-sky-400/20 hover:bg-sky-500/10"
            >
              Bet Slip
              <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">
                {betSlip.entries.length}
              </span>
            </button>
          ) : (
            <Link
              href="/bets"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:border-sky-400/20 hover:bg-sky-500/10"
            >
              Open Bets
            </Link>
          )}
          <div className={deskStatus.className}>{deskStatus.label}</div>
        </div>
      </div>

      <div className="mt-4 xl:hidden">
        <ShellSummary />
      </div>

      <nav className="mt-4 hidden flex-wrap gap-2 md:flex">
        {MAIN_NAV_ITEMS.map((item) => {
          const activeItem = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                activeItem
                  ? "rounded-full border border-sky-400/35 bg-sky-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white"
                  : "rounded-full border border-white/8 bg-white/[0.02] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 transition hover:border-white/12 hover:text-white"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
