import { NextResponse } from "next/server";
import { freezeClosingLines } from "@/services/market-data/closing-line-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const apiKey = process.env.INTERNAL_API_KEY?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const providedApiKey = request.headers.get("x-api-key")?.trim();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;

  if (!apiKey && !cronSecret) return true;
  return Boolean((apiKey && providedApiKey === apiKey) || (cronSecret && bearer === cronSecret));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await freezeClosingLines({
      leagueKey: "NBA",
      windowBeforeMinutes: 45,
      windowAfterMinutes: 120,
      force: false
    });

    return NextResponse.json({
      ok: true,
      job: "model-lock",
      result
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model lock job failed";
    console.error("[cron/model-lock]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
