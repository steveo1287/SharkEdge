import type { CurrentOddsBookOutcome } from "@/services/current-odds/provider-types";
import type { MlbBoardNormalizationResult, MlbTrendBoardRow } from "@/lib/types/mlb-trends";

export interface MlbBoardNormalizationService {
  normalizeBoardGames(input: unknown[]): MlbBoardNormalizationResult;
}

type BoardWarningCode =
  | "missing_identifier"
  | "missing_team_mapping"
  | "missing_moneyline"
  | "missing_runline"
  | "missing_total";

type BestLine = {
  line: number | null;
  price: number | null;
};

type TeamLookup = {
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized.length) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseDateString(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  const parsed = parseString(value);
  if (!parsed) {
    return null;
  }

  const timestamp = Date.parse(parsed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseHandedness(value: unknown): "L" | "R" | null {
  const parsed = parseString(value)?.toUpperCase();
  return parsed === "L" || parsed === "R" ? parsed : null;
}

function slugTeamId(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function incrementWarning(map: Map<BoardWarningCode, number>, code: BoardWarningCode) {
  map.set(code, (map.get(code) ?? 0) + 1);
}

function summarizeWarnings(map: Map<BoardWarningCode, number>) {
  const messages: Record<BoardWarningCode, string> = {
    missing_identifier: "Skipped {count} board rows missing game identifiers.",
    missing_team_mapping: "Skipped {count} board rows with no team mapping.",
    missing_moneyline: "{count} board rows missing moneyline prices.",
    missing_runline: "{count} board rows missing runline prices.",
    missing_total: "{count} board rows missing totals."
  };

  return Array.from(map.entries())
    .filter(([, count]) => count > 0)
    .map(([code, count]) => messages[code].replace("{count}", String(count)));
}

function normalizeOutcomeName(value: string | null) {
  return value?.trim().toLowerCase() ?? null;
}

function getTeamLookup(raw: Record<string, unknown>): TeamLookup | null {
  const homeTeamName = parseString(raw.home_team) ?? parseString(raw.homeTeamName);
  const awayTeamName = parseString(raw.away_team) ?? parseString(raw.awayTeamName);
  if (!homeTeamName || !awayTeamName) {
    return null;
  }

  return {
    homeTeamId: parseString(raw.homeTeamId) ?? slugTeamId(homeTeamName),
    awayTeamId: parseString(raw.awayTeamId) ?? slugTeamId(awayTeamName),
    homeTeamName,
    awayTeamName
  };
}

function getBookmakers(raw: Record<string, unknown>) {
  return Array.isArray(raw.bookmakers)
    ? raw.bookmakers.filter((bookmaker): bookmaker is Record<string, unknown> => isRecord(bookmaker))
    : [];
}

function getMarketOutcomes(
  bookmaker: Record<string, unknown>,
  marketType: "moneyline" | "spread" | "total"
): CurrentOddsBookOutcome[] {
  const markets = isRecord(bookmaker.markets) ? bookmaker.markets : null;
  const outcomes = markets?.[marketType];
  return Array.isArray(outcomes) ? (outcomes as CurrentOddsBookOutcome[]) : [];
}

function getBestSideLine(
  raw: Record<string, unknown>,
  marketType: "moneyline" | "spread",
  teamName: string
): BestLine {
  const normalizedTeam = teamName.trim().toLowerCase();
  let bestPrice: number | null = null;
  let bestLine: number | null = null;

  for (const bookmaker of getBookmakers(raw)) {
    for (const outcome of getMarketOutcomes(bookmaker, marketType)) {
      if (normalizeOutcomeName(outcome.name) !== normalizedTeam) {
        continue;
      }

      const price = parseNumber(outcome.price);
      const line = parseNumber(outcome.point);
      if (price === null && line === null) {
        continue;
      }

      if (bestPrice === null || (price ?? Number.NEGATIVE_INFINITY) > bestPrice) {
        bestPrice = price;
        bestLine = line;
      }
    }
  }

  return {
    line: bestLine,
    price: bestPrice
  };
}

function getBestTotalLines(raw: Record<string, unknown>) {
  let totalLine: number | null = null;
  let overPrice: number | null = null;
  let underPrice: number | null = null;

  for (const bookmaker of getBookmakers(raw)) {
    for (const outcome of getMarketOutcomes(bookmaker, "total")) {
      const normalizedName = normalizeOutcomeName(outcome.name);
      const price = parseNumber(outcome.price);
      const point = parseNumber(outcome.point);

      if (normalizedName === "over") {
        if (overPrice === null || (price ?? Number.NEGATIVE_INFINITY) > overPrice) {
          overPrice = price;
          totalLine = point ?? totalLine;
        }
      }

      if (normalizedName === "under") {
        if (underPrice === null || (price ?? Number.NEGATIVE_INFINITY) > underPrice) {
          underPrice = price;
          totalLine = totalLine ?? point;
        }
      }
    }
  }

  return {
    currentTotal: totalLine,
    currentTotalOverPrice: overPrice,
    currentTotalUnderPrice: underPrice
  };
}

function normalizeBoardGame(raw: Record<string, unknown>): MlbTrendBoardRow | null {
  const gameId = parseString(raw.gameId) ?? parseString(raw.id);
  const teams = getTeamLookup(raw);
  if (!gameId || !teams) {
    return null;
  }

  const context = isRecord(raw.context) ? raw.context : null;
  const moneylineHome = getBestSideLine(raw, "moneyline", teams.homeTeamName);
  const moneylineAway = getBestSideLine(raw, "moneyline", teams.awayTeamName);
  const runlineHome = getBestSideLine(raw, "spread", teams.homeTeamName);
  const runlineAway = getBestSideLine(raw, "spread", teams.awayTeamName);
  const totals = getBestTotalLines(raw);

  return {
    gameId,
    externalGameId: parseString(raw.externalGameId) ?? parseString(raw.externalEventId) ?? null,
    startsAt:
      parseDateString(raw.startsAt) ??
      parseDateString(raw.commence_time) ??
      parseDateString(raw.startTime) ??
      null,
    league: "MLB",
    homeTeamId: teams.homeTeamId,
    awayTeamId: teams.awayTeamId,
    homeTeamName: teams.homeTeamName,
    awayTeamName: teams.awayTeamName,
    matchup: `${teams.awayTeamName} at ${teams.homeTeamName}`,
    currentMoneylineHome: moneylineHome.price,
    currentMoneylineAway: moneylineAway.price,
    currentRunlineHome: runlineHome.line,
    currentRunlineAway: runlineAway.line,
    currentRunlinePriceHome: runlineHome.price,
    currentRunlinePriceAway: runlineAway.price,
    currentTotal: totals.currentTotal,
    currentTotalOverPrice: totals.currentTotalOverPrice,
    currentTotalUnderPrice: totals.currentTotalUnderPrice,
    startingPitcherHome:
      parseString(raw.startingPitcherHome) ?? parseString(context?.startingPitcherHome) ?? null,
    startingPitcherAway:
      parseString(raw.startingPitcherAway) ?? parseString(context?.startingPitcherAway) ?? null,
    startingPitcherHandHome:
      parseHandedness(raw.startingPitcherHandHome) ?? parseHandedness(context?.startingPitcherHandHome) ?? null,
    startingPitcherHandAway:
      parseHandedness(raw.startingPitcherHandAway) ?? parseHandedness(context?.startingPitcherHandAway) ?? null,
    status: parseString(raw.status) ?? "PREGAME",
    source: parseString(raw.source) ?? parseString(raw.provider) ?? parseString(raw.providerKey) ?? null
  };
}

export class DefaultMlbBoardNormalizationService implements MlbBoardNormalizationService {
  normalizeBoardGames(input: unknown[]): MlbBoardNormalizationResult {
    const warnings = new Map<BoardWarningCode, number>();
    const rows: MlbTrendBoardRow[] = [];

    for (const item of input) {
      if (!isRecord(item)) {
        incrementWarning(warnings, "missing_identifier");
        continue;
      }

      const gameId = parseString(item.gameId) ?? parseString(item.id);
      if (!gameId) {
        incrementWarning(warnings, "missing_identifier");
        continue;
      }

      if (!getTeamLookup(item)) {
        incrementWarning(warnings, "missing_team_mapping");
        continue;
      }

      const normalized = normalizeBoardGame(item);
      if (!normalized) {
        incrementWarning(warnings, "missing_team_mapping");
        continue;
      }

      if (normalized.currentMoneylineHome === null && normalized.currentMoneylineAway === null) {
        incrementWarning(warnings, "missing_moneyline");
      }

      if (
        normalized.currentRunlineHome === null &&
        normalized.currentRunlineAway === null &&
        normalized.currentRunlinePriceHome === null &&
        normalized.currentRunlinePriceAway === null
      ) {
        incrementWarning(warnings, "missing_runline");
      }

      if (
        normalized.currentTotal === null &&
        normalized.currentTotalOverPrice === null &&
        normalized.currentTotalUnderPrice === null
      ) {
        incrementWarning(warnings, "missing_total");
      }

      rows.push(normalized);
    }

    return {
      rows,
      warnings: summarizeWarnings(warnings)
    };
  }
}
