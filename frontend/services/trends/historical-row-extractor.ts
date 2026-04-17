import { prisma } from "@/lib/db/prisma";
import { profitUnitsForAmericanOdds } from "./metrics";
import type { HistoricalBetOpportunity, SupportedDiscoveryMarket, SupportedDiscoverySide } from "./types";

type ExtractorArgs = {
  leagues?: string[];
  historical?: boolean;
  days?: number;
  limit?: number;
};

type SupportedPropMarket = Exclude<SupportedDiscoveryMarket, "moneyline" | "spread" | "total">;

type ProjectionSummary = {
  meanValue: number | null;
  stdDev: number | null;
  overProb: number | null;
  underProb: number | null;
  statKey: string | null;
};

const PROP_MARKETS: SupportedPropMarket[] = [
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_threes",
  "player_pitcher_outs",
  "player_pitcher_strikeouts"
];

const PROP_MARKET_STAT_KEYS: Record<SupportedPropMarket, string[]> = {
  player_points: ["points", "pts"],
  player_rebounds: ["rebounds", "rebs", "reb"],
  player_assists: ["assists", "asts", "ast"],
  player_threes: ["threes", "threePointersMade", "three_pointers_made", "3pm"],
  player_pitcher_outs: ["pitcherOuts", "pitcher_outs", "outsRecorded", "outs"],
  player_pitcher_strikeouts: ["strikeouts", "pitcherStrikeouts", "pitcher_strikeouts", "ks"]
};

function getLineBucket(line: number | null) {
  if (typeof line !== "number") {
    return null;
  }
  const abs = Math.abs(line);
  if (abs < 1) return "pk";
  if (abs <= 2.5) return "1-2.5";
  if (abs <= 5.5) return "3-5.5";
  if (abs <= 9.5) return "6-9.5";
  return "10+";
}

function getTotalBucket(line: number | null) {
  if (typeof line !== "number") {
    return null;
  }
  if (line < 7.5) return "low";
  if (line < 9) return "mid";
  if (line < 10.5) return "high";
  return "very_high";
}

function getFavoriteOrDog(marketType: string, side: string, oddsAmerican: number, line: number | null) {
  if (marketType === "moneyline") {
    if (oddsAmerican < 0) return "favorite";
    if (oddsAmerican > 0) return "dog";
    return "pickem";
  }
  if (marketType === "spread" && typeof line === "number") {
    if ((side === "home" || side === "away") && line < 0) return "favorite";
    if ((side === "home" || side === "away") && line > 0) return "dog";
    return "pickem";
  }
  return null;
}

function getTeamContext(contexts: any[], competitorId: string | null | undefined) {
  if (!competitorId) {
    return null;
  }
  return contexts.find((context) => context.competitorId === competitorId) ?? null;
}

function getSeason(startTime: Date) {
  return startTime.getUTCFullYear();
}

function normalizeSelectionValue(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isOverSelection(value: unknown) {
  const normalized = normalizeSelectionValue(value);
  return normalized.includes("over");
}

function isUnderSelection(value: unknown) {
  const normalized = normalizeSelectionValue(value);
  return normalized.includes("under");
}

function asFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readProbabilityPayload(payload: unknown, line: number | null) {
  if (typeof payload === "number" && Number.isFinite(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof line === "number") {
    const keys = [line.toString(), line.toFixed(1), line.toFixed(2)];
    for (const key of keys) {
      const value = asFiniteNumber(record[key]);
      if (value !== null) {
        return value;
      }
    }
  }

  for (const fallbackKey of ["default", "mean", "median", "value"]) {
    const value = asFiniteNumber(record[fallbackKey]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function getProjectionSummary(event: any, playerId: string | null, marketType: SupportedPropMarket, line: number | null): ProjectionSummary {
  if (!playerId) {
    return {
      meanValue: null,
      stdDev: null,
      overProb: null,
      underProb: null,
      statKey: null
    };
  }

  const statKeys = PROP_MARKET_STAT_KEYS[marketType].map((entry) => entry.toLowerCase());
  const projection = (event.playerProjections ?? []).find((entry: any) => {
    const statKey = typeof entry.statKey === "string" ? entry.statKey.toLowerCase() : "";
    return entry.playerId === playerId && statKeys.includes(statKey);
  }) ?? null;

  if (!projection) {
    return {
      meanValue: null,
      stdDev: null,
      overProb: null,
      underProb: null,
      statKey: null
    };
  }

  return {
    meanValue: asFiniteNumber(projection.meanValue),
    stdDev: asFiniteNumber(projection.stdDev),
    overProb: readProbabilityPayload(projection.hitProbOver, line),
    underProb: readProbabilityPayload(projection.hitProbUnder, line),
    statKey: typeof projection.statKey === "string" ? projection.statKey : null
  };
}

function getPropStatValue(game: any | null, playerId: string | null, marketType: SupportedPropMarket) {
  if (!game || !playerId) {
    return null;
  }

  const row = (game.playerGameStats ?? []).find((entry: any) => entry.playerId === playerId) ?? null;
  if (!row || !row.statsJson || typeof row.statsJson !== "object") {
    return null;
  }

  const stats = row.statsJson as Record<string, unknown>;
  for (const key of PROP_MARKET_STAT_KEYS[marketType]) {
    const direct = asFiniteNumber(stats[key]);
    if (direct !== null) {
      return direct;
    }

    const lowerKey = Object.keys(stats).find((entry) => entry.toLowerCase() === key.toLowerCase());
    if (lowerKey) {
      const value = asFiniteNumber(stats[lowerKey]);
      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

function resolvePropContext(args: {
  player: any | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
}) {
  const playerTeamName = args.player?.team?.name ?? null;
  if (!playerTeamName) {
    return {
      teamName: null,
      opponentName: null,
      homeAway: null
    };
  }

  if (args.homeTeamName && playerTeamName === args.homeTeamName) {
    return {
      teamName: playerTeamName,
      opponentName: args.awayTeamName,
      homeAway: "home" as const
    };
  }

  if (args.awayTeamName && playerTeamName === args.awayTeamName) {
    return {
      teamName: playerTeamName,
      opponentName: args.homeTeamName,
      homeAway: "away" as const
    };
  }

  return {
    teamName: playerTeamName,
    opponentName: null,
    homeAway: null
  };
}

function getMarketOutcome(args: {
  marketType: SupportedDiscoveryMarket;
  side: SupportedDiscoverySide;
  eventResult: any | null;
  homeCompetitorId: string | null;
  awayCompetitorId: string | null;
  line: number | null;
  propStatValue?: number | null;
}) {
  const eventResult = args.eventResult;
  if (!eventResult && typeof args.propStatValue !== "number") {
    return { won: null, push: false };
  }

  if (args.marketType === "moneyline") {
    if (!eventResult?.winnerCompetitorId) {
      return { won: null, push: false };
    }
    const targetCompetitorId = args.side === "home" ? args.homeCompetitorId : args.awayCompetitorId;
    return {
      won: eventResult.winnerCompetitorId === targetCompetitorId,
      push: false
    };
  }

  if (args.marketType === "spread") {
    const cover = eventResult?.coverResult && typeof eventResult.coverResult === "object" ? eventResult.coverResult : null;
    if (cover) {
      const winner = typeof cover.winner === "string" ? cover.winner.toLowerCase() : null;
      const push = cover.push === true || winner === "push";
      return {
        won: push ? null : winner === args.side,
        push
      };
    }

    if (typeof eventResult?.margin === "number" && typeof args.line === "number") {
      const adjusted = args.side === "home" ? eventResult.margin + args.line : -eventResult.margin + args.line;
      return {
        won: adjusted === 0 ? null : adjusted > 0,
        push: adjusted === 0
      };
    }

    return { won: null, push: false };
  }

  if (args.marketType === "total") {
    const result = typeof eventResult?.ouResult === "string" ? eventResult.ouResult.toLowerCase() : null;
    if (!result) {
      return { won: null, push: false };
    }
    if (result === "push") {
      return { won: null, push: true };
    }
    return {
      won: result === args.side,
      push: false
    };
  }

  if (PROP_MARKETS.includes(args.marketType as SupportedPropMarket)) {
    if (typeof args.propStatValue !== "number" || typeof args.line !== "number") {
      return { won: null, push: false };
    }

    const delta = args.propStatValue - args.line;
    if (delta === 0) {
      return { won: null, push: true };
    }

    return {
      won: args.side === "over" ? delta > 0 : delta < 0,
      push: false
    };
  }

  return { won: null, push: false };
}

function buildHistoricalRow(args: {
  event: any;
  marketType: SupportedDiscoveryMarket;
  side: SupportedDiscoverySide;
  line: number | null;
  oddsAmerican: number;
  closeLine: number | null;
  closeOddsAmerican: number | null;
  teamName: string | null;
  opponentName: string | null;
  homeAway: "home" | "away" | null;
  playerId?: string | null;
  playerName?: string | null;
  propStatValue?: number | null;
  projectionMean?: number | null;
  projectionStdDev?: number | null;
  projectionOverProb?: number | null;
  projectionUnderProb?: number | null;
  projectionStatKey?: string | null;
}) {
  const homeParticipant = args.event.participants.find((participant: any) => participant.role === "HOME" || participant.isHome === true) ?? args.event.participants[0] ?? null;
  const awayParticipant = args.event.participants.find((participant: any) => participant.role === "AWAY" || participant.isHome === false) ?? args.event.participants[1] ?? null;
  const outcome = getMarketOutcome({
    marketType: args.marketType,
    side: args.side,
    eventResult: args.event.eventResult ?? null,
    homeCompetitorId: homeParticipant?.competitorId ?? null,
    awayCompetitorId: awayParticipant?.competitorId ?? null,
    line: args.line,
    propStatValue: args.propStatValue ?? null
  });
  const contextCompetitorId =
    args.side === "home"
      ? homeParticipant?.competitorId
      : args.side === "away"
        ? awayParticipant?.competitorId
        : null;
  const context = getTeamContext(args.event.participantContexts, contextCompetitorId);
  const projectionDelta =
    typeof args.projectionMean === "number" && typeof args.line === "number"
      ? Number((args.projectionMean - args.line).toFixed(2))
      : null;

  return {
    rowId: `${args.event.id}:${args.marketType}:${args.playerId ?? "team"}:${args.side}`,
    eventId: args.event.id,
    gameDate: args.event.startTime.toISOString(),
    season: getSeason(args.event.startTime),
    sport: args.event.sport?.code ?? "OTHER",
    league: args.event.league?.key ?? "OTHER",
    marketType: args.marketType,
    side: args.side,
    teamName: args.teamName,
    opponentName: args.opponentName,
    playerId: args.playerId ?? null,
    playerName: args.playerName ?? null,
    propStatValue: args.propStatValue ?? null,
    projectionMean: args.projectionMean ?? null,
    projectionStdDev: args.projectionStdDev ?? null,
    projectionDelta,
    homeTeam: homeParticipant?.competitor?.name ?? null,
    awayTeam: awayParticipant?.competitor?.name ?? null,
    homeAway: args.homeAway,
    favoriteOrDog: getFavoriteOrDog(args.marketType, args.side, args.oddsAmerican, args.line),
    line: args.line,
    oddsAmerican: args.oddsAmerican,
    closeLine: args.closeLine,
    closeOddsAmerican: args.closeOddsAmerican,
    won: outcome.won,
    push: outcome.push,
    profitUnits:
      outcome.won === null && !outcome.push
        ? null
        : profitUnitsForAmericanOdds(args.oddsAmerican, outcome.won === true, outcome.push),
    clvCents: typeof args.closeOddsAmerican === "number" ? args.closeOddsAmerican - args.oddsAmerican : null,
    beatClose: typeof args.closeOddsAmerican === "number" ? args.oddsAmerican > args.closeOddsAmerican : null,
    daysRest: context?.daysRest ?? null,
    opponentRestDays: context?.opponentRestDays ?? null,
    isBackToBack: context?.isBackToBack ?? null,
    recentWinRate: context?.recentWinRate ?? null,
    recentMargin: context?.recentMargin ?? null,
    lineBucket: getLineBucket(args.line),
    totalBucket: getTotalBucket(args.marketType === "total" ? args.line : null),
    metadata: {
      eventName: args.event.name,
      venue: args.event.venue ?? null,
      projectionOverProb: args.projectionOverProb ?? null,
      projectionUnderProb: args.projectionUnderProb ?? null,
      projectionStatKey: args.projectionStatKey ?? null
    }
  } satisfies HistoricalBetOpportunity;
}

function selectHistoricalMarket(event: any, marketType: "moneyline" | "spread" | "total") {
  const candidates = (event.markets ?? []).filter((market: any) => market.marketType === marketType && !market.playerId);
  if (!candidates.length) {
    return [];
  }

  return [...candidates].sort((left: any, right: any) => {
    const rightTs = new Date(right.updatedAt).getTime();
    const leftTs = new Date(left.updatedAt).getTime();
    return rightTs - leftTs;
  });
}

function selectHistoricalPropMarkets(event: any, marketType: SupportedPropMarket) {
  const candidates = (event.markets ?? []).filter((market: any) => market.marketType === marketType && market.playerId);
  if (!candidates.length) {
    return [];
  }

  return [...candidates].sort((left: any, right: any) => {
    const rightTs = new Date(right.updatedAt).getTime();
    const leftTs = new Date(left.updatedAt).getTime();
    return rightTs - leftTs;
  });
}

export async function extractHistoricalTrendRows(args?: ExtractorArgs) {
  const since = args?.days ? new Date(Date.now() - args.days * 86400000) : null;
  const events = await prisma.event.findMany({
    where: {
      ...(args?.historical === false ? { status: { in: ["SCHEDULED", "LIVE"] } } : { status: "FINAL" }),
      ...(since ? { startTime: { gte: since } } : {}),
      ...(args?.leagues?.length ? { league: { key: { in: args.leagues } } } : {})
    },
    orderBy: {
      startTime: args?.historical === false ? "asc" : "desc"
    },
    take: args?.limit ?? (args?.historical === false ? 300 : 1200),
    include: {
      league: true,
      sport: true,
      participants: {
        include: {
          competitor: true
        }
      },
      participantContexts: true,
      eventResult: true,
      markets: {
        include: {
          player: {
            include: {
              team: true
            }
          }
        }
      },
      currentMarketStates: {
        include: {
          bestHomeBook: true,
          bestAwayBook: true,
          bestOverBook: true,
          bestUnderBook: true,
          player: {
            include: {
              team: true
            }
          }
        }
      },
      playerProjections: true
    }
  });

  const externalEventIds = events
    .map((event) => event.externalEventId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const games = externalEventIds.length
    ? await prisma.game.findMany({
        where: {
          externalEventId: {
            in: externalEventIds
          }
        },
        include: {
          playerGameStats: true
        }
      })
    : [];
  const gameByExternalEventId = new Map(games.map((game) => [game.externalEventId, game]));

  const rows: HistoricalBetOpportunity[] = [];

  for (const event of events) {
    const homeParticipant = event.participants.find((participant) => participant.role === "HOME" || participant.isHome === true) ?? event.participants[0] ?? null;
    const awayParticipant = event.participants.find((participant) => participant.role === "AWAY" || participant.isHome === false) ?? event.participants[1] ?? null;
    const homeTeamName = homeParticipant?.competitor?.name ?? null;
    const awayTeamName = awayParticipant?.competitor?.name ?? null;
    const game = event.externalEventId ? gameByExternalEventId.get(event.externalEventId) ?? null : null;

    if (args?.historical === false) {
      for (const state of event.currentMarketStates) {
        if (state.marketType === "moneyline") {
          if (typeof state.bestHomeOddsAmerican === "number") {
            rows.push(buildHistoricalRow({
              event,
              marketType: "moneyline",
              side: "home",
              line: null,
              oddsAmerican: state.bestHomeOddsAmerican,
              closeLine: null,
              closeOddsAmerican: null,
              teamName: homeTeamName,
              opponentName: awayTeamName,
              homeAway: "home"
            }));
          }
          if (typeof state.bestAwayOddsAmerican === "number") {
            rows.push(buildHistoricalRow({
              event,
              marketType: "moneyline",
              side: "away",
              line: null,
              oddsAmerican: state.bestAwayOddsAmerican,
              closeLine: null,
              closeOddsAmerican: null,
              teamName: awayTeamName,
              opponentName: homeTeamName,
              homeAway: "away"
            }));
          }
        }

        if (state.marketType === "spread") {
          const line = state.consensusLineValue ?? null;
          if (typeof state.bestHomeOddsAmerican === "number") {
            rows.push(buildHistoricalRow({
              event,
              marketType: "spread",
              side: "home",
              line,
              oddsAmerican: state.bestHomeOddsAmerican,
              closeLine: null,
              closeOddsAmerican: null,
              teamName: homeTeamName,
              opponentName: awayTeamName,
              homeAway: "home"
            }));
          }
          if (typeof state.bestAwayOddsAmerican === "number") {
            rows.push(buildHistoricalRow({
              event,
              marketType: "spread",
              side: "away",
              line: typeof line === "number" ? -line : null,
              oddsAmerican: state.bestAwayOddsAmerican,
              closeLine: null,
              closeOddsAmerican: null,
              teamName: awayTeamName,
              opponentName: homeTeamName,
              homeAway: "away"
            }));
          }
        }

        if (state.marketType === "total") {
          if (typeof state.bestOverOddsAmerican === "number") {
            rows.push(buildHistoricalRow({
              event,
              marketType: "total",
              side: "over",
              line: state.consensusLineValue ?? null,
              oddsAmerican: state.bestOverOddsAmerican,
              closeLine: null,
              closeOddsAmerican: null,
              teamName: null,
              opponentName: null,
              homeAway: null
            }));
          }
          if (typeof state.bestUnderOddsAmerican === "number") {
            rows.push(buildHistoricalRow({
              event,
              marketType: "total",
              side: "under",
              line: state.consensusLineValue ?? null,
              oddsAmerican: state.bestUnderOddsAmerican,
              closeLine: null,
              closeOddsAmerican: null,
              teamName: null,
              opponentName: null,
              homeAway: null
            }));
          }
        }

        if (PROP_MARKETS.includes(state.marketType as SupportedPropMarket) && state.playerId) {
          const propMarketType = state.marketType as SupportedPropMarket;
          const player = state.player ?? null;
          const propTeams = resolvePropContext({
            player,
            homeTeamName,
            awayTeamName
          });
          const projection = getProjectionSummary(event, state.playerId, propMarketType, state.consensusLineValue ?? null);

          if (typeof state.bestOverOddsAmerican === "number") {
            rows.push(buildHistoricalRow({
              event,
              marketType: propMarketType,
              side: "over",
              line: state.consensusLineValue ?? null,
              oddsAmerican: state.bestOverOddsAmerican,
              closeLine: null,
              closeOddsAmerican: null,
              teamName: propTeams.teamName,
              opponentName: propTeams.opponentName,
              homeAway: propTeams.homeAway,
              playerId: state.playerId,
              playerName: player?.name ?? null,
              propStatValue: null,
              projectionMean: projection.meanValue,
              projectionStdDev: projection.stdDev,
              projectionOverProb: projection.overProb,
              projectionUnderProb: projection.underProb,
              projectionStatKey: projection.statKey
            }));
          }

          if (typeof state.bestUnderOddsAmerican === "number") {
            rows.push(buildHistoricalRow({
              event,
              marketType: propMarketType,
              side: "under",
              line: state.consensusLineValue ?? null,
              oddsAmerican: state.bestUnderOddsAmerican,
              closeLine: null,
              closeOddsAmerican: null,
              teamName: propTeams.teamName,
              opponentName: propTeams.opponentName,
              homeAway: propTeams.homeAway,
              playerId: state.playerId,
              playerName: player?.name ?? null,
              propStatValue: null,
              projectionMean: projection.meanValue,
              projectionStdDev: projection.stdDev,
              projectionOverProb: projection.overProb,
              projectionUnderProb: projection.underProb,
              projectionStatKey: projection.statKey
            }));
          }
        }
      }
      continue;
    }

    const moneylines = selectHistoricalMarket(event, "moneyline");
    const spreads = selectHistoricalMarket(event, "spread");
    const totals = selectHistoricalMarket(event, "total");

    const homeMl = moneylines.find((market: any) => normalizeSelectionValue(market.side ?? market.selection).includes("home") || market.selectionCompetitorId === homeParticipant?.competitorId) ?? null;
    const awayMl = moneylines.find((market: any) => normalizeSelectionValue(market.side ?? market.selection).includes("away") || market.selectionCompetitorId === awayParticipant?.competitorId) ?? null;
    if (homeMl) {
      rows.push(buildHistoricalRow({
        event,
        marketType: "moneyline",
        side: "home",
        line: homeMl.currentLine ?? homeMl.line ?? null,
        oddsAmerican: homeMl.currentOdds ?? homeMl.oddsAmerican,
        closeLine: homeMl.closingLine ?? null,
        closeOddsAmerican: homeMl.closingOdds ?? null,
        teamName: homeTeamName,
        opponentName: awayTeamName,
        homeAway: "home"
      }));
    }
    if (awayMl) {
      rows.push(buildHistoricalRow({
        event,
        marketType: "moneyline",
        side: "away",
        line: awayMl.currentLine ?? awayMl.line ?? null,
        oddsAmerican: awayMl.currentOdds ?? awayMl.oddsAmerican,
        closeLine: awayMl.closingLine ?? null,
        closeOddsAmerican: awayMl.closingOdds ?? null,
        teamName: awayTeamName,
        opponentName: homeTeamName,
        homeAway: "away"
      }));
    }

    const homeSpread = spreads.find((market: any) => market.selectionCompetitorId === homeParticipant?.competitorId) ?? spreads.find((market: any) => normalizeSelectionValue(market.side ?? market.selection).includes("home")) ?? null;
    const awaySpread = spreads.find((market: any) => market.selectionCompetitorId === awayParticipant?.competitorId) ?? spreads.find((market: any) => normalizeSelectionValue(market.side ?? market.selection).includes("away")) ?? null;
    if (homeSpread) {
      rows.push(buildHistoricalRow({
        event,
        marketType: "spread",
        side: "home",
        line: homeSpread.currentLine ?? homeSpread.line ?? null,
        oddsAmerican: homeSpread.currentOdds ?? homeSpread.oddsAmerican,
        closeLine: homeSpread.closingLine ?? null,
        closeOddsAmerican: homeSpread.closingOdds ?? null,
        teamName: homeTeamName,
        opponentName: awayTeamName,
        homeAway: "home"
      }));
    }
    if (awaySpread) {
      rows.push(buildHistoricalRow({
        event,
        marketType: "spread",
        side: "away",
        line: awaySpread.currentLine ?? awaySpread.line ?? null,
        oddsAmerican: awaySpread.currentOdds ?? awaySpread.oddsAmerican,
        closeLine: awaySpread.closingLine ?? null,
        closeOddsAmerican: awaySpread.closingOdds ?? null,
        teamName: awayTeamName,
        opponentName: homeTeamName,
        homeAway: "away"
      }));
    }

    const overTotal = totals.find((market: any) => isOverSelection(market.side ?? market.selection)) ?? null;
    const underTotal = totals.find((market: any) => isUnderSelection(market.side ?? market.selection)) ?? null;
    if (overTotal) {
      rows.push(buildHistoricalRow({
        event,
        marketType: "total",
        side: "over",
        line: overTotal.currentLine ?? overTotal.line ?? null,
        oddsAmerican: overTotal.currentOdds ?? overTotal.oddsAmerican,
        closeLine: overTotal.closingLine ?? null,
        closeOddsAmerican: overTotal.closingOdds ?? null,
        teamName: null,
        opponentName: null,
        homeAway: null
      }));
    }
    if (underTotal) {
      rows.push(buildHistoricalRow({
        event,
        marketType: "total",
        side: "under",
        line: underTotal.currentLine ?? underTotal.line ?? null,
        oddsAmerican: underTotal.currentOdds ?? underTotal.oddsAmerican,
        closeLine: underTotal.closingLine ?? null,
        closeOddsAmerican: underTotal.closingOdds ?? null,
        teamName: null,
        opponentName: null,
        homeAway: null
      }));
    }

    for (const propMarketType of PROP_MARKETS) {
      const propMarkets = selectHistoricalPropMarkets(event, propMarketType);
      const marketsByPlayerId = new Map<string, any[]>();
      for (const market of propMarkets) {
        if (!market.playerId) continue;
        const bucket = marketsByPlayerId.get(market.playerId) ?? [];
        bucket.push(market);
        marketsByPlayerId.set(market.playerId, bucket);
      }

      for (const [playerId, playerMarkets] of marketsByPlayerId.entries()) {
        const overMarket = playerMarkets.find((market) => isOverSelection(market.side ?? market.selection)) ?? null;
        const underMarket = playerMarkets.find((market) => isUnderSelection(market.side ?? market.selection)) ?? null;
        const player = overMarket?.player ?? underMarket?.player ?? null;
        const line = overMarket?.currentLine ?? overMarket?.line ?? underMarket?.currentLine ?? underMarket?.line ?? null;
        const propTeams = resolvePropContext({
          player,
          homeTeamName,
          awayTeamName
        });
        const projection = getProjectionSummary(event, playerId, propMarketType, line);
        const propStatValue = getPropStatValue(game, playerId, propMarketType);

        if (overMarket) {
          rows.push(buildHistoricalRow({
            event,
            marketType: propMarketType,
            side: "over",
            line,
            oddsAmerican: overMarket.currentOdds ?? overMarket.oddsAmerican,
            closeLine: overMarket.closingLine ?? null,
            closeOddsAmerican: overMarket.closingOdds ?? null,
            teamName: propTeams.teamName,
            opponentName: propTeams.opponentName,
            homeAway: propTeams.homeAway,
            playerId,
            playerName: player?.name ?? null,
            propStatValue,
            projectionMean: projection.meanValue,
            projectionStdDev: projection.stdDev,
            projectionOverProb: projection.overProb,
            projectionUnderProb: projection.underProb,
            projectionStatKey: projection.statKey
          }));
        }

        if (underMarket) {
          rows.push(buildHistoricalRow({
            event,
            marketType: propMarketType,
            side: "under",
            line,
            oddsAmerican: underMarket.currentOdds ?? underMarket.oddsAmerican,
            closeLine: underMarket.closingLine ?? null,
            closeOddsAmerican: underMarket.closingOdds ?? null,
            teamName: propTeams.teamName,
            opponentName: propTeams.opponentName,
            homeAway: propTeams.homeAway,
            playerId,
            playerName: player?.name ?? null,
            propStatValue,
            projectionMean: projection.meanValue,
            projectionStdDev: projection.stdDev,
            projectionOverProb: projection.overProb,
            projectionUnderProb: projection.underProb,
            projectionStatKey: projection.statKey
          }));
        }
      }
    }
  }

  return rows;
}

export async function extractCurrentTrendRows(args?: Omit<ExtractorArgs, "historical">) {
  return extractHistoricalTrendRows({
    ...args,
    historical: false
  });
}
