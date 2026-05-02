import type { LeagueKey } from "@/lib/types/domain";
import type { TrendSystemRun } from "@/services/trends/trend-system-engine";

type TrendSystemItem = TrendSystemRun["systems"][number];
type TrendSystemItemClv = Omit<TrendSystemItem, "metrics"> & {
  metrics: Omit<TrendSystemItem["metrics"], "clvPct"> & { clvPct: number };
};
type TrendSystemRunClv = Omit<TrendSystemRun, "systems"> & {
  systems: TrendSystemItemClv[];
};

declare module "@/services/trends/trend-system-engine" {
  export function buildTrendSystemRun(args?: { league?: LeagueKey | "ALL"; includeInactive?: boolean }): Promise<TrendSystemRunClv>;
}
