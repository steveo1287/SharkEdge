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
        compact ? "text-[0.82rem]" : "",
        active
          ? "bg-white/[0.05] text-white shadow-[inset_0_0_0_1px_rgba(56,189,248,0.18)]"
          : "text-slate-400 hover:bg-white/[0.03] hover:text-white"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("font-medium", active ? "text-white" : "text-slate-300")}>{label}</span>
      </div>
    </Link>
  );
}

export function Sidebar({ pathname, mobile = false, onNavigate }: SidebarProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_18%),#06111b] p-5 backdrop-blur-xl",
        mobile ? "rounded-[2rem] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.45)]" : ""
      )}
    >
      {mobile ? (
        <div className="flex items-center justify-between gap-3 rounded-[1.3rem] border border-white/8 bg-white/[0.03] px-4 py-3">
          <div>
            <div className="text-[0.64rem] uppercase tracking-[0.3em] text-slate-500">Navigation</div>
            <div className="mt-1 text-sm font-medium text-white">Move the desk without losing context.</div>
          </div>
          <div className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-sky-300">
            Mobile
          </div>
        </div>
      ) : null}

      <BrandMark />

      <div className="border-t border-white/8 pt-5">
        <div className="text-[0.64rem] uppercase tracking-[0.3em] text-slate-500">Command</div>
        <div className="mt-3 grid gap-1.5">
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

      <div className="border-t border-white/8 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[0.64rem] uppercase tracking-[0.3em] text-slate-500">League desks</div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.6rem] uppercase tracking-[0.22em] text-slate-400">
            {LEAGUE_NAV_ITEMS.length}
          </span>
        </div>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
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

      <div className="border-t border-white/8 pt-5">
        <div className="text-[0.64rem] uppercase tracking-[0.3em] text-slate-500">Workflow</div>
        <div className="mt-3 grid gap-1.5">
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

      <div className="border-t border-white/8 pt-5">
        <div className="text-[0.64rem] uppercase tracking-[0.3em] text-slate-500">Research</div>
        <div className="mt-3 grid gap-1.5">
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

      <div className="mt-auto rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4">
        <div className="text-[0.64rem] uppercase tracking-[0.3em] text-slate-500">Desk rules</div>
        <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-300">
          <div className="flex items-center justify-between gap-3">
            <span>League-first routing</span>
            <span className="text-white">On</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Verified prices</span>
            <span className="text-white">Required</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Explainability</span>
            <span className="text-white">Always on</span>
          </div>
        </div>
      </div>
    </div>
  );
}
