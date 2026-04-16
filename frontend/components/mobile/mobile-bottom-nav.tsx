"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/", label: "Discover", icon: "bolt" },
  { href: "/board", label: "Board", icon: "board" },
  { href: "/trends", label: "Trends", icon: "trend" },
  { href: "/games", label: "Games", icon: "games" },
  { href: "/performance", label: "Ledger", icon: "ledger" }
] as const;

function Icon({ type, active }: { type: (typeof NAV_ITEMS)[number]["icon"]; active: boolean }) {
  const stroke = active ? "#188cff" : "#778395";
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
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav xl:hidden">
      <ul className="grid grid-cols-5 gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-[18px] px-2 py-2 transition",
                  active ? "bg-[#151e2d] text-[#188cff]" : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-200"
                )}
              >
                <Icon type={item.icon} active={active} />
                <span className="text-[10px] font-semibold tracking-[0.06em]">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

