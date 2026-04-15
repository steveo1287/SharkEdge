"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

import { BrandMark } from "./brand-mark";
import {
  LEAGUE_NAV_ITEMS,
  MAIN_NAV_ITEMS,
  RESEARCH_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  isActivePath
} from "./navigation";

type SidebarProps = {
  pathname?: string;
  mobile?: boolean;
  onNavigate?: () => void;
};

function NavLink({
  href,
  label,
  active,
  onNavigate
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
        active
          ? "bg-sky-500/10 text-white shadow-[inset_0_0_0_1px_rgba(56,189,248,0.22)]"
          : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
      )}
    >
      {label}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 px-3 text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-slate-600">
      {children}
    </div>
  );
}

export function Sidebar({ pathname: pathnameProp, mobile = false, onNavigate }: SidebarProps) {
  const routerPathname = usePathname();
  const pathname = pathnameProp ?? routerPathname ?? "";

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-[#060f19]/98 backdrop-blur-xl",
        mobile ? "rounded-r-2xl shadow-[0_30px_80px_rgba(0,0,0,0.5)]" : ""
      )}
    >
      {/* LOGO — always visible, never scrolls away */}
      <div className="shrink-0 px-5 pb-4 pt-5">
        <BrandMark compact />
      </div>

      {/* SCROLLABLE NAV */}
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {/* CORE */}
        <div className="mb-5">
          <SectionLabel>Core</SectionLabel>
          <div className="grid gap-0.5">
            {MAIN_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActivePath(pathname, item.href)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>

        {/* LEAGUES */}
        <div className="mb-5">
          <SectionLabel>Leagues</SectionLabel>
          <div className="grid gap-0.5">
            {LEAGUE_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActivePath(pathname, item.href)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>

        {/* WORKFLOW */}
        <div className="mb-5">
          <SectionLabel>Workflow</SectionLabel>
          <div className="grid gap-0.5">
            {SECONDARY_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActivePath(pathname, item.href)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>

        {/* RESEARCH */}
        <div>
          <SectionLabel>Research</SectionLabel>
          <div className="grid gap-0.5">
            {RESEARCH_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActivePath(pathname, item.href)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
