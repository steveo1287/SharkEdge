import { prisma } from "@/lib/db/prisma";
import { buildFightHistoryFeatureView } from "@/services/modeling/fight-history-warehouse";
import { buildWeatherFeatureView } from "@/services/modeling/weather-snapshot-warehouse";
import { profitUnitsForAmericanOdds } from "./metrics";
import type { HistoricalBetOpportunity } from "./types";

type ExtractorArgs = {
  leagues?: string[];
  historical?: boolean;
  days?: number;
  limit?: number;
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

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function getMarketOutcome(args: {
  marketType: string;
  side: string;
  eventResult: any | null;
  homeCompetitorId: string | null;
  awayCompetitorId: string | null;
  line: number | null;
}) {
  const eventResult = args.eventResult;
  if (!eventResult) {
    return { won: null, push: false };
  }

  if (args.marketType === "moneyline") {
    if (!eventResult.winnerCompetitorId) {
      return { won: null, push: false };
    }
    const targetCompetitorId = args.side === "home" ? args.homeCompetitorId : args.awayCompetitorId;
    return {
      won: eventResult.winnerCompetitorId === targetCompetitorId,
      push: false
    };
  }

  if (args.marketType === "spread") {
    const cover = eventResult.coverResult && typeof eventResult.coverResult === "object" ? eventResult.coverResult : null;
    if (cover) {
      const winner = typeof cover.winner === "string" ? cover.winner.toLowerCase() : null;
      const push = cover.push === true || winner === "push";
      return {
        won: push ? null : winner === args.side,
        push
      };
    }

    if (typeof eventResult.margin === "number" && typeof args.line === "number") {
      const adjusted = args.side === "home" ? eventResult.margin + args.line : -eventResult.margin + args.line;
      return {
        won: adjusted === 0 ? null : adjusted > 0,
        push: adjusted === 0
      };
    }

    return { won: null, push: false };
  }

  if (args.marketType === "total") {
    const result = typeof eventResult.ouResult === "string" ? eventResult.ouResult.toLowerCase() : null;
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

  return { won: null, push: false };
}

function buildHistoricalRow(args: {
  event: any;
  marketType: "moneyline" | "spread" | "total";
  side: "home" | "away" | "over" | "under";
  line: number | null;
  oddsAmerican: number;
  closeLine: number | null;
  closeOddsAmerican: number | null;
  teamName: string | null;
  opponentName: string | null;
  homeAway: "home" | "away" | null;
}) {
  const homeParticipant = args.event.participants.find((participant: any) => participant.role === "HOME" || participant.isHome === true) ?? args.event.participants[0] ?? null;
  const awayParticipant = args.event.participants.find((participant: any) => participant.role === "AWAY" || participant.isHome === false) ?? args.event.participants[1] ?? null;
  const outcome = getMarketOutcome({
    marketType: args.marketType,
    side: args.side,
    eventResult: args.event.eventResult ?? null,
    homeCompetitorId: homeParticipant?.competitorId ?? null,
    awayCompetitorId: awayParticipant?.competitorId ?? null,
    line: args.line
  });
  const subjectParticipant =
    args.side === "home" ? homeParticipant : args.side === "away" ? awayParticipant : null;
  const opponentParticipant =
    args.side === "home" ? awayParticipant : args.side === "away" ? homeParticipant : null;
  const context = getTeamContext(args.event.participantContexts, subjectParticipant?.competitorId ?? null);
  const weatherFeature = buildWeatherFeatureView({
    sportKey: args.event.league?.key ?? "OTHER",
    venueName: args.event.venue ?? null,
    metadataJson: args.event.metadataJson ?? null
  });
  const eventMetadata =
    args.event.metadataJson && typeof args.event.metadataJson === "object" && !Array.isArray(args.event.metadataJson)
      ? (args.event.metadataJson as Record<string, unknown>)
      : null;
  const fightFeatures =
    (args.event.league?.key === "UFC" || args.event.league?.key === "BOXING") && subjectParticipant && opponentParticipant
      ? buildFightHistoryFeatureView({
          sportKey: args.event.league.key,
          rounds: coerceNumber(eventMetadata?.rounds) ?? (args.event.league.key === "UFC" ? 3 : 10),
          fighter: {
            record: subjectParticipant.record ?? null,
            recentWinRate: context?.recentWinRate ?? null,
            recentMargin: context?.recentMargin ?? null,
            metadata: {
              ...(subjectParticipant.competitor?.metadataJson && typeof subjectParticipant.competitor.metadataJson === "object" && !Array.isArray(subjectParticipant.competitor.metadataJson)
                ? subjectParticipant.competitor.metadataJson
                : {}),
              ...(subjectParticipant.metadataJson && typeof subjectParticipant.metadataJson === "object" && !Array.isArray(subjectParticipant.metadataJson)
                ? subjectParticipant.metadataJson
                : {})
            }
          },
          opponent: {
            record: opponentParticipant.record ?? null,
            recentWinRate: getTeamContext(args.event.participantContexts, opponentParticipant.competitorId)?.recentWinRate ?? null,
            recentMargin: getTeamContext(args.event.participantContexts, opponentParticipant.competitorId)?.recentMargin ?? null,
            metadata: {
              ...(opponentParticipant.competitor?.metadataJson && typeof opponentParticipant.competitor.metadataJson === "object" && !Array.isArray(opponentParticipant.competitor.metadataJson)
                ? opponentParticipant.competitor.metadataJson
                : {}),
              ...(opponentParticipant.metadataJson && typeof opponentParticipant.metadataJson === "object" && !Array.isArray(opponentParticipant.metadataJson)
                ? opponentParticipant.metadataJson
                : {})
            }
          }
        })
      : null;

  return {
    rowId: `${args.event.id}:${args.marketType}:${args.side}`,
    eventId: args.event.id,
    gameDate: args.event.startTime.toISOString(),
    season: getSeason(args.event.startTime),
    sport: args.event.sport?.code ?? "OTHER",
    league: args.event.league?.key ?? "OTHER",
    marketType: args.marketType,
    side: args.side,
    teamName: args.teamName,
    opponentName: args.opponentName,
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
    profitUnits: outcome.won === null && !outcome.push ? null : profitUnitsForAmericanOdds(args.oddsAmerican, outcome.won === true, outcome.push),
    clvCents: typeof args.closeOddsAmerican === "number" ? args.closeOddsAmerican - args.oddsAmerican : null,
    beatClose: typeof args.closeOddsAmerican === "number" ? args.oddsAmerican > args.closeOddsAmerican : null,
    daysRest: context?.daysRest ?? null,
    opponentRestDays: context?.opponentRestDays ?? null,
    isBackToBack: context?.isBackToBack ?? null,
    recentWinRate: context?.recentWinRate ?? null,
    recentMargin: context?.recentMargin ?? null,
    weatherBucket: weatherFeature.weatherBucket,
    altitudeBucket: weatherFeature.altitudeBucket,
    fighterQualityBucket: fightFeatures?.fighterQualityBucket ?? null,
    opponentQualityBucket: fightFeatures?.opponentQualityBucket ?? null,
    finishPressureBucket: fightFeatures?.finishPressureBucket ?? null,
    durabilityEdgeBucket: fightFeatures?.durabilityEdgeBucket ?? null,
    styleConflictBucket: fightFeatures?.styleConflictBucket ?? null,
    lineBucket: getLineBucket(args.line),
    totalBucket: getTotalBucket(args.marketType === "total" ? args.line : null),
    metadata: {
      eventName: args.event.name,
      venue: args.event.venue ?? null,
      weather: {
        bucket: weatherFeature.weatherBucket,
        altitudeBucket: weatherFeature.altitudeBucket,
        source: weatherFeature.adjustment.source,
        note: weatherFeature.adjustment.note
      },
      fight: fightFeatures
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
      markets: true,
      currentMarketStates: {
        include: {
          bestHomeBook: true,
          bestAwayBook: true,
          bestOverBook: true,
          bestUnderBook: true
        }
      }
    }
  });

  const rows: HistoricalBetOpportunity[] = [];

  for (const event of events) {
    const homeParticipant = event.participants.find((participant) => participant.role === "HOME" || participant.isHome === true) ?? event.participants[0] ?? null;
    const awayParticipant = event.participants.find((participant) => participant.role === "AWAY" || participant.isHome === false) ?? event.participants[1] ?? null;

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
              teamName: homeParticipant?.competitor?.name ?? null,
              opponentName: awayParticipant?.competitor?.name ?? null,
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
              teamName: awayParticipant?.competitor?.name ?? null,
              opponentName: homeParticipant?.competitor?.name ?? null,
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
              teamName: homeParticipant?.competitor?.name ?? null,
              opponentName: awayParticipant?.competitor?.name ?? null,
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
              teamName: awayParticipant?.competitor?.name ?? null,
              opponentName: homeParticipant?.competitor?.name ?? null,
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
      }
      continue;
    }

    const moneylines = selectHistoricalMarket(event, "moneyline");
    const spreads = selectHistoricalMarket(event, "spread");
    const totals = selectHistoricalMarket(event, "total");

    const homeMl = moneylines.find((market: any) => (market.side ?? market.selection ?? "").toLowerCase().includes("home") || market.selectionCompetitorId === homeParticipant?.competitorId) ?? null;
    const awayMl = moneylines.find((market: any) => (market.side ?? market.selection ?? "").toLowerCase().includes("away") || market.selectionCompetitorId === awayParticipant?.competitorId) ?? null;
    if (homeMl) {
      rows.push(buildHistoricalRow({
        event,
        marketType: "moneyline",
        side: "home",
        line: homeMl.currentLine ?? homeMl.line ?? null,
        oddsAmerican: homeMl.currentOdds ?? homeMl.oddsAmerican,
        closeLine: homeMl.closingLine ?? null,
        closeOddsAmerican: homeMl.closingOdds ?? null,
        teamName: homeParticipant?.competitor?.name ?? null,
        opponentName: awayParticipant?.competitor?.name ?? null,
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
        teamName: awayParticipant?.competitor?.name ?? null,
        opponentName: homeParticipant?.competitor?.name ?? null,
        homeAway: "away"
      }));
    }

    const homeSpread = spreads.find((market: any) => market.selectionCompetitorId === homeParticipant?.competitorId) ?? spreads.find((market: any) => (market.side ?? market.selection ?? "").toLowerCase().includes("home")) ?? null;
    const awaySpread = spreads.find((market: any) => market.selectionCompetitorId === awayParticipant?.competitorId) ?? spreads.find((market: any) => (market.side ?? market.selection ?? "").toLowerCase().includes("away")) ?? null;
    if (homeSpread) {
      rows.push(buildHistoricalRow({
        event,
        marketType: "spread",
        side: "home",
        line: homeSpread.currentLine ?? homeSpread.line ?? null,
        oddsAmerican: homeSpread.currentOdds ?? homeSpread.oddsAmerican,
        closeLine: homeSpread.closingLine ?? null,
        closeOddsAmerican: homeSpread.closingOdds ?? null,
        teamName: homeParticipant?.competitor?.name ?? null,
        opponentName: awayParticipant?.competitor?.name ?? null,
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
        teamName: awayParticipant?.competitor?.name ?? null,
        opponentName: homeParticipant?.competitor?.name ?? null,
        homeAway: "away"
      }));
    }

    const overTotal = totals.find((market: any) => (market.side ?? market.selection ?? "").toLowerCase().includes("over")) ?? null;
    const underTotal = totals.find((market: any) => (market.side ?? market.selection ?? "").toLowerCase().includes("under")) ?? null;
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
  }

  return rows;
}

export async function extractCurrentTrendRows(args?: Omit<ExtractorArgs, "historical">) {
  return extractHistoricalTrendRows({
    ...args,
    historical: false
  });
}
