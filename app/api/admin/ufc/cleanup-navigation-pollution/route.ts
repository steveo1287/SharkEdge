import { NextResponse } from "next/server";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

type PollutedFightRow = {
  fight_id: string;
  event_label: string;
  fight_date: Date | string;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
  reason: string;
};

type CountRow = { count: number | bigint };

const BAD_NAMES = [
  "ufc", "ufc apex", "find a gym", "find a bar", "skip to main content", "events", "tickets", "watch", "shop",
  "all athletes", "athletes", "betting odds", "connect", "group sales", "hall of fame", "how to watch", "ufc fight club",
  "dana whites contender series", "dana white s contender series", "road to ufc", "ufc fight pass", "newsletter",
  "news", "past", "upcoming", "results", "schedule"
];

function authorized(request: Request) {
  const url = new URL(request.url);
  const envSecret = process.env.UFC_ADMIN_RUN_TOKEN?.trim();
  if (envSecret) {
    const bearer = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();
    return url.searchParams.get("token") === envSecret || request.headers.get("x-api-key") === envSecret || bearer === envSecret;
  }
  return url.searchParams.get("confirm") === "cleanup-navigation-pollution";
}

function boolParam(url: URL, name: string, fallback = false) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const parsed = Number(url.searchParams.get(name) ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function toNumber(value: number | bigint | null | undefined) {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function cleanupPayload(reason: string) {
  return {
    matchupQuality: "FAKE_NAVIGATION",
    cleanupReason: reason,
    cleanupSource: "ufc-navigation-pollution-cleanup",
    cleanedAt: new Date().toISOString()
  };
}

async function pollutedFights(horizonDays: number, limit: number) {
  return prisma.$queryRaw<PollutedFightRow[]>`
    WITH bad_names AS (
      SELECT unnest(${BAD_NAMES}::text[]) AS bad_name
    ), candidates AS (
      SELECT f.id AS fight_id,
        f.event_label,
        f.fight_date,
        fa.full_name AS fighter_a_name,
        fb.full_name AS fighter_b_name,
        trim(regexp_replace(lower(COALESCE(fa.full_name, '')), '[^a-z0-9]+', ' ', 'g')) AS fighter_a_norm,
        trim(regexp_replace(lower(COALESCE(fb.full_name, '')), '[^a-z0-9]+', ' ', 'g')) AS fighter_b_norm,
        trim(regexp_replace(lower(COALESCE(f.event_label, '')), '[^a-z0-9]+', ' ', 'g')) AS event_label_norm
      FROM ufc_fights f
      LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
      LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
      WHERE f.fight_date >= now() - interval '30 days'
        AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
        AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
    )
    SELECT c.fight_id, c.event_label, c.fight_date, c.fighter_a_name, c.fighter_b_name,
      CASE
        WHEN c.fighter_a_norm IN (SELECT bad_name FROM bad_names) THEN 'bad_fighter_a_name'
        WHEN c.fighter_b_norm IN (SELECT bad_name FROM bad_names) THEN 'bad_fighter_b_name'
        WHEN c.event_label_norm IN (SELECT bad_name FROM bad_names) THEN 'bad_event_label'
        WHEN c.event_label_norm LIKE '%skip to main content%' THEN 'navigation_event_label'
        WHEN c.event_label_norm LIKE '%betting odds%' THEN 'navigation_event_label'
        WHEN c.event_label_norm LIKE '%how to watch%' THEN 'navigation_event_label'
        ELSE 'unknown_navigation_pollution'
      END AS reason
    FROM candidates c
    WHERE c.fighter_a_norm IN (SELECT bad_name FROM bad_names)
       OR c.fighter_b_norm IN (SELECT bad_name FROM bad_names)
       OR c.event_label_norm IN (SELECT bad_name FROM bad_names)
       OR c.event_label_norm LIKE '%skip to main content%'
       OR c.event_label_norm LIKE '%betting odds%'
       OR c.event_label_norm LIKE '%how to watch%'
    ORDER BY c.fight_date ASC, c.event_label ASC
    LIMIT ${Math.max(1, Math.min(500, limit))};
  `;
}

async function pollutedFighterCount() {
  const rows = await prisma.$queryRaw<CountRow[]>`
    WITH bad_names AS (
      SELECT unnest(${BAD_NAMES}::text[]) AS bad_name
    )
    SELECT COUNT(*) AS count
    FROM ufc_fighters ftr
    WHERE trim(regexp_replace(lower(COALESCE(ftr.full_name, '')), '[^a-z0-9]+', ' ', 'g')) IN (SELECT bad_name FROM bad_names);
  `;
  return toNumber(rows[0]?.count);
}

async function markFight(row: PollutedFightRow) {
  const payload = cleanupPayload(row.reason);
  await prisma.$executeRaw`
    UPDATE ufc_fights
    SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify(payload)}::jsonb,
        updated_at = now()
    WHERE id = ${row.fight_id};
  `;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized", required: process.env.UFC_ADMIN_RUN_TOKEN ? "valid token" : "?confirm=cleanup-navigation-pollution" }, { status: 401 });
  }
  if (!hasUsableServerDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: "No usable server database URL is configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const dryRun = boolParam(url, "dryRun", true);
  const horizonDays = numberParam(url, "horizonDays", 180, 1, 365);
  const limit = numberParam(url, "limit", 200, 1, 500);

  try {
    const [fights, fighterJunkCount] = await Promise.all([pollutedFights(horizonDays, limit), pollutedFighterCount()]);
    let markedFights = 0;
    const errors: string[] = [];

    if (!dryRun) {
      for (const fight of fights) {
        try {
          await markFight(fight);
          markedFights += 1;
        } catch (error) {
          errors.push(`${fight.event_label}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      mode: dryRun ? "dry-run" : "cleanup",
      horizonDays,
      limit,
      candidateFights: fights.length,
      markedFights,
      pollutedFighterNamesInTable: fighterJunkCount,
      sample: fights.slice(0, 50).map((fight) => ({
        fightId: fight.fight_id,
        eventLabel: fight.event_label,
        fightDate: iso(fight.fight_date),
        fighterA: fight.fighter_a_name,
        fighterB: fight.fighter_b_name,
        reason: fight.reason
      })),
      errors: errors.slice(0, 50)
    }, { status: errors.length === 0 ? 200 : 207 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
