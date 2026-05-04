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
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
    return [{
      sourceEventId,
      league: text(event.league ?? event.leagueKey ?? fallback.league).toUpperCase(),
      sport: text(event.sport ?? fallback.sport) || null,
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

function collectOutcomes(node: unknown, path: string[] = []): Array<{ path: string[]; outcome: Record<string, unknown> }> {
  if (!node || typeof node !== "object") return [];
  if (looksLikeOutcome(node)) return [{ path, outcome: node }];
  if (Array.isArray(node)) return node.flatMap((item: unknown, index: number) => collectOutcomes(item, [...path, String(index)]));
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]: [string, unknown]) => collectOutcomes(value, [...path, key]));
}

function bookmakerName(path: string[], row: Record<string, unknown>) {
  return text(row.bookmaker ?? row.bookmakerName ?? row.sportsbook ?? row.site ?? row.book ?? path.find((item: string) => /^[A-Za-z][A-Za-z0-9 _.-]{2,}$/.test(item))) || null;
}

export function normalizeOddsApiIoOdds(data: unknown, context: { sourceEventId: string; league: string; sport?: string | null; capturedAt?: string }): OddsApiIoNormalizedOddsRow[] {
  const capturedAt = context.capturedAt ?? new Date().toISOString();
  const outcomes = collectOutcomes(data);
  return outcomes.flatMap(({ path, outcome }: { path: string[]; outcome: Record<string, unknown> }, index: number): OddsApiIoNormalizedOddsRow[] => {
    const price = num(outcome.price ?? outcome.odds ?? outcome.american ?? outcome.value);
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
