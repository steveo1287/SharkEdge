import { NextResponse } from "next/server";

function maskKey(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}***`;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function getRuntimeKey() {
  const value =
    process.env.THERUNDOWN_API_KEY?.trim() ??
    process.env.THERUNDOWN_KEY?.trim() ??
    process.env.THE_RUNDOWN_API_KEY?.trim() ??
    process.env.THE_RUNDOWN_KEY?.trim() ??
    null;
  return value && value.length ? value : null;
}

export async function GET() {
  const key = getRuntimeKey();
  const baseUrl =
    process.env.THERUNDOWN_BASE_URL?.trim() || "https://therundown.io/api/v2";
  const date = new Date().toISOString().slice(0, 10);
  const url = new URL(`${baseUrl}/sports/3/events/${date}`);
  url.searchParams.set("market_ids", "1,2,3");
  url.searchParams.set("offset", "300");
  url.searchParams.set("main_line", "true");
  if (key) {
    url.searchParams.set("key", key);
  }

  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        reason: "missing_key",
        envKey: maskKey(key)
      },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-TheRundown-Key": key
      },
      signal: AbortSignal.timeout(12_000)
    });

    const raw = await response.text();
    let parsed: { events?: unknown[] } | null = null;
    try {
      parsed = JSON.parse(raw) as { events?: unknown[] };
    } catch {
      parsed = null;
    }

    const events = Array.isArray(parsed?.events) ? parsed?.events : [];
    const event0 = (events[0] ?? null) as Record<string, unknown> | null;
    const markets = Array.isArray(event0?.markets) ? (event0?.markets as unknown[]) : [];
    const market0 = (markets[0] ?? null) as Record<string, unknown> | null;

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      envKey: maskKey(key),
      requestUrl: url.toString().replace(key, "***"),
      eventCount: events.length,
      event0Keys: event0 ? Object.keys(event0).slice(0, 30) : null,
      event0HasTeams: Array.isArray(event0?.teams) ? (event0?.teams as unknown[]).length : null,
      event0HasMarkets: markets.length,
      market0Keys: market0 ? Object.keys(market0).slice(0, 30) : null,
      market0Name: typeof market0?.name === "string" ? market0.name : null,
      market0Id:
        typeof market0?.market_id === "number"
          ? market0.market_id
          : typeof market0?.marketId === "number"
            ? market0.marketId
            : null,
      bodyPreview: raw.slice(0, 500)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: "fetch_error",
        message: error instanceof Error ? error.message : "unknown",
        envKey: maskKey(key),
        requestUrl: url.toString().replace(key, "***")
      },
      { status: 500 }
    );
  }
}
