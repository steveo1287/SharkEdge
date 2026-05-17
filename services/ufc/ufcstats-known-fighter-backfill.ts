import crypto from "node:crypto";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type KnownFighterRow = {
  id: string;
  full_name: string;
  profile_gap_score: number | null;
};

type FighterIndexItem = {
  name: string;
  url: string;
};

type ParsedUfcStatsProfile = {
  url: string;
  record: { wins: number; losses: number; draws: number } | null;
  heightInches: number | null;
  reachInches: number | null;
  stance: string | null;
  dob: string | null;
  stats: Record<string, number | null>;
};

export type UfcStatsKnownFighterBackfillResult = {
  ok: boolean;
  mode: "dry-run" | "backfill";
  requestedLimit: number;
  offset: number;
  knownFighters: number;
  indexedFighters: number;
  matchedFighters: number;
  updatedFighters: number;
  roundStatsInserted: number;
  unmatched: string[];
  updated: Array<{ fighterId: string; fullName: string; url: string; stats: Record<string, number | null> }>;
  errors: string[];
};

const BAD_NAMES = new Set(["ufc", "ufc apex", "find a gym", "skip to main content", "events", "tickets", "watch", "shop"]);

function stableId(prefix: string, value: string) { return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`; }
function cleanHtml(value: string) { return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function normalizeName(value: string) { return cleanHtml(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function parseNumber(value: string | null) { if (!value) return null; const clean = value.replace(/%/g, "").replace(/--/g, "").trim(); if (!clean) return null; const parsed = Number(clean); return Number.isFinite(parsed) ? parsed : null; }
function parseHeight(value: string | null) { if (!value) return null; const match = value.match(/(\d+)\s*'\s*(\d+)/); if (!match) return null; return Number(match[1]) * 12 + Number(match[2]); }
function parseReach(value: string | null) { if (!value) return null; const parsed = Number(value.replace(/[^0-9.]/g, "")); return Number.isFinite(parsed) ? parsed : null; }
function labelValue(html: string, label: string) { const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const regex = new RegExp(`<i[^>]*>\\s*${escaped}:?\\s*<\\/i>\\s*([^<]+)`, "i"); const match = html.match(regex); return match ? cleanHtml(match[1]) : null; }
function parseRecord(html: string) { const match = html.match(/Record:\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/i); if (!match) return null; return { wins: Number(match[1]), losses: Number(match[2]), draws: Number(match[3]) }; }
function parseProfile(html: string, url: string): ParsedUfcStatsProfile {
  const slpm = parseNumber(labelValue(html, "SLpM"));
  const sapm = parseNumber(labelValue(html, "SApM"));
  return {
    url,
    record: parseRecord(html),
    heightInches: parseHeight(labelValue(html, "HEIGHT")),
    reachInches: parseReach(labelValue(html, "REACH")),
    stance: labelValue(html, "STANCE"),
    dob: labelValue(html, "DOB"),
    stats: {
      sigStrikesLandedPerMin: slpm,
      sigStrikesAbsorbedPerMin: sapm,
      strikingDifferential: slpm != null && sapm != null ? Number((slpm - sapm).toFixed(3)) : null,
      sigStrikeAccuracyPct: parseNumber(labelValue(html, "Str. Acc.")),
      sigStrikeDefensePct: parseNumber(labelValue(html, "Str. Def")),
      takedownsPer15: parseNumber(labelValue(html, "TD Avg.")),
      takedownAccuracyPct: parseNumber(labelValue(html, "TD Acc.")),
      takedownDefensePct: parseNumber(labelValue(html, "TD Def.")),
      submissionAttemptsPer15: parseNumber(labelValue(html, "Sub. Avg."))
    }
  };
}

async function fetchText(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, { headers: { "user-agent": "SharkEdge profile-depth backfill/1.0", accept: "text/html,application/xhtml+xml" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function parseIndexPage(html: string) {
  const rows = [...html.matchAll(/<tr[^>]*class="[^"]*b-statistics__table-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const fighters: FighterIndexItem[] = [];
  for (const row of rows) {
    const links = [...row.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({ url: match[1], text: cleanHtml(match[2]) })).filter((link) => link.text);
    if (links.length < 2) continue;
    const name = `${links[0].text} ${links[1].text}`.replace(/\s+/g, " ").trim();
    if (!name || BAD_NAMES.has(normalizeName(name))) continue;
    fighters.push({ name, url: links[0].url });
  }
  return fighters;
}

async function buildUfcStatsIndex(fetchImpl: typeof fetch) {
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  const items: FighterIndexItem[] = [];
  for (const letter of letters) {
    try { items.push(...parseIndexPage(await fetchText(`http://www.ufcstats.com/statistics/fighters?char=${letter}&page=all`, fetchImpl))); }
    catch { /* Continue; one missing letter page should not fail the whole backfill. */ }
  }
  const byName = new Map<string, FighterIndexItem>();
  for (const item of items) byName.set(normalizeName(item.name), item);
  return byName;
}

async function knownUpcomingFighters(limit: number, offset: number, horizonDays: number) {
  return prisma.$queryRaw<KnownFighterRow[]>`
    WITH upcoming AS (
      SELECT DISTINCT ftr.id, ftr.full_name, ftr.payload_json
      FROM ufc_fighters ftr
      JOIN ufc_fights f ON f.fighter_a_id = ftr.id OR f.fighter_b_id = ftr.id
      WHERE f.fight_date >= now() - interval '3 days'
        AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
        AND f.status NOT IN ('CANCELED', 'VOID')
        AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
        AND lower(ftr.full_name) NOT IN ('ufc', 'ufc apex', 'find a gym', 'skip to main content', 'events', 'tickets', 'watch', 'shop')
    ), feature_scores AS (
      SELECT fighter_id,
        MIN(CASE
          WHEN pro_fights IS NULL OR ufc_fights IS NULL OR rounds_fought IS NULL OR sig_strikes_landed_per_min IS NULL OR sig_strikes_absorbed_per_min IS NULL THEN 0
          WHEN cold_start_active THEN 45
          ELSE 97
        END) AS profile_gap_score
      FROM ufc_model_features
      GROUP BY fighter_id
    )
    SELECT u.id, u.full_name,
      COALESCE(fs.profile_gap_score, CASE WHEN u.payload_json ? 'stats' THEN 55 ELSE 0 END) AS profile_gap_score
    FROM upcoming u
    LEFT JOIN feature_scores fs ON fs.fighter_id = u.id
    ORDER BY
      CASE WHEN NOT (u.payload_json ? 'stats') THEN 0 ELSE 1 END,
      COALESCE(fs.profile_gap_score, 0) ASC,
      u.full_name ASC
    LIMIT ${Math.max(1, Math.min(200, limit))}
    OFFSET ${Math.max(0, Math.floor(offset))};
  `;
}

function profilePayload(profile: ParsedUfcStatsProfile, fullName: string, backfilledAt: string) {
  const record = profile.record;
  const proFights = record ? record.wins + record.losses + record.draws : null;
  return {
    source: "ufcstats-known-fighter-backfill",
    ufcStatsUrl: profile.url,
    ufcStatsBackfilledAt: backfilledAt,
    stats: { ...profile.stats, proFights, ufcFights: proFights, recordWins: record?.wins ?? null, recordLosses: record?.losses ?? null, recordDraws: record?.draws ?? null },
    profile: { fullName, heightInches: profile.heightInches, reachInches: profile.reachInches, stance: profile.stance, dob: profile.dob },
    rawPayload: { provider: "ufcstats", url: profile.url }
  };
}

async function updateFighterFromProfile(fighter: KnownFighterRow, profile: ParsedUfcStatsProfile, dryRun: boolean) {
  const backfilledAt = new Date().toISOString();
  const payload = profilePayload(profile, fighter.full_name, backfilledAt);
  if (dryRun) return;
  await prisma.$executeRaw`
    UPDATE ufc_fighters
    SET stance = COALESCE(${profile.stance}, stance),
        height_inches = COALESCE(${profile.heightInches}, height_inches),
        reach_inches = COALESCE(${profile.reachInches}, reach_inches),
        payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify(payload)}::jsonb,
        updated_at = now()
    WHERE id = ${fighter.id};
  `;
}

export async function backfillKnownUfcFighterStats(options: { limit?: number; offset?: number; horizonDays?: number; dryRun?: boolean; fetchImpl?: typeof fetch } = {}): Promise<UfcStatsKnownFighterBackfillResult> {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, mode: options.dryRun ? "dry-run" : "backfill", requestedLimit: options.limit ?? 40, offset: options.offset ?? 0, knownFighters: 0, indexedFighters: 0, matchedFighters: 0, updatedFighters: 0, roundStatsInserted: 0, unmatched: [], updated: [], errors: ["No usable server database URL is configured."] };
  }
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 40)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays ?? 180)));
  const dryRun = Boolean(options.dryRun);
  const fetchImpl = options.fetchImpl ?? fetch;
  const fighters = await knownUpcomingFighters(limit, offset, horizonDays);
  const index = await buildUfcStatsIndex(fetchImpl);
  const unmatched: string[] = [];
  const updated: UfcStatsKnownFighterBackfillResult["updated"] = [];
  const errors: string[] = [];
  let matchedFighters = 0;
  let updatedFighters = 0;

  for (const fighter of fighters) {
    const indexItem = index.get(normalizeName(fighter.full_name));
    if (!indexItem) { unmatched.push(fighter.full_name); continue; }
    matchedFighters += 1;
    try {
      const html = await fetchText(indexItem.url, fetchImpl);
      const profile = parseProfile(html, indexItem.url);
      const hasStats = Object.values(profile.stats).some((value) => typeof value === "number" && Number.isFinite(value));
      if (!hasStats && !profile.record && !profile.heightInches && !profile.reachInches) { unmatched.push(fighter.full_name); continue; }
      await updateFighterFromProfile(fighter, profile, dryRun);
      updatedFighters += 1;
      updated.push({ fighterId: fighter.id, fullName: fighter.full_name, url: profile.url, stats: profile.stats });
    } catch (error) {
      errors.push(`${fighter.full_name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { ok: errors.length === 0, mode: dryRun ? "dry-run" : "backfill", requestedLimit: limit, offset, knownFighters: fighters.length, indexedFighters: index.size, matchedFighters, updatedFighters, roundStatsInserted: 0, unmatched: unmatched.slice(0, 50), updated: updated.slice(0, 50), errors: errors.slice(0, 50) };
}
