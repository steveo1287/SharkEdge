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
    <div className="app-shell-grid min-h-screen bg-grid bg-[length:44px_44px]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-[290px] shrink-0 xl:block">
          <Sidebar pathname={pathname} />
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 xl:hidden">
            <button
              aria-label="Close mobile navigation"
              className="absolute inset-0 bg-slate-950/70"
              onClick={() => setMobileOpen(false)}
              type="button"
            />
            <div className="relative h-full w-[290px]">
              <Sidebar
                mobile
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </div>
        ) : null}

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Header
            pathname={pathname}
            toggleMobileNav={
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-11 min-w-[72px] items-center justify-center rounded-2xl border border-line bg-slate-900 px-3 text-white xl:hidden"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.2em]">Menu</span>
              </button>
            }
          />
          <main className="flex-1 px-4 py-6 xl:px-8 xl:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
