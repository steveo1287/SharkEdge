"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/", label: "Desk" },
  { href: "/board", label: "Board" },
  { href: "/sharkfights/ufc", label: "Fights" },
  { href: "/sim/nba", label: "NBA" },
  { href: "/sim/mlb", label: "MLB" }
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav px-2 pb-[env(safe-area-inset-bottom,0px)] pt-1 xl:hidden">
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 py-2 transition-colors",
                  active ? "text-aqua" : "text-bone/50 hover:text-bone/80"
                )}
              >
                <span className={cn("h-[17px] w-[17px] rounded-full border", active ? "border-aqua bg-aqua/15" : "border-bone/30")} />
                <span className={cn("text-[9px] font-semibold uppercase tracking-[0.08em]", active ? "text-aqua" : "text-bone/45")}>{item.label}</span>
                {active && <span className="absolute top-0 left-1/2 h-[2px] w-5 -translate-x-1/2 bg-aqua" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
