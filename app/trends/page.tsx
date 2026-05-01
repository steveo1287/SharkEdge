import { TrendsDashboardV3 } from "@/components/trends/trends-dashboard-v3";
import type { TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { getFastCachedTrendDashboard, getTrendDashboardCacheHealth } from "@/services/trends/dashboard-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function ageLabel(seconds: number | null) {
  if (seconds === null) return "not warmed";
  if (seconds < 60) return `${seconds}s old`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m old` : `${hours}h old`;
}

function CacheStatusStrip({ status, modeDefaultCards, exactCards, age }: { status: string; modeDefaultCards: number; exactCards: number; age: number | null }) {
  const ready = status === "exact" || status === "mode-default";
  return (
    <div className={`mb-4 rounded-2xl border px-4 py-3 text-xs leading-5 ${ready ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-100" : "border-amber-300/20 bg-amber-400/5 text-amber-100"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold uppercase tracking-[0.18em]">Trend cache</span>
          <span className="ml-2 text-slate-300">{status} · exact {exactCards} cards · default {modeDefaultCards} cards · {ageLabel(age)}</span>
        </div>
        <a href="/api/trends/cache-health" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Health JSON</a>
      </div>
    </div>
  );
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const aiQuery = readValue(resolved, "q")?.trim() ?? "";
  const savedTrendId = readValue(resolved, "savedTrendId")?.trim() ?? null;
  const mode = readMode(readValue(resolved, "mode"));
  const options = { mode, aiQuery, savedTrendId };

  const [{ payload }, health] = await Promise.all([
    getFastCachedTrendDashboard(filters, options),
    getTrendDashboardCacheHealth(filters, options)
  ]);

  return (
    <>
      <CacheStatusStrip
        status={health.effectiveStatus}
        exactCards={health.exact.cards}
        modeDefaultCards={health.modeDefault.cards}
        age={health.exact.ageSeconds ?? health.modeDefault.ageSeconds}
      />
      <TrendsDashboardV3 data={payload} />
    </>
  );
}
