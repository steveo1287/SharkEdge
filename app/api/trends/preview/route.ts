import { NextResponse } from "next/server";

import { previewTrendDefinition } from "@/services/trends/trend-foundation";
import { filterConditionsSchema } from "@/types/trends";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const filterConditions = filterConditionsSchema.parse(body.filterConditions ?? body);
    const preview = await previewTrendDefinition(filterConditions);
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to preview trend." },
      { status: 400 }
    );
  }
}
