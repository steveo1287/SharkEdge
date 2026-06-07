import Link from "next/link";

const TABS = [
  { key: "summary", label: "Summary", path: "" },
  { key: "team-stats", label: "Team Stats", path: "/team-stats" },
  { key: "box-score", label: "Box Score", path: "/box-score" },
  { key: "nrfi-f5", label: "NRFI / F5", path: "/nrfi-f5" }
] as const;

export function MlbFranchiseTabs({ gameId, active }: { gameId: string; active: typeof TABS[number]["key"] }) {
  return (
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-white/8 bg-white/[0.025] p-2">
      {TABS.map((tab) => {
        const href = `/sim/mlb/${encodeURIComponent(gameId)}${tab.path}`;
        const selected = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={href}
            className={selected
              ? "rounded-xl border border-sky-400/35 bg-sky-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-100"
              : "rounded-xl border border-white/8 bg-slate-950/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 transition hover:border-sky-400/25 hover:text-white"}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
