import type { BoardMarketView, GameCardView, GameStatus, PropCardView } from "@/lib/types/domain";
import type { OpportunityView } from "@/lib/types/opportunity";
import {
  getPlayerHeadshotUrl,
  getTeamLogoUrl,
  resolveMatchupHref
} from "@/lib/utils/entity-routing";

export type EliteGameCardModel = {
  id: string;
  href: string;
  startTime: string;
  state: "LIVE" | "UPCOMING" | "FINAL";
  awayTeam: {
    name: string;
    abbreviation: string;
    logoUrl: string | null;
  };
  homeTeam: {
    name: string;
    abbreviation: string;
    logoUrl: string | null;
  };
  league: string;
  bestLineLabel: string | null;
  edgePercent: number | null;
  confidenceLabel: string | null;
  reasonSummary: string | null;
  selectionLabel: string | null;
};

export type ElitePropCardModel = {
  id: string;
  href: string;
  startTime: string | null;
  state: "LIVE" | "UPCOMING" | "FINAL";
  league: string;
  subject: {
    name: string;
    imageUrl: string | null;
    shortLabel: string;
  };
  team: {
    name: string;
    abbreviation: string;
    logoUrl: string | null;
  };
  opponent: {
    name: string;
    abbreviation: string;
    logoUrl: string | null;
  };
  marketLabel: string;
  bestLineLabel: string | null;
  edgePercent: number | null;
  confidenceLabel: string | null;
  reasonSummary: string | null;
  sportsbookName: string | null;
};

export type HomeHeroCardModel =
  | { kind: "game"; card: EliteGameCardModel }
  | { kind: "prop"; card: ElitePropCardModel };

function resolveStateFromStatus(status: GameStatus | string | null | undefined):
  | "LIVE"
  | "UPCOMING"
  | "FINAL" {
  if (status === "LIVE") return "LIVE";
  if (status === "FINAL") return "FINAL";
  return "UPCOMING";
}

function formatConfidenceLabel(value: string | null | undefined) {
  if (!value) return null;
  if (/^[A-D]$/.test(value)) return `Tier ${value}`;
  return value.replace(/_/g, " ");
}

function pickBestMarket(game: GameCardView): { key: string; market: BoardMarketView } {
  const candidates: Array<{ key: string; market: BoardMarketView; score: number }> = [
    { key: "Moneyline", market: game.moneyline, score: game.moneyline.evProfile?.edgePct ?? -999 },
    { key: "Spread", market: game.spread, score: game.spread.evProfile?.edgePct ?? -999 },
    { key: "Total", market: game.total, score: game.total.evProfile?.edgePct ?? -999 }
  ];

  candidates.sort((left, right) => right.score - left.score);

  const top = candidates[0];
  if (top.score > -999) {
    return { key: top.key, market: top.market };
  }

  return { key: "Moneyline", market: game.moneyline };
}

function buildGameReason(game: GameCardView, market: BoardMarketView) {
  return (
    market.reasons?.[0]?.detail ??
    market.marketTruth?.note ??
    market.marketIntelligence?.notes?.[0] ??
    `${game.awayTeam.name} at ${game.homeTeam.name} is still carrying enough verified market context to stay on the desk.`
  );
}

function buildGameHref(game: GameCardView) {
  return (
    resolveMatchupHref({
      leagueKey: game.leagueKey,
      externalEventId: game.externalEventId,
      fallbackHref: game.detailHref ?? `/game/${game.id}`
    }) ??
    game.detailHref ??
    `/game/${game.id}`
  );
}

function buildSubjectShortLabel(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function shouldShowOnMainSlate(card: EliteGameCardModel): boolean {
  if (card.state === "LIVE" || card.state === "UPCOMING") return true;

  const startedAt = new Date(card.startTime).getTime();
  if (Number.isNaN(startedAt)) return false;

  const twelveHours = 12 * 60 * 60 * 1000;
  return Date.now() - startedAt <= twelveHours;
}

export function mapVerifiedGameToEliteCard(game: GameCardView): EliteGameCardModel {
  const best = pickBestMarket(game);

  return {
    id: game.id,
    href: buildGameHref(game),
    startTime: game.startTime,
    state: resolveStateFromStatus(game.status),
    awayTeam: {
      name: game.awayTeam.name,
      abbreviation: game.awayTeam.abbreviation,
      logoUrl: getTeamLogoUrl(game.leagueKey, game.awayTeam)
    },
    homeTeam: {
      name: game.homeTeam.name,
      abbreviation: game.homeTeam.abbreviation,
      logoUrl: getTeamLogoUrl(game.leagueKey, game.homeTeam)
    },
    league: game.leagueKey,
    bestLineLabel:
      best.market.lineLabel && best.market.lineLabel !== "Unavailable"
        ? `${best.key} ${best.market.lineLabel}`
        : best.market.label,
    edgePercent: best.market.evProfile?.edgePct ?? null,
    confidenceLabel: formatConfidenceLabel(best.market.confidenceBand ?? null),
    reasonSummary: buildGameReason(game, best.market),
    selectionLabel: best.market.label ?? null
  };
}

export function mapPropToEliteCard(prop: PropCardView): ElitePropCardModel {
  return {
    id: prop.id,
    href: prop.gameHref ?? `/game/${prop.gameId}`,
    startTime: null,
    state: "UPCOMING",
    league: prop.leagueKey,
    subject: {
      name: prop.player.name,
      imageUrl: getPlayerHeadshotUrl(prop.leagueKey, prop.player),
      shortLabel: buildSubjectShortLabel(prop.player.name)
    },
    team: {
      name: prop.team.name,
      abbreviation: prop.team.abbreviation,
      logoUrl: getTeamLogoUrl(prop.leagueKey, prop.team)
    },
    opponent: {
      name: prop.opponent.name,
      abbreviation: prop.opponent.abbreviation,
      logoUrl: getTeamLogoUrl(prop.leagueKey, prop.opponent)
    },
    marketLabel: `${prop.player.name} ${prop.side} ${prop.line}`,
    bestLineLabel:
      typeof prop.bestAvailableOddsAmerican === "number"
        ? `${prop.bestAvailableOddsAmerican > 0 ? "+" : ""}${prop.bestAvailableOddsAmerican}`
        : `${prop.oddsAmerican > 0 ? "+" : ""}${prop.oddsAmerican}`,
    edgePercent: prop.expectedValuePct ?? prop.evProfile?.edgePct ?? null,
    confidenceLabel: formatConfidenceLabel(prop.confidenceBand ?? null),
    reasonSummary:
      prop.analyticsSummary?.reason ??
      prop.reasons?.[0]?.detail ??
      prop.supportNote ??
      "This prop still has enough price or matchup support to stay on the desk.",
    sportsbookName: prop.bestAvailableSportsbookName ?? prop.sportsbook.name
  };
}

function findGameForOpportunity(opportunity: OpportunityView, games: GameCardView[]) {
  return (
    games.find(
      (game) =>
        opportunity.eventId === game.externalEventId ||
        opportunity.eventId === game.id ||
        opportunity.id.startsWith(`${game.id}:`)
    ) ?? null
  );
}

export function mapActionableToHeroCard(args: {
  opportunity: OpportunityView;
  games: GameCardView[];
  props: PropCardView[];
}): HomeHeroCardModel | null {
  const { opportunity, games, props } = args;

  if (opportunity.kind === "prop") {
    const prop = props.find((entry) => entry.id === opportunity.id);
    if (prop) {
      return {
        kind: "prop",
        card: {
          ...mapPropToEliteCard(prop),
          edgePercent: opportunity.expectedValuePct ?? prop.expectedValuePct ?? prop.evProfile?.edgePct ?? null,
          confidenceLabel: formatConfidenceLabel(opportunity.confidenceTier),
          reasonSummary: opportunity.reasonSummary ?? prop.analyticsSummary?.reason ?? null,
          startTime: findGameForOpportunity(opportunity, games)?.startTime ?? null,
          state: resolveStateFromStatus(findGameForOpportunity(opportunity, games)?.status)
        }
      };
    }

    return null;
  }

  const game = findGameForOpportunity(opportunity, games);
  if (!game) {
    return null;
  }

  return {
    kind: "game",
    card: {
      ...mapVerifiedGameToEliteCard(game),
      bestLineLabel:
        opportunity.displayLine != null
          ? `${opportunity.selectionLabel} ${String(opportunity.displayLine)}`
          : opportunity.selectionLabel,
      edgePercent: opportunity.expectedValuePct ?? opportunity.modelEdgePercent ?? null,
      confidenceLabel: formatConfidenceLabel(opportunity.confidenceTier),
      reasonSummary: opportunity.reasonSummary,
      selectionLabel: opportunity.selectionLabel
    }
  };
}
