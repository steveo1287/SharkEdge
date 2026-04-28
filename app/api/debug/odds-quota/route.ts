import { NextResponse } from "next/server";
import { checkOddsQuota, getCachedOddsQuota } from "@/services/odds/odds-quota-service";
import { getOddsApiBudget, getOddsApiDailyBudget, getOddsApiPullPlan, readLatestOddsApiSnapshot } from "@/services/odds/the-odds-api-budget-service";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");

  if (mode === "odds-probe") {
    const confirm = url.searchParams.get("confirm");
    if (confirm !== "burn-one") {
      const cached = await getCachedOddsQuota();
      return NextResponse.json({
        ok: false,
        status: "CONFIRM_REQUIRED",
        details: "mode=odds-probe may consume quota. Re-run with ?mode=odds-probe&confirm=burn-one to intentionally probe live MLB odds.",
        cached
      }, { status: 400 });
    }
    return NextResponse.json(await checkOddsQuota("odds-probe"));
  }

  if (mode === "sports-check") {
    return NextResponse.json(await checkOddsQuota("sports-check"));
  }

  const [providerQuota, budget, daily, pullPlan, snapshot] = await Promise.all([
    checkOddsQuota("cached"),
    getOddsApiBudget(),
    getOddsApiDailyBudget(),
    getOddsApiPullPlan({ mode: "regular" }),
    readLatestOddsApiSnapshot()
  ]);

  return NextResponse.json({
    ok: true,
    providerQuota,
    budget,
    daily,
    pullPlan,
    latestSnapshot: snapshot
      ? {
          generatedAt: snapshot.meta.generatedAt,
          sports: snapshot.meta.sports,
          requestsUsed: snapshot.meta.requestsUsed,
          monthlyUsed: snapshot.meta.monthlyUsed,
          dailyRegularUsed: snapshot.meta.dailyRegularUsed,
          eventCount: snapshot.events.length
        }
      : null
  });
}
