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

  // Close nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when nav is open
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
    <div className="min-h-screen">
      {/* ── MOBILE (< xl) ── */}
      <div className="xl:hidden">
        {/* Slide-in nav overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              type="button"
            />
            {/* Drawer */}
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

          {/* Logo in mobile top bar */}
          <BrandMark compact />

          {/* Live pill */}
          <div className="rounded-full border border-emerald-400/20 bg-emerald-500/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Live
          </div>
        </div>

        {/* Page content */}
        <main className="min-h-screen px-4 pb-28 pt-4">
          {children}
        </main>

        {/* Bottom nav */}
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
          <MobileBottomNav />
        </div>
      </div>

      {/* ── DESKTOP (xl+) ── */}
      <div className="hidden xl:flex xl:min-h-screen">
        {/* Fixed sidebar */}
        <aside className="sticky top-0 h-screen w-72 shrink-0 border-r border-white/6">
          <Sidebar pathname={pathname} />
        </aside>

        {/* Main content area */}
        <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
          <Header pathname={pathname} />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
