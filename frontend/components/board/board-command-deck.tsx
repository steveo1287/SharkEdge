import Link from "next/link";

import { cn } from "@/lib/utils/cn";

type CommandChip = {
  label: string;
  href: string;
  active: boolean;
};

type BoardCommandDeckProps = {
  marketItems: CommandChip[];
  sortItems: CommandChip[];
  selectedGameLabel: string | null;
  verifiedCount: number;
  moverCount: number;
};

function CommandGroup({ label, items }: { label: string; items: CommandChip[] }) {
  return (
    <div className="grid gap-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Link
            key={`${label}-${item.label}`}
            href={item.href}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition",
              item.active
                ? "border-sky-400/40 bg-sky-500/12 text-sky-200"
                : "border-white/8 bg-white/[0.03] text-slate-300 hover:border-white/14 hover:text-white"
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function BoardCommandDeck({
  marketItems,
  sortItems,
  selectedGameLabel,
  verifiedCount,
  moverCount
}: BoardCommandDeckProps) {
  return (
    <section className="sticky top-3 z-20 rounded-[1.2rem] border border-white/8 bg-[#08101a]/95 px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur xl:px-5">
      <div className="grid gap-4 xl:grid-cols-[1.25fr,1fr,1fr] xl:items-end">
        <div className="grid gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Board control</div>
          <div className="text-[1.05rem] font-semibold tracking-tight text-white">Rank the slate by the price you actually care about.</div>
          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">{verifiedCount} verified games</div>
            <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">{moverCount} movers on deck</div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
              {selectedGameLabel ? `Inspecting ${selectedGameLabel}` : "Select a game"}
            </div>
          </div>
        </div>

        <CommandGroup label="Market focus" items={marketItems} />
        <CommandGroup label="Sort board" items={sortItems} />
      </div>
    </section>
  );
}
