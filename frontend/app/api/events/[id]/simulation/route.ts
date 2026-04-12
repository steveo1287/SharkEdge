import { NextResponse } from "next/server";

import {
  buildEventProjectionFromHistory,
  buildPlayerPropProjectionsForEvent
} from "@/services/modeling/model-engine";

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function getProbabilityMap(
  projection: unknown,
  key: "hitProbOver" | "hitProbUnder"
): Record<string, number> | null {
  if (!projection || typeof projection !== "object") {
    return null;
  }

  const record = projection as Record<string, unknown>;
  const raw = record[key];
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return raw as Record<string, number>;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const [eventProjection, playerProjections] = await Promise.all([
      buildEventProjectionFromHistory(id),
      buildPlayerPropProjectionsForEvent(id)
    ]);

    if (!eventProjection) {
      return NextResponse.json({ error: "Event projection unavailable." }, { status: 404 });
    }

    const metadata =
      eventProjection.metadata && typeof eventProjection.metadata === "object"
        ? (eventProjection.metadata as Record<string, unknown>)
        : {};

    const marketAnchor =
      metadata.marketAnchor && typeof metadata.marketAnchor === "object"
        ? (metadata.marketAnchor as { total?: number | null; spreadHome?: number | null })
        : {};

    const eventBetComparisons = [
      typeof eventProjection.projectedTotal === "number" && typeof marketAnchor.total === "number"
        ? {
            marketType: "total",
            projected: round(eventProjection.projectedTotal, 2),
            marketLine: marketAnchor.total,
            delta: round(eventProjection.projectedTotal - marketAnchor.total, 2)
          }
        : null,
      typeof eventProjection.projectedSpreadHome === "number" &&
      typeof marketAnchor.spreadHome === "number"
        ? {
            marketType: "spread_home",
            projected: round(eventProjection.projectedSpreadHome, 2),
            marketLine: marketAnchor.spreadHome,
            delta: round(eventProjection.projectedSpreadHome - marketAnchor.spreadHome, 2)
          }
        : null
    ].filter((value): value is NonNullable<typeof value> => value !== null);

    const topPlayerEdges = playerProjections
      .map((projection) => {
        const projectionMeta =
          projection.metadata && typeof projection.metadata === "object"
            ? (projection.metadata as Record<string, unknown>)
            : {};
        const marketLine =
          typeof projectionMeta.marketLine === "number" ? projectionMeta.marketLine : null;
        const contextualEdgeScore =
          typeof projectionMeta.contextualEdgeScore === "number"
            ? projectionMeta.contextualEdgeScore
            : null;
        const playerName =
          typeof projectionMeta.playerName === "string" ? projectionMeta.playerName : projection.playerId;

        if (marketLine === null || contextualEdgeScore === null) {
          return null;
        }

        const overMap = getProbabilityMap(projection, "hitProbOver");
        const underMap = getProbabilityMap(projection, "hitProbUnder");
        const overProbability = overMap ? overMap[String(marketLine)] ?? null : null;
        const underProbability = underMap ? underMap[String(marketLine)] ?? null : null;

        return {
          playerId: projection.playerId,
          playerName,
          statKey: projection.statKey,
          projectedMean: projection.meanValue,
          projectedMedian: projection.medianValue ?? projection.meanValue,
          marketLine,
          contextualEdgeScore,
          suggestedSide:
            projection.meanValue > marketLine ? "OVER" : projection.meanValue < marketLine ? "UNDER" : "NONE",
          overProbability,
          underProbability
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((left, right) => Math.abs(right.contextualEdgeScore) - Math.abs(left.contextualEdgeScore))
      .slice(0, 20);

    return NextResponse.json({
      eventProjection,
      eventBetComparisons,
      playerProjectionCount: playerProjections.length,
      topPlayerEdges,
      topPlayerProjections: playerProjections.slice(0, 20)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build simulation." },
      { status: 500 }
    );
  }
}
