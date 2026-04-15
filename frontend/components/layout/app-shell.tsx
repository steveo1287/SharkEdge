"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { BrandMark } from "./brand-mark";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { MobileBottomNav } from "@/components/mobile/mobile-bottom-nav";

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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <div className="app-shell-grid min-h-screen">
      <div className="xl:hidden">
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 flex">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              type="button"
            />
            <div className="relative z-10 h-full w-[82vw] max-w-[320px] overflow-hidden">
              <Sidebar mobile pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="sticky top-0 z-40 border-b border-white/8 bg-[#06101b]/95 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-sky-400/25 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path d="M4 7h16M4 12h12M4 17h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>

            <BrandMark compact />

            <div className="rounded-full border border-emerald-400/20 bg-emerald-500/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Live
            </div>
          </div>
        </div>

        <div className="mobile-shell mx-auto flex min-h-screen w-full max-w-[430px] flex-col">
          <div className="flex-1 px-4 pb-28 pt-4">
            <main className="mobile-page-shell">{children}</main>
          </div>
          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
            <MobileBottomNav />
          </div>
        </div>
      </div>

      <div className="mx-auto hidden w-full max-w-[1840px] px-4 py-4 xl:block">
        <div className="workspace-frame grid min-h-[calc(100vh-2rem)] w-full xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="hidden min-h-full border-r border-white/6 xl:block">
            <Sidebar pathname={pathname} />
          </aside>

          <div className="workspace-main flex min-h-[calc(100vh-2rem)] flex-col">
            <Header pathname={pathname} />
            <main className="page-shell flex-1">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
