import type { MlbBatterBookPropQuoteWithPlayer } from "@/services/simulation/mlb-batter-prop-edge-board";
import type { MlbHitterPerGameProjection, MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbBatterPropQuoteQualityIssue = {
  severity: "WARN" | "REJECT";
  reason: string;
  quote: MlbBatterBookPropQuoteWithPlayer;
};

export type MlbBatterPropQuoteQualityReport = {
  modelVersion: "mlb-batter-prop-quote-quality-v1";
  inputCount: number;
  acceptedCount: number;
  mappedCount: number;
  staleCount: number;
  duplicateCount: number;
  unmatchedCount: number;
  thinMarketCount: number;
  qualityScore: number;
  quotes: MlbBatterBookPropQuoteWithPlayer[];
  issues: MlbBatterPropQuoteQualityIssue[];
  warnings: string[];
};

export type MlbBatterPropQuoteQualityConfig = {
  now?: Date | string | null;
  maxQuoteAgeMinutes?: number;
  requirePlayerMapping?: boolean;
  minBooksPerPlayerMarket?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeName(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeam(value: unknown) {
  return clean(value).toUpperCase();
}

function quoteIdentity(quote: MlbBatterBookPropQuoteWithPlayer) {
  return quote.playerId ? `id:${quote.playerId}` : `name:${normalizeName(quote.playerName)}:${normalizeTeam(quote.team)}`;
}

function quoteLineKey(quote: MlbBatterBookPropQuoteWithPlayer) {
  return [quoteIdentity(quote), quote.book.toLowerCase(), quote.market, quote.line, quote.side].join(":");
}

function quoteMarketKey(quote: MlbBatterBookPropQuoteWithPlayer) {
  return [quoteIdentity(quote), quote.market, quote.line].join(":");
}

function quoteUpdatedMs(quote: MlbBatterBookPropQuoteWithPlayer) {
  if (!quote.updatedAt) return null;
  const ms = new Date(quote.updatedAt).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function ageMinutes(quote: MlbBatterBookPropQuoteWithPlayer, nowMs: number) {
  const updated = quoteUpdatedMs(quote);
  if (updated === null) return null;
  return Math.max(0, (nowMs - updated) / 60000);
}

function buildHitterIndexes(projection: MlbPlayerStatProjectionGame) {
  const hitters = [...projection.awayHitters, ...projection.homeHitters];
  const byId = new Map<string, MlbHitterPerGameProjection>();
  const byNameTeam = new Map<string, MlbHitterPerGameProjection>();
  const byName = new Map<string, MlbHitterPerGameProjection[]>();
  for (const hitter of hitters) {
    byId.set(clean(hitter.playerId).toLowerCase(), hitter);
    byNameTeam.set(`${normalizeName(hitter.playerName)}:${normalizeTeam(hitter.team)}`, hitter);
    const nameKey = normalizeName(hitter.playerName);
    const bucket = byName.get(nameKey) ?? [];
    bucket.push(hitter);
    byName.set(nameKey, bucket);
  }
  return { hitters, byId, byNameTeam, byName };
}

function matchQuote(quote: MlbBatterBookPropQuoteWithPlayer, projection: MlbPlayerStatProjectionGame) {
  const indexes = buildHitterIndexes(projection);
  const playerId = clean(quote.playerId).toLowerCase();
  if (playerId && indexes.byId.has(playerId)) return indexes.byId.get(playerId)!;
  const name = normalizeName(quote.playerName);
  const team = normalizeTeam(quote.team);
  if (name && team && indexes.byNameTeam.has(`${name}:${team}`)) return indexes.byNameTeam.get(`${name}:${team}`)!;
  const nameMatches = indexes.byName.get(name) ?? [];
  if (nameMatches.length === 1) return nameMatches[0];
  return null;
}

function enrichQuote(quote: MlbBatterBookPropQuoteWithPlayer, hitter: MlbHitterPerGameProjection): MlbBatterBookPropQuoteWithPlayer {
  return {
    ...quote,
    playerId: hitter.playerId,
    playerName: hitter.playerName,
    team: hitter.team
  };
}

export function qualityGateMlbBatterPropQuotes(args: {
  projection: MlbPlayerStatProjectionGame;
  quotes: MlbBatterBookPropQuoteWithPlayer[];
  config?: MlbBatterPropQuoteQualityConfig;
}): MlbBatterPropQuoteQualityReport {
  const nowMs = args.config?.now ? new Date(args.config.now).getTime() : Date.now();
  const maxQuoteAgeMinutes = args.config?.maxQuoteAgeMinutes ?? 20;
  const requirePlayerMapping = args.config?.requirePlayerMapping ?? true;
  const minBooksPerPlayerMarket = args.config?.minBooksPerPlayerMarket ?? 2;
  const issues: MlbBatterPropQuoteQualityIssue[] = [];
  const accepted: MlbBatterBookPropQuoteWithPlayer[] = [];
  let mappedCount = 0;
  let staleCount = 0;
  let unmatchedCount = 0;

  for (const quote of args.quotes) {
    const hitter = matchQuote(quote, args.projection);
    if (!hitter) {
      unmatchedCount += 1;
      issues.push({ severity: requirePlayerMapping ? "REJECT" : "WARN", reason: `No projected hitter matched ${quote.playerName ?? quote.playerId ?? "unknown player"}.`, quote });
      if (requirePlayerMapping) continue;
    }

    const quoteAge = ageMinutes(quote, Number.isFinite(nowMs) ? nowMs : Date.now());
    if (quoteAge !== null && quoteAge > maxQuoteAgeMinutes) {
      staleCount += 1;
      issues.push({ severity: "REJECT", reason: `Quote is stale: ${quoteAge.toFixed(1)} minutes old.`, quote });
      continue;
    }

    const mappedQuote = hitter ? enrichQuote(quote, hitter) : quote;
    if (hitter) mappedCount += 1;
    accepted.push(mappedQuote);
  }

  const dedupedByKey = new Map<string, MlbBatterBookPropQuoteWithPlayer>();
  let duplicateCount = 0;
  for (const quote of accepted) {
    const key = quoteLineKey(quote);
    const existing = dedupedByKey.get(key);
    if (!existing) {
      dedupedByKey.set(key, quote);
      continue;
    }
    duplicateCount += 1;
    const existingMs = quoteUpdatedMs(existing) ?? 0;
    const nextMs = quoteUpdatedMs(quote) ?? 0;
    if (nextMs >= existingMs) dedupedByKey.set(key, quote);
    issues.push({ severity: "WARN", reason: `Duplicate quote collapsed for ${quote.book} ${quote.market} ${quote.side} ${quote.line}.`, quote });
  }

  const deduped = [...dedupedByKey.values()];
  const marketBuckets = new Map<string, MlbBatterBookPropQuoteWithPlayer[]>();
  for (const quote of deduped) {
    const key = quoteMarketKey(quote);
    const bucket = marketBuckets.get(key) ?? [];
    bucket.push(quote);
    marketBuckets.set(key, bucket);
  }

  let thinMarketCount = 0;
  for (const [key, bucket] of marketBuckets.entries()) {
    const books = new Set(bucket.map((quote) => quote.book.toLowerCase()));
    const sides = new Set(bucket.map((quote) => quote.side));
    if (books.size < minBooksPerPlayerMarket || sides.size < 2) {
      thinMarketCount += 1;
      issues.push({
        severity: "WARN",
        reason: `Thin prop market ${key}: ${books.size}/${minBooksPerPlayerMarket} books and ${sides.size}/2 sides.`,
        quote: bucket[0]
      });
    }
  }

  const rejectCount = issues.filter((issue) => issue.severity === "REJECT").length;
  const warnCount = issues.filter((issue) => issue.severity === "WARN").length;
  const qualityScore = Math.round(clamp(100 - rejectCount * 18 - warnCount * 5 - staleCount * 7 - unmatchedCount * 8 - thinMarketCount * 4, 0, 100));
  const warnings: string[] = [];
  if (!deduped.length) warnings.push("No quotes survived player mapping, freshness, and duplicate quality gates.");
  if (staleCount) warnings.push(`${staleCount} stale quote(s) rejected.`);
  if (unmatchedCount) warnings.push(`${unmatchedCount} quote(s) could not be mapped to projected hitters.`);
  if (duplicateCount) warnings.push(`${duplicateCount} duplicate quote(s) collapsed.`);
  if (thinMarketCount) warnings.push(`${thinMarketCount} thin player-market bucket(s) detected.`);

  return {
    modelVersion: "mlb-batter-prop-quote-quality-v1",
    inputCount: args.quotes.length,
    acceptedCount: deduped.length,
    mappedCount,
    staleCount,
    duplicateCount,
    unmatchedCount,
    thinMarketCount,
    qualityScore,
    quotes: deduped,
    issues,
    warnings
  };
}
