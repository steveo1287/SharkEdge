"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { MobileBottomNav } from "@/components/mobile/mobile-bottom-nav";
import { BrandMark } from "@/components/layout/brand-mark";

import { Header } from "./header";
import { Sidebar } from "./sidebar";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <div className="app-shell-grid min-h-screen">

      {/* ── MOBILE (< xl) ── */}
      <div className="xl:hidden">
        {/* Slide-in nav overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              type="button"
            />
            <div className="relative z-10 h-full w-72 overflow-hidden">
              <Sidebar
                mobile
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/8 bg-[#060f19]/95 px-4 py-3 backdrop-blur-xl">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-sky-400/25 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path
                d="M4 7h16M4 12h10M4 17h12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <BrandMark compact />

          <div className="rounded-full border border-emerald-400/20 bg-emerald-500/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Live
          </div>
        </div>

        {/* Mobile page content */}
        <div className="mobile-shell mx-auto flex min-h-screen w-full max-w-[430px] flex-col">
          <div className="flex-1 px-4 pb-28 pt-4">
            <main className="mobile-page-shell">{children}</main>
          </div>
          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
            <MobileBottomNav />
          </div>
        </div>
      </div>

      {/* ── DESKTOP (xl+) ── */}
      <div className="mx-auto hidden w-full max-w-[1820px] px-4 py-4 xl:block">
        <div className="workspace-frame grid min-h-[calc(100vh-2rem)] w-full xl:grid-cols-[288px_minmax(0,1fr)]">

          {/* Sidebar */}
          <aside className="hidden min-h-full border-r border-white/6 xl:block">
            <Sidebar pathname={pathname} />
          </aside>

          {/* Main */}
          <div className="workspace-main flex min-h-[calc(100vh-2rem)] flex-col">
            <Header pathname={pathname} />
            <main className="page-shell flex-1">{children}</main>
          </div>

        </div>
      </div>

    </div>
  );
}
