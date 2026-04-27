import { TrendsDashboardV2 } from "@/components/trends/trends-dashboard-v2";
import type { TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { getTrendDashboardSafe } from "@/services/trends/get-trend-dashboard-safe";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildFilters(searchParams: Record<string, string | string[] | undefined>) {
  try {
    return trendFiltersSchema.parse({
      sport: readValue(searchParams, "sport"),
      league: readValue(searchParams, "league"),
      market: readValue(searchParams, "market"),
      sportsbook: readValue(searchParams, "sportsbook"),
      side: readValue(searchParams, "side"),
      subject: readValue(searchParams, "subject"),
      team: readValue(searchParams, "team"),
      player: readValue(searchParams, "player"),
      fighter: readValue(searchParams, "fighter"),
      opponent: readValue(searchParams, "opponent"),
      window: readValue(searchParams, "window"),
      sample: readValue(searchParams, "sample")
    });
  } catch {
    return trendFiltersSchema.parse({}) as TrendFilters;
  }
}

function readMode(value: string | undefined): TrendMode {
  return value === "power" ? "power" : "simple";
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const aiQuery = readValue(resolved, "q")?.trim() ?? "";
  const savedTrendId = readValue(resolved, "savedTrendId")?.trim() ?? null;
  const mode = readMode(readValue(resolved, "mode"));

  const view = await getTrendDashboardSafe(filters, {
    mode,
    aiQuery,
    savedTrendId
  });

  return <TrendsDashboardV2 data={view} />;
}
