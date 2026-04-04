"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

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
      <div className="mx-auto w-full max-w-[1880px] px-0 py-0 md:px-3 md:py-3 xl:px-4 xl:py-4">
        <div className="workspace-frame grid min-h-screen w-full xl:min-h-[calc(100vh-2rem)] xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="hidden min-h-full border-r border-white/6 xl:block">
            <Sidebar pathname={pathname} />
          </aside>

          {mobileOpen ? (
            <div className="fixed inset-0 z-40 xl:hidden">
              <button
                aria-label="Close mobile navigation"
                className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),transparent_30%),rgba(2,8,15,0.82)] backdrop-blur-sm"
                onClick={() => setMobileOpen(false)}
                type="button"
              />
              <div className="relative h-full w-[332px] max-w-[88vw] px-3 py-4">
                <Sidebar
                  mobile
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
            </div>
          ) : null}

          <div className="workspace-main flex min-h-screen flex-1 flex-col xl:min-h-[calc(100vh-2rem)]">
            <Header
              pathname={pathname}
              toggleMobileNav={
                <button
                  type="button"
                  aria-label="Open navigation"
                  onClick={() => setMobileOpen(true)}
                  className="inline-flex h-11 min-w-[78px] items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] xl:hidden"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.2em]">Menu</span>
                </button>
              }
            />
            <main className="page-shell flex-1">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
