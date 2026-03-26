import { NextResponse } from "next/server";

import { getTrendDashboard } from "@/services/trends/trends-service";
import {
  archiveSavedTrend,
  deleteSavedTrend,
  recordSavedTrendRun,
  updateSavedTrend
} from "@/services/trends/saved-systems";
import { savedTrendUpdateSchema } from "@/lib/validation/trends";

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/database|prisma|migration/i.test(message)) return 503;
  return 500;
}

type RouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const body = await request.json();
    const payload = savedTrendUpdateSchema.parse(body);

    if (typeof payload.archived === "boolean") {
      await archiveSavedTrend(id, payload.archived);
      return NextResponse.json({ savedTrendId: id, archived: payload.archived });
    }

    const savedTrend = await updateSavedTrend(id, payload);

    if (payload.filters || payload.aiQuery !== undefined || payload.mode) {
      const query = (savedTrend.queryJson ?? {}) as Record<string, unknown>;
      const filters = (query.filters ?? {}) as Parameters<typeof getTrendDashboard>[0];
      const aiQuery = typeof query.aiQuery === "string" ? query.aiQuery : null;
      const mode = query.mode === "power" ? "power" : "simple";
      const dashboard = await getTrendDashboard(filters, {
        mode,
        aiQuery,
        savedTrendId: id
      });

      await recordSavedTrendRun({
        savedTrendId: id,
        queryJson: {
          filters,
          aiQuery,
          mode
        },
        resultJson: {
          sampleSize: dashboard.metrics.find((metric) => metric.label === "Sample Size")?.value ?? null,
          todayMatchCount: dashboard.todayMatches.length,
          savedTrendName: dashboard.savedTrendName
        }
      });
    }

    return NextResponse.json({ savedTrendId: id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update trend system." },
      { status: getStatusCode(error) }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    await deleteSavedTrend(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete trend system." },
      { status: getStatusCode(error) }
    );
  }
}
