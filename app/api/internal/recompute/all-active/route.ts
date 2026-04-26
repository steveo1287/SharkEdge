import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { recomputeCurrentMarketState, recomputeEdgeSignals } from "@/services/edges/edge-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  const activeEvents = await prisma.event.findMany({
    where: {
      startTime: {
        gte: new Date(Date.now() - 12 * 60 * 60 * 1000),
        lte: new Date(Date.now() + 48 * 60 * 60 * 1000)
      }
    },
    select: { id: true, name: true }
  });

  if (activeEvents.length === 0) {
    return NextResponse.json({ ok: true, message: "No active events to recompute", processed: 0 });
  }

  const results: { eventId: string; name: string; ok: boolean; error?: string }[] = [];

  for (const event of activeEvents) {
    try {
      await recomputeCurrentMarketState(event.id);
      await recomputeEdgeSignals(event.id);
      results.push({ eventId: event.id, name: event.name, ok: true });
    } catch (err) {
      results.push({
        eventId: event.id,
        name: event.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    ok: true,
    processed: activeEvents.length,
    succeeded,
    failed,
    results
  });
}
