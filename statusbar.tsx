"use client";

import type { ReactNode } from "react";
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

function NavIcon({ path, color = "currentColor" }: { path: string; color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

const NAV_ICONS: Record<string, string> = {
  "/":            "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  "/board":       "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
  "/games":       "M12 2a10 10 0 110 20A10 10 0 0112 2z M12 6v6l4 2",
  "/trends":      "M22 12l-4-4-4 9-4-9-4 4",
  "/props":       "M12 2a10 10 0 110 20A10 10 0 0112 2z M12 8v4 M12 16h.01",
  "/bets":        "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  "/alerts":      "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0",
  "/watchlist":   "M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z",
  "/performance": "M18 20V10 M12 20V4 M6 20v-6",
  "/players":     "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
  "/teams":       "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 3a4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
  "/content":     "M4 6h16 M4 12h8 M4 18h12",
  "/leagues/nba": "M12 2a10 10 0 110 20A10 10 0 0112 2z M12 2v20 M12 7c2.5 0 5 1.5 5 5s-2.5 5-5 5",
  "/leagues/mlb": "M12 2a10 10 0 110 20A10 10 0 0112 2z",
  "/leagues/nhl": "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  "/leagues/nfl": "M12 2a10 10 0 110 20A10 10 0 0112 2z",
  "/leagues/ncaab": "M12 2a10 10 0 110 20A10 10 0 0112 2z M12 7c2.5 0 5 1.5 5 5s-2.5 5-5 5",
  "/leagues/ncaaf": "M12 2a10 10 0 110 20A10 10 0 0112 2z",
  "/leagues/ufc": "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  "/leagues/boxing": "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
};

const NAV_BADGES: Record<string, { label: string; tone: "live" | "blue" | "amber" | "red" | "dim" }> = {
  "/board":   { label: "24", tone: "live" },
  "/trends":  { label: "7",  tone: "blue" },
  "/alerts":  { label: "3",  tone: "red" },
  "/leagues/nba": { label: "12", tone: "blue" },
  "/leagues/mlb": { label: "8",  tone: "amber" },
};

function NavBadge({ tone, label }: { tone: string; label: string }) {
  const styles: Record<string, string> = {
    live:  "bg-emerald-500/10 text-emerald-400 border border-emerald-400/20 animate-pulse",
    blue:  "bg-sky-500/10 text-sky-400 border border-sky-400/20",
    amber: "bg-amber-500/8 text-amber-300 border border-amber-400/20",
    red:   "bg-rose-500/8 text-rose-400 border border-rose-400/20",
    dim:   "bg-white/5 text-slate-500 border border-white/10",
  };
  return (
    <span className={cn("ml-auto text-[0.58rem] font-bold tracking-wide px-1.5 py-0.5 rounded-md", styles[tone] ?? styles.dim)}>
      {tone === "live" ? "● " : ""}{label}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="nav-section-label mb-1.5 mt-1">
      {children}
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  const badge = NAV_BADGES[href];
  const iconPath = NAV_ICONS[href] ?? "M12 12h.01";

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "nav-item",
        active && "active"
      )}
    >
      <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", opacity: active ? 1 : 0.55, flexShrink: 0 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {iconPath.split(" M").map((d, i) => (
            <path key={i} d={i === 0 ? d : "M" + d} />
          ))}
        </svg>
      </span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {badge && <NavBadge tone={badge.tone} label={badge.label} />}
    </Link>
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
      {/* LOGO */}
      <div className="shrink-0 px-5 pb-4 pt-5 border-b border-white/[0.05]">
        <BrandMark compact />
      </div>

      {/* NAV */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-3">
        <div className="mb-4">
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

        <div className="mb-4">
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

        <div className="mb-4">
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

      {/* STATUS FOOTER */}
      <div className="shrink-0 px-3 pb-4 border-t border-white/[0.05] pt-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-500/[0.05] border border-emerald-400/10 px-3 py-2.5">
          <div className="live-dot shrink-0" />
          <div className="min-w-0">
            <div className="text-[0.68rem] font-semibold text-emerald-400 leading-none">All systems live</div>
            <div className="text-[0.6rem] text-slate-600 mt-0.5">3 providers · 1m ago</div>
          </div>
        </div>
      </div>
    </div>
  );
}
