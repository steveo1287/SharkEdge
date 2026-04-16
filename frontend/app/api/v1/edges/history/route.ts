import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

    const signals = await prisma.edgeSignal.findMany({
      where: { isActive: true },
      include: {
        event: { include: { league: true } },
        sportsbook: true,
        player: true
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      count: signals.length,
      data: signals.map((signal) => {
        const metadata = asObject(signal.metadataJson);
        return {
          id: signal.id,
          createdAt: signal.createdAt.toISOString(),
          eventId: signal.eventId,
          eventLabel: signal.event.name,
          league: signal.event.league.key,
          sportsbook: signal.sportsbook.name,
          marketType: signal.marketType,
          side: signal.side,
          edgeScore: signal.edgeScore,
          adjustedEdgeScore: metadata?.adjustedEdgeScore ?? null,
          decomposition: metadata?.decomposition ?? null,
          scenarios: metadata?.scenarios ?? [],
          whyItGradesWell: metadata?.whyItGradesWell ?? null,
          player: signal.player?.name ?? null
        };
      })
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load edge explanation history." },
      { status: 500 }
    );
  }
}
