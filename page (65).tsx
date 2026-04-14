import { NextResponse } from "next/server";

import { getDiscoveredTrendSystem } from "@/services/trends/discovered-systems";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const { id } = await context.params;
  const payload = await getDiscoveredTrendSystem(id);

  if (!payload) {
    return NextResponse.json(
      {
        error: "Trend system not found."
      },
      {
        status: 404
      }
    );
  }

  return NextResponse.json(payload);
}
