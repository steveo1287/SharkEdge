"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/board", label: "Board", icon: "board" },
  { href: "/games", label: "Games", icon: "games" },
  { href: "/trends", label: "Trends", icon: "trend" },
  { href: "/bets", label: "Portfolio", icon: "ledger" },
  { href: "/alerts", label: "Alerts", icon: "bolt" }
] as const;

function Icon({ type, active }: { type: (typeof NAV_ITEMS)[number]["icon"]; active: boolean }) {
  const stroke = active ? "#86f6ff" : "#718096";
  const className = "h-[18px] w-[18px]";

  if (type === "bolt") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none">
        <path d="M13 2L5 13h5l-1 9 8-11h-5l1-9z" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "board") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none">
        <rect x="3.5" y="4.5" width="17" height="15" rx="3" stroke={stroke} strokeWidth="1.8" />
        <path d="M8 9h8M8 14h5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
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

  if (type === "games") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none">
        <rect x="4" y="5" width="16" height="14" rx="3" stroke={stroke} strokeWidth="1.8" />
        <path d="M8 9h8M8 13h8M8 17h5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
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
  const pathname = usePathname() ?? "";

  return (
    <nav className="mobile-bottom-nav xl:hidden">
      <ul className="grid grid-cols-5 gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-[18px] px-2 py-2 transition",
                  active
                    ? "bg-cyan-400/[0.10] text-cyan-100"
                    : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-200"
                )}
              >
                <Icon type={item.icon} active={active} />
                <span className="text-[10px] font-semibold tracking-[0.04em]">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
