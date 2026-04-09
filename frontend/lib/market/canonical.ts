import type { LeagueKey, MarketType, SportCode } from "@/lib/types/domain";

export type CanonicalMarketScope = "game" | "team" | "player" | "fight" | "market";

export type CanonicalMarketPeriod =
  | "full_game"
  | "first_5"
  | "first_half"
  | "second_half"
  | "first_quarter"
  | "second_quarter"
  | "third_quarter"
  | "fourth_quarter"
  | "first_period"
  | "second_period"
  | "third_period"
  | `round_${number}`
  | string;

export type CanonicalOutcomeType =
  | "home"
  | "away"
  | "over"
  | "under"
  | "yes"
  | "no"
  | "competitor_a"
  | "competitor_b"
  | "other";

export type CanonicalMarketStatus = "active" | "suspended" | "closed" | "settled" | "unknown";

export type CanonicalMarketSource = "live" | "historical" | "derived" | "mock" | string;

export type CanonicalMarketInput = {
  sport: SportCode;
  league: LeagueKey;
  eventId: string;
  providerEventId?: string | null;
  sportsbookKey: string;
  marketType: MarketType;
  marketScope: CanonicalMarketScope;
  period?: CanonicalMarketPeriod | null;
  side: string;
  line?: number | null;
  outcomeType?: CanonicalOutcomeType | null;
  participantTeamId?: string | null;
  participantPlayerId?: string | null;
  capturedAt: string;
  isLive: boolean;
  source: CanonicalMarketSource;
  status?: CanonicalMarketStatus | null;
  freshnessSeconds?: number | null;
  isStale?: boolean | null;
};

export type CanonicalMarket = CanonicalMarketInput & {
  period: CanonicalMarketPeriod;
  outcomeType: CanonicalOutcomeType;
  status: CanonicalMarketStatus;
  freshnessSeconds: number | null;
  isStale: boolean;
  canonicalFamilyKey: string;
  canonicalMarketKey: string;
};

export type CanonicalMarketComparison = {
  equal: boolean;
  mismatchFields: Array<keyof CanonicalMarket>;
};

function normalizeToken(value: string | null | undefined) {
  return (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "na";
}

function normalizeLine(line: number | null | undefined) {
  if (typeof line !== "number" || !Number.isFinite(line)) {
    return "na";
  }

  return line.toFixed(2);
}

export function normalizeCanonicalSide(value: string) {
  return normalizeToken(value);
}

export function normalizeCanonicalPeriod(value: CanonicalMarketPeriod | null | undefined) {
  return normalizeToken(value ?? "full_game") as CanonicalMarketPeriod;
}

export function buildCanonicalMarketFamilyKey(input: Omit<CanonicalMarketInput, "capturedAt" | "freshnessSeconds" | "isStale" | "sportsbookKey">) {
  return [
    normalizeToken(input.sport),
    normalizeToken(input.league),
    normalizeToken(input.eventId),
    normalizeToken(input.providerEventId),
    normalizeToken(input.marketType),
    normalizeToken(input.marketScope),
    normalizeCanonicalPeriod(input.period),
    normalizeCanonicalSide(input.side),
    normalizeLine(input.line),
    normalizeToken(input.outcomeType ?? "other"),
    normalizeToken(input.participantTeamId),
    normalizeToken(input.participantPlayerId)
  ].join(":");
}

export function buildCanonicalMarketKey(input: Omit<CanonicalMarketInput, "freshnessSeconds" | "isStale">) {
  return [
    buildCanonicalMarketFamilyKey(input),
    normalizeToken(input.sportsbookKey)
  ].join(":");
}

export function createCanonicalMarket(input: CanonicalMarketInput): CanonicalMarket {
  const period = normalizeCanonicalPeriod(input.period);
  const outcomeType = (normalizeToken(input.outcomeType ?? "other") as CanonicalOutcomeType) || "other";
  const status = (normalizeToken(input.status ?? "active") as CanonicalMarketStatus) || "unknown";
  const freshnessSeconds =
    typeof input.freshnessSeconds === "number" && Number.isFinite(input.freshnessSeconds)
      ? Math.max(0, Math.round(input.freshnessSeconds))
      : null;
  const isStale =
    typeof input.isStale === "boolean"
      ? input.isStale
      : typeof freshnessSeconds === "number"
        ? freshnessSeconds > (input.isLive ? 120 : 900)
        : false;

  const normalized: CanonicalMarket = {
    ...input,
    period,
    outcomeType,
    status,
    freshnessSeconds,
    isStale,
    canonicalFamilyKey: buildCanonicalMarketFamilyKey(input),
    canonicalMarketKey: buildCanonicalMarketKey(input)
  };

  return normalized;
}

export function compareCanonicalMarkets(left: CanonicalMarket, right: CanonicalMarket, args?: { ignoreSportsbook?: boolean; ignoreCapture?: boolean }) {
  const mismatchFields: Array<keyof CanonicalMarket> = [];
  const keys: Array<keyof CanonicalMarket> = [
    "sport",
    "league",
    "eventId",
    "providerEventId",
    "marketType",
    "marketScope",
    "period",
    "side",
    "line",
    "outcomeType",
    "participantTeamId",
    "participantPlayerId",
    "isLive",
    "source",
    "status"
  ];

  if (!args?.ignoreSportsbook) {
    keys.push("sportsbookKey");
  }

  if (!args?.ignoreCapture) {
    keys.push("capturedAt");
  }

  for (const key of keys) {
    if ((left[key] ?? null) !== (right[key] ?? null)) {
      mismatchFields.push(key);
    }
  }

  return {
    equal: mismatchFields.length === 0,
    mismatchFields
  } satisfies CanonicalMarketComparison;
}

export function describeCanonicalMarketMismatch(left: CanonicalMarket, right: CanonicalMarket) {
  const comparison = compareCanonicalMarkets(left, right);
  if (comparison.equal) {
    return [];
  }

  return comparison.mismatchFields.map((field) => String(field));
}
