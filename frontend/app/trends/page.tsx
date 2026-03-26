import { SectionTitle } from "@/components/ui/section-title";
import { TrendsDashboard } from "@/components/trends/trends-dashboard";
import { getTrendDashboard } from "@/services/trends/trends-service";
import type { TrendFilters } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: keyof TrendFilters | "mode" | "q" | "savedId"
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildTrendOverrides(
  searchParams: Record<string, string | string[] | undefined>
): Partial<TrendFilters> {
  const overrides: Partial<TrendFilters> = {};
  const keys: Array<keyof TrendFilters> = [
    "sport",
    "league",
    "market",
    "sportsbook",
    "side",
    "subject",
    "team",
    "player",
    "fighter",
    "opponent",
    "window",
    "sample"
  ];

  for (const key of keys) {
    const value = readParam(searchParams, key);
    if (value !== undefined) {
      (overrides as Record<string, string>)[key] = value;
    }
  }

  return overrides;
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const mode = readParam(resolved, "mode") === "power" ? "power" : "simple";
  const aiQuery = readParam(resolved, "q") ?? "";
  const savedTrendId = readParam(resolved, "savedId") ?? null;
  const data = await getTrendDashboard(buildTrendOverrides(resolved), {
    mode,
    aiQuery,
    savedTrendId
  });

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Trends Center"
        description="Run real stored-data systems, see which games match today, and move from historical context into the live slate without fake certainty."
      />
      <TrendsDashboard data={data} />
    </div>
  );
}
