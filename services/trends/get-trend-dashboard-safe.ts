import { hasUsableServerDatabaseUrl } from "@/lib/db/prisma";
import type { TrendDashboardView, TrendFilters } from "@/lib/types/domain";
import { buildFallbackTrendDashboard } from "./fallback-dashboard";
import { getTrendDashboard } from "./query-engine";

export async function getTrendDashboardSafe(
  filters: TrendFilters,
  options?: {
    mode?: "simple" | "power";
    aiQuery?: string;
    savedTrendId?: string | null;
  }
): Promise<TrendDashboardView> {
  if (!hasUsableServerDatabaseUrl()) {
    return buildFallbackTrendDashboard(filters);
  }

  try {
    return await getTrendDashboard(filters, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      /database|postgres|prisma|migrate|relation.*does not exist|P202[12]/.test(
        message
      )
    ) {
      return buildFallbackTrendDashboard(filters);
    }

    throw error;
  }
}
