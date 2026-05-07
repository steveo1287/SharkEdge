import { after, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;
export const runtime = "nodejs";

// Cron: GET /api/cron/mlb-closing-lines
// Capture closing moneyline and total prices for MLB games within a ±2hr window.
// Schedule this in vercel.json: {"path":"/api/cron/mlb-closing-lines","schedule":"*/30 * * * *"}
// or run it manually by hitting the endpoint with x-vercel-cron: 1 or Bearer CRON_SECRET.

function isAuthorized(request: Request) {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return bearer === cronSecret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const windowBefore = Number(url.searchParams.get("windowBefore") ?? 90);
  const windowAfter = Number(url.searchParams.get("windowAfter") ?? 180);

  after(async () => {
    const { captureMlbClosingLines } = await import("@/services/mlb/mlb-closing-line-capture");
    const result = await captureMlbClosingLines({ windowBeforeMinutes: windowBefore, windowAfterMinutes: windowAfter, force });
    console.info("[mlb-closing-lines]", JSON.stringify(result));
  });

  return NextResponse.json({ ok: true, scheduled: true, params: { force, windowBefore, windowAfter } });
}
