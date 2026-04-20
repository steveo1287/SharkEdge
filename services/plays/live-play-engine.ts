import type { LeagueKey } from "@/lib/types/domain";
import type { OpportunityView } from "@/lib/types/opportunity";
import {
  getHomeCommandData,
  type HomeDeskDateKey,
  type HomeLeagueScope
} from "@/services/home/home-command-service";
import {
  getPublishedTrendFeed,
  type PublishedTrendCard
} from "@/lib/trends/publisher";

export type LivePlayEngineFilters = {
  league: HomeLeagueScope;
  date: HomeDeskDateKey;
};

export type LivePlayEnginePlay = {
  id: string;
  league: LeagueKey;
  eventId: string;
  eventLabel: string;
  selectionLabel: string;
  marketType: string;
  sportsbookName: string | null;
  displayOddsAmerican: number | null;
  displayLine: string | number | null;
  expectedValuePct: number | null;
  opportunityScore: number;
  confidenceTier: OpportunityView["confidenceTier"];
  actionState: OpportunityView["actionState"];
  timingState: OpportunityView["timingState"];
  trapFlags: OpportunityView["trapFlags"];
  reasonSummary: string;
  triggerSummary: string;
  killSummary: string;
  bankrollPct: number;
  recommendedStake: number;
  recommendationTier: string | null;
  freshnessMinutes: number | null;
  staleFlag: boolean;
  sourceHealthState: OpportunityView["sourceHealth"]["state"];
  truthCalibrationStatus: OpportunityView["truthCalibration"]["status"];
  ranking: OpportunityView["ranking"] | null;
  marketMicrostructure: OpportunityView["marketMicrostructure"];
};

export type LivePlayEngineResponse = {
  generatedAt: string;
  filters: LivePlayEngineFilters;
  source: {
    boardSource: string;
    sourceNote: string;
    liveDeskAvailable: boolean;
    liveDeskFreshnessMinutes: number | null;
    providerState: string;
    providerLabel: string;
  };
  summary: {
    verifiedGames: number;
    movementGames: number;
    propsConsidered: number;
    surfacedPlays: number;
    traps: number;
    timingWindows: number;
    featuredTrends: number;
  };
  topPlays: LivePlayEnginePlay[];
  traps: LivePlayEnginePlay[];
  timingWindows: LivePlayEnginePlay[];
  featuredTrends: PublishedTrendCard[];
};

const VALID_LEAGUES: HomeLeagueScope[] = [
  "ALL",
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
];

const VALID_DATES: HomeDeskDateKey[] = ["today", "tomorrow", "upcoming"];

function normalizeLeague(value: string | null | undefined): HomeLeagueScope {
  const candidate = value?.trim().toUpperCase();
  return VALID_LEAGUES.includes(candidate as HomeLeagueScope)
    ? (candidate as HomeLeagueScope)
    : "ALL";
}

function normalizeDate(value: string | null | undefined): HomeDeskDateKey {
  const candidate = value?.trim().toLowerCase();
  return VALID_DATES.includes(candidate as HomeDeskDateKey)
    ? (candidate as HomeDeskDateKey)
    : "today";
}

function toPlay(opportunity: OpportunityView): LivePlayEnginePlay {
  return {
    id: opportunity.id,
    league: opportunity.league,
    eventId: opportunity.eventId,
    eventLabel: opportunity.eventLabel,
    selectionLabel: opportunity.selectionLabel,
    marketType: opportunity.marketType,
    sportsbookName: opportunity.sportsbookName,
    displayOddsAmerican: opportunity.displayOddsAmerican,
    displayLine: opportunity.displayLine,
    expectedValuePct: opportunity.expectedValuePct,
    opportunityScore: opportunity.opportunityScore,
    confidenceTier: opportunity.confidenceTier,
    actionState: opportunity.actionState,
    timingState: opportunity.timingState,
    trapFlags: opportunity.trapFlags,
    reasonSummary: opportunity.reasonSummary,
    triggerSummary: opportunity.triggerSummary,
    killSummary: opportunity.killSummary,
    bankrollPct: opportunity.sizing.bankrollPct,
    recommendedStake: opportunity.sizing.recommendedStake,
    recommendationTier: opportunity.ranking?.recommendationTier ?? null,
    freshnessMinutes: opportunity.providerFreshnessMinutes,
    staleFlag: opportunity.staleFlag,
    sourceHealthState: opportunity.sourceHealth.state,
    truthCalibrationStatus: opportunity.truthCalibration.status,
    ranking: opportunity.ranking ?? null,
    marketMicrostructure: opportunity.marketMicrostructure
  };
}

async function getFeaturedTrends(league: LeagueKey): Promise<PublishedTrendCard[]> {
  try {
    const feed = await getPublishedTrendFeed({
      league,
      window: "365d",
      sample: 5
    });
    return Array.isArray(feed?.featured) ? feed.featured.slice(0, 4) : [];
  } catch {
    return [];
  }
}

export async function getLivePlayEngine(input?: {
  league?: string | null;
  date?: string | null;
}): Promise<LivePlayEngineResponse> {
  const filters: LivePlayEngineFilters = {
    league: normalizeLeague(input?.league),
    date: normalizeDate(input?.date)
  };

  const home = await getHomeCommandData(filters);
  const featuredTrends = await getFeaturedTrends(home.focusedLeague);

  return {
    generatedAt: new Date().toISOString(),
    filters,
    source: {
      boardSource: home.boardData.source,
      sourceNote: home.boardData.sourceNote,
      liveDeskAvailable: home.liveDeskAvailable,
      liveDeskFreshnessMinutes: home.liveDeskFreshnessMinutes,
      providerState: home.boardData.providerHealth.state,
      providerLabel: home.boardData.providerHealth.label
    },
    summary: {
      verifiedGames: home.verifiedGames.length,
      movementGames: home.movementGames.length,
      propsConsidered: home.topProps.length,
      surfacedPlays: home.topActionables.length,
      traps: home.traps.length,
      timingWindows: home.decisionWindows.length,
      featuredTrends: featuredTrends.length
    },
    topPlays: home.topActionables.map(toPlay),
    traps: home.traps.map(toPlay),
    timingWindows: home.decisionWindows.map(toPlay),
    featuredTrends
  };
}
