import { NextResponse } from "next/server";
import { getMlbTeamProfile, getMlbTeamNames } from "@/services/mlb/mlb-trend-browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const team = searchParams.get("team")?.trim();

  if (!team) {
    const teams = await getMlbTeamNames().catch(() => [] as string[]);
    return NextResponse.json({ ok: true, teams });
  }

  try {
    const profile = await getMlbTeamProfile(team);
    if (!profile) {
      return NextResponse.json({ ok: false, error: `No trend data found for team: ${team}` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
