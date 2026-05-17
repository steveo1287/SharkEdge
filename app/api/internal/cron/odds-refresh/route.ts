import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentOddsBackendBaseUrl, hasCurrentOddsBackendBaseUrl } from "@/services/current-odds/backend-url";
import { refreshUfcMoneylineOddsSources } from "@/services/ufc/moneyline-odds-refresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && bearer === cronSecret) return true;

  const url = new URL(request.url);
  const adminToken = process.env.UFC_ADMIN_RUN_TOKEN?.trim();
  if (adminToken) return url.searchParams.get("token") === adminToken || request.headers.get("x-ufc-admin-token") === adminToken;
  return url.searchParams.get("confirm") === "odds-refresh";
}

function boolParam(url: URL, name: string, fallback = false) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const value = url.searchParams.get(name);
  const parsed = value ? Number(value) : fallback;
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.floor(parsed) : fallback));
}

async function refreshBackendMlbOdds(force: boolean) {
  if (!hasCurrentOddsBackendBaseUrl()) {
    return { ok: false, skipped: true, reason: "SHARKEDGE_BACKEND_URL is not configured." };
  }

  const apiKey = process.env.SHARKEDGE_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, skipped: true, reason: "SHARKEDGE_API_KEY is not configured for backend odds refresh." };
  }

  const url = new URL(`${getCurrentOddsBackendBaseUrl()}/api/ingest/odds/refresh`);
  url.searchParams.set("source", "auto");
  if (force) url.searchParams.set("force", "true");

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(20_000)
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

function settledValue<T>(result: PromiseSettledResult<T>) {
  if (result.status === "fulfilled") return result.value;
  return { ok: false, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
}

function okResult(value: unknown) {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as { ok?: unknown }).ok);
}

async function getInventory() {
  const [activeEvents, events, eventMarkets, currentMarketStates, edgeSignals] = await Promise.all([
    prisma.event.count({
      where: {
        startTime: {
          gte: new Date(Date.now() - 1000 * 60 * 60 * 12),
          lte: new Date(Date.now() + 1000 * 60 * 60 * 48)
        }
      }
    }),
    prisma.event.count(),
    prisma.eventMarket.count({ where: { updatedAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 6) } } }),
    prisma.currentMarketState.count({ where: { updatedAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 6) } } }),
    prisma.edgeSignal.count({ where: { isActive: true } })
  ]);
  return { events, activeEvents, eventMarkets, currentMarketStates, edgeSignals };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const url = new URL(request.url);
  const statusOnly = boolParam(url, "statusOnly", false);
  const dryRun = boolParam(url, "dryRun", false);
  const forceMlb = boolParam(url, "forceMlb", false);
  const skipMlb = boolParam(url, "skipMlb", false);
  const skipUfc = boolParam(url, "skipUfc", false);
  const horizonDays = numberParam(url, "horizonDays", 120, 1, 365);

  if (statusOnly) {
    return NextResponse.json({
      ok: true,
      mode: "status_only",
      worker: {
        managedBy: "web_cron_or_external_worker",
        entrypoint: "app/api/internal/cron/odds-refresh/route.ts",
        note: "This endpoint can status-check inventory or concurrently refresh MLB and UFC odds."
      },
      inventory: await getInventory()
    });
  }

  const [mlb, ufc, inventory] = await Promise.allSettled([
    skipMlb ? Promise.resolve({ ok: true, skipped: true }) : refreshBackendMlbOdds(forceMlb),
    skipUfc ? Promise.resolve({ ok: true, skipped: true }) : refreshUfcMoneylineOddsSources({ dryRun, horizonDays }),
    getInventory()
  ]);

  const mlbResult = settledValue(mlb);
  const ufcResult = settledValue(ufc);
  const ok = okResult(mlbResult) || okResult(ufcResult);

  return NextResponse.json({
    ok,
    mode: dryRun ? "dry-run" : "refresh",
    startedAt,
    finishedAt: new Date().toISOString(),
    config: {
      forceMlb,
      skipMlb,
      skipUfc,
      horizonDays,
      mlbSource: "backend scraper cache / Pinnacle MLB",
      ufcPrimary: "backend current odds mma_ufc",
      ufcBackup: "direct odds API MMA"
    },
    mlb: mlbResult,
    ufc: ufcResult,
    inventory: inventory.status === "fulfilled" ? inventory.value : null
  }, { status: ok ? 200 : 502 });
}

export async function POST(request: Request) {
  return GET(request);
}
