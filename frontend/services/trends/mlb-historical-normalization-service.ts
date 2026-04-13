import type {
  MlbHistoricalNormalizationResult,
  MlbTrendHistoricalRow
} from "@/lib/types/mlb-trends";

export interface MlbHistoricalNormalizationService {
  normalizeHistoricalGames(input: unknown[]): MlbHistoricalNormalizationResult;
}

type HistoricalWarningCode =
  | "missing_identifier"
  | "missing_date"
  | "missing_team_mapping"
  | "missing_final_score"
  | "missing_closing_moneyline"
  | "missing_closing_runline"
  | "missing_closing_total";

type TeamIdentity = {
  id: string;
  name: string;
  competitorId: string | null;
};

type HistoricalMarketEntry = {
  marketType: string | null;
  selection: string | null;
  side: string | null;
  line: number | null;
  oddsAmerican: number | null;
  closingLine: number | null;
  closingOdds: number | null;
  currentLine: number | null;
  currentOdds: number | null;
  selectionCompetitorId: string | null;
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

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
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

function deriveSeason(gameDate: string, explicitSeason: unknown) {
  const explicit = parseNumber(explicitSeason);
  if (explicit !== null) {
    return Math.trunc(explicit);
  }

  const timestamp = Date.parse(gameDate);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).getUTCFullYear()
    : new Date().getUTCFullYear();
}

function getNestedRecord(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  return isRecord(candidate) ? candidate : null;
}

function getNestedArray(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  return Array.isArray(candidate) ? candidate : [];
}

function incrementWarning(map: Map<HistoricalWarningCode, number>, code: HistoricalWarningCode) {
  map.set(code, (map.get(code) ?? 0) + 1);
}

function summarizeWarnings(map: Map<HistoricalWarningCode, number>) {
  const messages: Record<HistoricalWarningCode, string> = {
    missing_identifier: "Dropped {count} historical rows missing game identifiers.",
    missing_date: "Dropped {count} historical rows missing game dates.",
    missing_team_mapping: "Dropped {count} historical rows with no home/away team mapping.",
    missing_final_score: "Dropped {count} historical rows missing final scores.",
    missing_closing_moneyline: "{count} historical rows missing closing moneyline prices.",
    missing_closing_runline: "{count} historical rows missing closing runline prices.",
    missing_closing_total: "{count} historical rows missing closing totals."
  };

  return Array.from(map.entries())
    .filter(([, count]) => count > 0)
    .map(([code, count]) => messages[code].replace("{count}", String(count)));
}

function normalizeName(value: string | null) {
  return value?.trim().toLowerCase() ?? null;
}

function getTeamIdentityFromParticipant(participant: unknown): TeamIdentity | null {
  if (!isRecord(participant)) {
    return null;
  }

  const competitor = getNestedRecord(participant, "competitor");
  const team = competitor ? getNestedRecord(competitor, "team") : null;
  const metadata = getNestedRecord(participant, "metadataJson");
  const competitorMetadata = competitor ? getNestedRecord(competitor, "metadataJson") : null;

  const id =
    parseString(team?.id) ??
    parseString(competitor?.teamId) ??
    parseString(competitor?.id) ??
    parseString(participant.competitorId) ??
    parseString(metadata?.teamId) ??
    parseString(competitorMetadata?.teamId);
  const name =
    parseString(team?.name) ??
    parseString(competitor?.name) ??
    parseString(participant.name) ??
    parseString(metadata?.name) ??
    parseString(competitorMetadata?.name);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    competitorId: parseString(competitor?.id) ?? parseString(participant.competitorId)
  };
}

function getHomeAwayParticipants(raw: Record<string, unknown>) {
  const participants = getNestedArray(raw, "participants");

  const homeParticipant =
    participants.find((participant) => {
      if (!isRecord(participant)) {
        return false;
      }

      const role = parseString(participant.role)?.toUpperCase();
      const isHome = parseBoolean(participant.isHome);
      return role === "HOME" || isHome === true;
    }) ?? null;
  const awayParticipant =
    participants.find((participant) => {
      if (!isRecord(participant)) {
        return false;
      }

      const role = parseString(participant.role)?.toUpperCase();
      const isHome = parseBoolean(participant.isHome);
      return role === "AWAY" || isHome === false;
    }) ?? null;

  return {
    home: getTeamIdentityFromParticipant(homeParticipant),
    away: getTeamIdentityFromParticipant(awayParticipant)
  };
}

function parseParticipantScore(raw: Record<string, unknown>, side: "HOME" | "AWAY", teamName: string | null) {
  const participants = getNestedArray(raw, "participants");

  for (const participant of participants) {
    if (!isRecord(participant)) {
      continue;
    }

    const role = parseString(participant.role)?.toUpperCase();
    const isHome = parseBoolean(participant.isHome);
    const participantName =
      parseString(getNestedRecord(participant, "competitor")?.name) ?? parseString(participant.name);

    if (role === side || (side === "HOME" ? isHome === true : isHome === false)) {
      return parseNumber(participant.score);
    }

    if (teamName && participantName && normalizeName(participantName) === normalizeName(teamName)) {
      return parseNumber(participant.score);
    }
  }

  const eventResult = getNestedRecord(raw, "eventResult");
  const participantResults = Array.isArray(eventResult?.participantResultsJson)
    ? eventResult.participantResultsJson
    : [];

  for (const participant of participantResults) {
    if (!isRecord(participant)) {
      continue;
    }

    const role = parseString(participant.role)?.toUpperCase();
    const participantName = parseString(participant.name);

    if (role === side) {
      return parseNumber(participant.score) ?? parseNumber(participant.rawScore);
    }

    if (teamName && participantName && normalizeName(participantName) === normalizeName(teamName)) {
      return parseNumber(participant.score) ?? parseNumber(participant.rawScore);
    }
  }

  return parseNumber(side === "HOME" ? raw.homeScore : raw.awayScore);
}

function normalizeHistoricalMarkets(raw: Record<string, unknown>) {
  return getNestedArray(raw, "markets")
    .map((market): HistoricalMarketEntry | null => {
      if (!isRecord(market)) {
        return null;
      }

      return {
        marketType: parseString(market.marketType),
        selection: parseString(market.selection),
        side: parseString(market.side),
        line: parseNumber(market.line),
        oddsAmerican: parseNumber(market.oddsAmerican),
        closingLine: parseNumber(market.closingLine),
        closingOdds: parseNumber(market.closingOdds),
        currentLine: parseNumber(market.currentLine),
        currentOdds: parseNumber(market.currentOdds),
        selectionCompetitorId: parseString(market.selectionCompetitorId)
      };
    })
    .filter((market): market is HistoricalMarketEntry => Boolean(market));
}

function marketMatchesTeam(market: HistoricalMarketEntry, team: TeamIdentity | null, side: "HOME" | "AWAY") {
  const normalizedSide = normalizeName(market.side);
  if (normalizedSide === side.toLowerCase()) {
    return true;
  }

  if (!team) {
    return false;
  }

  if (market.selectionCompetitorId && team.competitorId && market.selectionCompetitorId === team.competitorId) {
    return true;
  }

  return normalizeName(market.selection) === normalizeName(team.name);
}

function pickHistoricalMarket(
  markets: HistoricalMarketEntry[],
  marketType: "moneyline" | "spread" | "total",
  matcher: (market: HistoricalMarketEntry) => boolean
) {
  return markets
    .filter((market) => market.marketType === marketType)
    .filter(matcher)
    .sort((left, right) => {
      const leftHasClosing = Number(left.closingOdds !== null || left.closingLine !== null);
      const rightHasClosing = Number(right.closingOdds !== null || right.closingLine !== null);
      if (leftHasClosing !== rightHasClosing) {
        return rightHasClosing - leftHasClosing;
      }

      const leftOdds = left.closingOdds ?? left.currentOdds ?? left.oddsAmerican ?? Number.NEGATIVE_INFINITY;
      const rightOdds = right.closingOdds ?? right.currentOdds ?? right.oddsAmerican ?? Number.NEGATIVE_INFINITY;
      return rightOdds - leftOdds;
    })[0] ?? null;
}

function extractHistoricalPricing(
  markets: HistoricalMarketEntry[],
  homeTeam: TeamIdentity | null,
  awayTeam: TeamIdentity | null
) {
  const homeMoneyline = pickHistoricalMarket(markets, "moneyline", (market) =>
    marketMatchesTeam(market, homeTeam, "HOME")
  );
  const awayMoneyline = pickHistoricalMarket(markets, "moneyline", (market) =>
    marketMatchesTeam(market, awayTeam, "AWAY")
  );
  const homeRunline = pickHistoricalMarket(markets, "spread", (market) =>
    marketMatchesTeam(market, homeTeam, "HOME")
  );
  const awayRunline = pickHistoricalMarket(markets, "spread", (market) =>
    marketMatchesTeam(market, awayTeam, "AWAY")
  );
  const overTotal = pickHistoricalMarket(
    markets,
    "total",
    (market) => normalizeName(market.selection) === "over" || normalizeName(market.side) === "over"
  );
  const underTotal = pickHistoricalMarket(
    markets,
    "total",
    (market) => normalizeName(market.selection) === "under" || normalizeName(market.side) === "under"
  );

  return {
    closingMoneylineHome: homeMoneyline?.closingOdds ?? null,
    closingMoneylineAway: awayMoneyline?.closingOdds ?? null,
    closingRunlineHome: homeRunline?.closingLine ?? null,
    closingRunlineAway: awayRunline?.closingLine ?? null,
    closingRunlinePriceHome: homeRunline?.closingOdds ?? null,
    closingRunlinePriceAway: awayRunline?.closingOdds ?? null,
    closingTotal: overTotal?.closingLine ?? underTotal?.closingLine ?? null,
    closingTotalOverPrice: overTotal?.closingOdds ?? null,
    closingTotalUnderPrice: underTotal?.closingOdds ?? null
  };
}

function getOptionalContext(raw: Record<string, unknown>) {
  const candidateKeys = ["context", "metadataJson", "stateJson", "weather", "weatherJson"];
  for (const key of candidateKeys) {
    const record = getNestedRecord(raw, key);
    if (record) {
      return record;
    }
  }

  return null;
}

function normalizeHistoricalGame(raw: Record<string, unknown>): MlbTrendHistoricalRow | null {
  const gameId = parseString(raw.gameId) ?? parseString(raw.id);
  const gameDate =
    parseDateString(raw.gameDate) ?? parseDateString(raw.startTime) ?? parseDateString(raw.date);

  const topLevelHomeTeam = getNestedRecord(raw, "homeTeam");
  const topLevelAwayTeam = getNestedRecord(raw, "awayTeam");
  const participants = getHomeAwayParticipants(raw);

  const homeTeamId = parseString(topLevelHomeTeam?.id) ?? participants.home?.id ?? parseString(raw.homeTeamId);
  const awayTeamId = parseString(topLevelAwayTeam?.id) ?? participants.away?.id ?? parseString(raw.awayTeamId);
  const homeTeamName =
    parseString(topLevelHomeTeam?.name) ?? participants.home?.name ?? parseString(raw.homeTeamName);
  const awayTeamName =
    parseString(topLevelAwayTeam?.name) ?? participants.away?.name ?? parseString(raw.awayTeamName);

  if (!gameId || !gameDate || !homeTeamId || !awayTeamId || !homeTeamName || !awayTeamName) {
    return null;
  }

  const homeScore = parseParticipantScore(raw, "HOME", homeTeamName);
  const awayScore = parseParticipantScore(raw, "AWAY", awayTeamName);
  if (homeScore === null || awayScore === null) {
    return null;
  }

  const context = getOptionalContext(raw);
  const markets = normalizeHistoricalMarkets(raw);
  const pricing = extractHistoricalPricing(markets, participants.home, participants.away);
  const eventResult = getNestedRecord(raw, "eventResult");
  const eventResultMetadata = eventResult ? getNestedRecord(eventResult, "metadataJson") : null;

  return {
    gameId,
    externalGameId: parseString(raw.externalGameId) ?? parseString(raw.externalEventId) ?? null,
    gameDate,
    season: deriveSeason(gameDate, raw.season),
    league: "MLB",
    homeTeamId,
    awayTeamId,
    homeTeamName,
    awayTeamName,
    homeScore,
    awayScore,
    totalRuns: homeScore + awayScore,
    homeWon: homeScore > awayScore,
    awayWon: awayScore > homeScore,
    closingMoneylineHome: pricing.closingMoneylineHome,
    closingMoneylineAway: pricing.closingMoneylineAway,
    closingRunlineHome: pricing.closingRunlineHome,
    closingRunlineAway: pricing.closingRunlineAway,
    closingRunlinePriceHome: pricing.closingRunlinePriceHome,
    closingRunlinePriceAway: pricing.closingRunlinePriceAway,
    closingTotal: pricing.closingTotal,
    closingTotalOverPrice: pricing.closingTotalOverPrice,
    closingTotalUnderPrice: pricing.closingTotalUnderPrice,
    startingPitcherHome:
      parseString(raw.startingPitcherHome) ??
      parseString(context?.startingPitcherHome) ??
      parseString(getNestedRecord(raw, "homePitcher")?.name) ??
      null,
    startingPitcherAway:
      parseString(raw.startingPitcherAway) ??
      parseString(context?.startingPitcherAway) ??
      parseString(getNestedRecord(raw, "awayPitcher")?.name) ??
      null,
    startingPitcherHandHome:
      parseHandedness(raw.startingPitcherHandHome) ??
      parseHandedness(context?.startingPitcherHandHome) ??
      parseHandedness(getNestedRecord(raw, "homePitcher")?.hand) ??
      null,
    startingPitcherHandAway:
      parseHandedness(raw.startingPitcherHandAway) ??
      parseHandedness(context?.startingPitcherHandAway) ??
      parseHandedness(getNestedRecord(raw, "awayPitcher")?.hand) ??
      null,
    bullpenStatusHome: parseString(raw.bullpenStatusHome) ?? parseString(context?.bullpenStatusHome) ?? null,
    bullpenStatusAway: parseString(raw.bullpenStatusAway) ?? parseString(context?.bullpenStatusAway) ?? null,
    isDoubleHeader: parseBoolean(raw.isDoubleHeader) ?? parseBoolean(context?.isDoubleHeader) ?? null,
    gameNumberInSeries: parseNumber(raw.gameNumberInSeries) ?? parseNumber(context?.gameNumberInSeries) ?? null,
    weatherSummary: parseString(raw.weatherSummary) ?? parseString(context?.weatherSummary) ?? null,
    temperatureF: parseNumber(raw.temperatureF) ?? parseNumber(context?.temperatureF) ?? null,
    windMph: parseNumber(raw.windMph) ?? parseNumber(context?.windMph) ?? null,
    windDirection: parseString(raw.windDirection) ?? parseString(context?.windDirection) ?? null,
    source:
      parseString(raw.source) ??
      parseString(raw.sourceKey) ??
      parseString(raw.providerKey) ??
      parseString(eventResultMetadata?.providerKey) ??
      null
  };
}

export class DefaultMlbHistoricalNormalizationService implements MlbHistoricalNormalizationService {
  normalizeHistoricalGames(input: unknown[]): MlbHistoricalNormalizationResult {
    const warnings = new Map<HistoricalWarningCode, number>();
    const rows: MlbTrendHistoricalRow[] = [];

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

      const gameDate =
        parseDateString(item.gameDate) ?? parseDateString(item.startTime) ?? parseDateString(item.date);
      if (!gameDate) {
        incrementWarning(warnings, "missing_date");
        continue;
      }

      const participants = getHomeAwayParticipants(item);
      const teamMapped =
        parseString(item.homeTeamId) ||
        parseString(item.awayTeamId) ||
        participants.home ||
        participants.away;
      if (!teamMapped) {
        incrementWarning(warnings, "missing_team_mapping");
        continue;
      }

      const normalized = normalizeHistoricalGame(item);
      if (!normalized) {
        incrementWarning(warnings, "missing_final_score");
        continue;
      }

      if (normalized.closingMoneylineHome === null && normalized.closingMoneylineAway === null) {
        incrementWarning(warnings, "missing_closing_moneyline");
      }

      if (
        normalized.closingRunlineHome === null &&
        normalized.closingRunlineAway === null &&
        normalized.closingRunlinePriceHome === null &&
        normalized.closingRunlinePriceAway === null
      ) {
        incrementWarning(warnings, "missing_closing_runline");
      }

      if (
        normalized.closingTotal === null &&
        normalized.closingTotalOverPrice === null &&
        normalized.closingTotalUnderPrice === null
      ) {
        incrementWarning(warnings, "missing_closing_total");
      }

      rows.push(normalized);
    }

    return {
      rows,
      warnings: summarizeWarnings(warnings)
    };
  }
}
