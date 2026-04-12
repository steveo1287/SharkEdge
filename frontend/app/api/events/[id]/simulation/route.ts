import { NextResponse } from "next/server";

import { buildEventSimulationView } from "@/services/simulation/simulation-view-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const simulation = await buildEventSimulationView(id);

    if (!simulation) {
      return NextResponse.json({ error: "Event projection unavailable." }, { status: 404 });
    }

    return NextResponse.json(simulation);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build simulation." },
      { status: 500 }
    );
  }
}
