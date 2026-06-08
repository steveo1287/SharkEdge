import type { MlbBatterBookPropQuoteWithPlayer } from "@/services/simulation/mlb-batter-prop-edge-board";

export type MlbRawBatterPropQuote = Record<string, unknown>;

export type MlbBatterPropQuoteNormalizationResult = {
  modelVersion: "mlb-batter-prop-quote-normalizer-v1";
  quotes: MlbBatterBookPropQuoteWithPlayer[];
  rejected: Array<{
    index: number;
    reason: string;
    raw: MlbRawBatterPropQuote;
  }>;
  warnings: string[];
};

const MARKET_ALIASES: Record<string, MlbBatterBookPropQuoteWithPlayer["market"]> = {
  hits: "HITS",
  hit: "HITS",
  batter_hits: "HITS",
  batterhits: "HITS",
  player_hits: "HITS",
  total_bases: "TOTAL_BASES",
  totalbases: "TOTAL_BASES",
  tb: "TOTAL_BASES",
  batter_total_bases: "TOTAL_BASES",
  home_run: "HOME_RUN",
  homerun: "HOME_RUN",
  hr: "HOME_RUN",
  home_runs: "HOME_RUN",
  batter_home_runs: "HOME_RUN",
  walks: "WALKS",
  walk: "WALKS",
  bb: "WALKS",
  batter_walks: "WALKS",
  strikeouts: "STRIKEOUTS",
  strikeout: "STRIKEOUTS",
  ks: "STRIKEOUTS",
  batter_strikeouts: "STRIKEOUTS",
  batter_so: "STRIKEOUTS"
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown) {
  return clean(value).toLowerCase().replace(/[\s\-./]+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function firstString(row: MlbRawBatterPropQuote, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function firstNumber(row: MlbRawBatterPropQuote, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function normalizeMarket(value: unknown): MlbBatterBookPropQuoteWithPlayer["market"] | null {
  const key = normalizeKey(value);
  return MARKET_ALIASES[key] ?? null;
}

function normalizeSide(value: unknown): MlbBatterBookPropQuoteWithPlayer["side"] | null {
  const key = normalizeKey(value);
  if (["over", "o", "yes"].includes(key)) return "OVER";
  if (["under", "u", "no"].includes(key)) return "UNDER";
  return null;
}

function normalizeTeam(value: unknown) {
  const team = clean(value).toUpperCase();
  return team || null;
}

function normalizeOne(raw: MlbRawBatterPropQuote, index: number) {
  const book = firstString(raw, ["book", "sportsbook", "provider", "source", "bookName"]);
  const playerId = firstString(raw, ["playerId", "player_id", "participantId", "participant_id", "mlbamId", "mlbId"]);
  const playerName = firstString(raw, ["playerName", "player_name", "participantName", "participant_name", "name", "label"]);
  const team = normalizeTeam(firstString(raw, ["team", "teamAbbr", "team_abbr", "playerTeam", "player_team"]));
  const market = normalizeMarket(firstString(raw, ["market", "marketType", "market_type", "prop", "propType", "stat", "category"]));
  const side = normalizeSide(firstString(raw, ["side", "selection", "outcome", "labelSide"]));
  const line = firstNumber(raw, ["line", "point", "points", "handicap", "value", "lineValue"]);
  const americanOdds = firstNumber(raw, ["americanOdds", "odds", "price", "american", "american_odds"]);
  const updatedAt = firstString(raw, ["updatedAt", "updated_at", "lastUpdated", "last_updated", "capturedAt", "captured_at"]);

  if (!book) return { quote: null, rejected: { index, reason: "missing book", raw } };
  if (!playerId && !playerName) return { quote: null, rejected: { index, reason: "missing player identity", raw } };
  if (!market) return { quote: null, rejected: { index, reason: "unsupported or missing market", raw } };
  if (!side) return { quote: null, rejected: { index, reason: "unsupported or missing side", raw } };
  if (line === null) return { quote: null, rejected: { index, reason: "missing line", raw } };
  if (americanOdds === null || americanOdds === 0) return { quote: null, rejected: { index, reason: "invalid American odds", raw } };

  return {
    quote: {
      book,
      market,
      line,
      side,
      americanOdds,
      playerId: playerId || null,
      playerName: playerName || null,
      team,
      available: typeof raw.available === "boolean" ? raw.available : undefined,
      updatedAt: updatedAt || undefined
    } satisfies MlbBatterBookPropQuoteWithPlayer,
    rejected: null
  };
}

export function normalizeMlbBatterPropQuotes(rawQuotes: unknown): MlbBatterPropQuoteNormalizationResult {
  const warnings: string[] = [];
  if (!Array.isArray(rawQuotes)) {
    return {
      modelVersion: "mlb-batter-prop-quote-normalizer-v1",
      quotes: [],
      rejected: [],
      warnings: ["Raw batter prop quotes payload was not an array."]
    };
  }

  const quotes: MlbBatterBookPropQuoteWithPlayer[] = [];
  const rejected: MlbBatterPropQuoteNormalizationResult["rejected"] = [];
  rawQuotes.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      rejected.push({ index, reason: "quote is not an object", raw: { value: raw } });
      return;
    }
    const result = normalizeOne(raw as MlbRawBatterPropQuote, index);
    if (result.quote) quotes.push(result.quote);
    if (result.rejected) rejected.push(result.rejected);
  });

  if (!quotes.length) warnings.push("No valid MLB batter prop quotes normalized.");
  if (rejected.length) warnings.push(`${rejected.length} raw batter prop quote(s) rejected during normalization.`);

  return {
    modelVersion: "mlb-batter-prop-quote-normalizer-v1",
    quotes,
    rejected,
    warnings
  };
}
