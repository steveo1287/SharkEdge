import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export type SectionTabItem = {
  label: string;
  href?: string;
  active?: boolean;
  count?: number | string | null;
};

export function SectionTabs({ items }: { items: SectionTabItem[] }) {
  return (
    <div className="flex items-center gap-5 overflow-x-auto pb-1 text-sm hide-scrollbar">
      {items.map((item) => {
        const className = cn(
          "inline-flex items-center gap-2 whitespace-nowrap border-b-2 pb-2 pt-1 font-medium transition",
          item.active ? "border-[#188cff] text-white" : "border-transparent text-slate-500 hover:text-slate-200"
        );

        const content = (
          <>
            <span>{item.label}</span>
            {item.count ? (
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] tracking-[0.08em] text-slate-400">
                {item.count}
              </span>
            ) : null}
          </>
        );

        return item.href ? (
          <Link key={item.label} href={item.href} className={className}>
            {content}
          </Link>
        ) : (
          <div key={item.label} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

