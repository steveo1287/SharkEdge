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
    <div className="app-shell-grid min-h-screen bg-[radial-gradient(circle_at_top,_rgba(88,255,255,0.06),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(135,76,255,0.05),_transparent_22%)]">
      <div className="xl:hidden">
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              type="button"
            />
            <div className="relative z-10 h-full w-[84vw] max-w-[320px] overflow-hidden">
              <Sidebar mobile pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/[0.06] bg-[#06080e]/92 px-4 py-3 backdrop-blur-2xl">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] border border-white/[0.08] bg-white/[0.04] text-slate-300 transition hover:border-cyan-400/25 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path d="M4 7h16M4 12h10M4 17h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <BrandMark compact />

          <div className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
            Live
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

      <div className="mx-auto hidden w-full max-w-[1880px] px-4 py-4 xl:block">
        <div className="workspace-frame grid min-h-[calc(100vh-2rem)] w-full grid-cols-[312px_minmax(0,1fr)] overflow-hidden rounded-[2rem] border border-white/[0.06] bg-[#05070c]/94 shadow-[0_34px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <aside className="min-h-full border-r border-white/[0.06]">
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
