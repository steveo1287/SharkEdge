import { NextResponse } from "next/server";

import { getTrendDashboard } from "@/services/trends/trends-service";
import {
  createSavedTrend,
  listSavedTrendRows,
  recordSavedTrendRun
} from "@/services/trends/saved-systems";
import { savedTrendMutationSchema } from "@/lib/validation/trends";

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/database|prisma|migration/i.test(message)) return 503;
  return 500;
}

export async function GET() {
  try {
    const systems = await listSavedTrendRows();
    return NextResponse.json({ systems });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load saved systems." },
      { status: getStatusCode(error) }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = savedTrendMutationSchema.parse(body);
    const savedTrend = await createSavedTrend({
      name: payload.name,
      filters: payload.filters,
      mode: payload.mode,
      aiQuery: payload.aiQuery ?? null
    });
    const dashboard = await getTrendDashboard(payload.filters, {
      mode: payload.mode,
      aiQuery: payload.aiQuery ?? null,
      savedTrendId: savedTrend.id
    });

    await recordSavedTrendRun({
      savedTrendId: savedTrend.id,
      queryJson: {
        filters: payload.filters,
        aiQuery: payload.aiQuery ?? null,
        mode: payload.mode
      },
      resultJson: {
        sampleSize: dashboard.metrics.find((metric) => metric.label === "Sample Size")?.value ?? null,
        todayMatchCount: dashboard.todayMatches.length,
        savedTrendName: dashboard.savedTrendName
      }
    });

    return NextResponse.json({ savedTrendId: savedTrend.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save trend system." },
      { status: getStatusCode(error) }
    );
  }
}
