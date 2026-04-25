import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const HEALTH_STATE_KEY = "odds-health:v1:state";
const HEALTH_STATE_TTL_SECONDS = 60 * 60 * 24;
const FAILURE_STREAK_ALERT_THRESHOLD = 2;

type HealthState = {
  failureStreak: number;
  lastStatus: "ok" | "degraded" | "error";
  lastAlertAt: string | null;
};

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return false;
  }
  return bearer === cronSecret;
}

function getOrigin(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://sharkedge.vercel.app";
  }
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: "application/json"
    }
  });

  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    json
  };
}

async function sendSlackAlert(message: string) {
  const webhook = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!webhook) {
    return { sent: false, reason: "SLACK_WEBHOOK_URL not configured." };
  }

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: message
    })
  });

  return {
    sent: response.ok,
    reason: response.ok ? null : `Slack webhook returned ${response.status}.`
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const origin = getOrigin(request);
  // Using OddsHarvester + SportsDataverse for all odds data (removed paid APIs)
  const [board, readiness, inventory, previousState] = await Promise.all([
    fetchJson(`${origin}/api/v1/board?status=all&date=all`),
    fetchJson(`${origin}/api/v1/providers/readiness`),
    Promise.all([
      prisma.event.count({
        where: {
          startTime: {
            gte: new Date(Date.now() - 1000 * 60 * 60 * 12),
            lte: new Date(Date.now() + 1000 * 60 * 60 * 48)
          }
        }
      }),
      prisma.eventMarket.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 1000 * 60 * 60 * 6)
          }
        }
      }),
      prisma.currentMarketState.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 1000 * 60 * 60 * 6)
          }
        }
      }),
      prisma.edgeSignal.count({
        where: { isActive: true }
      })
    ]),
    readHotCache<HealthState>(HEALTH_STATE_KEY)
  ]);

  const boardGames = Array.isArray(board.json?.games) ? board.json.games.length : 0;
  const readinessState = readiness.json?.overallState ?? "ERROR";

  const issues: string[] = [];
  if (!board.ok) {
    issues.push(`Board endpoint failed (${board.status}).`);
  }
  if (readinessState === "ERROR") {
    issues.push("Readiness overallState is ERROR.");
  }
  if (boardGames === 0) {
    issues.push("Board returned zero games.");
  }

  const status: "ok" | "degraded" | "error" =
    issues.length === 0 ? "ok" : readinessState === "ERROR" ? "error" : "degraded";

  const nextState: HealthState = {
    failureStreak: status === "ok" ? 0 : (previousState?.failureStreak ?? 0) + 1,
    lastStatus: status,
    lastAlertAt: previousState?.lastAlertAt ?? null
  };

  const shouldAlert =
    status !== "ok" && nextState.failureStreak >= FAILURE_STREAK_ALERT_THRESHOLD;
  const shouldRecoveryAlert =
    status === "ok" && previousState?.lastStatus && previousState.lastStatus !== "ok";

  let slack: { sent: boolean; reason: string | null } | null = null;
  if (shouldAlert) {
    const msg = [
      `SharkEdge odds health alert (${status.toUpperCase()})`,
      `Board games: ${boardGames}`,
      `Readiness: ${readinessState}`,
      `Failure streak: ${nextState.failureStreak}`,
      `Issues: ${issues.join(" | ")}`
    ].join("\n");
    slack = await sendSlackAlert(msg);
    nextState.lastAlertAt = new Date().toISOString();
  } else if (shouldRecoveryAlert) {
    slack = await sendSlackAlert(
      `SharkEdge odds health recovered. Board games: ${boardGames}, readiness: ${readinessState}.`
    );
    nextState.lastAlertAt = new Date().toISOString();
  }

  await writeHotCache(HEALTH_STATE_KEY, nextState, HEALTH_STATE_TTL_SECONDS);

  return NextResponse.json({
    ok: status === "ok",
    status,
    issues,
    checks: {
      board: {
        ok: board.ok,
        status: board.status,
        source: board.json?.source ?? null,
        games: boardGames
      },
      readiness: {
        ok: readiness.ok,
        status: readiness.status,
        overallState: readinessState
      }
    },
    inventory: {
      events: inventory[0],
      eventMarkets: inventory[1],
      currentMarketStates: inventory[2],
      edgeSignals: inventory[3]
    },
    state: nextState,
    slack
  });
}
