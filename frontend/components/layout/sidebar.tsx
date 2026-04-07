import Link from "next/link";

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
  pathname: string;
  mobile?: boolean;
  onNavigate?: () => void;
};

function NavLink({
  href,
  label,
  active,
  onNavigate,
  compact = false
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group rounded-[1.15rem] border border-transparent px-4 py-3 transition",
        compact ? "text-[0.82rem]" : "text-[0.95rem]",
        active
          ? "bg-white/[0.05] text-white shadow-[inset_0_0_0_1px_rgba(56,189,248,0.28)]"
          : "text-slate-400 hover:bg-white/[0.03] hover:text-white"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("font-medium", active ? "text-white" : "text-slate-300")}>
          {label}
        </span>
      </div>
    </Link>
  );
}

export function Sidebar({ pathname, mobile = false, onNavigate }: SidebarProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-6 bg-[#060f19]/96 p-5 backdrop-blur-xl",
        mobile ? "rounded-r-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.45)]" : ""
      )}
    >
      {/* LOGO */}
      <BrandMark />

      {/* COMMAND */}
      <div className="border-t border-white/8 pt-4">
        <div className="text-[0.6rem] uppercase tracking-[0.32em] text-slate-500">
          Command
        </div>

        <div className="mt-3 grid gap-2">
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

      {/* LEAGUE DESKS */}
      <div className="border-t border-white/8 pt-4">
        <div className="flex items-center justify-between">
          <div className="text-[0.6rem] uppercase tracking-[0.32em] text-slate-500">
            League desks
          </div>

          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.6rem] uppercase tracking-[0.22em] text-slate-400">
            {LEAGUE_NAV_ITEMS.length}
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {LEAGUE_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActivePath(pathname, item.href)}
              onNavigate={onNavigate}
              compact
            />
          ))}
        </div>
      </div>

      {/* WORKFLOW */}
      <div className="border-t border-white/8 pt-4">
        <div className="text-[0.6rem] uppercase tracking-[0.32em] text-slate-500">
          Workflow
        </div>

        <div className="mt-3 grid gap-2">
          {SECONDARY_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActivePath(pathname, item.href)}
              onNavigate={onNavigate}
              compact
            />
          ))}
        </div>
      </div>

      {/* RESEARCH */}
      <div className="border-t border-white/8 pt-4">
        <div className="text-[0.6rem] uppercase tracking-[0.32em] text-slate-500">
          Research
        </div>

        <div className="mt-3 grid gap-2">
          {RESEARCH_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActivePath(pathname, item.href)}
              onNavigate={onNavigate}
              compact
            />
          ))}
        </div>
      </div>

      {/* FOOTER RULES */}
      <div className="mt-auto rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4">
        <div className="text-[0.6rem] uppercase tracking-[0.32em] text-slate-500">
          Desk rules
        </div>

        <div className="mt-3 grid gap-2 text-sm text-slate-300">
          <div className="flex justify-between">
            <span>League-first routing</span>
            <span className="text-white">On</span>
          </div>
          <div className="flex justify-between">
            <span>Verified prices</span>
            <span className="text-white">Required</span>
          </div>
          <div className="flex justify-between">
            <span>Explainability</span>
            <span className="text-white">Always on</span>
          </div>
        </div>
      </div>
    </div>
  );
}