import Link from "next/link";

import { cn } from "@/lib/utils/cn";

const TABS = [
  { key: "summary", label: "Summary", suffix: "" },
  { key: "team-stats", label: "Team Stats", suffix: "/team-stats" },
  { key: "box-score", label: "Box Score", suffix: "/box-score" },
  { key: "nrfi-f5", label: "NRFI / F5", suffix: "/nrfi-f5" }
] as const;

export type MlbFranchiseTabKey = (typeof TABS)[number]["key"];

export function MlbFranchiseTabs({ gameId, active }: { gameId: string; active: MlbFranchiseTabKey }) {
  const base = `/sim/mlb/${encodeURIComponent(gameId)}`;
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/50 p-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`${base}${tab.suffix}`}
          className={cn(
            "shrink-0 rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
            active === tab.key
              ? "bg-aqua/15 text-aqua shadow-[0_0_24px_rgba(34,211,238,0.08)]"
              : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
