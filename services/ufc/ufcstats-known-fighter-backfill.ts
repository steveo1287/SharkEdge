import crypto from "node:crypto";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { classifyCombatSportsEnrichmentLane } from "@/services/ufc/enrichment-lane-classifier";

type KnownFighterRow = { id: string; full_name: string; profile_gap_score: number | null };
type FighterIndexItem = { name: string; url: string };
type FighterMatch = FighterIndexItem & { matchMethod: string; matchScore: number };
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
  laneSkipped: Record<string, number>;
  matchedFighters: number;
  updatedFighters: number;
  roundStatsInserted: number;
  unmatched: string[];
  updated: Array<{ fighterId: string; fullName: string; matchedName: string; matchMethod: string; matchScore: number; url: string; stats: Record<string, number | null> }>;
  errors: string[];
};

const BAD_NAMES = new Set([
  "ufc", "ufc apex", "find a gym", "find a bar", "skip to main content", "events", "tickets", "watch", "shop",
  "all athletes", "athletes", "betting odds", "connect", "group sales", "hall of fame", "how to watch", "ufc fight club",
  "dana whites contender series", "dana white s contender series", "road to ufc", "ufc fight pass", "newsletter"
]);

const NAME_ALIASES: Record<string, string[]> = {
  "aoriqileng": ["aori qileng"],
  "song yadong": ["song ya dong"],
  "sumudaerji": ["su mudaerji"],
  "sergei pavlovich": ["sergey pavlovich"],
  "shara magomedov": ["sharabutdin magomedov"],
  "zhang mingyang": ["mingyang zhang"],
  "yi sak lee": ["leesak yi", "lee sak yi"],
  "zhu kangjie": ["kangjie zhu"],
  "shara bullet": ["sharabutdin magomedov"]
};

function stableId(prefix: string, value: string) { return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`; }
function cleanHtml(value: string) { return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function normalizeName(value: string) { return cleanHtml(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function sortedNameKey(value: string) { return normalizeName(value).split(" ").filter(Boolean).sort().join(" "); }
function tokenSet(value: string) { return new Set(normalizeName(value).split(" ").filter(Boolean)); }
function tokenScore(left: string, right: string) { const a = tokenSet(left); const b = tokenSet(right); if (!a.size || !b.size) return 0; const common = [...a].filter((token) => b.has(token)).length; return common / Math.max(a.size, b.size); }
function parseNumber(value: string | null) { if (!value) return null; const clean = value.replace(/%/g, "").replace(/--/g, "").trim(); if (!clean) return null; const parsed = Number(clean); return Number.isFinite(parsed) ? parsed : null; }
function parseHeight(value: string | null) { if (!value) return null; const match = value.match(/(\d+)\s*'\s*(\d+)/); if (!match) return null; return Number(match[1]) * 12 + Number(match[2]); }
function parseReach(value: string | null) { if (!value) return null; const parsed = Number(value.replace(/[^0-9.]/g, "")); return Number.isFinite(parsed) ? parsed : null; }
function labelValue(html: string, label: string) { const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const regex = new RegExp(`<i[^>]*>\\s*${escaped}:?\\s*<\\/i>\\s*([^<]+)`, "i"); const match = html.match(regex); return match ? cleanHtml(match[1]) : null; }
function parseRecord(html: string) { const match = html.match(/Record:\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/i); if (!match) return null; return { wins: Number(match[1]), losses: Number(match[2]), draws: Number(match[3]) }; }

function parseProfile(html: string, url: string): ParsedUfcStatsProfile {
  const slpm = parseNumber(labelValue(html, "SLpM"));
  const sapm = parseNumber(labelValue(html, "SApM"));
  const tdAvg = parseNumber(labelValue(html, "TD Avg."));
  const tdDef = parseNumber(labelValue(html, "TD Def."));
  const subAvg = parseNumber(labelValue(html, "Sub. Avg."));
  return {
    url,
    record: parseRecord(html),
    heightInches: parseHeight(labelValue(html, "HEIGHT")),
    reachInches: parseReach(labelValue(html, "REACH")),
    stance: labelValue(html, "STANCE"),
    dob: labelValue(html, "DOB"),
    stats: {
      slpm,
      sapm,
      sigStrikesLandedPerMin: slpm,
      sigStrikesAbsorbedPerMin: sapm,
      strikingDifferential: slpm != null && sapm != null ? Number((slpm - sapm).toFixed(3)) : null,
      sigStrikeAccuracyPct: parseNumber(labelValue(html, "Str. Acc.")),
      sigStrikeDefensePct: parseNumber(labelValue(html, "Str. Def")),
      takedownsPer15: tdAvg,
      takedownAccuracyPct: parseNumber(labelValue(html, "TD Acc.")),
      takedownDefensePct: tdDef,
      submissionAttemptsPer15: subAvg
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
    try { items.push(...parseIndexPage(await fetchText(`http://www.ufcstats.com/statistics/fighters?char=${letter}&page=all`, fetchImpl))); } catch { }
  }
  const byName = new Map<string, FighterIndexItem>();
  for (const item of items) byName.set(normalizeName(item.name), item);
  return byName;
}

function findIndexItem(fighterName: string, index: Map<string, FighterIndexItem>): FighterMatch | null {
  const normalized = normalizeName(fighterName);
  const direct = index.get(normalized);
  if (direct) return { ...direct, matchMethod: "exact", matchScore: 1 };
  for (const alias of NAME_ALIASES[normalized] ?? []) {
    const item = index.get(normalizeName(alias));
    if (item) return { ...item, matchMethod: `alias:${alias}`, matchScore: 0.98 };
  }
  const sorted = sortedNameKey(normalized);
  for (const item of index.values()) {
    if (sortedNameKey(item.name) === sorted) return { ...item, matchMethod: "token-sort", matchScore: 0.96 };
  }
  const scored = [...index.values()].map((item) => ({ item, score: tokenScore(normalized, item.name) })).filter(({ score }) => score >= 0.86).sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length);
  const best = scored[0];
  return best ? { ...best.item, matchMethod: "token-fuzzy", matchScore: Number(best.score.toFixed(3)) } : null;
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
        AND regexp_replace(lower(ftr.full_name), '[^a-z0-9]+', ' ', 'g') NOT IN ('ufc', 'ufc apex', 'find a gym', 'find a bar', 'skip to main content', 'events', 'tickets', 'watch', 'shop', 'all athletes', 'athletes', 'betting odds', 'connect', 'group sales', 'hall of fame', 'how to watch', 'ufc fight club', 'dana whites contender series', 'dana white s contender series', 'road to ufc', 'ufc fight pass', 'newsletter')
    ), feature_scores AS (
      SELECT fighter_id,
        MIN(CASE WHEN pro_fights IS NULL OR ufc_fights IS NULL OR rounds_fought IS NULL OR sig_strikes_landed_per_min IS NULL OR sig_strikes_absorbed_per_min IS NULL THEN 0 WHEN cold_start_active THEN 45 ELSE 97 END) AS profile_gap_score
      FROM ufc_model_features
      GROUP BY fighter_id
    )
    SELECT u.id, u.full_name, COALESCE(fs.profile_gap_score, CASE WHEN u.payload_json ? 'stats' THEN 55 ELSE 0 END) AS profile_gap_score
    FROM upcoming u
    LEFT JOIN feature_scores fs ON fs.fighter_id = u.id
    ORDER BY CASE WHEN NOT (u.payload_json ? 'stats') THEN 0 ELSE 1 END, COALESCE(fs.profile_gap_score, 0) ASC, u.full_name ASC
    LIMIT ${Math.max(1, Math.min(200, limit))}
    OFFSET ${Math.max(0, Math.floor(offset))};
  `;
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function estimatedRounds(record: ParsedUfcStatsProfile["record"]) { if (!record) return null; return Math.max(1, Math.round((record.wins + record.losses + record.draws) * 2.15)); }
function estimatedControlTimePct(stats: Record<string, number | null>) { return clamp((stats.takedownsPer15 ?? 0.8) * 7.5 + (stats.submissionAttemptsPer15 ?? 0.25) * 3.5, 4, 42); }
function estimatedControlEscapePct(stats: Record<string, number | null>) { return stats.takedownDefensePct == null ? null : clamp(stats.takedownDefensePct * 0.82, 25, 92); }
function estimatedStamina(roundsFought: number | null) { return roundsFought == null ? null : clamp(47 + Math.sqrt(roundsFought) * 3.2, 42, 84); }
function estimatedSubmissionDefense(stats: Record<string, number | null>) { return clamp(58 + (stats.takedownDefensePct ?? 62) * 0.18 - (stats.submissionAttemptsPer15 ?? 0) * 1.5, 45, 88); }

function profilePayload(profile: ParsedUfcStatsProfile, fullName: string, match: FighterMatch, backfilledAt: string) {
  const record = profile.record;
  const proFights = record ? record.wins + record.losses + record.draws : null;
  const roundsFought = estimatedRounds(record);
  const controlTimePct = estimatedControlTimePct(profile.stats);
  const controlEscapePct = estimatedControlEscapePct(profile.stats);
  const staminaScore = estimatedStamina(roundsFought);
  const submissionDefensePct = estimatedSubmissionDefense(profile.stats);
  const finishRate = record && record.wins > 0 ? null : null;
  const careerStats = {
    slpm: profile.stats.slpm,
    sapm: profile.stats.sapm,
    sigStrikesLandedPerMin: profile.stats.sigStrikesLandedPerMin,
    sigStrikesAbsorbedPerMin: profile.stats.sigStrikesAbsorbedPerMin,
    strikingDifferential: profile.stats.strikingDifferential,
    sigStrikeAccuracyPct: profile.stats.sigStrikeAccuracyPct,
    sigStrikeDefensePct: profile.stats.sigStrikeDefensePct,
    takedownsPer15: profile.stats.takedownsPer15,
    takedownAccuracyPct: profile.stats.takedownAccuracyPct,
    takedownDefensePct: profile.stats.takedownDefensePct,
    submissionAttemptsPer15: profile.stats.submissionAttemptsPer15,
    submissionDefensePct,
    controlTimePct,
    controlEscapePct,
    finishRate,
    daysSinceLastFight: null
  };
  return {
    source: "ufcstats-known-fighter-backfill",
    profileSource: "ufcstats-public-profile",
    ufcStatsUrl: profile.url,
    ufcStatsMatchedName: match.name,
    ufcStatsMatchMethod: match.matchMethod,
    ufcStatsMatchScore: match.matchScore,
    ufcStatsBackfilledAt: backfilledAt,
    enrichmentLane: "UFCSTATS",
    proFights,
    ufcFights: proFights,
    wins: record?.wins ?? null,
    losses: record?.losses ?? null,
    draws: record?.draws ?? null,
    roundsFought,
    stats: { ...profile.stats, proFights, ufcFights: proFights, recordWins: record?.wins ?? null, recordLosses: record?.losses ?? null, recordDraws: record?.draws ?? null, roundsFought, controlTimePct, controlEscapePct, submissionDefensePct, staminaScore },
    careerStats,
    eliteProfile: {
      fighterId: null,
      fullName,
      generatedAt: backfilledAt,
      modelVersion: "ufcstats-public-profile-v1",
      dataQuality: proFights && proFights >= 8 ? "B" : proFights && proFights >= 3 ? "C" : "D",
      sample: { proFights, ufcFights: proFights, amateurFights: 0, roundsFought, minutesFought: roundsFought == null ? null : roundsFought * 5, wins: record?.wins ?? null, losses: record?.losses ?? null },
      careerStats,
      background: { stance: profile.stance, combatBase: null, camp: null, amateurSignal: 50, promotionTierSignal: 64, opponentStrengthSignal: 50 },
      diagnostics: {
        profileSource: "ufcstats-public-profile",
        opponentAdjusted: false,
        historyWeighted: false,
        missing: Object.entries(careerStats).filter(([, value]) => value == null).map(([key]) => key),
        derivedEstimates: ["roundsFought", "controlTimePct", "controlEscapePct", "submissionDefensePct", "staminaScore"]
      }
    },
    profile: { fullName, heightInches: profile.heightInches, reachInches: profile.reachInches, stance: profile.stance, dob: profile.dob },
    rawPayload: { provider: "ufcstats", url: profile.url }
  };
}

async function updateFighterFromProfile(fighter: KnownFighterRow, match: FighterMatch, profile: ParsedUfcStatsProfile, dryRun: boolean) {
  const backfilledAt = new Date().toISOString();
  const payload = profilePayload(profile, fighter.full_name, match, backfilledAt);
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

function increment(map: Record<string, number>, key: string) { map[key] = (map[key] ?? 0) + 1; }

export async function backfillKnownUfcFighterStats(options: { limit?: number; offset?: number; horizonDays?: number; dryRun?: boolean; fetchImpl?: typeof fetch } = {}): Promise<UfcStatsKnownFighterBackfillResult> {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, mode: options.dryRun ? "dry-run" : "backfill", requestedLimit: options.limit ?? 40, offset: options.offset ?? 0, knownFighters: 0, indexedFighters: 0, laneSkipped: {}, matchedFighters: 0, updatedFighters: 0, roundStatsInserted: 0, unmatched: [], updated: [], errors: ["No usable server database URL is configured."] };
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
  const laneSkipped: Record<string, number> = {};
  let matchedFighters = 0;
  let updatedFighters = 0;
  for (const fighter of fighters) {
    const lane = classifyCombatSportsEnrichmentLane({ fighterName: fighter.full_name });
    if (lane.lane !== "UFCSTATS") { increment(laneSkipped, lane.lane); continue; }
    const match = findIndexItem(fighter.full_name, index);
    if (!match) { unmatched.push(fighter.full_name); continue; }
    matchedFighters += 1;
    try {
      const profile = parseProfile(await fetchText(match.url, fetchImpl), match.url);
      const hasStats = Object.values(profile.stats).some((value) => typeof value === "number" && Number.isFinite(value));
      if (!hasStats && !profile.record && !profile.heightInches && !profile.reachInches) { unmatched.push(fighter.full_name); continue; }
      await updateFighterFromProfile(fighter, match, profile, dryRun);
      updatedFighters += 1;
      updated.push({ fighterId: fighter.id, fullName: fighter.full_name, matchedName: match.name, matchMethod: match.matchMethod, matchScore: match.matchScore, url: profile.url, stats: profile.stats });
    } catch (error) { errors.push(`${fighter.full_name}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return { ok: errors.length === 0, mode: dryRun ? "dry-run" : "backfill", requestedLimit: limit, offset, knownFighters: fighters.length, indexedFighters: index.size, laneSkipped, matchedFighters, updatedFighters, roundStatsInserted: 0, unmatched: unmatched.slice(0, 50), updated: updated.slice(0, 50), errors: errors.slice(0, 50) };
}
