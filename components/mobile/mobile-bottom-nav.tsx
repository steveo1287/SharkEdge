"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/",       label: "Home",   icon: "home" },
  { href: "/board",  label: "Board",  icon: "board" },
  { href: "/games",  label: "Games",  icon: "games" },
  { href: "/trends", label: "Trends", icon: "trends" },
  { href: "/bets",   label: "Bets",   icon: "bets" }
] as const;

function MobileNavIcon({ type, active }: { type: (typeof NAV_ITEMS)[number]["icon"]; active: boolean }) {
  const color = active ? "#60a5fa" : "#52525b";
  const s = "h-[18px] w-[18px]";

  if (type === "home") return (
    <svg viewBox="0 0 24 24" className={s} fill="none">
      <path d="M3 12L12 4l9 8M5 10.5V20h5v-5h4v5h5V10.5" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  if (type === "board") return (
    <svg viewBox="0 0 24 24" className={s} fill="none">
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke={color} strokeWidth="1.7"/>
      <rect x="13" y="3" width="8" height="8" rx="1.5" stroke={color} strokeWidth="1.7"/>
      <rect x="3" y="13" width="8" height="8" rx="1.5" stroke={color} strokeWidth="1.7"/>
      <rect x="13" y="13" width="8" height="8" rx="1.5" stroke={color} strokeWidth="1.7"/>
    </svg>
  );

  if (type === "games") return (
    <svg viewBox="0 0 24 24" className={s} fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.7"/>
      <path d="M3 9h18M8 5V3M16 5V3" stroke={color} strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );

  if (type === "trends") return (
    <svg viewBox="0 0 24 24" className={s} fill="none">
      <path d="M3 17l5-6 4 3 5-8 4 2" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17 7h4v4" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  return (
    <svg viewBox="0 0 24 24" className={s} fill="none">
      <rect x="3" y="6" width="18" height="14" rx="2" stroke={color} strokeWidth="1.7"/>
      <path d="M3 10h18M8 10V6M16 10V6" stroke={color} strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="border-t border-zinc-800/70 bg-[#0c0d0f]/95 px-2 pb-[env(safe-area-inset-bottom,0px)] pt-1 backdrop-blur-xl xl:hidden">
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition",
                  active ? "text-blue-400" : "text-zinc-600 hover:text-zinc-400"
                )}
              >
                <MobileNavIcon type={item.icon} active={active} />
                <span className={cn("text-[9px] font-semibold tracking-wide", active ? "text-blue-400" : "text-zinc-600")}>
                  {item.label}
                </span>
                {active && (
                  <span className="absolute bottom-1 h-0.5 w-4 rounded-full bg-blue-500" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
