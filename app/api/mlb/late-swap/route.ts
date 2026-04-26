import { NextResponse } from "next/server";
import { runMlbLateSwapWatch, getLastMlbLateSwapWatchResult } from "@/services/simulation/mlb-late-swap-watcher";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const last = await getLastMlbLateSwapWatchResult();
  return NextResponse.json({ ok: true, last });
}

export async function POST() {
  try {
    const gamesRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/v1/board`, { cache: "no-store" });
    const gamesData = await gamesRes.json();
    const games = (gamesData?.games || []).filter((g: any) => g.leagueKey === "MLB");

    const result = await runMlbLateSwapWatch(games);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Failed late swap run" }, { status: 500 });
  }
}
