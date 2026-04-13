import type {
  EdgeBand,
  GameDetailView as LegacyGameDetailView,
  LeagueKey,
  MatchupDetailView,
  MatchupParticipantView,
  MatchupTrendCardView,
} from "@/lib/types/domain";
import { getMatchupTrendCards as getEngineMatchupTrendCards } from "@/lib/trends/engine";
import { normalizeGameDetailLiveOdds } from "@/services/live-odds/live-odds-normalizer";
import { getGameDetailLiveOddsInputs } from "@/services/live-odds/live-odds-route-consumers";

function buildLegacyTrendCards(detail: LegacyGameDetailView): MatchupTrendCardView[] {
  const cards: MatchupTrendCardView[] = [];

  if (detail.lineMovement.length >= 2) {
    const opening = detail.lineMovement[0];
    const latest = detail.lineMovement[detail.lineMovement.length - 1];
    const spreadMove =
      typeof opening.spreadLine === "number" && typeof latest.spreadLine === "number"
        ? latest.spreadLine - opening.spreadLine
        : null;
    const totalMove =
      typeof opening.totalLine === "number" && typeof latest.totalLine === "number"
        ? latest.totalLine - opening.totalLine
        : null;

    cards.push({
      id: `${detail.game.id}-spread-move`,
      title: "Spread move",
      value:
        spreadMove === null
          ? "No tracked move"
          : `${spreadMove > 0 ? "+" : ""}${spreadMove.toFixed(1)} pts`,
      note: "Computed from stored pricing snapshots for this matchup.",
      tone: spreadMove && Math.abs(spreadMove) >= 1 ? "brand" : "muted"
    });

    cards.push({
      id: `${detail.game.id}-total-move`,
      title: "Total move",
      value:
        totalMove === null
          ? "No tracked move"
          : `${totalMove > 0 ? "+" : ""}${totalMove.toFixed(1)} pts`,
      note: "Opening versus latest tracked total in the stored market history.",
      tone: totalMove && Math.abs(totalMove) >= 1 ? "premium" : "muted"
    });
  } else if (detail.marketRanges?.length) {
    cards.push({
      id: `${detail.game.id}-range`,
      title: "Market range",
      value: detail.marketRanges[0]?.value ?? "Range pending",
      note: "Current range view comes from the live market analytics payload when available.",
      tone: "brand"
    });
  }

  if (detail.edgeScore.score > 0) {
    cards.push({
      id: `${detail.game.id}-edge`,
      title: "Edge signal",
      value: `${detail.edgeScore.score}`,
      note: "Current board composite signal from the live odds path.",
      tone: mapEdgeTone(detail.edgeScore.label)
    });
  }

  return cards;
}

function mapEdgeTone(label: EdgeBand) {
  if (label === "Elite") {
    return "success" as const;
  }

  if (label === "Strong") {
    return "brand" as const;
  }

  if (label === "Watchlist") {
    return "premium" as const;
  }

  return "muted" as const;
}

async function buildHistoricalTrendCards(args: {
  leagueKey: LeagueKey;
  eventLabel: string;
  eventType: MatchupDetailView["eventType"];
  participants: MatchupParticipantView[];
  externalEventId: string;
}) {
  return getEngineMatchupTrendCards({
    leagueKey: args.leagueKey,
    participantNames: args.participants.map((participant) => participant.name),
    externalEventId: args.externalEventId,
    limit: 3
  });
}

export async function getMatchupDetail(routeId: string): Promise<MatchupDetailView | null> {
  const { leagueKey, rawExternalId, payload, legacyDetail } =
    await getGameDetailLiveOddsInputs(routeId);

  if (!leagueKey) {
    return null;
  }

  const merged = normalizeGameDetailLiveOdds({
    routeId,
    leagueKey,
    externalEventId:
      payload?.externalEventId ??
      rawExternalId ??
      legacyDetail?.game.externalEventId ??
      routeId,
    payload,
    legacyDetail
  });

  const historicalTrendCards = await buildHistoricalTrendCards({
    leagueKey,
    eventLabel: merged.eventLabel,
    eventType: merged.eventType,
    participants: merged.participants,
    externalEventId: merged.externalEventId
  });

  return {
    ...merged,
    trendCards: (
      historicalTrendCards.length
        ? historicalTrendCards
        : [
            ...(payload?.trendCards ?? []),
            ...(!payload && legacyDetail ? buildLegacyTrendCards(legacyDetail) : [])
          ]
    ).slice(0, 3)
  };
}
