export type OddsApiIoNormalizedEvent = {
  sourceEventId: string;
  league: string;
  sport: string | null;
  eventLabel: string;
  startTime: string | null;
  status: string | null;
  raw: Record<string, unknown>;
};

export type OddsApiIoNormalizedOddsRow = {
  id: string;
  eventId: string;
  league: string;
  sport: string | null;
  marketType: string;
  side: string;
  selection: string | null;
  sportsbookName: string | null;
  price: number | null;
  point: number | null;
  sourceSnapshotId: string;
  capturedAt: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const cleaned = value.replace(/^\+/, "").trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePrice(value: unknown): number | null {
  const parsed = num(value);
  if (parsed == null || parsed <= 0) return parsed;
  // Odds-API.io examples expose decimal odds. SharkEdge market math expects American odds.
  if (parsed > 1 && parsed < 50) {
    const american = parsed >= 2 ? (parsed - 1) * 100 : -100 / (parsed - 1);
    return Math.round(american);
  }
  return Math.round(parsed);
}

function date(value: unknown): string | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function idSafe(value: string) {
  return value.replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 180);
}

function eventId(event: Record<string, unknown>) {
  return text(event.id ?? event.eventId ?? event.event_id ?? event.fixtureId ?? event.fixture_id);
}

function teamName(event: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = event[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && "name" in value) return text((value as Record<string, unknown>).name);
  }
  return "";
}

function objectText(value: unknown, keys: string[]) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = row[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return "";
}

function rowsFromUnknown(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const row = data as Record<string, unknown>;
  if (Array.isArray(row.data)) return row.data;
  if (Array.isArray(row.events)) return row.events;
  return [];
}

export function normalizeOddsApiIoEvents(data: unknown, fallback: { league: string; sport?: string | null }): OddsApiIoNormalizedEvent[] {
  const rows: unknown[] = rowsFromUnknown(data);
  return rows.flatMap((raw: unknown): OddsApiIoNormalizedEvent[] => {
    if (!raw || typeof raw !== "object") return [];
    const event = raw as Record<string, unknown>;
    const sourceEventId = eventId(event);
    if (!sourceEventId) return [];
    const home = teamName(event, ["home", "homeTeam", "home_team", "teamHome", "participant1"]);
    const away = teamName(event, ["away", "awayTeam", "away_team", "teamAway", "participant2"]);
    const eventLabel = text(event.name ?? event.eventName ?? event.label ?? event.matchup) || [away, home].filter(Boolean).join(" @ ") || sourceEventId;
    const rawLeague = event.league;
    const leagueStr = typeof rawLeague === "string" ? rawLeague : null;
    return [{
      sourceEventId,
      league: (leagueStr ?? text(event.leagueKey ?? fallback.league)).toUpperCase(),
      sport: objectText(event.sport, ["slug", "name", "key"]) || text(fallback.sport) || null,
      eventLabel,
      startTime: date(event.startTime ?? event.start_time ?? event.commence_time ?? event.date),
      status: text(event.status ?? event.state) || null,
      raw: event
    }];
  });
}

function inferMarket(key: string) {
  const lower = key.toLowerCase();
  if (lower.includes("money") || lower === "ml" || lower.includes("h2h")) return "moneyline";
  if (lower === "1x2" || lower.includes("home_away")) return "moneyline";
  if (lower.includes("spread") || lower.includes("handicap") || lower.includes("hdp")) return "spread";
  if (lower.includes("total") || lower.includes("over") || lower.includes("under")) return "total";
  return lower.replace(/[^a-z0-9]+/g, "_") || "unknown";
}

function inferSide(selection: string, market: string) {
  const lower = selection.toLowerCase();
  if (market === "total" && lower.includes("over")) return "over";
  if (market === "total" && lower.includes("under")) return "under";
  if (lower.includes("home")) return "home";
  if (lower.includes("away") || lower.includes("road")) return "away";
  if (lower.includes("draw")) return "draw";
  return selection || "unknown";
}

function looksLikeOutcome(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.price !== undefined || row.odds !== undefined || row.american !== undefined || row.name !== undefined || row.selection !== undefined;
}

function collectOutcomes(node: unknown, path: string[] = [], inherited: Record<string, unknown> = {}): Array<{ path: string[]; outcome: Record<string, unknown> }> {
  if (!node || typeof node !== "object") return [];
  if (looksLikeOutcome(node)) return [{ path, outcome: { ...inherited, ...(node as Record<string, unknown>) } }];
  if (Array.isArray(node)) return node.flatMap((item: unknown, index: number) => collectOutcomes(item, [...path, String(index)], inherited));
  const row = node as Record<string, unknown>;
  const nextInherited = {
    ...inherited,
    ...(row.bookmaker || row.bookmakerName || row.sportsbook ? { bookmaker: row.bookmaker ?? row.bookmakerName ?? row.sportsbook } : {}),
    ...(row.market || row.marketType || row.key ? { market: row.market ?? row.marketType ?? row.key } : {})
  };
  return Object.entries(row).flatMap(([key, value]: [string, unknown]) => collectOutcomes(value, [...path, key], nextInherited));
}

function bookmakerName(path: string[], row: Record<string, unknown>) {
  return text(row.bookmaker ?? row.bookmakerName ?? row.sportsbook ?? row.site ?? row.book ?? path.find((item: string) => /^[A-Za-z][A-Za-z0-9 _.-]{2,}$/.test(item))) || null;
}

const OUTCOME_SIDE_KEYS = ["home", "away", "over", "under", "draw"] as const;

function arrayFromMarketNode(node: unknown): Array<{ key: string | null; value: unknown }> {
  if (Array.isArray(node)) return node.map((value, index) => ({ key: String(index), value }));
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).map(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) return { key, value: { key, ...(value as Record<string, unknown>) } };
    return { key, value };
  });
}

function oddsArray(odds: unknown): Record<string, unknown>[] {
  if (Array.isArray(odds)) return odds.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));
  if (odds && typeof odds === "object") return [odds as Record<string, unknown>];
  return [];
}

function normalizeBookmakersOdds(
  event: Record<string, unknown>,
  context: { sourceEventId: string; league: string; sport?: string | null; capturedAt: string }
): OddsApiIoNormalizedOddsRow[] {
  const bookmakers = event.bookmakers as Record<string, unknown>;
  const rows: OddsApiIoNormalizedOddsRow[] = [];
  let idx = 0;

  for (const [bkName, markets] of Object.entries(bookmakers)) {
    for (const marketEntry of arrayFromMarketNode(markets)) {
      const market = marketEntry.value;
      if (!market || typeof market !== "object") continue;
      const m = market as Record<string, unknown>;
      const marketType = inferMarket(text(m.name ?? m.market ?? m.marketName ?? m.key ?? marketEntry.key ?? ""));
      for (const o of oddsArray(m.odds ?? m.outcomes ?? m.prices ?? m)) {
        const hdp = num(o.hdp);
        const label = o.label ? text(o.label) : null;
        for (const sideKey of OUTCOME_SIDE_KEYS) {
          const price = normalizePrice(o[sideKey]);
          if (price == null) continue;
          const selection = label ?? sideKey;
          const side = sideKey === "home" || sideKey === "away" || sideKey === "over" || sideKey === "under" || sideKey === "draw"
            ? sideKey
            : inferSide(selection, marketType);
          const sourceSnapshotId = idSafe(`${context.sourceEventId}:${bkName}:${marketType}:${side}:${selection}:${hdp ?? "np"}:${idx}`);
          idx++;
          rows.push({
            id: `oddsapiio:${sourceSnapshotId}`,
            eventId: context.sourceEventId,
            league: context.league,
            sport: context.sport ?? null,
            marketType,
            side,
            selection,
            sportsbookName: bkName,
            price,
            point: hdp,
            sourceSnapshotId,
            capturedAt: context.capturedAt
          });
        }
      }
    }
  }
  return rows;
}

export function normalizeOddsApiIoOdds(data: unknown, context: { sourceEventId: string; league: string; sport?: string | null; capturedAt?: string }): OddsApiIoNormalizedOddsRow[] {
  const capturedAt = context.capturedAt ?? new Date().toISOString();

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (obj.bookmakers && typeof obj.bookmakers === "object" && !Array.isArray(obj.bookmakers)) {
      return normalizeBookmakersOdds(obj, { ...context, capturedAt });
    }
  }

  const outcomes = collectOutcomes(data);
  return outcomes.flatMap(({ path, outcome }: { path: string[]; outcome: Record<string, unknown> }, index: number): OddsApiIoNormalizedOddsRow[] => {
    const price = normalizePrice(outcome.price ?? outcome.odds ?? outcome.american ?? outcome.value);
    if (price == null) return [];
    const marketType = inferMarket(text(outcome.market ?? outcome.marketType ?? outcome.key ?? path.find((item: string) => /money|h2h|spread|handicap|total|over|under/i.test(item)) ?? "unknown"));
    const selection = text(outcome.name ?? outcome.selection ?? outcome.team ?? outcome.label ?? outcome.side) || null;
    const side = inferSide(selection ?? text(path[path.length - 1]), marketType);
    const point = num(outcome.point ?? outcome.handicap ?? outcome.hdp ?? outcome.line);
    const sportsbookName = bookmakerName(path, outcome);
    const sourceSnapshotId = idSafe(`${context.sourceEventId}:${sportsbookName ?? "book"}:${marketType}:${side}:${selection ?? "selection"}:${point ?? "np"}:${index}`);
    return [{
      id: `oddsapiio:${sourceSnapshotId}`,
      eventId: context.sourceEventId,
      league: context.league,
      sport: context.sport ?? null,
      marketType,
      side,
      selection,
      sportsbookName,
      price,
      point,
      sourceSnapshotId,
      capturedAt
    }];
  });
}
