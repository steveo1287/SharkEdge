import type { HistoricalOddsBookmaker, HistoricalOddsGame, HistoricalOddsOutcome } from "@/services/historical-odds/provider-types";

const HISTORICAL_BOOKMAKER_PRIORITY = [
  "draftkings",
  "fanduel",
  "betmgm",
  "williamhill_us",
  "betrivers",
  "espnbet",
  "fanatics"
] as const;

export type HistoricalMarketSourceKind =
  | "structured_closing"
  | "structured_latest_prestart_snapshot"
  | "archived_historical_bookmaker"
  | "none";

export type HistoricalTrendMarketRecord = {
  marketType: "moneyline" | "spread" | "total";
  selection: string;
  side: "HOME" | "AWAY" | "OVER" | "UNDER" | null;
  line: number | null;
  oddsAmerican: number | null;
  closingLine: number | null;
  closingOdds: number | null;
  currentLine: null;
  currentOdds: null;
  selectionCompetitorId: string | null;
  sourceKey: string;
};

export type StructuredHistoricalMarketRecord = {
  marketType: string | null;
  selection: string | null;
  side: string | null;
  line: number | null;
  oddsAmerican: number | null;
  closingLine: number | null;
  closingOdds: number | null;
  currentLine: number | null;
  currentOdds: number | null;
  isLive?: boolean | null;
  selectionCompetitorId?: string | null;
  snapshots?: Array<{
    capturedAt: Date | string | null;
    line: number | null;
    oddsAmerican: number | null;
  }>;
};

type StructuredMarketQuote = {
  marketType: "moneyline" | "spread" | "total";
  selection: string;
  side: "HOME" | "AWAY" | "OVER" | "UNDER" | null;
  closingLine: number | null;
  closingOdds: number | null;
  selectionCompetitorId: string | null;
  sourceKind: Exclude<HistoricalMarketSourceKind, "archived_historical_bookmaker" | "none">;
};

type HistoricalSidePair = {
  home: HistoricalOddsOutcome | null;
  away: HistoricalOddsOutcome | null;
};

type HistoricalTotalPair = {
  over: HistoricalOddsOutcome | null;
  under: HistoricalOddsOutcome | null;
};

export type HistoricalMarketExtractionResult = {
  markets: HistoricalTrendMarketRecord[];
  sourceByMarketType: {
    moneyline: HistoricalMarketSourceKind;
    runline: HistoricalMarketSourceKind;
    total: HistoricalMarketSourceKind;
  };
};

function parseString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildNameTokens(value: string | null | undefined) {
  const raw = value ?? "";
  const parts = raw
    .split(/\s+/)
    .map((part) => normalizeToken(part))
    .filter(Boolean);

  return Array.from(new Set([normalizeToken(raw), ...parts, parts.at(-1) ?? ""])).filter(Boolean);
}

function parseDate(value: Date | string | null | undefined) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  const parsed = parseString(value);
  if (!parsed) {
    return null;
  }

  const timestamp = Date.parse(parsed);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function normalizeSide(value: string | null | undefined) {
  const normalized = parseString(value)?.toUpperCase() ?? null;
  if (!normalized) {
    return null;
  }

  if (normalized === "HOME" || normalized === "AWAY" || normalized === "OVER" || normalized === "UNDER") {
    return normalized;
  }

  if (normalized === "COMPETITOR_A") {
    return "AWAY";
  }

  if (normalized === "COMPETITOR_B") {
    return "HOME";
  }

  return null;
}

function isMoneylineMarketType(value: string | null) {
  return value === "moneyline";
}

function isRunlineMarketType(value: string | null) {
  return value === "spread";
}

function isTotalMarketType(value: string | null) {
  return value === "total";
}

function getBookmakerPriority(key: string | null | undefined) {
  const normalized = normalizeToken(key);
  const index = HISTORICAL_BOOKMAKER_PRIORITY.findIndex((entry) => entry === normalized);
  return index === -1 ? HISTORICAL_BOOKMAKER_PRIORITY.length + 1 : index;
}

function marketSelectionMatchesTeam(
  selection: string | null,
  selectionCompetitorId: string | null,
  teamName: string,
  competitorId: string | null,
  side: "HOME" | "AWAY",
  marketSide: "HOME" | "AWAY" | "OVER" | "UNDER" | null
) {
  if (marketSide === side) {
    return true;
  }

  if (selectionCompetitorId && competitorId && selectionCompetitorId === competitorId) {
    return true;
  }

  const selectionTokens = buildNameTokens(selection);
  const teamTokens = buildNameTokens(teamName);
  return selectionTokens.some((token) => teamTokens.includes(token));
}

export function selectBestPregameMarketSnapshot(
  snapshots: StructuredHistoricalMarketRecord["snapshots"],
  scheduledStart: Date | string | null | undefined
) {
  if (!Array.isArray(snapshots) || !snapshots.length) {
    return null;
  }

  const start = parseDate(scheduledStart);
  const normalizedSnapshots = snapshots
    .map((snapshot) => {
      const capturedAt = parseDate(snapshot.capturedAt);
      if (!capturedAt) {
        return null;
      }

      return {
        capturedAt,
        line: parseNumber(snapshot.line),
        oddsAmerican: parseNumber(snapshot.oddsAmerican)
      };
    })
    .filter(
      (
        snapshot
      ): snapshot is {
        capturedAt: Date;
        line: number | null;
        oddsAmerican: number | null;
      } => Boolean(snapshot)
    )
    .sort((left, right) => left.capturedAt.getTime() - right.capturedAt.getTime());

  if (!normalizedSnapshots.length) {
    return null;
  }

  if (!start) {
    return normalizedSnapshots.at(-1) ?? null;
  }

  const pregame = normalizedSnapshots.filter((snapshot) => snapshot.capturedAt.getTime() <= start.getTime());
  return pregame.at(-1) ?? null;
}

function getStructuredQuote(
  market: StructuredHistoricalMarketRecord,
  scheduledStart: Date | string | null | undefined
): StructuredMarketQuote | null {
  const marketType = parseString(market.marketType);
  const normalizedMarketType = isMoneylineMarketType(marketType)
    ? "moneyline"
    : isRunlineMarketType(marketType)
      ? "spread"
      : isTotalMarketType(marketType)
        ? "total"
        : null;

  if (!normalizedMarketType || market.isLive === true) {
    return null;
  }

  const selection = parseString(market.selection);
  if (!selection) {
    return null;
  }

  const side = normalizeSide(market.side);
  const explicitClosingLine = parseNumber(market.closingLine);
  const explicitClosingOdds = parseNumber(market.closingOdds);

  if (explicitClosingLine !== null || explicitClosingOdds !== null) {
    return {
      marketType: normalizedMarketType,
      selection,
      side,
      closingLine: explicitClosingLine,
      closingOdds: explicitClosingOdds,
      selectionCompetitorId: parseString(market.selectionCompetitorId),
      sourceKind: "structured_closing"
    };
  }

  const bestPregameSnapshot = selectBestPregameMarketSnapshot(market.snapshots, scheduledStart);
  if (!bestPregameSnapshot) {
    return null;
  }

  return {
    marketType: normalizedMarketType,
    selection,
    side,
    closingLine: bestPregameSnapshot.line,
    closingOdds: bestPregameSnapshot.oddsAmerican,
    selectionCompetitorId: parseString(market.selectionCompetitorId),
    sourceKind: "structured_latest_prestart_snapshot"
  };
}

function pickStructuredSide(
  quotes: StructuredMarketQuote[],
  marketType: "moneyline" | "spread" | "total",
  matcher: (quote: StructuredMarketQuote) => boolean
) {
  return quotes
    .filter((quote) => quote.marketType === marketType)
    .filter(matcher)
    .sort((left, right) => {
      if (left.sourceKind !== right.sourceKind) {
        return left.sourceKind === "structured_closing" ? -1 : 1;
      }

      return 0;
    })[0] ?? null;
}

function createStructuredRecords(args: {
  quotes: StructuredMarketQuote[];
  homeTeamName: string;
  awayTeamName: string;
  homeCompetitorId: string | null;
  awayCompetitorId: string | null;
}) {
  const homeMoneyline = pickStructuredSide(args.quotes, "moneyline", (quote) =>
    marketSelectionMatchesTeam(
      quote.selection,
      quote.selectionCompetitorId,
      args.homeTeamName,
      args.homeCompetitorId,
      "HOME",
      quote.side
    )
  );
  const awayMoneyline = pickStructuredSide(args.quotes, "moneyline", (quote) =>
    marketSelectionMatchesTeam(
      quote.selection,
      quote.selectionCompetitorId,
      args.awayTeamName,
      args.awayCompetitorId,
      "AWAY",
      quote.side
    )
  );
  const homeRunline = pickStructuredSide(args.quotes, "spread", (quote) =>
    marketSelectionMatchesTeam(
      quote.selection,
      quote.selectionCompetitorId,
      args.homeTeamName,
      args.homeCompetitorId,
      "HOME",
      quote.side
    )
  );
  const awayRunline = pickStructuredSide(args.quotes, "spread", (quote) =>
    marketSelectionMatchesTeam(
      quote.selection,
      quote.selectionCompetitorId,
      args.awayTeamName,
      args.awayCompetitorId,
      "AWAY",
      quote.side
    )
  );
  const overTotal = pickStructuredSide(
    args.quotes,
    "total",
    (quote) => quote.side === "OVER" || normalizeToken(quote.selection) === "over"
  );
  const underTotal = pickStructuredSide(
    args.quotes,
    "total",
    (quote) => quote.side === "UNDER" || normalizeToken(quote.selection) === "under"
  );

  const markets: HistoricalTrendMarketRecord[] = [];
  let moneylineSource: HistoricalMarketSourceKind = "none";
  let runlineSource: HistoricalMarketSourceKind = "none";
  let totalSource: HistoricalMarketSourceKind = "none";

  if (homeMoneyline) {
    moneylineSource = homeMoneyline.sourceKind;
    markets.push({
      marketType: "moneyline",
      selection: args.homeTeamName,
      side: "HOME",
      line: null,
      oddsAmerican: homeMoneyline.closingOdds,
      closingLine: null,
      closingOdds: homeMoneyline.closingOdds,
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: args.homeCompetitorId,
      sourceKey: "oddsharvester_historical"
    });
  }

  if (awayMoneyline) {
    moneylineSource = awayMoneyline.sourceKind;
    markets.push({
      marketType: "moneyline",
      selection: args.awayTeamName,
      side: "AWAY",
      line: null,
      oddsAmerican: awayMoneyline.closingOdds,
      closingLine: null,
      closingOdds: awayMoneyline.closingOdds,
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: args.awayCompetitorId,
      sourceKey: "oddsharvester_historical"
    });
  }

  if (homeRunline) {
    runlineSource = homeRunline.sourceKind;
    markets.push({
      marketType: "spread",
      selection: args.homeTeamName,
      side: "HOME",
      line: homeRunline.closingLine,
      oddsAmerican: homeRunline.closingOdds,
      closingLine: homeRunline.closingLine,
      closingOdds: homeRunline.closingOdds,
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: args.homeCompetitorId,
      sourceKey: "oddsharvester_historical"
    });
  }

  if (awayRunline) {
    runlineSource = awayRunline.sourceKind;
    markets.push({
      marketType: "spread",
      selection: args.awayTeamName,
      side: "AWAY",
      line: awayRunline.closingLine,
      oddsAmerican: awayRunline.closingOdds,
      closingLine: awayRunline.closingLine,
      closingOdds: awayRunline.closingOdds,
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: args.awayCompetitorId,
      sourceKey: "oddsharvester_historical"
    });
  }

  if (overTotal) {
    totalSource = overTotal.sourceKind;
    markets.push({
      marketType: "total",
      selection: "Over",
      side: "OVER",
      line: overTotal.closingLine,
      oddsAmerican: overTotal.closingOdds,
      closingLine: overTotal.closingLine,
      closingOdds: overTotal.closingOdds,
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: null,
      sourceKey: "oddsharvester_historical"
    });
  }

  if (underTotal) {
    totalSource = underTotal.sourceKind;
    markets.push({
      marketType: "total",
      selection: "Under",
      side: "UNDER",
      line: underTotal.closingLine,
      oddsAmerican: underTotal.closingOdds,
      closingLine: underTotal.closingLine,
      closingOdds: underTotal.closingOdds,
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: null,
      sourceKey: "oddsharvester_historical"
    });
  }

  return {
    markets,
    sourceByMarketType: {
      moneyline: moneylineSource,
      runline: runlineSource,
      total: totalSource
    }
  };
}

function outcomeMatchesTeam(outcome: HistoricalOddsOutcome, teamName: string) {
  const outcomeTokens = buildNameTokens(outcome.name);
  const teamTokens = buildNameTokens(teamName);
  return outcomeTokens.some((token) => teamTokens.includes(token));
}

function selectHistoricalTeamPair(
  outcomes: HistoricalOddsOutcome[],
  homeTeamName: string,
  awayTeamName: string
): HistoricalSidePair | null {
  if (!outcomes.length) {
    return null;
  }

  const home = outcomes.find((outcome) => outcomeMatchesTeam(outcome, homeTeamName)) ?? null;
  const away = outcomes.find((outcome) => outcomeMatchesTeam(outcome, awayTeamName)) ?? null;

  if (!home && !away) {
    return null;
  }

  return { home, away };
}

function selectHistoricalTotalPair(outcomes: HistoricalOddsOutcome[]): HistoricalTotalPair | null {
  if (!outcomes.length) {
    return null;
  }

  const over = outcomes.find((outcome) => normalizeToken(outcome.name) === "over") ?? null;
  const under = outcomes.find((outcome) => normalizeToken(outcome.name) === "under") ?? null;

  if (!over && !under) {
    return null;
  }

  return { over, under };
}

function scoreHistoricalBookmaker(args: {
  bookmaker: HistoricalOddsBookmaker;
  marketType: "moneyline" | "spread" | "total";
  homeTeamName: string;
  awayTeamName: string;
}) {
  const priorityScore = getBookmakerPriority(args.bookmaker.key);

  if (args.marketType === "total") {
    const pair = selectHistoricalTotalPair(args.bookmaker.markets.total ?? []);
    if (!pair || (!pair.over && !pair.under)) {
      return Number.POSITIVE_INFINITY;
    }

    const completeness = Number(Boolean(pair.over)) + Number(Boolean(pair.under));
    return priorityScore * 10 - completeness;
  }

  const pair = selectHistoricalTeamPair(
    args.marketType === "moneyline" ? args.bookmaker.markets.moneyline ?? [] : args.bookmaker.markets.spread ?? [],
    args.homeTeamName,
    args.awayTeamName
  );
  if (!pair || (!pair.home && !pair.away)) {
    return Number.POSITIVE_INFINITY;
  }

  const completeness = Number(Boolean(pair.home)) + Number(Boolean(pair.away));
  return priorityScore * 10 - completeness;
}

function selectBestArchivedBookmaker(args: {
  bookmakers: HistoricalOddsBookmaker[];
  marketType: "moneyline" | "spread" | "total";
  homeTeamName: string;
  awayTeamName: string;
}) {
  return [...args.bookmakers]
    .sort(
      (left, right) =>
        scoreHistoricalBookmaker({ ...args, bookmaker: left }) -
        scoreHistoricalBookmaker({ ...args, bookmaker: right })
    )
    .find(
      (bookmaker) =>
        Number.isFinite(scoreHistoricalBookmaker({ ...args, bookmaker })) &&
        scoreHistoricalBookmaker({ ...args, bookmaker }) < Number.POSITIVE_INFINITY
    ) ?? null;
}

function createArchivedRecords(args: {
  historicalGame: HistoricalOddsGame;
  homeTeamName: string;
  awayTeamName: string;
  homeCompetitorId: string | null;
  awayCompetitorId: string | null;
}) {
  const markets: HistoricalTrendMarketRecord[] = [];
  let moneylineSource: HistoricalMarketSourceKind = "none";
  let runlineSource: HistoricalMarketSourceKind = "none";
  let totalSource: HistoricalMarketSourceKind = "none";

  const moneylineBookmaker = selectBestArchivedBookmaker({
    bookmakers: args.historicalGame.bookmakers,
    marketType: "moneyline",
    homeTeamName: args.homeTeamName,
    awayTeamName: args.awayTeamName
  });
  const runlineBookmaker = selectBestArchivedBookmaker({
    bookmakers: args.historicalGame.bookmakers,
    marketType: "spread",
    homeTeamName: args.homeTeamName,
    awayTeamName: args.awayTeamName
  });
  const totalBookmaker = selectBestArchivedBookmaker({
    bookmakers: args.historicalGame.bookmakers,
    marketType: "total",
    homeTeamName: args.homeTeamName,
    awayTeamName: args.awayTeamName
  });

  const moneylinePair = moneylineBookmaker
    ? selectHistoricalTeamPair(moneylineBookmaker.markets.moneyline ?? [], args.homeTeamName, args.awayTeamName)
    : null;
  if (moneylinePair?.home) {
    moneylineSource = "archived_historical_bookmaker";
    markets.push({
      marketType: "moneyline",
      selection: args.homeTeamName,
      side: "HOME",
      line: null,
      oddsAmerican: parseNumber(moneylinePair.home.price),
      closingLine: null,
      closingOdds: parseNumber(moneylinePair.home.price),
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: args.homeCompetitorId,
      sourceKey: "oddsharvester_historical"
    });
  }

  if (moneylinePair?.away) {
    moneylineSource = "archived_historical_bookmaker";
    markets.push({
      marketType: "moneyline",
      selection: args.awayTeamName,
      side: "AWAY",
      line: null,
      oddsAmerican: parseNumber(moneylinePair.away.price),
      closingLine: null,
      closingOdds: parseNumber(moneylinePair.away.price),
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: args.awayCompetitorId,
      sourceKey: "oddsharvester_historical"
    });
  }

  const runlinePair = runlineBookmaker
    ? selectHistoricalTeamPair(runlineBookmaker.markets.spread ?? [], args.homeTeamName, args.awayTeamName)
    : null;
  if (runlinePair?.home) {
    runlineSource = "archived_historical_bookmaker";
    markets.push({
      marketType: "spread",
      selection: args.homeTeamName,
      side: "HOME",
      line: parseNumber(runlinePair.home.point),
      oddsAmerican: parseNumber(runlinePair.home.price),
      closingLine: parseNumber(runlinePair.home.point),
      closingOdds: parseNumber(runlinePair.home.price),
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: args.homeCompetitorId,
      sourceKey: "oddsharvester_historical"
    });
  }

  if (runlinePair?.away) {
    runlineSource = "archived_historical_bookmaker";
    markets.push({
      marketType: "spread",
      selection: args.awayTeamName,
      side: "AWAY",
      line: parseNumber(runlinePair.away.point),
      oddsAmerican: parseNumber(runlinePair.away.price),
      closingLine: parseNumber(runlinePair.away.point),
      closingOdds: parseNumber(runlinePair.away.price),
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: args.awayCompetitorId,
      sourceKey: "oddsharvester_historical"
    });
  }

  const totalPair = totalBookmaker ? selectHistoricalTotalPair(totalBookmaker.markets.total ?? []) : null;
  if (totalPair?.over) {
    totalSource = "archived_historical_bookmaker";
    markets.push({
      marketType: "total",
      selection: "Over",
      side: "OVER",
      line: parseNumber(totalPair.over.point),
      oddsAmerican: parseNumber(totalPair.over.price),
      closingLine: parseNumber(totalPair.over.point),
      closingOdds: parseNumber(totalPair.over.price),
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: null,
      sourceKey: "oddsharvester_historical"
    });
  }

  if (totalPair?.under) {
    totalSource = "archived_historical_bookmaker";
    markets.push({
      marketType: "total",
      selection: "Under",
      side: "UNDER",
      line: parseNumber(totalPair.under.point),
      oddsAmerican: parseNumber(totalPair.under.price),
      closingLine: parseNumber(totalPair.under.point),
      closingOdds: parseNumber(totalPair.under.price),
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: null,
      sourceKey: "oddsharvester_historical"
    });
  }

  return {
    markets,
    sourceByMarketType: {
      moneyline: moneylineSource,
      runline: runlineSource,
      total: totalSource
    }
  };
}

function mergeHistoricalMarkets(
  primary: HistoricalTrendMarketRecord[],
  fallback: HistoricalTrendMarketRecord[]
) {
  const merged = new Map<string, HistoricalTrendMarketRecord>();

  for (const market of [...primary, ...fallback]) {
    const key = [
      market.marketType,
      market.side ?? "NONE",
      market.selectionCompetitorId ?? "NONE",
      normalizeToken(market.selection)
    ].join("|");

    if (!merged.has(key)) {
      merged.set(key, market);
    }
  }

  return Array.from(merged.values());
}

export function extractHistoricalMoneyline(args: {
  structuredMarkets?: StructuredHistoricalMarketRecord[];
  historicalGame?: HistoricalOddsGame | null;
  scheduledStart?: Date | string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeCompetitorId: string | null;
  awayCompetitorId: string | null;
}) {
  const structuredQuotes = (args.structuredMarkets ?? [])
    .map((market) => getStructuredQuote(market, args.scheduledStart))
    .filter((quote): quote is StructuredMarketQuote => Boolean(quote));
  const structured = createStructuredRecords({
    quotes: structuredQuotes,
    homeTeamName: args.homeTeamName,
    awayTeamName: args.awayTeamName,
    homeCompetitorId: args.homeCompetitorId,
    awayCompetitorId: args.awayCompetitorId
  });
  const archived = args.historicalGame
    ? createArchivedRecords({
        historicalGame: args.historicalGame,
        homeTeamName: args.homeTeamName,
        awayTeamName: args.awayTeamName,
        homeCompetitorId: args.homeCompetitorId,
        awayCompetitorId: args.awayCompetitorId
      })
    : {
        markets: [],
        sourceByMarketType: {
          moneyline: "none" as const,
          runline: "none" as const,
          total: "none" as const
        }
      };

  const structuredMoneyline = structured.markets.filter((market) => market.marketType === "moneyline");
  const archivedMoneyline = archived.markets.filter((market) => market.marketType === "moneyline");

  return {
    markets: mergeHistoricalMarkets(structuredMoneyline, archivedMoneyline),
    source:
      structured.sourceByMarketType.moneyline !== "none"
        ? structured.sourceByMarketType.moneyline
        : archived.sourceByMarketType.moneyline
  };
}

export function extractHistoricalRunline(args: {
  structuredMarkets?: StructuredHistoricalMarketRecord[];
  historicalGame?: HistoricalOddsGame | null;
  scheduledStart?: Date | string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeCompetitorId: string | null;
  awayCompetitorId: string | null;
}) {
  const structuredQuotes = (args.structuredMarkets ?? [])
    .map((market) => getStructuredQuote(market, args.scheduledStart))
    .filter((quote): quote is StructuredMarketQuote => Boolean(quote));
  const structured = createStructuredRecords({
    quotes: structuredQuotes,
    homeTeamName: args.homeTeamName,
    awayTeamName: args.awayTeamName,
    homeCompetitorId: args.homeCompetitorId,
    awayCompetitorId: args.awayCompetitorId
  });
  const archived = args.historicalGame
    ? createArchivedRecords({
        historicalGame: args.historicalGame,
        homeTeamName: args.homeTeamName,
        awayTeamName: args.awayTeamName,
        homeCompetitorId: args.homeCompetitorId,
        awayCompetitorId: args.awayCompetitorId
      })
    : {
        markets: [],
        sourceByMarketType: {
          moneyline: "none" as const,
          runline: "none" as const,
          total: "none" as const
        }
      };

  const structuredRunline = structured.markets.filter((market) => market.marketType === "spread");
  const archivedRunline = archived.markets.filter((market) => market.marketType === "spread");

  return {
    markets: mergeHistoricalMarkets(structuredRunline, archivedRunline),
    source:
      structured.sourceByMarketType.runline !== "none"
        ? structured.sourceByMarketType.runline
        : archived.sourceByMarketType.runline
  };
}

export function extractHistoricalTotal(args: {
  structuredMarkets?: StructuredHistoricalMarketRecord[];
  historicalGame?: HistoricalOddsGame | null;
  scheduledStart?: Date | string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeCompetitorId: string | null;
  awayCompetitorId: string | null;
}) {
  const structuredQuotes = (args.structuredMarkets ?? [])
    .map((market) => getStructuredQuote(market, args.scheduledStart))
    .filter((quote): quote is StructuredMarketQuote => Boolean(quote));
  const structured = createStructuredRecords({
    quotes: structuredQuotes,
    homeTeamName: args.homeTeamName,
    awayTeamName: args.awayTeamName,
    homeCompetitorId: args.homeCompetitorId,
    awayCompetitorId: args.awayCompetitorId
  });
  const archived = args.historicalGame
    ? createArchivedRecords({
        historicalGame: args.historicalGame,
        homeTeamName: args.homeTeamName,
        awayTeamName: args.awayTeamName,
        homeCompetitorId: args.homeCompetitorId,
        awayCompetitorId: args.awayCompetitorId
      })
    : {
        markets: [],
        sourceByMarketType: {
          moneyline: "none" as const,
          runline: "none" as const,
          total: "none" as const
        }
      };

  const structuredTotal = structured.markets.filter((market) => market.marketType === "total");
  const archivedTotal = archived.markets.filter((market) => market.marketType === "total");

  return {
    markets: mergeHistoricalMarkets(structuredTotal, archivedTotal),
    source:
      structured.sourceByMarketType.total !== "none"
        ? structured.sourceByMarketType.total
        : archived.sourceByMarketType.total
  };
}

export function extractHistoricalTrendMarkets(args: {
  structuredMarkets?: StructuredHistoricalMarketRecord[];
  historicalGame?: HistoricalOddsGame | null;
  scheduledStart?: Date | string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeCompetitorId: string | null;
  awayCompetitorId: string | null;
}) : HistoricalMarketExtractionResult {
  const moneyline = extractHistoricalMoneyline(args);
  const runline = extractHistoricalRunline(args);
  const total = extractHistoricalTotal(args);

  return {
    markets: [...moneyline.markets, ...runline.markets, ...total.markets],
    sourceByMarketType: {
      moneyline: moneyline.source,
      runline: runline.source,
      total: total.source
    }
  };
}
