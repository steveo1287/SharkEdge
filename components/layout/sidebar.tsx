"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";
import {
  LEAGUE_NAV_ITEMS,
  MAIN_NAV_ITEMS,
  RESEARCH_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  NAV_ICONS,
  isActivePath
} from "./navigation";

type SidebarProps = {
  pathname?: string;
  mobile?: boolean;
  onNavigate?: () => void;
};

// ─── Icon renderer ────────────────────────────────────────────────────────────
function NavIcon({ svgContent }: { svgContent: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}

// ─── Nav Link ─────────────────────────────────────────────────────────────────
function NavLink({
  href,
  label,
  icon,
  badge,
  active,
  onNavigate
}: {
  href: string;
  label: string;
  icon: string;
  badge?: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium transition-all duration-100",
        active
          ? "bg-[#1a2436] text-white before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:rounded-r-full before:bg-blue-500"
          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
      )}
    >
      <span className={cn("shrink-0 transition-colors", active ? "text-blue-400" : "text-zinc-500 group-hover:text-zinc-300")}>
        <NavIcon svgContent={icon} />
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="rounded px-1 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide bg-blue-500/15 text-blue-400 border border-blue-500/20">
          {badge}
        </span>
      )}
    </Link>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="mb-1 mt-4 flex items-center gap-2 px-2.5">
      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-zinc-600">
        {label}
      </span>
      <div className="h-px flex-1 bg-zinc-800/60" />
    </div>
  );
}

// ─── League Pills ─────────────────────────────────────────────────────────────
function LeaguePills({
  pathname,
  onNavigate
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 px-2.5">
      {LEAGUE_NAV_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "rounded-md px-2 py-0.5 text-[0.72rem] font-medium transition-all",
              active
                ? "bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/25"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
export function Sidebar({
  pathname: pathnameProp,
  mobile = false,
  onNavigate
}: SidebarProps) {
  const routerPathname = usePathname();
  const pathname = pathnameProp ?? routerPathname ?? "";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        mobile
          ? "w-[260px] bg-[#0f1014] shadow-2xl"
          : "bg-[#0f1014]"
      )}
    >
      {/* ── LOGO ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 border-b border-zinc-800/60 px-4 py-4">
        <Link href="/" onClick={onNavigate} className="group flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-800">
            <img
              src="/brand/sharkedge-logo.jpg"
              alt="SharkEdge"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <div className="font-display text-[0.95rem] font-semibold leading-none tracking-tight text-white">
              Shark<span className="text-blue-400">Edge</span>
            </div>
            <div className="mt-0.5 text-[0.55rem] uppercase tracking-[0.18em] text-zinc-600">
              Intelligence
            </div>
          </div>
        </Link>

        {/* Live indicator */}
        <div className="ml-auto flex items-center gap-1">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
          </span>
        </div>
      </div>

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3">
        {/* Primary */}
        <div className="px-2">
          {MAIN_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              badge={item.badge}
              active={isActivePath(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {/* Leagues */}
        <SectionDivider label="Leagues" />
        <LeaguePills pathname={pathname} onNavigate={onNavigate} />

        {/* My Workspace */}
        <SectionDivider label="My Workspace" />
        <div className="px-2">
          {SECONDARY_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActivePath(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {/* Research */}
        <SectionDivider label="Research" />
        <div className="px-2">
          {RESEARCH_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActivePath(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <div className="border-t border-zinc-800/60 px-2 py-3">
        <NavLink
          href="/settings"
          label="Settings"
          icon={NAV_ICONS.settings}
          active={isActivePath(pathname, "/settings")}
          onNavigate={onNavigate}
        />
        <div className="mt-2 px-2.5 text-[0.6rem] text-zinc-700">
          SharkEdge v3.0 · Research Preview
        </div>
      </div>
    </div>
  );
}
