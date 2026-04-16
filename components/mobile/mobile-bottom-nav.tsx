"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/",       label: "Desk",   icon: "home" },
  { href: "/board",  label: "Board",  icon: "board" },
  { href: "/games",  label: "Games",  icon: "games" },
  { href: "/trends", label: "Trends", icon: "trends" },
  { href: "/bets",   label: "Book",   icon: "bets" }
] as const;

function MobileNavIcon({ type, active }: { type: (typeof NAV_ITEMS)[number]["icon"]; active: boolean }) {
  const color = active ? "#22D3EE" : "rgba(232, 220, 196, 0.40)";
  const s = "h-[17px] w-[17px]";
  const sw = "1.25";

  if (type === "home") return (
    <svg viewBox="0 0 24 24" className={s} fill="none">
      <path d="M3 12L12 4l9 8M5 10.5V20h5v-5h4v5h5V10.5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  if (type === "board") return (
    <svg viewBox="0 0 24 24" className={s} fill="none">
      <rect x="3" y="3" width="8" height="8" rx="1" stroke={color} strokeWidth={sw}/>
      <rect x="13" y="3" width="8" height="8" rx="1" stroke={color} strokeWidth={sw}/>
      <rect x="3" y="13" width="8" height="8" rx="1" stroke={color} strokeWidth={sw}/>
      <rect x="13" y="13" width="8" height="8" rx="1" stroke={color} strokeWidth={sw}/>
    </svg>
  );

  if (type === "games") return (
    <svg viewBox="0 0 24 24" className={s} fill="none">
      <rect x="3" y="5" width="18" height="16" rx="1" stroke={color} strokeWidth={sw}/>
      <path d="M3 9h18M8 5V3M16 5V3" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  );

  if (type === "trends") return (
    <svg viewBox="0 0 24 24" className={s} fill="none">
      <path d="M3 17l5-6 4 3 5-8 4 2" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17 7h4v4" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  return (
    <svg viewBox="0 0 24 24" className={s} fill="none">
      <rect x="3" y="6" width="18" height="14" rx="1" stroke={color} strokeWidth={sw}/>
      <path d="M3 10h18M8 10V6M16 10V6" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  );
}

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
                <MobileNavIcon type={item.icon} active={active} />
                <span
                  className={cn(
                    "text-[9px] font-semibold uppercase tracking-[0.08em]",
                    active ? "text-aqua" : "text-bone/45"
                  )}
                >
                  {item.label}
                </span>
                {active && (
                  <span className="absolute top-0 left-1/2 h-[2px] w-5 -translate-x-1/2 bg-aqua" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
