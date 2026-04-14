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
      <div className="xl:hidden">
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              type="button"
            />
            <div className="relative z-10 h-full w-72 overflow-hidden">
              <Sidebar mobile pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="hard-shell-header sticky top-0 z-40 rounded-b-[1.4rem] px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="mobile-icon-button"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path d="M4 7h16M4 12h10M4 17h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>

            <div className="flex min-w-0 items-center gap-3">
              <BrandMark compact />
              <div className="hidden min-[380px]:block text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">market command</div>
            </div>

            <div className="hard-chip hard-chip--brand">Live</div>
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

      <div className="mx-auto hidden w-full max-w-[1860px] px-4 py-4 xl:block">
        <div className="workspace-frame grid min-h-[calc(100vh-2rem)] w-full xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="hidden min-h-full border-r border-white/6 xl:block">
            <Sidebar pathname={pathname} />
          </aside>
          <div className="workspace-main flex min-h-[calc(100vh-2rem)] flex-col">
            <div className="hard-shell-header m-4 mb-0 rounded-[1.45rem] px-5 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <BrandMark />
                  <div className="h-8 w-px bg-white/8" />
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">SharkEdge Terminal</div>
                    <div className="mt-1 text-sm text-slate-300">Live odds, trends, props, and execution in one flow.</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="hard-chip hard-chip--success">verified board</div>
                  <div className="hard-chip">deep game desk</div>
                </div>
              </div>
            </div>
            <Header pathname={pathname} />
            <main className="page-shell flex-1">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
