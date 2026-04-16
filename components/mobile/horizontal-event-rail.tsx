import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export type HorizontalEventRailItem = {
  id: string;
  label: string;
  note?: string | null;
  href?: string | null;
  active?: boolean;
};

export function HorizontalEventRail({ items }: { items: HorizontalEventRailItem[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="mobile-scroll-row hide-scrollbar">
      {items.map((item) => {
        const className = cn(
          "min-w-[88px] rounded-[18px] border px-3 py-2",
          item.active
            ? "border-[#2d466c] bg-[#243750] text-white"
            : "border-white/[0.08] bg-white/[0.03] text-slate-300"
        );

        const content = (
          <>
            <div className="text-[11px] font-semibold">{item.label}</div>
            {item.note ? <div className="mt-1 text-[10px] text-slate-500">{item.note}</div> : null}
          </>
        );

        return item.href ? (
          <Link key={item.id} href={item.href} className={className}>
            {content}
          </Link>
        ) : (
          <div key={item.id} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

