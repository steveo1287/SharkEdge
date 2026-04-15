import { NextResponse } from "next/server";

import { z } from "zod";

import { DEFAULT_USER_ID } from "@/services/account/user-service";
import { createAlertSubscription, listAlertSubscriptions } from "@/services/alerts/subscriptions-service";

const alertSubscriptionSchema = z.object({
  sportId: z.string().optional(),
  leagueId: z.string().optional(),
  marketType: z
    .enum([
      "spread",
      "moneyline",
      "total",
      "team_total",
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_threes",
      "fight_winner",
      "method_of_victory",
      "round_total",
      "round_winner",
      "other"
    ])
    .optional(),
  minEvPercent: z.number().optional(),
  minConfidenceScore: z.number().optional(),
  playerId: z.string().optional(),
  teamId: z.string().optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional()
});

export async function GET() {
  try {
    return NextResponse.json(await listAlertSubscriptions());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load alerts." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = alertSubscriptionSchema.parse(await request.json());
    return NextResponse.json({
      subscription: await createAlertSubscription({
        userId: DEFAULT_USER_ID,
        ...payload
      })
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create alert." },
      { status: 400 }
    );
  }
}
