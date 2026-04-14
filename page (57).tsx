import { NextRequest, NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import { getOpportunityGradingDashboard } from "@/services/opportunities/opportunity-grading-dashboard";

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/database|prisma|migration/i.test(message)) {
    return 503;
  }

  return 400;
}

function parseLeague(value: string | null): LeagueKey | "ALL" {
  if (!value) {
    return "ALL";
  }

  return (value.toUpperCase() as LeagueKey | "ALL") ?? "ALL";
}

function parseNumber(value: string | null, fallback: number) {
  const parsed = value ? Number(value) : fallback;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dashboard = await getOpportunityGradingDashboard({
      league: parseLeague(searchParams.get("league")),
      reviewWindowDays: parseNumber(searchParams.get("days"), 60),
      reviewLimit: parseNumber(searchParams.get("limit"), 80)
    });

    return NextResponse.json(dashboard);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load opportunity grading dashboard."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
