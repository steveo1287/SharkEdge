import Link from "next/link";

import { brandKit } from "@/lib/brand/brand-kit";
import { cn } from "@/lib/utils/cn";

import { BrandMark } from "./brand-mark";

const navItems = [
  { href: "/", label: "Board" },
  { href: "/props", label: "Props" },
  { href: "/bets", label: "Bets" },
  { href: "/performance", label: "Performance" },
  { href: "/trends", label: "Trends" }
] as const;

type SidebarProps = {
  pathname: string;
  mobile?: boolean;
  onNavigate?: () => void;
};

export function Sidebar({ pathname, mobile = false, onNavigate }: SidebarProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-8 border-r border-line/80 bg-slate-950/95 p-5",
        mobile ? "rounded-r-3xl border-r-0 border-l-0 shadow-panel" : ""
      )}
    >
      <BrandMark />

      <div className="grid gap-2">
        {navItems.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-medium transition",
                active
                  ? "border-sky-400/50 bg-sky-500/10 text-white"
                  : "border-transparent bg-transparent text-slate-300 hover:border-line hover:bg-slate-900/80 hover:text-white"
              )}
            >
              {item.label}
            </Link>
          );
        })}

        <div className="rounded-2xl border border-line/80 bg-slate-900/60 px-4 py-3 text-sm text-slate-500">
          <div className="mb-1 font-medium text-slate-300">Live</div>
          <div>Coming soon with in-play odds and tracker hooks.</div>
        </div>
      </div>

      <div className="mt-auto rounded-3xl border border-line/80 bg-gradient-to-b from-slate-900 to-slate-950 p-4">
        <div className="text-xs uppercase tracking-[0.22em] text-amber-300">
          {brandKit.sidebarNote.title}
        </div>
        <div className="mt-2 text-sm leading-6 text-slate-300">
          {brandKit.sidebarNote.body}
        </div>
      </div>
    </div>
  );
}
