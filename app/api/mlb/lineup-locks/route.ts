import { NextResponse } from "next/server";
import { getMlbLineupLock } from "@/services/simulation/mlb-lineup-locks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getParam(request: Request, key: string, fallback: string) {
  const url = new URL(request.url);
  return url.searchParams.get(key)?.trim() || fallback;
}

export async function GET(request: Request) {
  const away = getParam(request, "away", "Chicago Cubs");
  const home = getParam(request, "home", "St. Louis Cardinals");
  const lock = await getMlbLineupLock(away, home);
  return NextResponse.json({ ok: true, lock });
}
