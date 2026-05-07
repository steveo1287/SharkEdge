import { after, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;
export const runtime = "nodejs";

// Cron: GET /api/cron/mlb-umpire-refresh
// Seeds umpire tendency table (idempotent) and refreshes today's home-plate
// umpire assignments from the MLB Stats API officials hydration.
// Schedule in vercel.json: {"path":"/api/cron/mlb-umpire-refresh","schedule":"0 10,14,18 * * *"}
// (runs at 10am, 2pm, 6pm ET — before afternoon and evening first pitches)

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

  after(async () => {
    const { seedMlbUmpireDb, refreshUmpireAssignments } = await import("@/services/simulation/mlb-umpire-db");
    const seed = await seedMlbUmpireDb().catch((err: unknown) => ({ seeded: 0, skipped: 0, error: String(err) }));
    const refresh = await refreshUmpireAssignments().catch((err: unknown) => ({ upserted: 0, missing: 0, error: String(err) }));
    console.info("[mlb-umpire-refresh]", JSON.stringify({ seed, refresh }));
  });

  return NextResponse.json({ ok: true, scheduled: true });
}
