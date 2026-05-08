import { NextResponse } from "next/server";

import { getOddsApiBudget, getOddsApiDailyBudget, getOddsApiPullPlan, readLatestOddsApiSnapshot } from "@/services/odds/the-odds-api-budget-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OddsEvent = {
  sport_key?: string;
  bookmakers?: Array<{ markets?: Array<{ key?: string }> }>;
};

function hasEnvKey() {
  return Boolean(process.env.THE_ODDS_API_KEY?.trim() || process.env.ODDS_API_KEY?.trim());
}

function ageMinutes(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
}

export async function GET() {
  const [snapshot, budget, daily, regularPlan, manualPlan] = await Promise.all([
    readLatestOddsApiSnapshot().catch(() => null),
    getOddsApiBudget().catch(() => null),
    getOddsApiDailyBudget().catch(() => null),
    getOddsApiPullPlan({ mode: "regular", sportsCsv: "baseball_mlb" }).catch((error) => ({ ok: false, reason: error instanceof Error ? error.message : String(error) })),
    getOddsApiPullPlan({ mode: "manual", sportsCsv: "baseball_mlb" }).catch((error) => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }))
  ]);

  const events = ((snapshot?.events ?? []) as OddsEvent[]);
  const mlbEvents = events.filter((event) => event.sport_key === "baseball_mlb");
  const h2hEvents = mlbEvents.filter((event) => event.bookmakers?.some((book) => book.markets?.some((market) => market.key === "h2h")));
  const totalsEvents = mlbEvents.filter((event) => event.bookmakers?.some((book) => book.markets?.some((market) => market.key === "totals")));
  const generatedAt = snapshot?.meta?.generatedAt ?? null;

  return NextResponse.json({
    ok: hasEnvKey() && Boolean(snapshot) && mlbEvents.length > 0,
    generatedAt: new Date().toISOString(),
    provider: "the-odds-api",
    apiKeyConfigured: hasEnvKey(),
    snapshot: {
      exists: Boolean(snapshot),
      generatedAt,
      ageMinutes: ageMinutes(generatedAt),
      sports: snapshot?.meta?.sports ?? [],
      events: events.length,
      mlbEvents: mlbEvents.length,
      mlbH2hEvents: h2hEvents.length,
      mlbTotalsEvents: totalsEvents.length,
      requestsUsed: snapshot?.meta?.requestsUsed ?? null,
      monthlyUsed: snapshot?.meta?.monthlyUsed ?? null,
      monthlyLimit: snapshot?.meta?.monthlyLimit ?? null
    },
    budget,
    daily,
    pullPlan: {
      regular: regularPlan,
      manual: manualPlan
    },
    verdict: !hasEnvKey()
      ? "ODDS_API_KEY or THE_ODDS_API_KEY is missing."
      : !snapshot
        ? "No Odds API snapshot is cached yet."
        : mlbEvents.length <= 0
          ? "Cached Odds API snapshot has no MLB events."
          : totalsEvents.length <= 0
            ? "MLB events exist, but totals markets are missing from the cached snapshot."
            : "Odds API snapshot has MLB totals available."
  });
}
