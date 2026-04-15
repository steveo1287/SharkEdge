import { NextResponse } from "next/server";

import { getTrendDefinitionDetail } from "@/services/trends/trend-foundation";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const detail = await getTrendDefinitionDetail(id);

  if (!detail) {
    return NextResponse.json({ error: "Trend not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}
