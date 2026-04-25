import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertOddsIngestPayload } from "@/services/market-data/market-data-service";

// Accepts the OddsHarvester push script payload format and normalizes it
// to the internal ingest schema before writing to the database.

function getApiKey(request: Request) {
  return (
    request.headers.get("x-api-key")?.trim() ??
    request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim() ??
    null
  );
}

function isAuthorized(request: Request) {
  const configured = process.env.INTERNAL_API_KEY?.trim();
  if (!configured) return true; // open if not configured
  return getApiKey(request) === configured;
}

const pushLineSchema = z.object({
  book: z.string().min(1),
  fetchedAt: z.string().nullable().optional(),
  homeMoneyline: z.number().nullable().optional(),
  awayMoneyline: z.number().nullable().optional(),
  homeSpread: z.number().nullable().optional(),
  homeSpreadOdds: z.number().nullable().optional(),
  awaySpreadOdds: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
  overOdds: z.number().nullable().optional(),
  underOdds: z.number().nullable().optional(),
  odds: z.record(z.string(), z.number().nullable()).optional()
});

const pushPayloadSchema = z.object({
  sport: z.string().min(1),
  sportKey: z.string().optional(),
  eventKey: z.string().min(1),
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  commenceTime: z.string(),
  source: z.string().optional().default("oddsharvester"),
  sourceMeta: z.record(z.string(), z.unknown()).optional(),
  lines: z.array(pushLineSchema).min(1)
});

function normalizeSource(raw: string): "theoddsapi" | "scraper" | "therundown" | "draftkings" | "fanduel" | "oddsapi-io" | "oddsharvester" {
  const known = ["theoddsapi", "scraper", "therundown", "draftkings", "fanduel", "oddsapi-io", "oddsharvester"] as const;
  return known.includes(raw as typeof known[number]) ? (raw as typeof known[number]) : "oddsharvester";
}

function normalizeCommenceTime(raw: string): string {
  try {
    return new Date(raw).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function normalizeLine(line: z.infer<typeof pushLineSchema>, fallbackTime: string) {
  const fetchedAt = line.fetchedAt ? normalizeCommenceTime(line.fetchedAt) : fallbackTime;

  const odds = {
    homeMoneyline: line.homeMoneyline ?? (line.odds?.homeMoneyline ?? null),
    awayMoneyline: line.awayMoneyline ?? (line.odds?.awayMoneyline ?? null),
    homeSpread: line.homeSpread ?? (line.odds?.homeSpread ?? null),
    homeSpreadOdds: line.homeSpreadOdds ?? (line.odds?.homeSpreadOdds ?? null),
    awaySpreadOdds: line.awaySpreadOdds ?? (line.odds?.awaySpreadOdds ?? null),
    total: line.total ?? (line.odds?.total ?? null),
    overOdds: line.overOdds ?? (line.odds?.overOdds ?? null),
    underOdds: line.underOdds ?? (line.odds?.underOdds ?? null)
  };

  return { book: line.book, fetchedAt, odds };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "OddsHarvester ingest endpoint is ready",
    endpoint: "POST /api/ingest/odds",
    auth: process.env.INTERNAL_API_KEY ? "x-api-key required" : "open (no INTERNAL_API_KEY set)"
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = pushPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const now = new Date().toISOString();
  const commenceTime = normalizeCommenceTime(data.commenceTime);
  const lines = data.lines.map((line) => normalizeLine(line, now));

  try {
    const result = await upsertOddsIngestPayload({
      sport: data.sportKey ?? data.sport,
      eventKey: data.eventKey,
      homeTeam: data.homeTeam,
      awayTeam: data.awayTeam,
      commenceTime,
      source: normalizeSource(data.source),
      sourceMeta: data.sourceMeta,
      lines
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed";
    console.error("[ingest/odds]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
