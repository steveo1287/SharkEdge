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
        <aside className="h-screen w-[232px] shrink-0 sticky top-0 border-r border-bone/[0.06]">
          <Sidebar pathname={pathname} />
        </aside>

        <div className="flex flex-1 min-w-0 flex-col bg-ink">
          <Header pathname={pathname} />
          <main className="flex-1">
            <div className="page-shell">{children}</div>
          </main>
        </div>
      </div>

      {/* ── MOBILE ──────────────────────────────────────────────────────── */}
      <div className="xl:hidden">
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-abyss/80 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              type="button"
            />
            <div className="relative z-10 h-full overflow-hidden border-r border-bone/[0.08]">
              <Sidebar mobile pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 border-b border-bone/[0.06] bg-ink/90 backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-bone/[0.10] bg-surface text-bone/70"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path d="M4 7h16M4 12h12M4 17h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-text-primary">
              SHARK<span className="mx-[2px] text-aqua">·</span>EDGE
            </div>

            <div className="flex items-center gap-1.5 rounded-md border border-bone/[0.10] bg-surface px-2.5 py-1.5">
              <span className="live-dot" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.10em] text-bone/80">Live</span>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full">
          <div className="min-h-screen px-4 pb-28 pt-4 sm:max-w-none">
            <main className="mobile-page-shell">{children}</main>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40">
          <div className="mx-auto w-full">
            <MobileBottomNav />
          </div>
        </div>
      </div>
    </>
  );
}
