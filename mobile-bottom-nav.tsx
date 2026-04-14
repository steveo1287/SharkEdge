"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/games", label: "Games", icon: "games" },
  { href: "/board", label: "Board", icon: "board", featured: true },
  { href: "/trends", label: "Trends", icon: "trend" },
  { href: "/bets", label: "Bets", icon: "ledger" }
] as const;

function Icon({ type, active }: { type: (typeof NAV_ITEMS)[number]["icon"]; active: boolean }) {
  const stroke = active ? "#0b1015" : "#7f93a8";
  const className = "h-[18px] w-[18px]";

  if (type === "home") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none">
        <path d="M4 11.5L12 5l8 6.5V19a1 1 0 01-1 1h-4.5v-5h-5v5H5a1 1 0 01-1-1v-7.5z" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "board") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none">
        <rect x="3.5" y="4.5" width="17" height="15" rx="3" stroke={stroke} strokeWidth="1.8" />
        <path d="M8 9h8M8 13h8M8 17h4" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "games") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none">
        <rect x="4" y="5" width="16" height="14" rx="3" stroke={stroke} strokeWidth="1.8" />
        <path d="M8 9h8M8 13h8M8 17h5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "trend") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none">
        <path d="M4 16l5-5 3 3 7-8" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 6h1.5V7.5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M5 18l2-10 5 4 5-7 2 13" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav xl:hidden">
      <ul className="grid grid-cols-5 gap-2">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const featured = Boolean(item.featured);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-full min-h-[64px] flex-col items-center justify-center gap-1 rounded-[18px] px-2 py-2 transition",
                  featured
                    ? active
                      ? "bg-gradient-to-b from-[#64e8ff] to-[#18bfff] text-[#081118] shadow-[0_12px_28px_rgba(24,191,255,0.28)]"
                      : "bg-[#0e1823] text-white ring-1 ring-inset ring-white/8"
                    : active
                      ? "bg-white/[0.06] text-white"
                      : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-200"
                )}
              >
                <Icon type={item.icon} active={featured ? active : active} />
                <span className={cn("text-[10px] font-semibold tracking-[0.08em]", featured ? "uppercase" : "")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
