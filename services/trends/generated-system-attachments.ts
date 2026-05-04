import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export type GeneratedSystemAttachmentOptions = {
  league?: string | "ALL";
  date?: string;
  limitEvents?: number;
  topSystemsPerGame?: number;
  includeResearch?: boolean;
};

export type GeneratedSystemAttachmentSignal = {
  systemId: string;
  name: string;
  league: string;
  market: string;
  side: string;
  grade: string;
  qualityGate: string;
  strengthScore: number | null;
  sampleSize: number;
  record: string;
  profitUnits: number;
  roiPct: number | null;
  winRatePct: number | null;
  clvPct: number | null;
  last10: string | null;
  last30: string | null;
  currentStreak: string | null;
  dedupeKey: string;
  relatedKey: string;
  matchedConditions: string[];
  unmatchedConditions: string[];
  reasons: string[];
  blockers: string[];
  rankScore: number;
};

export type GeneratedSystemAttachmentGame = {
  eventId: string;
  eventLabel: string;
  league: string;
  sport: string;
  startTime: string;
  status: string;
  topSystems: GeneratedSystemAttachmentSignal[];
  collapsedRelated: Array<{ relatedKey: string; count: number; topSystemId: string }>;
  allMatchedCount: number;
  blockedCount: number;
  sourceNote: string;
};

export type GeneratedSystemAttachmentPayload = {
  generatedAt: string;
  sourceNote: string;
  games: GeneratedSystemAttachmentGame[];
  stats: {
    eventsScanned: number;
    systemsScanned: number;
    gamesWithGeneratedSystems: number;
    attachedSystems: number;
    blockedSystems: number;
  };
};

type EventRow = {
  id: string;
  name: string;
  starttime: Date | string;
  status: string;
  sport: string;
  leaguekey: string;
  venue: string | null;
  metadatajson: Record<string, unknown> | null;
};

type SystemRow = {
  id: string;
  name: string;
  league: string;
  market: string;
  side: string;
  filter_json: Record<string, unknown>;
  conditions_json: Array<{ key?: string; label?: string; value?: string; family?: string }>;
  dedupe_key: string;
  related_key: string;
  quality_gate: string;
  gate_reasons_json: string[];
  blockers_json: string[];
  preview_tags_json: string[];
  sample_size: number | null;
  wins: number | null;
  losses: number | null;
  pushes: number | null;
  profit_units: number | null;
  roi_pct: number | null;
  win_rate_pct: number | null;
  clv_pct: number | null;
  last10: string | null;
  last30: string | null;
  current_streak: string | null;
  strength_score: number | null;
  grade: string | null;
};

function dayRange(date?: string) {
  const anchor = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(anchor.getTime())) return dayRange();
  const start = new Date(anchor);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 1);
  return { start, end };
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function numberValue(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function eventContext(event: EventRow) {
  const metadata = event.metadatajson ?? {};
  const venue = normalize(event.venue);
  const name = normalize(event.name);
  return {
    venue,
    home: venue === "home" || name.includes(" vs ") || name.includes(" v "),
    neutral: venue === "neutral" || normalize(metadata["venueType"]).includes("neutral"),
    road: venue === "road",
    tags: Object.entries(metadata).map(([key, value]) => `${key}:${String(value)}`.toLowerCase())
  };
}

function conditionMatchesEvent(condition: { key?: string; value?: string; family?: string }, event: EventRow, system: SystemRow) {
  const key = normalize(condition.key);
  const value = normalize(condition.value);
  const family = normalize(condition.family);
  const context = eventContext(event);

  if (!key) return false;
  if (family === "venue") {
    if (value === "neutral") return context.neutral;
    if (value === "home") return system.side === "home" || context.home;
    if (value === "road") return system.side === "away" || context.road;
  }
  if (family === "price") {
    return false;
  }
  if (family === "market_context") {
    return false;
  }
  if (family === "rest" || family === "form") {
    return context.tags.some((tag) => tag.includes(`${key}:`) || tag.includes(`${family}:`) || tag.includes(value));
  }
  return context.tags.some((tag) => tag.includes(key) || tag.includes(value));
}

function isSystemEligible(system: SystemRow, includeResearch: boolean) {
  if (system.quality_gate === "promote_candidate" || system.quality_gate === "watch_candidate") return true;
  return includeResearch && system.quality_gate === "research_candidate";
}

function marketCompatible(systemMarket: string) {
  return ["moneyline", "spread", "total", "player_prop", "fight_winner"].includes(systemMarket);
}

function systemMatchesGame(system: SystemRow, event: EventRow, includeResearch: boolean) {
  if (!isSystemEligible(system, includeResearch)) return false;
  if (!marketCompatible(system.market)) return false;
  if (normalize(system.league) !== normalize(event.leaguekey)) return false;
  return true;
}

function rankScore(system: SystemRow, matchedConditions: string[], unmatchedConditions: string[]) {
  let score = 0;
  const sample = numberValue(system.sample_size);
  const roi = numberValue(system.roi_pct);
  const profit = numberValue(system.profit_units);
  const clv = numberValue(system.clv_pct);
  const win = numberValue(system.win_rate_pct);
  const strength = numberValue(system.strength_score);

  score += Math.min(25, sample / 8);
  score += Math.min(18, Math.max(0, roi) * 1.2);
  score += Math.min(12, Math.max(0, profit) * 0.35);
  score += Math.min(10, Math.max(0, clv) * 3);
  score += win >= 55 ? 8 : win >= 52 ? 4 : 0;
  score += strength > 0 ? Math.min(12, strength / 8) : 0;
  score += matchedConditions.length * 4;
  score -= unmatchedConditions.length * 6;
  score -= asArray(system.blockers_json).length * 8;
  if (system.quality_gate === "promote_candidate") score += 10;
  if (system.quality_gate === "watch_candidate") score += 4;
  if (system.grade === "A") score += 8;
  if (system.grade === "B") score += 4;
  return Math.round(Math.max(0, score));
}

function toSignal(system: SystemRow, event: EventRow): GeneratedSystemAttachmentSignal {
  const matchedConditions = system.conditions_json
    .filter((condition) => conditionMatchesEvent(condition, event, system))
    .map((condition) => condition.label ?? condition.key ?? "condition");
  const unmatchedConditions = system.conditions_json
    .filter((condition) => !conditionMatchesEvent(condition, event, system))
    .map((condition) => condition.label ?? condition.key ?? "condition");
  const blockers = asArray(system.blockers_json);
  const sampleSize = numberValue(system.sample_size);
  const wins = numberValue(system.wins);
  const losses = numberValue(system.losses);
  const pushes = numberValue(system.pushes);

  return {
    systemId: system.id,
    name: system.name,
    league: system.league,
    market: system.market,
    side: system.side,
    grade: system.grade ?? "P",
    qualityGate: system.quality_gate,
    strengthScore: system.strength_score,
    sampleSize,
    record: `${wins}-${losses}${pushes ? `-${pushes}` : ""}`,
    profitUnits: numberValue(system.profit_units),
    roiPct: system.roi_pct,
    winRatePct: system.win_rate_pct,
    clvPct: system.clv_pct,
    last10: system.last10,
    last30: system.last30,
    currentStreak: system.current_streak,
    dedupeKey: system.dedupe_key,
    relatedKey: system.related_key,
    matchedConditions,
    unmatchedConditions,
    reasons: asArray(system.gate_reasons_json),
    blockers,
    rankScore: rankScore(system, matchedConditions, unmatchedConditions)
  };
}

function collapseRelated(signals: GeneratedSystemAttachmentSignal[], topSystems: GeneratedSystemAttachmentSignal[]) {
  const topIds = new Set(topSystems.map((system) => system.systemId));
  const groups = new Map<string, GeneratedSystemAttachmentSignal[]>();
  for (const signal of signals.filter((item) => !topIds.has(item.systemId))) {
    const group = groups.get(signal.relatedKey) ?? [];
    group.push(signal);
    groups.set(signal.relatedKey, group);
  }
  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 0)
    .sort(([, left], [, right]) => right.length - left.length)
    .slice(0, 8)
    .map(([relatedKey, group]) => ({ relatedKey, count: group.length, topSystemId: group.sort((left, right) => right.rankScore - left.rankScore)[0]?.systemId ?? "" }));
}

async function fetchTodaysEvents(options: Required<Pick<GeneratedSystemAttachmentOptions, "league" | "limitEvents">> & { start: Date; end: Date }) {
  const rows = await prisma.$queryRaw<EventRow[]>`
    SELECT
      e.id,
      e.name,
      e.start_time AS startTime,
      e.status::text AS status,
      e.venue,
      e.metadata_json AS metadataJson,
      l.key AS leagueKey,
      l.sport::text AS sport
    FROM events e
    JOIN leagues l ON l.id = e.league_id
    WHERE e.start_time >= ${options.start}
      AND e.start_time < ${options.end}
      AND (${options.league} = 'ALL' OR l.key = ${options.league})
    ORDER BY e.start_time ASC
    LIMIT ${options.limitEvents}
  `;
  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name),
    starttime: row.starttime instanceof Date ? row.starttime : new Date(String(row.starttime)),
    status: String(row.status),
    sport: String(row.sport),
    leaguekey: String(row.leaguekey),
    venue: row.venue == null ? null : String(row.venue),
    metadatajson: (row.metadatajson ?? null) as Record<string, unknown> | null
  }));
}

async function fetchGeneratedSystems() {
  const rows = await prisma.$queryRaw<SystemRow[]>`
    WITH latest_snapshots AS (
      SELECT DISTINCT ON (system_id)
        system_id,
        sample_size,
        wins,
        losses,
        pushes,
        profit_units,
        roi_pct,
        win_rate_pct,
        clv_pct,
        average_price,
        last10,
        last30,
        current_streak,
        strength_score,
        grade,
        quality_gate AS snapshot_quality_gate,
        generated_at
      FROM generated_trend_system_snapshots
      ORDER BY system_id, generated_at DESC
    )
    SELECT
      s.id,
      s.name,
      s.league,
      s.market,
      s.side,
      s.filter_json,
      s.conditions_json,
      s.dedupe_key,
      s.related_key,
      s.quality_gate,
      s.gate_reasons_json,
      s.blockers_json,
      s.preview_tags_json,
      ls.sample_size,
      ls.wins,
      ls.losses,
      ls.pushes,
      ls.profit_units,
      ls.roi_pct,
      ls.win_rate_pct,
      ls.clv_pct,
      ls.last10,
      ls.last30,
      ls.current_streak,
      ls.strength_score,
      COALESCE(ls.grade, 'P') AS grade
    FROM generated_trend_systems s
    LEFT JOIN latest_snapshots ls ON ls.system_id = s.id
    WHERE s.status = 'ACTIVE'
    ORDER BY COALESCE(ls.sample_size, 0) DESC, COALESCE(ls.roi_pct, 0) DESC
    LIMIT 2000
  `;
  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name),
    league: String(row.league),
    market: String(row.market),
    side: String(row.side),
    filter_json: (row.filter_json ?? {}) as Record<string, unknown>,
    conditions_json: Array.isArray(row.conditions_json) ? row.conditions_json as SystemRow["conditions_json"] : [],
    dedupe_key: String(row.dedupe_key),
    related_key: String(row.related_key),
    quality_gate: String(row.quality_gate),
    gate_reasons_json: Array.isArray(row.gate_reasons_json) ? row.gate_reasons_json as string[] : [],
    blockers_json: Array.isArray(row.blockers_json) ? row.blockers_json as string[] : [],
    preview_tags_json: Array.isArray(row.preview_tags_json) ? row.preview_tags_json as string[] : [],
    sample_size: row.sample_size == null ? null : Number(row.sample_size),
    wins: row.wins == null ? null : Number(row.wins),
    losses: row.losses == null ? null : Number(row.losses),
    pushes: row.pushes == null ? null : Number(row.pushes),
    profit_units: row.profit_units == null ? null : Number(row.profit_units),
    roi_pct: row.roi_pct == null ? null : Number(row.roi_pct),
    win_rate_pct: row.win_rate_pct == null ? null : Number(row.win_rate_pct),
    clv_pct: row.clv_pct == null ? null : Number(row.clv_pct),
    last10: row.last10 == null ? null : String(row.last10),
    last30: row.last30 == null ? null : String(row.last30),
    current_streak: row.current_streak == null ? null : String(row.current_streak),
    strength_score: row.strength_score == null ? null : Number(row.strength_score),
    grade: row.grade == null ? null : String(row.grade)
  }));
}

export async function buildGeneratedSystemAttachments(options: GeneratedSystemAttachmentOptions = {}): Promise<GeneratedSystemAttachmentPayload> {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: "Generated-system attachments skipped because DATABASE_URL is unavailable.",
      games: [],
      stats: { eventsScanned: 0, systemsScanned: 0, gamesWithGeneratedSystems: 0, attachedSystems: 0, blockedSystems: 0 }
    };
  }

  const { start, end } = dayRange(options.date);
  const league = (options.league ?? "ALL").toUpperCase();
  const limitEvents = options.limitEvents ?? 100;
  const topSystemsPerGame = options.topSystemsPerGame ?? 3;
  const includeResearch = options.includeResearch ?? false;

  try {
    const [events, systems] = await Promise.all([
      fetchTodaysEvents({ league, limitEvents, start, end }),
      fetchGeneratedSystems()
    ]);

    const games = events.map<GeneratedSystemAttachmentGame>((event) => {
      const signals = systems
        .filter((system) => systemMatchesGame(system, event, includeResearch))
        .map((system) => toSignal(system, event))
        .filter((signal) => includeResearch || signal.blockers.length === 0)
        .sort((left, right) => right.rankScore - left.rankScore || right.sampleSize - left.sampleSize);
      const topSystems = signals.slice(0, topSystemsPerGame);
      return {
        eventId: event.id,
        eventLabel: event.name,
        league: event.leaguekey,
        sport: event.sport,
        startTime: new Date(event.starttime).toISOString(),
        status: event.status,
        topSystems,
        collapsedRelated: collapseRelated(signals, topSystems),
        allMatchedCount: signals.length,
        blockedCount: systems.filter((system) => normalize(system.league) === normalize(event.leaguekey) && asArray(system.blockers_json).length > 0).length,
        sourceNote: signals.length
          ? `${topSystems.length} top generated system${topSystems.length === 1 ? "" : "s"} attached from ${signals.length} matches.`
          : "No persisted generated systems matched this event yet."
      };
    }).filter((game) => game.allMatchedCount > 0);

    return {
      generatedAt: new Date().toISOString(),
      sourceNote: "Generated-system attachment preview uses persisted generated systems and today's events. It does not create picks or place bets.",
      games,
      stats: {
        eventsScanned: events.length,
        systemsScanned: systems.length,
        gamesWithGeneratedSystems: games.length,
        attachedSystems: games.reduce((total, game) => total + game.allMatchedCount, 0),
        blockedSystems: games.reduce((total, game) => total + game.blockedCount, 0)
      }
    };
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: error instanceof Error
        ? `Generated-system attachments unavailable: ${error.message}`
        : "Generated-system attachments unavailable.",
      games: [],
      stats: { eventsScanned: 0, systemsScanned: 0, gamesWithGeneratedSystems: 0, attachedSystems: 0, blockedSystems: 0 }
    };
  }
}
