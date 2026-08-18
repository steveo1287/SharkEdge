import {
  simulateNflSeason,
  type NflSeasonProjectionInput
} from "@/services/nfl/season-projection-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    endpoint: "/api/nfl/season-projections",
    method: "POST",
    description: "Runs a coherent joint NFL schedule simulation with standings, playoff seeding, tiebreakers, and postseason paths.",
    required: ["teams", "games"],
    defaults: {
      iterations: 5000,
      homeFieldRating: 55
    }
  });
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as NflSeasonProjectionInput;
    const projection = simulateNflSeason(input);
    return Response.json(projection, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: "Invalid NFL season projection request",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 400 }
    );
  }
}
