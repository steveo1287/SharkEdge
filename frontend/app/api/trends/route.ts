import { NextResponse } from "next/server";

import { getTrendApiResponse, parseTrendFilters } from "@/services/trends/trends-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parseTrendFilters(
    Object.fromEntries(url.searchParams.entries())
  );
  const mode = url.searchParams.get("mode") === "power" ? "power" : "simple";
  const aiQuery = url.searchParams.get("q");
  const savedTrendId = url.searchParams.get("savedId");
  const data = await getTrendApiResponse(filters, {
    mode,
    aiQuery,
    savedTrendId
  });

  return NextResponse.json(data, {
    status: data.setup ? 503 : 200
  });
}
