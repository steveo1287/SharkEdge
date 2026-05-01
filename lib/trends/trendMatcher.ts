import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  buildTrendEventWhere,
  candidateMatchesFilters,
  type RuntimeTrendCandidate
} from "@/lib/trends/filterBuilder";
import {
  filterConditionsSchema,
  type FilterConditions,
  type TrendMatchResult
} from "@/types/trends";

const eventTrendArgs = Prisma.validator<Prisma.EventDefaultArgs>()({
  include: {
    sport: { select: { code: true, name: true } },
    league: { select: { key: true, name: true } },
    participants: {
      orderBy: { sortOrder: "asc" },
      include: {
        competitor: {
          select: {
            id: true,
            name: true
          }
        }
      }
    },
    participantContexts: true,
    eventResult: true,
    markets: {
      include: {
        sportsbook: { select: { key: true, name: true } },
        selectionCompetitor: { select: { id: true, name: true } }
      }
    }
  }
});

type EventWithTrendData = Prisma.EventGetPayload<typeof eventTrendArgs>;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getClosingLine(market: EventWithTrendData["markets"][number]) {
  return market.closingLine ?? market.currentLine ?? market.openingLine ?? market.line ?? null;
}

function getClosingOdds(market: EventWithTrendData["markets"][number]) {
  return market.closingOdds ?? market.currentOdds ?? market.oddsAmerican;
}

function getImpliedProbability(oddsAmerican: number) {
  if (oddsAmerican < 0) {
    const abs = Math.abs(oddsAmerican);
    return abs / (abs + 100);
  }
  return 100 / (oddsAmerican + 100);
}

function getUnitsWon(oddsAmerican: number, betResult: TrendMatchResult["betResult"]) {
  if (betResult === "P" || betResult === "PENDING") return 0;
  if (betResult === "L") return -1;
  return oddsAmerican > 0 ? oddsAmerican / 100 : 100 / Math.abs(oddsAmerican);
}

function getRoleFromParticipant(participant: EventWithTrendData["participants"][number]) {
  if (participant.role === "HOME") return "HOME";
  if (participant.role === "AWAY") return "AWAY";
  if (participant.role === "COMPETITOR_A") return "COMPETITOR_A";
  if (participant.role === "COMPETITOR_B") return "COMPETITOR_B";
  return "HOME";
}

function getScoreByRole(event: EventWithTrendData, role: string) {
  const participant = event.participants.find((entry) => entry.role === role);
  if (!participant?.score) return null;
  const score = Number(participant.score);
  return Number.isFinite(score) ? score : null;
}

function getContext(event: EventWithTrendData, competitorId: string | null | undefined) {
  if (!competitorId) return null;
  return event.participantContexts.find((context) => context.competitorId === competitorId) ?? null;
}

function getDivisionMatchup(event: EventWithTrendData) {
  return false;
}

function buildSideCandidate(
  event: EventWithTrendData,
  market: EventWithTrendData["markets"][number],
  competitorId: string,
  role: RuntimeTrendCandidate["role"],
  opponentId: string | null,
  opponentName: string | null
): RuntimeTrendCandidate {
  const subjectContext = getContext(event, competitorId);
  const opponentContext = getContext(event, opponentId);
  const subjectName =
    market.selectionCompetitor?.id === competitorId
      ? market.selectionCompetitor.name
      : event.participants.find((entry) => entry.competitorId === competitorId)?.competitor.name ?? market.selection;
  const peerMarket = event.markets.find(
    (entry) =>
      entry.id !== market.id &&
      entry.marketType === market.marketType &&
      entry.selectionCompetitorId &&
      entry.selectionCompetitorId !== competitorId &&
      entry.eventId === event.id
  );
  const selfOdds = getClosingOdds(market);
  const peerOdds = peerMarket ? getClosingOdds(peerMarket) : null;
  const selfProbability = getImpliedProbability(selfOdds);
  const peerProbability = typeof peerOdds === "number" ? getImpliedProbability(peerOdds) : null;

  return {
    eventId: event.id,
    startTime: event.startTime,
    side: market.side ?? role,
    role,
    subjectName,
    opponentName,
    line: getClosingLine(market),
    oddsAmerican: selfOdds,
    totalLine: market.marketType === "total" ? getClosingLine(market) : null,
    moneyline: market.marketType === "moneyline" ? selfOdds : null,
    isFavorite: typeof peerProbability === "number" ? selfProbability > peerProbability : selfOdds < 0,
    isUnderdog: typeof peerProbability === "number" ? selfProbability < peerProbability : selfOdds > 0,
    isNeutralSite: Boolean((event.metadataJson as Record<string, unknown> | null)?.neutralSite),
    isDivisionalGame: getDivisionMatchup(event),
    restDays: subjectContext?.daysRest ?? null,
    backToBack: subjectContext?.isBackToBack ?? null,
    winStreak: subjectContext?.siteStreak && subjectContext.siteStreak > 0 ? subjectContext.siteStreak : 0,
    lossStreak: subjectContext?.siteStreak && subjectContext.siteStreak < 0 ? Math.abs(subjectContext.siteStreak) : 0,
    travelMiles: subjectContext?.travelProxyScore ? Math.round(subjectContext.travelProxyScore * 100) : null,
    offensiveRating: null,
    defensiveRating: null,
    opponentRestDays: opponentContext?.daysRest ?? null,
    opponentWinStreak: opponentContext?.siteStreak && opponentContext.siteStreak > 0 ? opponentContext.siteStreak : 0,
    opponentOffensiveRating: null,
    opponentDefensiveRating: null
  };
}

function buildCandidatesForEvent(event: EventWithTrendData, filters: FilterConditions) {
  const candidates: Array<{ candidate: RuntimeTrendCandidate; market: EventWithTrendData["markets"][number] }> = [];
  const participants = event.participants;
  const home = participants.find((entry) => entry.role === "HOME" || entry.role === "COMPETITOR_A");
  const away = participants.find((entry) => entry.role === "AWAY" || entry.role === "COMPETITOR_B");

  if (filters.betType === "total") {
    const totalMarkets = event.markets.filter((market) => market.marketType === "total");
    for (const market of totalMarkets) {
      const side = (market.side ?? "").toUpperCase();
      if (side !== "OVER" && side !== "UNDER") continue;
      candidates.push({
        candidate: {
          eventId: event.id,
          startTime: event.startTime,
          side,
          role: side as RuntimeTrendCandidate["role"],
          subjectName: event.name,
          opponentName: null,
          line: getClosingLine(market),
          oddsAmerican: getClosingOdds(market),
          totalLine: getClosingLine(market),
          moneyline: null,
          isFavorite: null,
          isUnderdog: null,
          isNeutralSite: Boolean((event.metadataJson as Record<string, unknown> | null)?.neutralSite),
          isDivisionalGame: getDivisionMatchup(event),
          restDays: null,
          backToBack: null,
          winStreak: null,
          lossStreak: null,
          travelMiles: null,
          offensiveRating: null,
          defensiveRating: null,
          opponentRestDays: null,
          opponentWinStreak: null,
          opponentOffensiveRating: null,
          opponentDefensiveRating: null
        },
        market
      });
    }
    return candidates;
  }

  const sideMarkets = event.markets.filter((market) => market.marketType === filters.marketType);
  for (const market of sideMarkets) {
    const selectionId = market.selectionCompetitorId;
    if (!selectionId) continue;
    const participant = participants.find((entry) => entry.competitorId === selectionId);
    if (!participant) continue;
    const role = getRoleFromParticipant(participant);
    const opponent = participants.find((entry) => entry.competitorId !== selectionId);
    candidates.push({
      candidate: buildSideCandidate(
        event,
        market,
        selectionId,
        role,
        opponent?.competitorId ?? null,
        opponent?.competitor.name ?? null
      ),
      market
    });
  }

  if (!sideMarkets.length && home && away && filters.marketType === "moneyline") {
    const fallbackHome = event.markets.find(
      (market) => market.marketType === "moneyline" && normalizeText(market.selection).includes(normalizeText(home.competitor.name))
    );
    const fallbackAway = event.markets.find(
      (market) => market.marketType === "moneyline" && normalizeText(market.selection).includes(normalizeText(away.competitor.name))
    );
    if (fallbackHome) {
      candidates.push({
        candidate: buildSideCandidate(event, fallbackHome, home.competitorId, "HOME", away.competitorId, away.competitor.name),
        market: fallbackHome
      });
    }
    if (fallbackAway) {
      candidates.push({
        candidate: buildSideCandidate(event, fallbackAway, away.competitorId, "AWAY", home.competitorId, home.competitor.name),
        market: fallbackAway
      });
    }
  }

  return candidates;
}

function gradeBetResult(
  event: EventWithTrendData,
  market: EventWithTrendData["markets"][number],
  candidate: RuntimeTrendCandidate,
  activeOnly: boolean
): TrendMatchResult["betResult"] {
  if (activeOnly) return "PENDING";
  const result = event.eventResult;
  if (!result) return "PENDING";

  if (candidate.role === "OVER" || candidate.role === "UNDER") {
    if (typeof result.totalPoints !== "number" || typeof candidate.totalLine !== "number") return "PENDING";
    if (result.totalPoints === candidate.totalLine) return "P";
    if (candidate.role === "OVER") return result.totalPoints > candidate.totalLine ? "W" : "L";
    return result.totalPoints < candidate.totalLine ? "W" : "L";
  }

  if (market.marketType === "moneyline") {
    return result.winnerCompetitorId === (market.selectionCompetitorId ?? null) ? "W" : "L";
  }

  if (market.marketType === "spread") {
    const homeScore = getScoreByRole(event, "HOME") ?? getScoreByRole(event, "COMPETITOR_A");
    const awayScore = getScoreByRole(event, "AWAY") ?? getScoreByRole(event, "COMPETITOR_B");
    const line = getClosingLine(market);
    if (typeof homeScore !== "number" || typeof awayScore !== "number" || typeof line !== "number") {
      return "PENDING";
    }
    const isHomeSide = candidate.role === "HOME" || candidate.role === "COMPETITOR_A";
    const adjustedScore = isHomeSide ? homeScore + line : awayScore + line;
    const opponentScore = isHomeSide ? awayScore : homeScore;
    if (adjustedScore === opponentScore) return "P";
    return adjustedScore > opponentScore ? "W" : "L";
  }

  return "PENDING";
}

// Compute how much the bet won/lost by (cover margin).
// Positive = covered/beat by that amount. Null when not determinable.
// Spread: delta = (team_score + spread) - opponent_score
// Total OVER: delta = total_points - total_line
// Total UNDER: delta = total_line - total_points
// Moneyline: absolute score margin from EventResult
function computeCoverMargin(
  event: EventWithTrendData,
  market: EventWithTrendData["markets"][number],
  candidate: RuntimeTrendCandidate
): number | null {
  const result = event.eventResult;
  if (!result) return null;

  if (candidate.role === "OVER" || candidate.role === "UNDER") {
    if (typeof result.totalPoints !== "number" || typeof candidate.totalLine !== "number") return null;
    const delta = result.totalPoints - candidate.totalLine;
    return candidate.role === "OVER" ? delta : -delta;
  }

  if (market.marketType === "moneyline") {
    if (typeof result.margin !== "number") return null;
    const won = result.winnerCompetitorId === (market.selectionCompetitorId ?? null);
    return won ? result.margin : -result.margin;
  }

  if (market.marketType === "spread") {
    const homeScore = getScoreByRole(event, "HOME") ?? getScoreByRole(event, "COMPETITOR_A");
    const awayScore = getScoreByRole(event, "AWAY") ?? getScoreByRole(event, "COMPETITOR_B");
    const line = getClosingLine(market);
    if (typeof homeScore !== "number" || typeof awayScore !== "number" || typeof line !== "number") return null;
    const isHomeSide = candidate.role === "HOME" || candidate.role === "COMPETITOR_A";
    const adjustedScore = isHomeSide ? homeScore + line : awayScore + line;
    const opponentScore = isHomeSide ? awayScore : homeScore;
    return Number((adjustedScore - opponentScore).toFixed(1));
  }

  return null;
}

export async function matchTrendToGames(
  rawFilters: unknown,
  options?: { activeOnly?: boolean; limit?: number }
) {
  const { filters, where } = buildTrendEventWhere(rawFilters, options);
  const events = await prisma.event.findMany({
    where,
    ...eventTrendArgs,
    orderBy: { startTime: "asc" },
    take: options?.limit
  });

  const matches: TrendMatchResult[] = [];
  let cumulativeProfit = 0;

  for (const event of events) {
    for (const { candidate, market } of buildCandidatesForEvent(event, filters)) {
      if (!candidateMatchesFilters(candidate, filters)) continue;
      const betResult = gradeBetResult(event, market, candidate, Boolean(options?.activeOnly));
      const unitsWon = getUnitsWon(candidate.oddsAmerican, betResult);
      const coverMargin = options?.activeOnly ? null : computeCoverMargin(event, market, candidate);
      if (betResult !== "PENDING") {
        cumulativeProfit += unitsWon;
      }

      matches.push({
        id: `${event.id}:${market.id}`,
        eventId: event.id,
        eventLabel: event.name,
        startTime: event.startTime.toISOString(),
        sport: event.sport.code,
        league: event.league.key,
        marketType: market.marketType,
        selection: market.selection,
        side: market.side,
        selectionCompetitorId: market.selectionCompetitorId,
        betResult,
        unitsWon,
        cumulativeProfit: Number(cumulativeProfit.toFixed(2)),
        oddsAmerican: candidate.oddsAmerican,
        line: candidate.line,
        closingLine: getClosingLine(market),
        role: candidate.role,
        todayEligible: Boolean(options?.activeOnly),
        coverMargin,
        whyMatched: [
          filters.restDays ? `${candidate.restDays ?? "n/a"} days rest` : null,
          filters.backToBack !== null && filters.backToBack !== undefined
            ? candidate.backToBack
              ? "back-to-back"
              : "not back-to-back"
            : null,
          filters.isFavorite ? "favorite price" : filters.isUnderdog ? "underdog price" : null
        ].filter((value): value is string => Boolean(value)),
        metadata: {
          sportsbook: market.sportsbook?.name ?? null,
          opponentName: candidate.opponentName,
          marketLabel: market.marketLabel
        }
      });
    }
  }

  return matches;
}

export function parseFilterConditions(rawFilters: unknown) {
  return filterConditionsSchema.parse(rawFilters);
}
