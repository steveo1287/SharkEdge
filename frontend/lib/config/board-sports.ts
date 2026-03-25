import type { BoardSupportStatus, LeagueKey, SportCode } from "@/lib/types/domain";

export type BoardSportConfig = {
  leagueKey: LeagueKey;
  leagueLabel: string;
  sport: SportCode;
  status: BoardSupportStatus;
  liveScoreProvider: string | null;
  currentOddsProvider: string | null;
  historicalOddsProvider: string | null;
  note: string;
  detail: string;
  scoreboardDetail: string;
};

export const BOARD_SPORTS: BoardSportConfig[] = [
  {
    leagueKey: "NBA",
    leagueLabel: "NBA",
    sport: "BASKETBALL",
    status: "LIVE",
    liveScoreProvider: "ESPN scoreboard",
    currentOddsProvider: "Current odds backend",
    historicalOddsProvider: "OddsHarvester historical ingestion",
    note: "Full live board section with ESPN state and current sportsbook pricing.",
    detail: "NBA is fully wired into the live board with score/state context and current pregame odds.",
    scoreboardDetail: "ESPN state adapter active for NBA."
  },
  {
    leagueKey: "NCAAB",
    leagueLabel: "NCAA Men's Basketball",
    sport: "BASKETBALL",
    status: "LIVE",
    liveScoreProvider: "ESPN scoreboard",
    currentOddsProvider: "Current odds backend",
    historicalOddsProvider: "OddsHarvester historical ingestion",
    note: "Full live board section with ESPN state and current sportsbook pricing.",
    detail: "NCAAB is live on the board with ESPN state and optional NCAA fallback scaffolding behind it.",
    scoreboardDetail: "ESPN state adapter active for NCAAB. NCAA fallback scaffold is available when needed."
  },
  {
    leagueKey: "MLB",
    leagueLabel: "MLB",
    sport: "BASEBALL",
    status: "LIVE",
    liveScoreProvider: "ESPN scoreboard",
    currentOddsProvider: "Current odds backend",
    historicalOddsProvider: "OddsHarvester historical ingestion",
    note: "Live MLB section with scoreboard state and current board pricing.",
    detail: "MLB is visible as a real live board section with ESPN score/state data and current pregame odds.",
    scoreboardDetail: "ESPN state adapter active for MLB."
  },
  {
    leagueKey: "NHL",
    leagueLabel: "NHL",
    sport: "HOCKEY",
    status: "LIVE",
    liveScoreProvider: "ESPN scoreboard",
    currentOddsProvider: "Current odds backend",
    historicalOddsProvider: "OddsHarvester historical ingestion",
    note: "Live NHL section with scoreboard state and current board pricing.",
    detail: "NHL is visible as a real live board section with ESPN score/state data and current pregame odds.",
    scoreboardDetail: "ESPN state adapter active for NHL."
  },
  {
    leagueKey: "NFL",
    leagueLabel: "NFL",
    sport: "FOOTBALL",
    status: "LIVE",
    liveScoreProvider: "ESPN scoreboard",
    currentOddsProvider: "Current odds backend",
    historicalOddsProvider: "OddsHarvester historical ingestion",
    note: "Live NFL section with scoreboard state and current board pricing.",
    detail: "NFL is wired into the live board with ESPN score/state coverage and current sportsbook prices.",
    scoreboardDetail: "ESPN state adapter active for NFL."
  },
  {
    leagueKey: "NCAAF",
    leagueLabel: "College Football",
    sport: "FOOTBALL",
    status: "LIVE",
    liveScoreProvider: "ESPN scoreboard",
    currentOddsProvider: "Current odds backend",
    historicalOddsProvider: "OddsHarvester historical ingestion",
    note: "Live college football section with ESPN state and NCAA fallback scaffolding.",
    detail: "NCAAF is wired into the live board with ESPN score/state coverage and NCAA fallback scaffolding.",
    scoreboardDetail: "ESPN state adapter active for NCAAF. NCAA fallback scaffold is available when needed."
  },
  {
    leagueKey: "UFC",
    leagueLabel: "UFC",
    sport: "MMA",
    status: "PARTIAL",
    liveScoreProvider: "UFC stats provider scaffold",
    currentOddsProvider: null,
    historicalOddsProvider: null,
    note: "Dedicated MMA adapter scaffold is in place, but it is not a full live odds board yet.",
    detail: "UFC is visible in the product with a combat-sport adapter path, but the live board is still pending odds and richer event-state rendering.",
    scoreboardDetail: "Dedicated MMA adapter scaffold wired. No full live board or grading path yet."
  },
  {
    leagueKey: "BOXING",
    leagueLabel: "Boxing",
    sport: "BOXING",
    status: "COMING SOON",
    liveScoreProvider: "Boxing adapter scaffold",
    currentOddsProvider: null,
    historicalOddsProvider: null,
    note: "Visible in the product, but not marketed as live.",
    detail: "Boxing is product-visible now, with adapter hooks reserved for future live event and odds support.",
    scoreboardDetail: "Boxing adapter scaffold only. No live feed connected yet."
  }
];

export const BOARD_SPORT_ORDER = BOARD_SPORTS.map((sport) => sport.leagueKey);

export function getBoardSportConfig(leagueKey: LeagueKey) {
  return BOARD_SPORTS.find((sport) => sport.leagueKey === leagueKey) ?? null;
}
