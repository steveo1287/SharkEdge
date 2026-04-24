import type { BoardSupportStatus, LeagueKey, SportCode } from "@/lib/types/domain";
import { PROVIDER_REGISTRY, formatProviderLabels } from "@/services/providers/registry";

export type BoardSportConfig = {
  leagueKey: LeagueKey;
  leagueLabel: string;
  sport: SportCode;
  status: BoardSupportStatus;
  liveScoreProvider: string | null;
  currentOddsProvider: string | null;
  historicalOddsProvider: string | null;
  propsStatus: BoardSupportStatus;
  propsProviders: string[];
  propsNote: string;
  note: string;
  detail: string;
  scoreboardDetail: string;
};

const SPORT_LABELS: Record<LeagueKey, string> = {
  NBA: "NBA",
  MLB: "MLB",
  NHL: "NHL",
  NFL: "NFL",
  NCAAF: "College Football",
  UFC: "UFC",
  BOXING: "Boxing"
};

const SPORT_CODES: Record<LeagueKey, SportCode> = {
  NBA: "BASKETBALL",
  MLB: "BASEBALL",
  NHL: "HOCKEY",
  NFL: "FOOTBALL",
  NCAAF: "FOOTBALL",
  UFC: "MMA",
  BOXING: "BOXING"
};

const SPORT_NOTES: Record<
  LeagueKey,
  {
    note: string;
    detail: string;
    scoreboardDetail: string;
  }
> = {
  NBA: {
    note: "NBA is fully wired into the live board, live matchup pages, and current basketball props.",
    detail:
      "NBA now runs through a live score adapter, matchup detail provider, current odds adapter, and harvested historical odds foundation.",
    scoreboardDetail:
      "ESPN powers live state and matchup drill-in. Current odds stay separate from historical ingestion."
  },
  MLB: {
    note: "MLB scoreboard and matchup pages are live. Current odds are wired. Props remain partial.",
    detail:
      "MLB renders live scoreboard state and real matchup detail panels today, while player prop coverage is still adapter-limited.",
    scoreboardDetail:
      "ESPN scoreboard and summary endpoints power MLB live state and matchup detail."
  },
  NHL: {
    note: "NHL scoreboard and matchup pages are live. Current odds are wired. Props remain partial.",
    detail:
      "NHL renders live scoreboard state and real matchup detail panels today, while prop market coverage is still adapter-limited.",
    scoreboardDetail:
      "ESPN scoreboard and summary endpoints power NHL live state and matchup detail."
  },
  NFL: {
    note: "NFL scoreboard and matchup pages are live. Current odds are wired. Props remain partial.",
    detail:
      "NFL renders live scoreboard state and matchup drill-ins now, with current pregame odds and honest props limitations.",
    scoreboardDetail:
      "ESPN scoreboard and summary endpoints power NFL live state and matchup detail."
  },
  NCAAF: {
    note: "College football scoreboard and matchup pages are live. NCAA enrichment remains fallback-only where needed.",
    detail:
      "NCAAF renders live scoreboard state and matchup drill-ins now, with ESPN primary coverage and NCAA fallback scaffolding.",
    scoreboardDetail:
      "ESPN is primary, with NCAA fallback scaffolding available for college football."
  },
  UFC: {
    note: "UFC is visible with a dedicated MMA provider path, real event/fighter drill-ins, and honest partial odds/props coverage.",
    detail:
      "UFC event and fighter panels are now wired through a dedicated MMA source path, but current odds and real prop coverage remain partial.",
    scoreboardDetail:
      "Dedicated MMA event source active. Combat odds and round-state coverage are still partial."
  },
  BOXING: {
    note: "Boxing is product-visible with live event context and partial odds coverage through the shared backend path.",
    detail:
      "Boxing stays visible with honest partial support states and shared backend odds routing, while full matchup/stat depth is still in progress.",
    scoreboardDetail:
      "Boxing event context is live and odds are requested through the shared backend path when available."
  }
};

export const BOARD_SPORT_ORDER: LeagueKey[] = [
  "NBA",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
];

export const BOARD_SPORTS: BoardSportConfig[] = BOARD_SPORT_ORDER.map((leagueKey) => {
  const registry = PROVIDER_REGISTRY[leagueKey];
  const copy = SPORT_NOTES[leagueKey];

  return {
    leagueKey,
    leagueLabel: SPORT_LABELS[leagueKey],
    sport: SPORT_CODES[leagueKey],
    status: registry.status,
    liveScoreProvider: formatProviderLabels(registry.scoreProviders),
    currentOddsProvider: formatProviderLabels(registry.currentOddsProviders),
    historicalOddsProvider: formatProviderLabels(registry.historicalProviders),
    propsStatus: registry.propsStatus,
    propsProviders: registry.propsProviders,
    propsNote: registry.propsNote,
    note: copy.note,
    detail: copy.detail,
    scoreboardDetail: copy.scoreboardDetail
  };
});

export function getBoardSportConfig(leagueKey: LeagueKey) {
  return BOARD_SPORTS.find((sport) => sport.leagueKey === leagueKey) ?? null;
}
