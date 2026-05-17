import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type FighterRow = {
  id: string;
  full_name: string;
  stance: string | null;
  height_inches: number | null;
  reach_inches: number | null;
  combat_base: string | null;
  payload_json: unknown;
};

type FightRow = {
  id: string;
  fight_date: Date | string;
  event_label: string;
  weight_class: string | null;
  fighter_a_id: string;
  fighter_b_id: string;
  winner_fighter_id: string | null;
  opponent_id: string;
  opponent_name: string | null;
  payload_json: unknown;
};

type StatCountRow = { fight_count: number | bigint; round_rows: number | bigint; last_stat_row_at: Date | string | null };
type OppStrengthRow = { opponent_count: number | bigint; opponent_win_pct: number | null; opponent_finish_rate: number | null; opponent_avg_fights: number | null };
type RecentStatRow = { fight_id: string; sig_landed: number | null; sig_attempted: number | null; sig_absorbed: number | null; td_landed: number | null; td_attempted: number | null; sub_attempts: number | null; control_seconds: number | null; seconds_fought: number | null };

type ProfileIntelligence = {
  generatedAt: string;
  fighterId: string;
  fighterName: string;
  urlMatch: {
    status: "VERIFIED" | "LIKELY" | "WEAK" | "MISSING";
    ufcStatsUrl: string | null;
    matchedName: string | null;
    matchMethod: string | null;
    matchScore: number | null;
    normalizedNameScore: number;
  };
  historyWrite: {
    status: "CONFIRMED" | "THIN" | "MISSING";
    fightCount: number;
    roundRows: number;
    lastStatRowAt: string | null;
  };
  opponentStrength: {
    status: "USABLE" | "THIN" | "MISSING";
    opponentCount: number;
    opponentWinPct: number | null;
    opponentFinishRate: number | null;
    opponentAvgFights: number | null;
    strengthScore: number;
  };
  recentForm: {
    status: "USABLE" | "THIN" | "MISSING";
    fightsUsed: number;
    lastFightDate: string | null;
    daysSinceLastFight: number | null;
    recentWinPct: number | null;
    recentFinishLosses: number;
    recentSigDiffPerMin: number | null;
    recentTakedownsPer15: number | null;
    recentControlPct: number | null;
    formScore: number;
  };
  stanceStyle: {
    stance: string;
    combatBase: string;
    archetype: string;
    tendencies: string[];
    matchupHooks: string[];
  };
  contextFlags: {
    shortNoticeKnown: boolean | null;
    age: number | null;
    ageBand: "YOUNG" | "PRIME" | "AGING" | "UNKNOWN";
    layoffDays: number | null;
    layoffFlag: "ACTIVE" | "MODERATE_LAYOFF" | "LONG_LAYOFF" | "UNKNOWN";
    latestWeightClass: string | null;
    previousWeightClass: string | null;
    weightClassChange: "NONE" | "UP" | "DOWN" | "UNKNOWN";
  };
  fallbackReferences: {
    needed: boolean;
    reason: string[];
    candidateQueries: string[];
    candidateSites: string[];
  };
  readiness: {
    score: number;
    grade: "A" | "B" | "C" | "D";
    blockers: string[];
    warnings: string[];
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%/g, "").replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function toIso(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function daysSince(value: Date | string | null) {
  const iso = toIso(value);
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenScore(left: unknown, right: unknown) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  const common = [...aTokens].filter((token) => bTokens.has(token)).length;
  return round(common / Math.max(aTokens.size, bTokens.size, 1), 3);
}

function payloadRecords(payload: unknown) {
  const root = asRecord(payload);
  const elite = asRecord(root.eliteProfile);
  const complete = asRecord(root.completeProfile);
  return [
    root,
    asRecord(root.stats),
    asRecord(root.careerStats),
    asRecord(root.historyDerivedStats),
    asRecord(root.profile),
    elite,
    asRecord(elite.sample),
    asRecord(elite.careerStats),
    complete,
    asRecord(complete.sample),
    asRecord(complete.physical),
    asRecord(complete.careerStats)
  ];
}

function payloadString(payload: unknown, ...keys: string[]) {
  for (const record of payloadRecords(payload)) {
    for (const key of keys) {
      const value = str(record[key]);
      if (value) return value;
    }
  }
  return null;
}

function payloadNumber(payload: unknown, ...keys: string[]) {
  for (const record of payloadRecords(payload)) {
    for (const key of keys) {
      const raw = asRecord(record[key]).value ?? record[key];
      const value = num(raw);
      if (value != null) return value;
    }
  }
  return null;
}

function ufcStatsUrl(payload: unknown) {
  const url = payloadString(payload, "ufcStatsUrl", "ufcstatsUrl", "url", "profileUrl", "fighterUrl");
  return url && /ufcstats\.com\/fighter-details/i.test(url) ? url : null;
}

function grade(score: number): ProfileIntelligence["readiness"]["grade"] {
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 55) return "C";
  return "D";
}

function urlAudit(fighter: FighterRow): ProfileIntelligence["urlMatch"] {
  const payload = asRecord(fighter.payload_json);
  const matchedName = payloadString(payload, "ufcStatsMatchedName", "matchedName", "fullName");
  const matchMethod = payloadString(payload, "ufcStatsMatchMethod", "matchMethod");
  const matchScore = payloadNumber(payload, "ufcStatsMatchScore", "matchScore");
  const url = ufcStatsUrl(payload);
  const normalizedNameScore = tokenScore(fighter.full_name, matchedName ?? fighter.full_name);
  const score = Math.max(matchScore ?? 0, normalizedNameScore);
  const status = !url ? "MISSING" : score >= 0.96 ? "VERIFIED" : score >= 0.86 ? "LIKELY" : "WEAK";
  return { status, ufcStatsUrl: url, matchedName, matchMethod, matchScore, normalizedNameScore };
}

function careerNumber(fighter: FighterRow, key: string, fallback = 0) {
  return payloadNumber(fighter.payload_json, key) ?? fallback;
}

function styleAudit(fighter: FighterRow): ProfileIntelligence["stanceStyle"] {
  const stance = fighter.stance ?? payloadString(fighter.payload_json, "stance") ?? "Unknown";
  const combatBase = fighter.combat_base ?? payloadString(fighter.payload_json, "combatBase", "combat_base", "base") ?? "unknown";
  const slpm = careerNumber(fighter, "slpm", 3.5);
  const sapm = careerNumber(fighter, "sapm", 3.2);
  const td15 = careerNumber(fighter, "takedownsPer15", 1);
  const tdDef = careerNumber(fighter, "takedownDefensePct", 62);
  const sub15 = careerNumber(fighter, "submissionAttemptsPer15", 0.35);
  const control = careerNumber(fighter, "controlTimePct", 15);
  const finish = careerNumber(fighter, "finishRate", 0.5);
  const base = normalize(combatBase);
  let archetype = "balanced";
  if (td15 >= 2.2 || control >= 27 || base.includes("wrest") || base.includes("sambo")) archetype = "wrestling-control";
  else if (sub15 >= 0.85 || base.includes("bjj") || base.includes("grappl") || base.includes("jiu")) archetype = "submission-grappler";
  else if (slpm >= 4.3 && td15 < 1) archetype = "volume-striker";
  else if (finish >= 0.62 && slpm >= 3.4) archetype = "power-finisher";
  const tendencies = [
    slpm >= 4.2 ? "high-volume striking" : slpm <= 2.7 ? "low-volume striking" : "moderate striking volume",
    slpm - sapm >= 0.8 ? "positive striking differential" : slpm - sapm <= -0.5 ? "absorbs more than lands" : "neutral striking differential",
    td15 >= 2 ? "takedown-heavy" : td15 <= 0.5 ? "low wrestling output" : "mixed wrestling output",
    tdDef >= 72 ? "strong takedown defense" : tdDef <= 52 ? "takedown defense concern" : "average takedown defense",
    sub15 >= 0.8 ? "submission threat" : "limited submission volume",
    control >= 27 ? "control-time driven" : control <= 10 ? "low top-control sample" : "moderate control sample"
  ];
  const matchupHooks = [
    stance.toLowerCase().includes("southpaw") ? "southpaw looks change open-stance striking reads" : "orthodox/standard stance reads",
    archetype === "wrestling-control" ? "prioritize opponent takedown defense and get-up rate" : null,
    archetype === "volume-striker" ? "prioritize opponent strike defense and damage absorption" : null,
    archetype === "submission-grappler" ? "prioritize opponent submission defense and scramble survival" : null,
    tdDef <= 52 ? "vulnerable if opponent chains takedowns" : null
  ].filter((item): item is string => Boolean(item));
  return { stance, combatBase, archetype, tendencies, matchupHooks };
}

async function loadFighters(limit: number, upcomingOnly: boolean, horizonDays: number) {
  if (!upcomingOnly) return prisma.$queryRaw<FighterRow[]>`SELECT id, full_name, stance, height_inches, reach_inches, combat_base, payload_json FROM ufc_fighters ORDER BY updated_at DESC, full_name LIMIT ${limit}`;
  return prisma.$queryRaw<FighterRow[]>`
    SELECT DISTINCT ftr.id, ftr.full_name, ftr.stance, ftr.height_inches, ftr.reach_inches, ftr.combat_base, ftr.payload_json
    FROM ufc_fighters ftr
    JOIN ufc_fights f ON f.fighter_a_id = ftr.id OR f.fighter_b_id = ftr.id
    WHERE f.fight_date >= now() - interval '12 hours'
      AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
      AND f.status NOT IN ('CANCELED', 'VOID')
      AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
    ORDER BY ftr.full_name
    LIMIT ${limit}
  `;
}

async function loadFights(fighterId: string, limit = 8) {
  return prisma.$queryRaw<FightRow[]>`
    SELECT f.id, f.fight_date, f.event_label, f.weight_class, f.fighter_a_id, f.fighter_b_id, f.winner_fighter_id,
      CASE WHEN f.fighter_a_id = ${fighterId} THEN f.fighter_b_id ELSE f.fighter_a_id END AS opponent_id,
      opp.full_name AS opponent_name,
      f.payload_json
    FROM ufc_fights f
    LEFT JOIN ufc_fighters opp ON opp.id = CASE WHEN f.fighter_a_id = ${fighterId} THEN f.fighter_b_id ELSE f.fighter_a_id END
    WHERE (f.fighter_a_id = ${fighterId} OR f.fighter_b_id = ${fighterId})
      AND f.fight_date <= now()
      AND f.status = 'COMPLETED'
    ORDER BY f.fight_date DESC
    LIMIT ${limit}
  `;
}

async function statCounts(fighterId: string) {
  const rows = await prisma.$queryRaw<StatCountRow[]>`
    SELECT COUNT(DISTINCT fight_id) AS fight_count, COUNT(*) AS round_rows, MAX(updated_at) AS last_stat_row_at
    FROM ufc_fight_stats_rounds
    WHERE fighter_id = ${fighterId}
  `;
  const row = rows[0];
  const fightCount = Number(row?.fight_count ?? 0);
  const roundRows = Number(row?.round_rows ?? 0);
  return { status: fightCount >= 4 && roundRows >= 8 ? "CONFIRMED" as const : fightCount > 0 ? "THIN" as const : "MISSING" as const, fightCount, roundRows, lastStatRowAt: toIso(row?.last_stat_row_at ?? null) };
}

async function opponentStrength(fighterId: string) {
  const rows = await prisma.$queryRaw<OppStrengthRow[]>`
    WITH opponents AS (
      SELECT DISTINCT CASE WHEN f.fighter_a_id = ${fighterId} THEN f.fighter_b_id ELSE f.fighter_a_id END AS opponent_id
      FROM ufc_fights f
      WHERE (f.fighter_a_id = ${fighterId} OR f.fighter_b_id = ${fighterId}) AND f.status = 'COMPLETED'
    ), opp_results AS (
      SELECT o.opponent_id,
        COUNT(DISTINCT f.id) FILTER (WHERE f.winner_fighter_id = o.opponent_id)::double precision AS wins,
        COUNT(DISTINCT f.id) FILTER (WHERE f.winner_fighter_id IS NOT NULL AND f.winner_fighter_id <> o.opponent_id)::double precision AS losses,
        COUNT(DISTINCT f.id) FILTER (WHERE f.winner_fighter_id = o.opponent_id AND lower(COALESCE(f.payload_json->>'method', '')) NOT LIKE '%decision%')::double precision AS finishes,
        COUNT(DISTINCT f.id)::double precision AS fights
      FROM opponents o
      JOIN ufc_fights f ON f.fighter_a_id = o.opponent_id OR f.fighter_b_id = o.opponent_id
      WHERE f.status = 'COMPLETED'
      GROUP BY o.opponent_id
    )
    SELECT COUNT(*) AS opponent_count,
      AVG(CASE WHEN wins + losses > 0 THEN wins / (wins + losses) ELSE NULL END)::double precision AS opponent_win_pct,
      AVG(CASE WHEN wins > 0 THEN finishes / wins ELSE NULL END)::double precision AS opponent_finish_rate,
      AVG(fights)::double precision AS opponent_avg_fights
    FROM opp_results
  `;
  const row = rows[0];
  const opponentCount = Number(row?.opponent_count ?? 0);
  const opponentWinPct = num(row?.opponent_win_pct);
  const opponentFinishRate = num(row?.opponent_finish_rate);
  const opponentAvgFights = num(row?.opponent_avg_fights);
  const strengthScore = clamp(Math.round((opponentWinPct ?? 0.5) * 70 + Math.min(20, (opponentAvgFights ?? 0) * 1.5) + (opponentFinishRate ?? 0.4) * 10), 1, 99);
  return { status: opponentCount >= 4 ? "USABLE" as const : opponentCount > 0 ? "THIN" as const : "MISSING" as const, opponentCount, opponentWinPct: opponentWinPct == null ? null : round(opponentWinPct, 3), opponentFinishRate: opponentFinishRate == null ? null : round(opponentFinishRate, 3), opponentAvgFights: opponentAvgFights == null ? null : round(opponentAvgFights, 2), strengthScore };
}

async function recentStats(fighterId: string, recentFightIds: string[]) {
  if (!recentFightIds.length) return [] as RecentStatRow[];
  return prisma.$queryRaw<RecentStatRow[]>`
    SELECT fight_id,
      SUM(sig_strikes_landed)::double precision AS sig_landed,
      SUM(sig_strikes_attempted)::double precision AS sig_attempted,
      SUM(sig_strikes_absorbed)::double precision AS sig_absorbed,
      SUM(takedowns_landed)::double precision AS td_landed,
      SUM(takedowns_attempted)::double precision AS td_attempted,
      SUM(submission_attempts)::double precision AS sub_attempts,
      SUM(control_seconds)::double precision AS control_seconds,
      SUM(COALESCE(seconds_fought, 300))::double precision AS seconds_fought
    FROM ufc_fight_stats_rounds
    WHERE fighter_id = ${fighterId} AND fight_id = ANY(${recentFightIds}::text[])
    GROUP BY fight_id
  `;
}

async function recentForm(fighterId: string, fights: FightRow[]): Promise<ProfileIntelligence["recentForm"]> {
  const recent = fights.slice(0, 5);
  if (!recent.length) return { status: "MISSING", fightsUsed: 0, lastFightDate: null, daysSinceLastFight: null, recentWinPct: null, recentFinishLosses: 0, recentSigDiffPerMin: null, recentTakedownsPer15: null, recentControlPct: null, formScore: 45 };
  const rows = await recentStats(fighterId, recent.map((fight) => fight.id));
  const seconds = rows.reduce((sum, row) => sum + (num(row.seconds_fought) ?? 0), 0);
  const sigLanded = rows.reduce((sum, row) => sum + (num(row.sig_landed) ?? 0), 0);
  const sigAbsorbed = rows.reduce((sum, row) => sum + (num(row.sig_absorbed) ?? 0), 0);
  const tdLanded = rows.reduce((sum, row) => sum + (num(row.td_landed) ?? 0), 0);
  const controlSeconds = rows.reduce((sum, row) => sum + (num(row.control_seconds) ?? 0), 0);
  const wins = recent.filter((fight) => fight.winner_fighter_id === fighterId).length;
  const losses = recent.filter((fight) => fight.winner_fighter_id && fight.winner_fighter_id !== fighterId).length;
  const recentWinPct = wins + losses > 0 ? round(wins / (wins + losses), 3) : null;
  const recentFinishLosses = recent.filter((fight) => fight.winner_fighter_id && fight.winner_fighter_id !== fighterId && !normalize(asRecord(fight.payload_json).method).includes("decision")).length;
  const recentSigDiffPerMin = seconds > 0 ? round(((sigLanded - sigAbsorbed) / seconds) * 60, 3) : null;
  const recentTakedownsPer15 = seconds > 0 ? round((tdLanded / seconds) * 900, 3) : null;
  const recentControlPct = seconds > 0 ? round((controlSeconds / seconds) * 100, 2) : null;
  const formScore = clamp(Math.round(50 + (recentWinPct ?? 0.5) * 22 + (recentSigDiffPerMin ?? 0) * 8 + (recentTakedownsPer15 ?? 0) * 2 + (recentControlPct ?? 0) * 0.12 - recentFinishLosses * 8), 1, 99);
  return { status: rows.length >= 3 ? "USABLE" : rows.length > 0 ? "THIN" : "MISSING", fightsUsed: recent.length, lastFightDate: toIso(recent[0]?.fight_date ?? null), daysSinceLastFight: daysSince(recent[0]?.fight_date ?? null), recentWinPct, recentFinishLosses, recentSigDiffPerMin, recentTakedownsPer15, recentControlPct, formScore };
}

function contextFlags(fighter: FighterRow, fights: FightRow[]): ProfileIntelligence["contextFlags"] {
  const age = payloadNumber(fighter.payload_json, "age");
  const last = fights[0] ?? null;
  const previous = fights[1] ?? null;
  const layoffDays = daysSince(last?.fight_date ?? null);
  const latestWeightClass = last?.weight_class ?? payloadString(fighter.payload_json, "weightClass", "weight_class");
  const previousWeightClass = previous?.weight_class ?? null;
  const shortNoticeRaw = payloadString(fighter.payload_json, "shortNotice", "short_notice", "shortNoticeKnown");
  const ageBand = age == null ? "UNKNOWN" : age < 26 ? "YOUNG" : age <= 34 ? "PRIME" : "AGING";
  const layoffFlag = layoffDays == null ? "UNKNOWN" : layoffDays >= 365 ? "LONG_LAYOFF" : layoffDays >= 210 ? "MODERATE_LAYOFF" : "ACTIVE";
  const weightClassChange = !latestWeightClass || !previousWeightClass ? "UNKNOWN" : normalize(latestWeightClass) === normalize(previousWeightClass) ? "NONE" : "UNKNOWN";
  return { shortNoticeKnown: shortNoticeRaw == null ? null : ["true", "1", "yes"].includes(shortNoticeRaw.toLowerCase()), age, ageBand, layoffDays, layoffFlag, latestWeightClass, previousWeightClass, weightClassChange };
}

function fallbackRefs(fighter: FighterRow, url: ProfileIntelligence["urlMatch"], history: ProfileIntelligence["historyWrite"]): ProfileIntelligence["fallbackReferences"] {
  const reason = [];
  if (url.status === "MISSING") reason.push("missing UFCStats profile URL");
  if (url.status === "WEAK") reason.push("weak UFCStats name match");
  if (history.status === "MISSING") reason.push("no fight-detail stat rows written");
  const needed = reason.length > 0;
  return {
    needed,
    reason,
    candidateQueries: needed ? [`${fighter.full_name} Tapology`, `${fighter.full_name} Sherdog`, `${fighter.full_name} UFC.com profile`, `${fighter.full_name} MMA record stats`] : [],
    candidateSites: needed ? ["tapology.com", "sherdog.com", "ufc.com", "espn.com/mma"] : []
  };
}

function readiness(input: { url: ProfileIntelligence["urlMatch"]; history: ProfileIntelligence["historyWrite"]; opponent: ProfileIntelligence["opponentStrength"]; recent: ProfileIntelligence["recentForm"]; fallback: ProfileIntelligence["fallbackReferences"] }): ProfileIntelligence["readiness"] {
  const score = clamp(Math.round(
    (input.url.status === "VERIFIED" ? 24 : input.url.status === "LIKELY" ? 18 : input.url.status === "WEAK" ? 8 : 0) +
    (input.history.status === "CONFIRMED" ? 30 : input.history.status === "THIN" ? 16 : 0) +
    (input.opponent.status === "USABLE" ? 18 : input.opponent.status === "THIN" ? 9 : 0) +
    (input.recent.status === "USABLE" ? 18 : input.recent.status === "THIN" ? 9 : 0) +
    (input.fallback.needed ? 0 : 10)
  ), 1, 100);
  const blockers = [input.url.status === "MISSING" ? "MISSING_UFCSTATS_URL" : null, input.history.status === "MISSING" ? "NO_FIGHT_DETAIL_STATS" : null].filter((item): item is string => Boolean(item));
  const warnings = [input.url.status === "WEAK" ? "WEAK_UFCSTATS_MATCH" : null, input.history.status === "THIN" ? "THIN_HISTORY_SAMPLE" : null, input.opponent.status !== "USABLE" ? "OPPONENT_STRENGTH_THIN" : null, input.recent.status !== "USABLE" ? "RECENT_FORM_THIN" : null].filter((item): item is string => Boolean(item));
  return { score, grade: grade(score), blockers, warnings };
}

async function buildIntelligence(fighter: FighterRow): Promise<ProfileIntelligence> {
  const generatedAt = new Date().toISOString();
  const fights = await loadFights(fighter.id, 10);
  const url = urlAudit(fighter);
  const history = await statCounts(fighter.id);
  const opponent = await opponentStrength(fighter.id);
  const recent = await recentForm(fighter.id, fights);
  const stanceStyle = styleAudit(fighter);
  const flags = contextFlags(fighter, fights);
  const fallback = fallbackRefs(fighter, url, history);
  const ready = readiness({ url, history, opponent, recent, fallback });
  return { generatedAt, fighterId: fighter.id, fighterName: fighter.full_name, urlMatch: url, historyWrite: history, opponentStrength: opponent, recentForm: recent, stanceStyle, contextFlags: flags, fallbackReferences: fallback, readiness: ready };
}

export async function enrichUfcFighterProfileIntelligence(options: { limit?: number; horizonDays?: number; upcomingOnly?: boolean; dryRun?: boolean } = {}) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, mode: options.dryRun ? "dry-run" : "write", error: "No usable server database URL is configured." };
  const limit = Math.max(1, Math.min(1000, Math.floor(options.limit ?? 300)));
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays ?? 180)));
  const upcomingOnly = options.upcomingOnly ?? true;
  const dryRun = Boolean(options.dryRun);
  const fighters = await loadFighters(limit, upcomingOnly, horizonDays);
  let updated = 0;
  const items: Array<{ fighterId: string; fighterName: string; score: number; grade: string; blockers: string[]; warnings: string[] }> = [];
  const errors: string[] = [];
  for (const fighter of fighters) {
    try {
      const intelligence = await buildIntelligence(fighter);
      items.push({ fighterId: fighter.id, fighterName: fighter.full_name, score: intelligence.readiness.score, grade: intelligence.readiness.grade, blockers: intelligence.readiness.blockers, warnings: intelligence.readiness.warnings });
      if (!dryRun) {
        await prisma.$executeRaw`
          UPDATE ufc_fighters
          SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify({ profileIntelligence: intelligence })}::jsonb,
            updated_at = now()
          WHERE id = ${fighter.id}
        `;
      }
      updated += 1;
    } catch (error) {
      errors.push(`${fighter.full_name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const gradeCounts = items.reduce((acc, item) => ({ ...acc, [item.grade]: (acc[item.grade] ?? 0) + 1 }), { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>);
  return { ok: errors.length === 0, mode: dryRun ? "dry-run" : "write", fighterCount: fighters.length, updatedFighters: updated, gradeCounts, blockers: items.flatMap((item) => item.blockers.map((blocker) => `${item.fighterName}: ${blocker}`)).slice(0, 50), warnings: items.flatMap((item) => item.warnings.map((warning) => `${item.fighterName}: ${warning}`)).slice(0, 50), items: items.slice(0, 50), errors: errors.slice(0, 50) };
}
