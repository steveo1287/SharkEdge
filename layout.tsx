import { NextResponse } from "next/server";

import { getTrendDefinitionActiveMatches } from "@/services/trends/trend-foundation";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const matches = await getTrendDefinitionActiveMatches(id);

  if (!matches) {
    return NextResponse.json({ error: "Trend not found." }, { status: 404 });
  }

  return NextResponse.json({ matches });
}
