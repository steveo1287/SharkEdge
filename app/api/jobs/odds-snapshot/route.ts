import { NextResponse } from "next/server";
import { runOddsApiSnapshotPull } from "@/services/odds/the-odds-api-budget-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const modeParam = searchParams.get("mode");
  const sports = searchParams.get("sports");

  const mode = modeParam === "manual" ? "manual" : "regular";

  const result = await runOddsApiSnapshotPull({
    mode,
    sportsCsv: sports
  });

  return NextResponse.json(result);
}
