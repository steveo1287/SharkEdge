import { prisma } from "@/lib/db/prisma";

type RawBookSelection = {
  id: string;
  bookId: string | null;
  bookKey: string;
  bookName: string;
  marketType: string;
  period: string | null;
  playerId: string | null;
  playerName: string | null;
  selectionCompetitorId: string | null;
  selection: string;
  side: string | null;
  line: number | null;
  oddsAmerican: number | null;
  marketLabel: string | null;
  sourceKey: string | null;
  updatedAt: string;
  freshnessMinutes: number;
};

export type MlbBookMarketSelection = RawBookSelection & {
  deltaFromConsensus: number | null;
  isOutlier: boolean;
  isStale: boolean;
};

export type MlbBookMarketGroup = {
  marketScope: "game" | "player";
  marketKey: string;
  label: string;
  playerId: string | null;
  playerName: string | null;
  consensusLine: number | null;
  books: MlbBookMarketSelection[];
  outlierCount: number;
  staleCount: number;
};

export type MlbBookMarketState = {
  summary: {
    booksInMesh: string[];
    gameMarketCount: number;
    playerMarketCount: number;
    outlierBookCount: number;
    staleBookCount: number;
  };
  gameMarkets: MlbBookMarketGroup[];
  playerMarkets: MlbBookMarketGroup[];
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getFreshnessMinutes(updatedAt: Date) {
  return Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 60000));
}

function isOverLike(side: string | null | undefined, selection: string | null | undefined) {
  const sideToken = normalize(side);
  const selectionToken = normalize(selection);
  return (
    sideToken === "over" ||
    sideToken === "o" ||
    selectionToken === "over" ||
    selectionToken.startsWith("over ") ||
    selectionToken.includes(" over ")
  );
}

function isHomeLike(args: {
  side: string | null | undefined;
  selection: string | null | undefined;
  selectionCompetitorId: string | null | undefined;
  homeCompetitorId: string | null | undefined;
  homeTokens: string[];
}) {
  const sideToken = normalize(args.side);
  const selectionToken = normalize(args.selection);

  if (
    args.selectionCompetitorId &&
    args.homeCompetitorId &&
    args.selectionCompetitorId === args.homeCompetitorId
  ) {
    return true;
  }

  if (sideToken === "home" || sideToken === "h") {
    return true;
  }

  return args.homeTokens.some((token) => token.length > 1 && selectionToken.includes(token));
}

function buildOutlierThreshold(group: MlbBookMarketGroup) {
  if (group.marketScope === "game") {
    return group.marketKey === "total" ? 1 : 0.75;
  }
  if (group.marketKey.includes("pitcher_outs")) {
    return 1;
  }
  if (group.marketKey.includes("strikeouts")) {
    return 0.5;
  }
  return 0.5;
}

function toSelection(row: {
  id: string;
  sportsbook: { id: string; key: string; name: string } | null;
  marketType: string;
  period: string | null;
  playerId: string | null;
  player: { name: string } | null;
  selectionCompetitorId: string | null;
  selection: string;
  side: string | null;
  line: number | null;
  currentLine: number | null;
  oddsAmerican: number;
  currentOdds: number | null;
  marketLabel: string;
  sourceKey: string | null;
  updatedAt: Date;
}): RawBookSelection {
  return {
    id: row.id,
    bookId: row.sportsbook?.id ?? null,
    bookKey: row.sportsbook?.key ?? "unknown",
    bookName: row.sportsbook?.name ?? "Unknown book",
    marketType: row.marketType,
    period: row.period,
    playerId: row.playerId,
    playerName: row.player?.name ?? null,
    selectionCompetitorId: row.selectionCompetitorId,
    selection: row.selection,
    side: row.side,
    line: row.currentLine ?? row.line ?? null,
    oddsAmerican: row.currentOdds ?? row.oddsAmerican ?? null,
    marketLabel: row.marketLabel ?? null,
    sourceKey: row.sourceKey,
    updatedAt: row.updatedAt.toISOString(),
    freshnessMinutes: getFreshnessMinutes(row.updatedAt),
  };
}

function finalizeGroup(group: Omit<MlbBookMarketGroup, "consensusLine" | "books" | "outlierCount" | "staleCount"> & {
  rawBooks: RawBookSelection[];
}): MlbBookMarketGroup {
  const numericLines = group.rawBooks
    .map((book) => book.line)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const consensusLine = median(numericLines);
  const medianFreshness = median(group.rawBooks.map((book) => book.freshnessMinutes)) ?? 0;

  const provisional: MlbBookMarketGroup = {
    marketScope: group.marketScope,
    marketKey: group.marketKey,
    label: group.label,
    playerId: group.playerId,
    playerName: group.playerName,
    consensusLine,
    books: [],
    outlierCount: 0,
    staleCount: 0,
  };

  const outlierThreshold = buildOutlierThreshold(provisional);

  const books = group.rawBooks
    .map((book) => {
      const deltaFromConsensus =
        typeof consensusLine === "number" && typeof book.line === "number"
          ? round(book.line - consensusLine, 2)
          : null;
      const isOutlier =
        typeof deltaFromConsensus === "number"
          ? Math.abs(deltaFromConsensus) >= outlierThreshold
          : false;
      const isStale = book.freshnessMinutes >= Math.max(30, medianFreshness + 15);

      return {
        ...book,
        deltaFromConsensus,
        isOutlier,
        isStale,
      } satisfies MlbBookMarketSelection;
    })
    .sort((left, right) => {
      const leftDelta = typeof left.deltaFromConsensus === "number" ? Math.abs(left.deltaFromConsensus) : 0;
      const rightDelta = typeof right.deltaFromConsensus === "number" ? Math.abs(right.deltaFromConsensus) : 0;
      if (leftDelta !== rightDelta) {
        return rightDelta - leftDelta;
      }
      return left.freshnessMinutes - right.freshnessMinutes;
    });

  return {
    ...provisional,
    books,
    outlierCount: books.filter((book) => book.isOutlier).length,
    staleCount: books.filter((book) => book.isStale).length,
  };
}

export async function buildMlbBookMarketState(eventId: string): Promise<MlbBookMarketState | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participants: {
        include: {
          competitor: true,
        },
      },
      markets: {
        include: {
          sportsbook: true,
          player: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      },
    },
  });

  if (!event || event.league.key !== "MLB") {
    return null;
  }

  const homeParticipant =
    event.participants.find((participant) => participant.role === "HOME") ??
    event.participants[0] ??
    null;

  const homeTokens = [
    homeParticipant?.competitor.name,
    homeParticipant?.competitor.shortName,
    homeParticipant?.competitor.abbreviation,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalize(value));

  const rawGameGroups = new Map<string, {
    marketScope: "game";
    marketKey: string;
    label: string;
    playerId: null;
    playerName: null;
    rawBooks: RawBookSelection[];
  }>();

  const rawPlayerGroups = new Map<string, {
    marketScope: "player";
    marketKey: string;
    label: string;
    playerId: string | null;
    playerName: string | null;
    rawBooks: RawBookSelection[];
  }>();

  const dedupe = new Set<string>();

  for (const market of event.markets) {
    if (market.period && market.period !== "full_game") {
      continue;
    }

    const selection = toSelection({
      id: market.id,
      sportsbook: market.sportsbook
        ? { id: market.sportsbook.id, key: market.sportsbook.key, name: market.sportsbook.name }
        : null,
      marketType: String(market.marketType),
      period: market.period,
      playerId: market.playerId,
      player: market.player ? { name: market.player.name } : null,
      selectionCompetitorId: market.selectionCompetitorId,
      selection: market.selection,
      side: market.side,
      line: market.line,
      currentLine: market.currentLine,
      oddsAmerican: market.oddsAmerican,
      currentOdds: market.currentOdds,
      marketLabel: market.marketLabel,
      sourceKey: market.sourceKey,
      updatedAt: market.updatedAt,
    });

    if (selection.line === null) {
      continue;
    }

    const dedupeKey = [
      selection.bookKey,
      selection.marketType,
      selection.playerId ?? "event",
      selection.selectionCompetitorId ?? "none",
      normalize(selection.side),
      selection.line,
    ].join(":");

    if (dedupe.has(dedupeKey)) {
      continue;
    }
    dedupe.add(dedupeKey);

    if (selection.marketType === "total" && isOverLike(selection.side, selection.selection)) {
      const key = "total";
      const group =
        rawGameGroups.get(key) ??
        {
          marketScope: "game" as const,
          marketKey: key,
          label: "Game total",
          playerId: null,
          playerName: null,
          rawBooks: [],
        };
      group.rawBooks.push(selection);
      rawGameGroups.set(key, group);
      continue;
    }

    if (
      selection.marketType === "spread" &&
      isHomeLike({
        side: selection.side,
        selection: selection.selection,
        selectionCompetitorId: selection.selectionCompetitorId,
        homeCompetitorId: homeParticipant?.competitorId ?? null,
        homeTokens,
      })
    ) {
      const key = "spread_home";
      const group =
        rawGameGroups.get(key) ??
        {
          marketScope: "game" as const,
          marketKey: key,
          label: "Home spread",
          playerId: null,
          playerName: null,
          rawBooks: [],
        };
      group.rawBooks.push(selection);
      rawGameGroups.set(key, group);
      continue;
    }

    if (
      selection.playerId &&
      selection.marketType.startsWith("player_") &&
      isOverLike(selection.side, selection.selection)
    ) {
      const key = `${selection.playerId}:${selection.marketType}`;
      const group =
        rawPlayerGroups.get(key) ??
        {
          marketScope: "player" as const,
          marketKey: selection.marketType,
          label: `${selection.playerName ?? "Player"} · ${selection.marketType.replace(/^player_/, "").replace(/_/g, " ")}`,
          playerId: selection.playerId,
          playerName: selection.playerName,
          rawBooks: [],
        };
      group.rawBooks.push(selection);
      rawPlayerGroups.set(key, group);
    }
  }

  const gameMarkets = [...rawGameGroups.values()]
    .map((group) => finalizeGroup(group))
    .filter((group) => group.books.length > 0);

  const playerMarkets = [...rawPlayerGroups.values()]
    .map((group) => finalizeGroup(group))
    .filter((group) => group.books.length > 0);

  const booksInMesh = Array.from(
    new Set(
      [...gameMarkets, ...playerMarkets]
        .flatMap((group) => group.books.map((book) => book.bookName))
        .filter((value) => value.trim().length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  const staleBookCount = [...gameMarkets, ...playerMarkets].reduce(
    (sum, group) => sum + group.staleCount,
    0
  );
  const outlierBookCount = [...gameMarkets, ...playerMarkets].reduce(
    (sum, group) => sum + group.outlierCount,
    0
  );

  return {
    summary: {
      booksInMesh,
      gameMarketCount: gameMarkets.length,
      playerMarketCount: playerMarkets.length,
      outlierBookCount,
      staleBookCount,
    },
    gameMarkets,
    playerMarkets,
  };
}
