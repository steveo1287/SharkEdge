"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { MobileBottomNav } from "@/components/mobile/mobile-bottom-nav";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <>
      {/* ── DESKTOP ─────────────────────────────────────────────────────── */}
      <div className="hidden xl:flex xl:min-h-screen xl:w-full">
        {/* Fixed sidebar */}
        <aside className="h-screen w-[220px] shrink-0 sticky top-0 border-r border-zinc-800/60">
          <Sidebar pathname={pathname} />
        </aside>

        {/* Main area */}
        <div className="flex flex-1 min-w-0 flex-col">
          <Header pathname={pathname} />
          <main className="flex-1">
            <div className="page-shell">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* ── MOBILE ──────────────────────────────────────────────────────── */}
      <div className="xl:hidden">
        {/* Mobile slide-over nav */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              type="button"
            />
            <div className="relative z-10 h-full overflow-hidden">
              <Sidebar mobile pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 border-b border-zinc-800/60 bg-[#0f1014]/95 backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700/50 bg-zinc-800/50 text-zinc-400"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path d="M4 7h16M4 12h12M4 17h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>

            {/* Logo */}
            <div className="font-display text-[0.95rem] font-semibold text-white">
              Shark<span className="text-blue-400">Edge</span>
            </div>

            {/* Live badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/8 px-2.5 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
              </span>
              <span className="text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-green-400">Live</span>
            </div>
          </div>
        </div>

        {/* Mobile content */}
        <div className="mx-auto w-full max-w-[430px]">
          <div className="min-h-screen px-3 pb-28 pt-4">
            <main className="mobile-page-shell">{children}</main>
          </div>
        </div>

        {/* Mobile bottom nav */}
        <div className="fixed inset-x-0 bottom-0 z-40">
          <div className="mx-auto w-full max-w-[430px]">
            <MobileBottomNav />
          </div>
        </div>
      </div>
    </>
  );
}
