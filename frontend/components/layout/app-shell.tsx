"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { MobileBottomNav } from "@/components/mobile/mobile-bottom-nav";

import { Header } from "./header";
import { Sidebar } from "./sidebar";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell-grid min-h-screen">
      <div className="xl:hidden">
        {mobileOpen ? (
          <div className="fixed inset-0 z-40">
            <button
              aria-label="Close mobile navigation"
              className="absolute inset-0 bg-slate-950/80"
              onClick={() => setMobileOpen(false)}
              type="button"
            />
            <div className="relative h-full w-[300px]">
              <Sidebar mobile pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="mobile-shell mx-auto flex min-h-screen w-full max-w-[430px] flex-col">
          <div className="flex-1 px-4 pb-28 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
            <div className="mb-4 flex items-center justify-between">
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
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                Live
              </div>
            </div>
            <main className="mobile-page-shell">{children}</main>
          </div>
          <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            <MobileBottomNav />
          </div>
        </div>
      </div>

      <div className="mx-auto hidden w-full max-w-[1820px] px-0 py-0 md:px-3 md:py-3 xl:block xl:px-4 xl:py-4">
        <div className="workspace-frame grid min-h-screen w-full xl:min-h-[calc(100vh-2rem)] xl:grid-cols-[288px_minmax(0,1fr)]">
          <aside className="hidden min-h-full border-r border-white/6 xl:block">
            <Sidebar pathname={pathname} />
          </aside>

          <div className="workspace-main flex min-h-screen flex-1 flex-col xl:min-h-[calc(100vh-2rem)]">
            <Header pathname={pathname} />
            <main className="page-shell flex-1">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
