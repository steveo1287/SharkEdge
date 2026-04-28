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
  NAV_ICONS,
  isActivePath
} from "./navigation";

type SidebarProps = {
  pathname?: string;
  mobile?: boolean;
  onNavigate?: () => void;
};

function NavIcon({ svgContent }: { svgContent: string }) {
  return <svg viewBox="0 0 16 16" className="h-[15px] w-[15px] shrink-0" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svgContent }} />;
}

function NavLink({ href, label, icon, badge, active, onNavigate }: { href: string; label: string; icon: string; badge?: string; active: boolean; onNavigate?: () => void }) {
  return (
    <Link href={href} onClick={onNavigate} data-active={active ? "true" : undefined} className={cn("nav-item group", active && "text-text-primary")}>
      <span className={cn("shrink-0 transition-colors", active ? "text-aqua" : "text-bone/40 group-hover:text-bone/70")}><NavIcon svgContent={icon} /></span>
      <span className="flex-1 truncate">{label}</span>
      {badge && <span className="rounded-sm border border-aqua/25 bg-aqua/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-aqua">{badge}</span>}
    </Link>
  );
}

function SectionDivider({ label }: { label: string }) {
  return <div className="mb-1 mt-5 flex items-center gap-2 px-4"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-bone/40">{label}</span><div className="h-px flex-1 bg-bone/[0.06]" /></div>;
}

function LeaguePills({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-wrap gap-1 px-4">
      {LEAGUE_NAV_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href);
        return <Link key={item.href} href={item.href} onClick={onNavigate} className={cn("rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] transition-colors", active ? "bg-aqua/10 text-aqua" : "text-bone/45 hover:text-bone/80")}>{item.label}</Link>;
      })}
    </div>
  );
}

export function Sidebar({ pathname: pathnameProp, mobile = false, onNavigate }: SidebarProps) {
  const routerPathname = usePathname();
  const pathname = pathnameProp ?? routerPathname ?? "";

  return (
    <div className={cn("flex h-full flex-col", mobile ? "w-[272px] bg-abyss" : "bg-abyss")}>
      <div className="flex items-center justify-between border-b border-bone/[0.06] px-5 py-[18px]"><BrandMark compact /><div className="flex items-center gap-1.5"><span className="live-dot" /></div></div>
      <div className="border-b border-bone/[0.06] px-3 py-2.5"><button type="button" className="flex w-full items-center gap-2 rounded-md border border-bone/[0.06] bg-surface px-2.5 py-1.5 text-[11.5px] text-bone/50 transition-colors hover:border-bone/[0.12] hover:text-bone/80"><svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.25" /><path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /></svg><span className="flex-1 text-left">Search…</span><kbd className="font-mono text-[10px] tracking-tight text-bone/40">⌘K</kbd></button></div>
      <nav className="flex-1 overflow-y-auto py-2">
        <div className="py-1">{MAIN_NAV_ITEMS.map((item) => <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} badge={item.badge} active={isActivePath(pathname, item.href)} onNavigate={onNavigate} />)}</div>
        <SectionDivider label="Leagues" />
        <LeaguePills pathname={pathname} onNavigate={onNavigate} />
        <SectionDivider label="Workspace" />
        <div className="py-1">
          <NavLink href="/sim/accuracy" label="Sim Accuracy" icon={NAV_ICONS.performance} badge="GRADE" active={isActivePath(pathname, "/sim/accuracy")} onNavigate={onNavigate} />
          {SECONDARY_NAV_ITEMS.map((item) => <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActivePath(pathname, item.href)} onNavigate={onNavigate} />)}
        </div>
        <SectionDivider label="Research" />
        <div className="py-1">{RESEARCH_NAV_ITEMS.map((item) => <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActivePath(pathname, item.href)} onNavigate={onNavigate} />)}</div>
      </nav>
      <div className="border-t border-bone/[0.06] py-2"><NavLink href="/settings" label="Settings" icon={NAV_ICONS.settings} active={isActivePath(pathname, "/settings")} onNavigate={onNavigate} /><div className="mt-1 px-5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-bone/30">v3 · Research Preview</div></div>
    </div>
  );
}
