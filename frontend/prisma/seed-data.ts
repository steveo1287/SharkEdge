import type {
  BetRecord,
  GameRecord,
  InjuryRecord,
  LeagueRecord,
  LeagueStanding,
  MockDatabase,
  PlayerGameStatRecord,
  PlayerRecord,
  PreviousGame,
  SavedTrendRecord,
  SportsbookRecord,
  TeamGameStatRecord,
  TeamRecord,
  TrendRunRecord,
  UserRecord
} from "../lib/types/domain";
import { americanToDecimal, americanToImpliedProbability, calculateToWin } from "../lib/utils/odds";

type GameBookBlueprint = {
  gameId: string;
  sportsbookId: string;
  updatedAt: string;
  spreadHomeLine: number;
  spreadHomeOdds: number;
  spreadAwayOdds: number;
  moneylineHome: number;
  moneylineAway: number;
  totalLine: number;
  overOdds: number;
  underOdds: number;
  history: Array<{
    capturedAt: string;
    spreadHomeLine: number;
    spreadHomeOdds: number;
    spreadAwayOdds: number;
    moneylineHome: number;
    moneylineAway: number;
    totalLine: number;
    overOdds: number;
    underOdds: number;
  }>;
};

type PropBlueprint = {
  id: string;
  gameId: string;
  playerId: string;
  sportsbookId: string;
  marketType: "player_points" | "player_rebounds" | "player_assists" | "player_threes";
  line: number;
  overOdds: number;
  underOdds: number;
  history: Array<{
    capturedAt: string;
    line: number;
    overOdds: number;
    underOdds: number;
  }>;
};

const timestamps = {
  created: "2026-03-23T12:00:00.000Z",
  updated: "2026-03-23T15:45:00.000Z"
};

const leagues: LeagueRecord[] = [
  {
    id: "league_nba",
    key: "NBA",
    name: "National Basketball Association",
    sport: "BASKETBALL",
    createdAt: timestamps.created,
    updatedAt: timestamps.updated
  },
  {
    id: "league_ncaab",
    key: "NCAAB",
    name: "NCAA Men's Basketball",
    sport: "BASKETBALL",
    createdAt: timestamps.created,
    updatedAt: timestamps.updated
  }
];

const sportsbooks: SportsbookRecord[] = [
  {
    id: "book_dk",
    key: "draftkings",
    name: "DraftKings",
    region: "US",
    createdAt: timestamps.created,
    updatedAt: timestamps.updated
  },
  {
    id: "book_fd",
    key: "fanduel",
    name: "FanDuel",
    region: "US",
    createdAt: timestamps.created,
    updatedAt: timestamps.updated
  },
  {
    id: "book_mgm",
    key: "betmgm",
    name: "BetMGM",
    region: "US",
    createdAt: timestamps.created,
    updatedAt: timestamps.updated
  },
  {
    id: "book_czr",
    key: "caesars",
    name: "Caesars",
    region: "US",
    createdAt: timestamps.created,
    updatedAt: timestamps.updated
  }
];

const teams: TeamRecord[] = [
  { id: "team_bos", leagueId: "league_nba", name: "Boston Celtics", abbreviation: "BOS", externalIds: { espn: "2" }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_mil", leagueId: "league_nba", name: "Milwaukee Bucks", abbreviation: "MIL", externalIds: { espn: "15" }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_lal", leagueId: "league_nba", name: "Los Angeles Lakers", abbreviation: "LAL", externalIds: { espn: "13" }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_den", leagueId: "league_nba", name: "Denver Nuggets", abbreviation: "DEN", externalIds: { espn: "7" }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_nyk", leagueId: "league_nba", name: "New York Knicks", abbreviation: "NYK", externalIds: { espn: "18" }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_mia", leagueId: "league_nba", name: "Miami Heat", abbreviation: "MIA", externalIds: { espn: "14" }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_duke", leagueId: "league_ncaab", name: "Duke Blue Devils", abbreviation: "DUKE", externalIds: { espn: "150" }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_hou", leagueId: "league_ncaab", name: "Houston Cougars", abbreviation: "HOU", externalIds: { espn: "248" }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_uconn", leagueId: "league_ncaab", name: "UConn Huskies", abbreviation: "UCONN", externalIds: { espn: "41" }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_arizona", leagueId: "league_ncaab", name: "Arizona Wildcats", abbreviation: "ARIZ", externalIds: { espn: "12" }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_kansas", leagueId: "league_ncaab", name: "Kansas Jayhawks", abbreviation: "KU", externalIds: { espn: "2305" }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_purdue", leagueId: "league_ncaab", name: "Purdue Boilermakers", abbreviation: "PUR", externalIds: { espn: "2509" }, createdAt: timestamps.created, updatedAt: timestamps.updated }
];

const players: PlayerRecord[] = [
  { id: "player_tatum", leagueId: "league_nba", teamId: "team_bos", name: "Jayson Tatum", position: "F", externalIds: { espn: "4065648" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_brown", leagueId: "league_nba", teamId: "team_bos", name: "Jaylen Brown", position: "G/F", externalIds: { espn: "3917376" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_giannis", leagueId: "league_nba", teamId: "team_mil", name: "Giannis Antetokounmpo", position: "F", externalIds: { espn: "3032977" }, status: "QUESTIONABLE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_lillard", leagueId: "league_nba", teamId: "team_mil", name: "Damian Lillard", position: "G", externalIds: { espn: "6606" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_lebron", leagueId: "league_nba", teamId: "team_lal", name: "LeBron James", position: "F", externalIds: { espn: "1966" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_davis", leagueId: "league_nba", teamId: "team_lal", name: "Anthony Davis", position: "F/C", externalIds: { espn: "6583" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_jokic", leagueId: "league_nba", teamId: "team_den", name: "Nikola Jokic", position: "C", externalIds: { espn: "3112335" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_murray", leagueId: "league_nba", teamId: "team_den", name: "Jamal Murray", position: "G", externalIds: { espn: "3936299" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_brunson", leagueId: "league_nba", teamId: "team_nyk", name: "Jalen Brunson", position: "G", externalIds: { espn: "3934672" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_randle", leagueId: "league_nba", teamId: "team_nyk", name: "Julius Randle", position: "F", externalIds: { espn: "3064514" }, status: "OUT", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_butler", leagueId: "league_nba", teamId: "team_mia", name: "Jimmy Butler", position: "F", externalIds: { espn: "6430" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_bam", leagueId: "league_nba", teamId: "team_mia", name: "Bam Adebayo", position: "C", externalIds: { espn: "4066261" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_flagg", leagueId: "league_ncaab", teamId: "team_duke", name: "Cooper Flagg", position: "F", externalIds: { sharkedge: "cooper-flagg" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_proctor", leagueId: "league_ncaab", teamId: "team_duke", name: "Tyrese Proctor", position: "G", externalIds: { sharkedge: "tyrese-proctor" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_crier", leagueId: "league_ncaab", teamId: "team_hou", name: "LJ Cryer", position: "G", externalIds: { sharkedge: "lj-cryer" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_sharp", leagueId: "league_ncaab", teamId: "team_hou", name: "Emanuel Sharp", position: "G", externalIds: { sharkedge: "emanuel-sharp" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_karaban", leagueId: "league_ncaab", teamId: "team_uconn", name: "Alex Karaban", position: "F", externalIds: { sharkedge: "alex-karaban" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_solo", leagueId: "league_ncaab", teamId: "team_uconn", name: "Solo Ball", position: "G", externalIds: { sharkedge: "solo-ball" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_caleb", leagueId: "league_ncaab", teamId: "team_arizona", name: "Caleb Love", position: "G", externalIds: { sharkedge: "caleb-love" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_bradley", leagueId: "league_ncaab", teamId: "team_arizona", name: "Jaden Bradley", position: "G", externalIds: { sharkedge: "jaden-bradley" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_dickinson", leagueId: "league_ncaab", teamId: "team_kansas", name: "Hunter Dickinson", position: "C", externalIds: { sharkedge: "hunter-dickinson" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_zeke", leagueId: "league_ncaab", teamId: "team_kansas", name: "Zeke Mayo", position: "G", externalIds: { sharkedge: "zeke-mayo" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_braden", leagueId: "league_ncaab", teamId: "team_purdue", name: "Braden Smith", position: "G", externalIds: { sharkedge: "braden-smith" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_tkr", leagueId: "league_ncaab", teamId: "team_purdue", name: "Trey Kaufman-Renn", position: "F", externalIds: { sharkedge: "trey-kaufman-renn" }, status: "ACTIVE", createdAt: timestamps.created, updatedAt: timestamps.updated }
];

const games: GameRecord[] = [
  { id: "game_bos_mil", leagueId: "league_nba", externalEventId: "nba-bos-mil-20260323", startTime: "2026-03-23T23:30:00.000Z", homeTeamId: "team_bos", awayTeamId: "team_mil", status: "PREGAME", venue: "TD Garden", scoreJson: null, liveStateJson: null, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "game_den_lal", leagueId: "league_nba", externalEventId: "nba-den-lal-20260324", startTime: "2026-03-24T01:00:00.000Z", homeTeamId: "team_den", awayTeamId: "team_lal", status: "PREGAME", venue: "Ball Arena", scoreJson: null, liveStateJson: null, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "game_nyk_mia", leagueId: "league_nba", externalEventId: "nba-nyk-mia-20260324", startTime: "2026-03-24T00:30:00.000Z", homeTeamId: "team_nyk", awayTeamId: "team_mia", status: "PREGAME", venue: "Madison Square Garden", scoreJson: null, liveStateJson: null, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "game_duke_hou", leagueId: "league_ncaab", externalEventId: "ncaab-duke-hou-20260323", startTime: "2026-03-23T21:15:00.000Z", homeTeamId: "team_hou", awayTeamId: "team_duke", status: "PREGAME", venue: "T-Mobile Center", scoreJson: null, liveStateJson: null, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "game_uconn_arizona", leagueId: "league_ncaab", externalEventId: "ncaab-uconn-arizona-20260323", startTime: "2026-03-23T23:50:00.000Z", homeTeamId: "team_arizona", awayTeamId: "team_uconn", status: "PREGAME", venue: "Crypto.com Arena", scoreJson: null, liveStateJson: null, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "game_kansas_purdue", leagueId: "league_ncaab", externalEventId: "ncaab-kansas-purdue-20260324", startTime: "2026-03-24T02:10:00.000Z", homeTeamId: "team_purdue", awayTeamId: "team_kansas", status: "PREGAME", venue: "Lucas Oil Stadium", scoreJson: null, liveStateJson: null, createdAt: timestamps.created, updatedAt: timestamps.updated }
];

const standings: Record<"NBA" | "NCAAB", LeagueStanding[]> = {
  NBA: [
    { teamId: "team_bos", rank: 1, wins: 52, losses: 23, streak: "W4", netRating: 8.4 },
    { teamId: "team_den", rank: 2, wins: 49, losses: 26, streak: "W2", netRating: 6.9 },
    { teamId: "team_nyk", rank: 3, wins: 47, losses: 28, streak: "W1", netRating: 5.3 },
    { teamId: "team_mil", rank: 4, wins: 46, losses: 29, streak: "L1", netRating: 4.8 },
    { teamId: "team_lal", rank: 5, wins: 43, losses: 32, streak: "W3", netRating: 2.1 },
    { teamId: "team_mia", rank: 6, wins: 41, losses: 34, streak: "L2", netRating: 0.9 }
  ],
  NCAAB: [
    { teamId: "team_hou", rank: 1, wins: 30, losses: 5, streak: "W8", netRating: 21.5 },
    { teamId: "team_duke", rank: 2, wins: 29, losses: 6, streak: "W6", netRating: 20.3 },
    { teamId: "team_purdue", rank: 3, wins: 28, losses: 7, streak: "W3", netRating: 17.9 },
    { teamId: "team_uconn", rank: 4, wins: 26, losses: 9, streak: "W2", netRating: 16.2 },
    { teamId: "team_arizona", rank: 5, wins: 26, losses: 9, streak: "L1", netRating: 15.4 },
    { teamId: "team_kansas", rank: 6, wins: 24, losses: 11, streak: "W1", netRating: 11.7 }
  ]
};

const previousGames: PreviousGame[] = [
  { id: "prev_nba_1", leagueKey: "NBA", playedAt: "2026-03-22T01:00:00.000Z", awayTeamId: "team_bos", homeTeamId: "team_nyk", awayScore: 114, homeScore: 107 },
  { id: "prev_nba_2", leagueKey: "NBA", playedAt: "2026-03-22T02:30:00.000Z", awayTeamId: "team_den", homeTeamId: "team_lal", awayScore: 118, homeScore: 111 },
  { id: "prev_ncaab_1", leagueKey: "NCAAB", playedAt: "2026-03-22T00:10:00.000Z", awayTeamId: "team_hou", homeTeamId: "team_arizona", awayScore: 76, homeScore: 70 },
  { id: "prev_ncaab_2", leagueKey: "NCAAB", playedAt: "2026-03-22T02:05:00.000Z", awayTeamId: "team_purdue", homeTeamId: "team_duke", awayScore: 72, homeScore: 78 }
];

const teamGameStats: TeamGameStatRecord[] = [
  { id: "team_stat_1", gameId: "game_bos_mil", teamId: "team_bos", statsJson: { pace: 99.1, offensiveRating: 121.2, defensiveRating: 111.6, recentForm: "8-2", atsLast10: "6-4", reboundRate: 51.4, turnoverRate: 12.3, split: "Home 28-8", rank: 2 }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_stat_2", gameId: "game_bos_mil", teamId: "team_mil", statsJson: { pace: 100.3, offensiveRating: 118.1, defensiveRating: 113.8, recentForm: "6-4", atsLast10: "5-5", reboundRate: 50.6, turnoverRate: 13.6, split: "Away 20-15", rank: 8 }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_stat_3", gameId: "game_den_lal", teamId: "team_den", statsJson: { pace: 97.4, offensiveRating: 119.5, defensiveRating: 110.8, recentForm: "7-3", atsLast10: "7-3", reboundRate: 52.1, turnoverRate: 12.0, split: "Home 26-9", rank: 3 }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_stat_4", gameId: "game_den_lal", teamId: "team_lal", statsJson: { pace: 100.1, offensiveRating: 116.4, defensiveRating: 113.5, recentForm: "7-3", atsLast10: "6-4", reboundRate: 49.8, turnoverRate: 13.2, split: "Away 18-17", rank: 11 }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_stat_5", gameId: "game_nyk_mia", teamId: "team_nyk", statsJson: { pace: 96.8, offensiveRating: 117.1, defensiveRating: 111.4, recentForm: "6-4", atsLast10: "5-5", reboundRate: 51.0, turnoverRate: 11.8, split: "Home 25-11", rank: 6 }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_stat_6", gameId: "game_nyk_mia", teamId: "team_mia", statsJson: { pace: 95.9, offensiveRating: 113.0, defensiveRating: 112.1, recentForm: "5-5", atsLast10: "4-6", reboundRate: 49.1, turnoverRate: 12.7, split: "Away 17-18", rank: 14 }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_stat_7", gameId: "game_duke_hou", teamId: "team_duke", statsJson: { pace: 71.6, offensiveRating: 124.2, defensiveRating: 95.7, recentForm: "8-2", atsLast10: "7-3", reboundRate: 53.6, turnoverRate: 14.0, split: "Neutral 5-2", rank: 2 }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_stat_8", gameId: "game_duke_hou", teamId: "team_hou", statsJson: { pace: 67.8, offensiveRating: 118.9, defensiveRating: 90.4, recentForm: "9-1", atsLast10: "8-2", reboundRate: 54.4, turnoverRate: 13.2, split: "Neutral 6-1", rank: 1 }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_stat_9", gameId: "game_uconn_arizona", teamId: "team_uconn", statsJson: { pace: 69.9, offensiveRating: 119.6, defensiveRating: 97.9, recentForm: "7-3", atsLast10: "6-4", reboundRate: 52.8, turnoverRate: 13.4, split: "Neutral 4-2", rank: 7 }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_stat_10", gameId: "game_uconn_arizona", teamId: "team_arizona", statsJson: { pace: 72.1, offensiveRating: 118.2, defensiveRating: 99.8, recentForm: "6-4", atsLast10: "5-5", reboundRate: 50.5, turnoverRate: 14.6, split: "Neutral 5-2", rank: 10 }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_stat_11", gameId: "game_kansas_purdue", teamId: "team_kansas", statsJson: { pace: 70.3, offensiveRating: 115.8, defensiveRating: 98.6, recentForm: "5-5", atsLast10: "4-6", reboundRate: 50.1, turnoverRate: 13.8, split: "Neutral 3-2", rank: 17 }, createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "team_stat_12", gameId: "game_kansas_purdue", teamId: "team_purdue", statsJson: { pace: 68.8, offensiveRating: 122.6, defensiveRating: 96.9, recentForm: "8-2", atsLast10: "6-4", reboundRate: 54.8, turnoverRate: 12.1, split: "Neutral 4-1", rank: 4 }, createdAt: timestamps.created, updatedAt: timestamps.updated }
];

const playerGameStats: PlayerGameStatRecord[] = [
  { id: "player_stat_tatum", gameId: "game_bos_mil", playerId: "player_tatum", statsJson: { points: 30.1, rebounds: 8.7, assists: 4.9, threes: 3.4, recentHitRate: 0.67 }, minutes: 36.4, starter: true, outcomeStatus: "healthy", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_stat_giannis", gameId: "game_bos_mil", playerId: "player_giannis", statsJson: { points: 31.2, rebounds: 11.3, assists: 6.2, threes: 0.8, recentHitRate: 0.61 }, minutes: 35.1, starter: true, outcomeStatus: "questionable", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_stat_lebron", gameId: "game_den_lal", playerId: "player_lebron", statsJson: { points: 26.8, rebounds: 7.5, assists: 8.1, threes: 2.3, recentHitRate: 0.58 }, minutes: 35.9, starter: true, outcomeStatus: "healthy", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_stat_jokic", gameId: "game_den_lal", playerId: "player_jokic", statsJson: { points: 27.6, rebounds: 12.4, assists: 9.3, threes: 1.1, recentHitRate: 0.66 }, minutes: 34.5, starter: true, outcomeStatus: "healthy", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_stat_brunson", gameId: "game_nyk_mia", playerId: "player_brunson", statsJson: { points: 28.4, rebounds: 3.8, assists: 7.0, threes: 2.7, recentHitRate: 0.63 }, minutes: 36.7, starter: true, outcomeStatus: "healthy", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "player_stat_butler", gameId: "game_nyk_mia", playerId: "player_butler", statsJson: { points: 23.4, rebounds: 5.5, assists: 5.1, threes: 1.4, recentHitRate: 0.56 }, minutes: 34.0, starter: true, outcomeStatus: "healthy", createdAt: timestamps.created, updatedAt: timestamps.updated }
];

const injuries: InjuryRecord[] = [
  { id: "injury_giannis", playerId: "player_giannis", teamId: "team_mil", gameId: "game_bos_mil", status: "QUESTIONABLE", source: "Team injury report", reportedAt: "2026-03-23T15:00:00.000Z", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "injury_randle", playerId: "player_randle", teamId: "team_nyk", gameId: "game_nyk_mia", status: "OUT", source: "Team injury report", reportedAt: "2026-03-23T13:20:00.000Z", createdAt: timestamps.created, updatedAt: timestamps.updated },
  { id: "injury_karaban", playerId: "player_karaban", teamId: "team_uconn", gameId: "game_uconn_arizona", status: "QUESTIONABLE", source: "Beat writer update", reportedAt: "2026-03-23T14:10:00.000Z", createdAt: timestamps.created, updatedAt: timestamps.updated }
];

const users: UserRecord[] = [
  {
    id: "user_demo",
    email: null,
    username: "demo_bettor",
    bankrollSettingsJson: { bankroll: 5000, unitSize: 50, preferredStakePlan: "flat" },
    createdAt: timestamps.created,
    updatedAt: timestamps.updated
  }
];

const gameAngles: MockDatabase["gameAngles"] = [
  { gameId: "game_bos_mil", modelProbability: 0.59, recentHitRate: 0.64, matchupRank: 8, lineMovementSupport: 0.4, volatility: 0.24 },
  { gameId: "game_den_lal", modelProbability: 0.57, recentHitRate: 0.62, matchupRank: 10, lineMovementSupport: 0.2, volatility: 0.29 },
  { gameId: "game_nyk_mia", modelProbability: 0.55, recentHitRate: 0.56, matchupRank: 13, lineMovementSupport: 0.1, volatility: 0.34 },
  { gameId: "game_duke_hou", modelProbability: 0.58, recentHitRate: 0.66, matchupRank: 4, lineMovementSupport: 0.5, volatility: 0.18 },
  { gameId: "game_uconn_arizona", modelProbability: 0.54, recentHitRate: 0.58, matchupRank: 12, lineMovementSupport: 0.2, volatility: 0.27 },
  { gameId: "game_kansas_purdue", modelProbability: 0.61, recentHitRate: 0.65, matchupRank: 6, lineMovementSupport: 0.3, volatility: 0.2 }
];

const propAngles: MockDatabase["propAngles"] = [
  { id: "angle_tatum_points", gameId: "game_bos_mil", playerId: "player_tatum", marketType: "player_points", preferredSportsbookId: "book_fd", preferredSide: "OVER", recentHitRate: 0.68, matchupRank: 22, modelProbability: 0.59, volatility: 0.23 },
  { id: "angle_giannis_rebounds", gameId: "game_bos_mil", playerId: "player_giannis", marketType: "player_rebounds", preferredSportsbookId: "book_dk", preferredSide: "OVER", recentHitRate: 0.64, matchupRank: 19, modelProbability: 0.57, volatility: 0.26 },
  { id: "angle_jokic_assists", gameId: "game_den_lal", playerId: "player_jokic", marketType: "player_assists", preferredSportsbookId: "book_dk", preferredSide: "OVER", recentHitRate: 0.71, matchupRank: 26, modelProbability: 0.62, volatility: 0.16 },
  { id: "angle_lebron_points", gameId: "game_den_lal", playerId: "player_lebron", marketType: "player_points", preferredSportsbookId: "book_mgm", preferredSide: "UNDER", recentHitRate: 0.61, matchupRank: 9, modelProbability: 0.56, volatility: 0.25 },
  { id: "angle_brunson_assists", gameId: "game_nyk_mia", playerId: "player_brunson", marketType: "player_assists", preferredSportsbookId: "book_fd", preferredSide: "OVER", recentHitRate: 0.66, matchupRank: 24, modelProbability: 0.58, volatility: 0.22 },
  { id: "angle_butler_points", gameId: "game_nyk_mia", playerId: "player_butler", marketType: "player_points", preferredSportsbookId: "book_czr", preferredSide: "UNDER", recentHitRate: 0.58, matchupRank: 7, modelProbability: 0.55, volatility: 0.31 },
  { id: "angle_flagg_points", gameId: "game_duke_hou", playerId: "player_flagg", marketType: "player_points", preferredSportsbookId: "book_fd", preferredSide: "OVER", recentHitRate: 0.69, matchupRank: 17, modelProbability: 0.6, volatility: 0.21 },
  { id: "angle_crier_threes", gameId: "game_duke_hou", playerId: "player_crier", marketType: "player_threes", preferredSportsbookId: "book_dk", preferredSide: "OVER", recentHitRate: 0.63, matchupRank: 18, modelProbability: 0.57, volatility: 0.24 },
  { id: "angle_karaban_rebounds", gameId: "game_uconn_arizona", playerId: "player_karaban", marketType: "player_rebounds", preferredSportsbookId: "book_mgm", preferredSide: "OVER", recentHitRate: 0.62, matchupRank: 16, modelProbability: 0.56, volatility: 0.22 },
  { id: "angle_caleb_points", gameId: "game_uconn_arizona", playerId: "player_caleb", marketType: "player_points", preferredSportsbookId: "book_fd", preferredSide: "OVER", recentHitRate: 0.57, matchupRank: 21, modelProbability: 0.55, volatility: 0.28 },
  { id: "angle_braden_assists", gameId: "game_kansas_purdue", playerId: "player_braden", marketType: "player_assists", preferredSportsbookId: "book_dk", preferredSide: "OVER", recentHitRate: 0.67, matchupRank: 25, modelProbability: 0.59, volatility: 0.18 },
  { id: "angle_dickinson_points", gameId: "game_kansas_purdue", playerId: "player_dickinson", marketType: "player_points", preferredSportsbookId: "book_czr", preferredSide: "UNDER", recentHitRate: 0.55, matchupRank: 8, modelProbability: 0.54, volatility: 0.3 }
];

const gameBookBlueprints: GameBookBlueprint[] = [
  {
    gameId: "game_bos_mil",
    sportsbookId: "book_dk",
    updatedAt: "2026-03-23T15:40:00.000Z",
    spreadHomeLine: -4.5,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -188,
    moneylineAway: 158,
    totalLine: 228.5,
    overOdds: -108,
    underOdds: -112,
    history: [
      { capturedAt: "2026-03-22T14:00:00.000Z", spreadHomeLine: -3.5, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -172, moneylineAway: 146, totalLine: 226.5, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T09:20:00.000Z", spreadHomeLine: -4.0, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -180, moneylineAway: 152, totalLine: 227.5, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T15:40:00.000Z", spreadHomeLine: -4.5, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -188, moneylineAway: 158, totalLine: 228.5, overOdds: -108, underOdds: -112 }
    ]
  },
  {
    gameId: "game_bos_mil",
    sportsbookId: "book_fd",
    updatedAt: "2026-03-23T15:35:00.000Z",
    spreadHomeLine: -4.0,
    spreadHomeOdds: -112,
    spreadAwayOdds: -108,
    moneylineHome: -182,
    moneylineAway: 154,
    totalLine: 228.0,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T14:00:00.000Z", spreadHomeLine: -3.0, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -166, moneylineAway: 142, totalLine: 226.0, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T09:20:00.000Z", spreadHomeLine: -3.5, spreadHomeOdds: -111, spreadAwayOdds: -109, moneylineHome: -174, moneylineAway: 148, totalLine: 227.0, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T15:35:00.000Z", spreadHomeLine: -4.0, spreadHomeOdds: -112, spreadAwayOdds: -108, moneylineHome: -182, moneylineAway: 154, totalLine: 228.0, overOdds: -110, underOdds: -110 }
    ]
  },
  {
    gameId: "game_bos_mil",
    sportsbookId: "book_mgm",
    updatedAt: "2026-03-23T15:31:00.000Z",
    spreadHomeLine: -4.5,
    spreadHomeOdds: -108,
    spreadAwayOdds: -112,
    moneylineHome: -190,
    moneylineAway: 160,
    totalLine: 229.0,
    overOdds: -105,
    underOdds: -115,
    history: [
      { capturedAt: "2026-03-22T14:00:00.000Z", spreadHomeLine: -3.5, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -175, moneylineAway: 148, totalLine: 227.0, overOdds: -108, underOdds: -112 },
      { capturedAt: "2026-03-23T09:20:00.000Z", spreadHomeLine: -4.0, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -182, moneylineAway: 154, totalLine: 228.0, overOdds: -106, underOdds: -114 },
      { capturedAt: "2026-03-23T15:31:00.000Z", spreadHomeLine: -4.5, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -190, moneylineAway: 160, totalLine: 229.0, overOdds: -105, underOdds: -115 }
    ]
  },
  {
    gameId: "game_bos_mil",
    sportsbookId: "book_czr",
    updatedAt: "2026-03-23T15:28:00.000Z",
    spreadHomeLine: -5.0,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -195,
    moneylineAway: 164,
    totalLine: 228.5,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T14:00:00.000Z", spreadHomeLine: -4.0, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -180, moneylineAway: 150, totalLine: 226.5, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T09:20:00.000Z", spreadHomeLine: -4.5, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -187, moneylineAway: 156, totalLine: 227.5, overOdds: -111, underOdds: -109 },
      { capturedAt: "2026-03-23T15:28:00.000Z", spreadHomeLine: -5.0, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -195, moneylineAway: 164, totalLine: 228.5, overOdds: -110, underOdds: -110 }
    ]
  },
  {
    gameId: "game_den_lal",
    sportsbookId: "book_dk",
    updatedAt: "2026-03-23T15:42:00.000Z",
    spreadHomeLine: -5.5,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -218,
    moneylineAway: 182,
    totalLine: 229.5,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T14:20:00.000Z", spreadHomeLine: -4.5, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -198, moneylineAway: 166, totalLine: 227.5, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T09:40:00.000Z", spreadHomeLine: -5.0, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -208, moneylineAway: 174, totalLine: 228.5, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T15:42:00.000Z", spreadHomeLine: -5.5, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -218, moneylineAway: 182, totalLine: 229.5, overOdds: -110, underOdds: -110 }
    ]
  },
  {
    gameId: "game_den_lal",
    sportsbookId: "book_fd",
    updatedAt: "2026-03-23T15:38:00.000Z",
    spreadHomeLine: -5.0,
    spreadHomeOdds: -112,
    spreadAwayOdds: -108,
    moneylineHome: -210,
    moneylineAway: 176,
    totalLine: 230.0,
    overOdds: -108,
    underOdds: -112,
    history: [
      { capturedAt: "2026-03-22T14:20:00.000Z", spreadHomeLine: -4.0, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -190, moneylineAway: 160, totalLine: 228.0, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T09:40:00.000Z", spreadHomeLine: -4.5, spreadHomeOdds: -111, spreadAwayOdds: -109, moneylineHome: -200, moneylineAway: 168, totalLine: 229.0, overOdds: -108, underOdds: -112 },
      { capturedAt: "2026-03-23T15:38:00.000Z", spreadHomeLine: -5.0, spreadHomeOdds: -112, spreadAwayOdds: -108, moneylineHome: -210, moneylineAway: 176, totalLine: 230.0, overOdds: -108, underOdds: -112 }
    ]
  },
  {
    gameId: "game_den_lal",
    sportsbookId: "book_mgm",
    updatedAt: "2026-03-23T15:37:00.000Z",
    spreadHomeLine: -5.5,
    spreadHomeOdds: -108,
    spreadAwayOdds: -112,
    moneylineHome: -220,
    moneylineAway: 184,
    totalLine: 229.5,
    overOdds: -105,
    underOdds: -115,
    history: [
      { capturedAt: "2026-03-22T14:20:00.000Z", spreadHomeLine: -4.5, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -200, moneylineAway: 168, totalLine: 227.5, overOdds: -107, underOdds: -113 },
      { capturedAt: "2026-03-23T09:40:00.000Z", spreadHomeLine: -5.0, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -210, moneylineAway: 176, totalLine: 228.5, overOdds: -106, underOdds: -114 },
      { capturedAt: "2026-03-23T15:37:00.000Z", spreadHomeLine: -5.5, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -220, moneylineAway: 184, totalLine: 229.5, overOdds: -105, underOdds: -115 }
    ]
  },
  {
    gameId: "game_den_lal",
    sportsbookId: "book_czr",
    updatedAt: "2026-03-23T15:29:00.000Z",
    spreadHomeLine: -6.0,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -228,
    moneylineAway: 188,
    totalLine: 229.0,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T14:20:00.000Z", spreadHomeLine: -5.0, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -205, moneylineAway: 170, totalLine: 227.0, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T09:40:00.000Z", spreadHomeLine: -5.5, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -216, moneylineAway: 180, totalLine: 228.0, overOdds: -111, underOdds: -109 },
      { capturedAt: "2026-03-23T15:29:00.000Z", spreadHomeLine: -6.0, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -228, moneylineAway: 188, totalLine: 229.0, overOdds: -110, underOdds: -110 }
    ]
  },
  {
    gameId: "game_nyk_mia",
    sportsbookId: "book_dk",
    updatedAt: "2026-03-23T15:33:00.000Z",
    spreadHomeLine: -3.0,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -152,
    moneylineAway: 128,
    totalLine: 217.5,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T14:10:00.000Z", spreadHomeLine: -2.0, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -136, moneylineAway: 116, totalLine: 216.0, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T09:10:00.000Z", spreadHomeLine: -2.5, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -144, moneylineAway: 122, totalLine: 216.5, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T15:33:00.000Z", spreadHomeLine: -3.0, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -152, moneylineAway: 128, totalLine: 217.5, overOdds: -110, underOdds: -110 }
    ]
  },
  {
    gameId: "game_nyk_mia",
    sportsbookId: "book_fd",
    updatedAt: "2026-03-23T15:30:00.000Z",
    spreadHomeLine: -2.5,
    spreadHomeOdds: -112,
    spreadAwayOdds: -108,
    moneylineHome: -146,
    moneylineAway: 124,
    totalLine: 217.0,
    overOdds: -108,
    underOdds: -112,
    history: [
      { capturedAt: "2026-03-22T14:10:00.000Z", spreadHomeLine: -1.5, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -130, moneylineAway: 112, totalLine: 215.5, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T09:10:00.000Z", spreadHomeLine: -2.0, spreadHomeOdds: -111, spreadAwayOdds: -109, moneylineHome: -138, moneylineAway: 118, totalLine: 216.0, overOdds: -108, underOdds: -112 },
      { capturedAt: "2026-03-23T15:30:00.000Z", spreadHomeLine: -2.5, spreadHomeOdds: -112, spreadAwayOdds: -108, moneylineHome: -146, moneylineAway: 124, totalLine: 217.0, overOdds: -108, underOdds: -112 }
    ]
  },
  {
    gameId: "game_nyk_mia",
    sportsbookId: "book_mgm",
    updatedAt: "2026-03-23T15:27:00.000Z",
    spreadHomeLine: -3.0,
    spreadHomeOdds: -108,
    spreadAwayOdds: -112,
    moneylineHome: -154,
    moneylineAway: 130,
    totalLine: 217.5,
    overOdds: -105,
    underOdds: -115,
    history: [
      { capturedAt: "2026-03-22T14:10:00.000Z", spreadHomeLine: -2.0, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -138, moneylineAway: 118, totalLine: 216.0, overOdds: -106, underOdds: -114 },
      { capturedAt: "2026-03-23T09:10:00.000Z", spreadHomeLine: -2.5, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -146, moneylineAway: 124, totalLine: 216.5, overOdds: -105, underOdds: -115 },
      { capturedAt: "2026-03-23T15:27:00.000Z", spreadHomeLine: -3.0, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -154, moneylineAway: 130, totalLine: 217.5, overOdds: -105, underOdds: -115 }
    ]
  },
  {
    gameId: "game_nyk_mia",
    sportsbookId: "book_czr",
    updatedAt: "2026-03-23T15:26:00.000Z",
    spreadHomeLine: -3.5,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -160,
    moneylineAway: 134,
    totalLine: 217.0,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T14:10:00.000Z", spreadHomeLine: -2.5, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -144, moneylineAway: 120, totalLine: 215.5, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T09:10:00.000Z", spreadHomeLine: -3.0, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -152, moneylineAway: 126, totalLine: 216.5, overOdds: -111, underOdds: -109 },
      { capturedAt: "2026-03-23T15:26:00.000Z", spreadHomeLine: -3.5, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -160, moneylineAway: 134, totalLine: 217.0, overOdds: -110, underOdds: -110 }
    ]
  },
  {
    gameId: "game_duke_hou",
    sportsbookId: "book_dk",
    updatedAt: "2026-03-23T15:34:00.000Z",
    spreadHomeLine: -2.5,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -142,
    moneylineAway: 120,
    totalLine: 138.5,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T15:00:00.000Z", spreadHomeLine: -1.5, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -128, moneylineAway: 108, totalLine: 136.5, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T10:00:00.000Z", spreadHomeLine: -2.0, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -135, moneylineAway: 114, totalLine: 137.5, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T15:34:00.000Z", spreadHomeLine: -2.5, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -142, moneylineAway: 120, totalLine: 138.5, overOdds: -110, underOdds: -110 }
    ]
  },
  {
    gameId: "game_duke_hou",
    sportsbookId: "book_fd",
    updatedAt: "2026-03-23T15:32:00.000Z",
    spreadHomeLine: -2.0,
    spreadHomeOdds: -112,
    spreadAwayOdds: -108,
    moneylineHome: -136,
    moneylineAway: 116,
    totalLine: 139.0,
    overOdds: -108,
    underOdds: -112,
    history: [
      { capturedAt: "2026-03-22T15:00:00.000Z", spreadHomeLine: -1.0, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -122, moneylineAway: 104, totalLine: 137.0, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T10:00:00.000Z", spreadHomeLine: -1.5, spreadHomeOdds: -111, spreadAwayOdds: -109, moneylineHome: -129, moneylineAway: 110, totalLine: 138.0, overOdds: -108, underOdds: -112 },
      { capturedAt: "2026-03-23T15:32:00.000Z", spreadHomeLine: -2.0, spreadHomeOdds: -112, spreadAwayOdds: -108, moneylineHome: -136, moneylineAway: 116, totalLine: 139.0, overOdds: -108, underOdds: -112 }
    ]
  },
  {
    gameId: "game_duke_hou",
    sportsbookId: "book_mgm",
    updatedAt: "2026-03-23T15:31:00.000Z",
    spreadHomeLine: -2.5,
    spreadHomeOdds: -108,
    spreadAwayOdds: -112,
    moneylineHome: -144,
    moneylineAway: 122,
    totalLine: 138.5,
    overOdds: -105,
    underOdds: -115,
    history: [
      { capturedAt: "2026-03-22T15:00:00.000Z", spreadHomeLine: -1.5, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -130, moneylineAway: 110, totalLine: 136.5, overOdds: -106, underOdds: -114 },
      { capturedAt: "2026-03-23T10:00:00.000Z", spreadHomeLine: -2.0, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -137, moneylineAway: 116, totalLine: 137.5, overOdds: -105, underOdds: -115 },
      { capturedAt: "2026-03-23T15:31:00.000Z", spreadHomeLine: -2.5, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -144, moneylineAway: 122, totalLine: 138.5, overOdds: -105, underOdds: -115 }
    ]
  },
  {
    gameId: "game_duke_hou",
    sportsbookId: "book_czr",
    updatedAt: "2026-03-23T15:27:00.000Z",
    spreadHomeLine: -3.0,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -148,
    moneylineAway: 126,
    totalLine: 138.0,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T15:00:00.000Z", spreadHomeLine: -2.0, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -134, moneylineAway: 112, totalLine: 136.0, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T10:00:00.000Z", spreadHomeLine: -2.5, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -141, moneylineAway: 118, totalLine: 137.0, overOdds: -111, underOdds: -109 },
      { capturedAt: "2026-03-23T15:27:00.000Z", spreadHomeLine: -3.0, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -148, moneylineAway: 126, totalLine: 138.0, overOdds: -110, underOdds: -110 }
    ]
  },
  {
    gameId: "game_uconn_arizona",
    sportsbookId: "book_dk",
    updatedAt: "2026-03-23T15:39:00.000Z",
    spreadHomeLine: -1.5,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -128,
    moneylineAway: 108,
    totalLine: 145.5,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T16:00:00.000Z", spreadHomeLine: -0.5, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -116, moneylineAway: -102, totalLine: 144.0, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T10:30:00.000Z", spreadHomeLine: -1.0, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -122, moneylineAway: 102, totalLine: 145.0, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T15:39:00.000Z", spreadHomeLine: -1.5, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -128, moneylineAway: 108, totalLine: 145.5, overOdds: -110, underOdds: -110 }
    ]
  },
  {
    gameId: "game_uconn_arizona",
    sportsbookId: "book_fd",
    updatedAt: "2026-03-23T15:34:00.000Z",
    spreadHomeLine: -1.0,
    spreadHomeOdds: -112,
    spreadAwayOdds: -108,
    moneylineHome: -122,
    moneylineAway: 104,
    totalLine: 146.0,
    overOdds: -108,
    underOdds: -112,
    history: [
      { capturedAt: "2026-03-22T16:00:00.000Z", spreadHomeLine: 0.0, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -110, moneylineAway: -110, totalLine: 144.5, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T10:30:00.000Z", spreadHomeLine: -0.5, spreadHomeOdds: -111, spreadAwayOdds: -109, moneylineHome: -116, moneylineAway: -102, totalLine: 145.5, overOdds: -108, underOdds: -112 },
      { capturedAt: "2026-03-23T15:34:00.000Z", spreadHomeLine: -1.0, spreadHomeOdds: -112, spreadAwayOdds: -108, moneylineHome: -122, moneylineAway: 104, totalLine: 146.0, overOdds: -108, underOdds: -112 }
    ]
  },
  {
    gameId: "game_uconn_arizona",
    sportsbookId: "book_mgm",
    updatedAt: "2026-03-23T15:30:00.000Z",
    spreadHomeLine: -1.5,
    spreadHomeOdds: -108,
    spreadAwayOdds: -112,
    moneylineHome: -130,
    moneylineAway: 110,
    totalLine: 145.5,
    overOdds: -105,
    underOdds: -115,
    history: [
      { capturedAt: "2026-03-22T16:00:00.000Z", spreadHomeLine: -0.5, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -118, moneylineAway: 100, totalLine: 144.0, overOdds: -106, underOdds: -114 },
      { capturedAt: "2026-03-23T10:30:00.000Z", spreadHomeLine: -1.0, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -124, moneylineAway: 106, totalLine: 145.0, overOdds: -105, underOdds: -115 },
      { capturedAt: "2026-03-23T15:30:00.000Z", spreadHomeLine: -1.5, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -130, moneylineAway: 110, totalLine: 145.5, overOdds: -105, underOdds: -115 }
    ]
  },
  {
    gameId: "game_uconn_arizona",
    sportsbookId: "book_czr",
    updatedAt: "2026-03-23T15:26:00.000Z",
    spreadHomeLine: -2.0,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -134,
    moneylineAway: 114,
    totalLine: 145.0,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T16:00:00.000Z", spreadHomeLine: -1.0, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -122, moneylineAway: 104, totalLine: 143.5, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T10:30:00.000Z", spreadHomeLine: -1.5, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -128, moneylineAway: 110, totalLine: 144.5, overOdds: -111, underOdds: -109 },
      { capturedAt: "2026-03-23T15:26:00.000Z", spreadHomeLine: -2.0, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -134, moneylineAway: 114, totalLine: 145.0, overOdds: -110, underOdds: -110 }
    ]
  },
  {
    gameId: "game_kansas_purdue",
    sportsbookId: "book_dk",
    updatedAt: "2026-03-23T15:36:00.000Z",
    spreadHomeLine: -4.5,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -182,
    moneylineAway: 154,
    totalLine: 149.5,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T16:30:00.000Z", spreadHomeLine: -3.5, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -168, moneylineAway: 144, totalLine: 147.5, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T11:00:00.000Z", spreadHomeLine: -4.0, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -175, moneylineAway: 150, totalLine: 148.5, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T15:36:00.000Z", spreadHomeLine: -4.5, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -182, moneylineAway: 154, totalLine: 149.5, overOdds: -110, underOdds: -110 }
    ]
  },
  {
    gameId: "game_kansas_purdue",
    sportsbookId: "book_fd",
    updatedAt: "2026-03-23T15:32:00.000Z",
    spreadHomeLine: -4.0,
    spreadHomeOdds: -112,
    spreadAwayOdds: -108,
    moneylineHome: -176,
    moneylineAway: 148,
    totalLine: 150.0,
    overOdds: -108,
    underOdds: -112,
    history: [
      { capturedAt: "2026-03-22T16:30:00.000Z", spreadHomeLine: -3.0, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -162, moneylineAway: 138, totalLine: 148.0, overOdds: -109, underOdds: -111 },
      { capturedAt: "2026-03-23T11:00:00.000Z", spreadHomeLine: -3.5, spreadHomeOdds: -111, spreadAwayOdds: -109, moneylineHome: -169, moneylineAway: 144, totalLine: 149.0, overOdds: -108, underOdds: -112 },
      { capturedAt: "2026-03-23T15:32:00.000Z", spreadHomeLine: -4.0, spreadHomeOdds: -112, spreadAwayOdds: -108, moneylineHome: -176, moneylineAway: 148, totalLine: 150.0, overOdds: -108, underOdds: -112 }
    ]
  },
  {
    gameId: "game_kansas_purdue",
    sportsbookId: "book_mgm",
    updatedAt: "2026-03-23T15:31:00.000Z",
    spreadHomeLine: -4.5,
    spreadHomeOdds: -108,
    spreadAwayOdds: -112,
    moneylineHome: -184,
    moneylineAway: 156,
    totalLine: 149.5,
    overOdds: -105,
    underOdds: -115,
    history: [
      { capturedAt: "2026-03-22T16:30:00.000Z", spreadHomeLine: -3.5, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -170, moneylineAway: 146, totalLine: 147.5, overOdds: -106, underOdds: -114 },
      { capturedAt: "2026-03-23T11:00:00.000Z", spreadHomeLine: -4.0, spreadHomeOdds: -107, spreadAwayOdds: -113, moneylineHome: -177, moneylineAway: 152, totalLine: 148.5, overOdds: -105, underOdds: -115 },
      { capturedAt: "2026-03-23T15:31:00.000Z", spreadHomeLine: -4.5, spreadHomeOdds: -108, spreadAwayOdds: -112, moneylineHome: -184, moneylineAway: 156, totalLine: 149.5, overOdds: -105, underOdds: -115 }
    ]
  },
  {
    gameId: "game_kansas_purdue",
    sportsbookId: "book_czr",
    updatedAt: "2026-03-23T15:28:00.000Z",
    spreadHomeLine: -5.0,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    moneylineHome: -188,
    moneylineAway: 160,
    totalLine: 149.0,
    overOdds: -110,
    underOdds: -110,
    history: [
      { capturedAt: "2026-03-22T16:30:00.000Z", spreadHomeLine: -4.0, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -174, moneylineAway: 148, totalLine: 147.0, overOdds: -110, underOdds: -110 },
      { capturedAt: "2026-03-23T11:00:00.000Z", spreadHomeLine: -4.5, spreadHomeOdds: -109, spreadAwayOdds: -111, moneylineHome: -181, moneylineAway: 154, totalLine: 148.0, overOdds: -111, underOdds: -109 },
      { capturedAt: "2026-03-23T15:28:00.000Z", spreadHomeLine: -5.0, spreadHomeOdds: -110, spreadAwayOdds: -110, moneylineHome: -188, moneylineAway: 160, totalLine: 149.0, overOdds: -110, underOdds: -110 }
    ]
  }
];

const propBlueprints: PropBlueprint[] = [
  { id: "prop_tatum_points", gameId: "game_bos_mil", playerId: "player_tatum", sportsbookId: "book_fd", marketType: "player_points", line: 29.5, overOdds: -112, underOdds: -108, history: [{ capturedAt: "2026-03-22T15:00:00.000Z", line: 28.5, overOdds: -110, underOdds: -110 }, { capturedAt: "2026-03-23T10:30:00.000Z", line: 29.0, overOdds: -111, underOdds: -109 }, { capturedAt: "2026-03-23T15:10:00.000Z", line: 29.5, overOdds: -112, underOdds: -108 }] },
  { id: "prop_giannis_rebounds", gameId: "game_bos_mil", playerId: "player_giannis", sportsbookId: "book_dk", marketType: "player_rebounds", line: 11.5, overOdds: -104, underOdds: -118, history: [{ capturedAt: "2026-03-22T15:00:00.000Z", line: 11.0, overOdds: -102, underOdds: -120 }, { capturedAt: "2026-03-23T10:30:00.000Z", line: 11.0, overOdds: -105, underOdds: -115 }, { capturedAt: "2026-03-23T15:10:00.000Z", line: 11.5, overOdds: -104, underOdds: -118 }] },
  { id: "prop_jokic_assists", gameId: "game_den_lal", playerId: "player_jokic", sportsbookId: "book_dk", marketType: "player_assists", line: 9.5, overOdds: -108, underOdds: -112, history: [{ capturedAt: "2026-03-22T15:30:00.000Z", line: 9.0, overOdds: -110, underOdds: -110 }, { capturedAt: "2026-03-23T11:15:00.000Z", line: 9.0, overOdds: -108, underOdds: -112 }, { capturedAt: "2026-03-23T15:15:00.000Z", line: 9.5, overOdds: -108, underOdds: -112 }] },
  { id: "prop_lebron_points", gameId: "game_den_lal", playerId: "player_lebron", sportsbookId: "book_mgm", marketType: "player_points", line: 26.5, overOdds: -105, underOdds: -115, history: [{ capturedAt: "2026-03-22T15:30:00.000Z", line: 27.5, overOdds: -108, underOdds: -112 }, { capturedAt: "2026-03-23T11:15:00.000Z", line: 27.0, overOdds: -106, underOdds: -114 }, { capturedAt: "2026-03-23T15:15:00.000Z", line: 26.5, overOdds: -105, underOdds: -115 }] },
  { id: "prop_brunson_assists", gameId: "game_nyk_mia", playerId: "player_brunson", sportsbookId: "book_fd", marketType: "player_assists", line: 7.5, overOdds: -114, underOdds: -106, history: [{ capturedAt: "2026-03-22T15:10:00.000Z", line: 7.0, overOdds: -110, underOdds: -110 }, { capturedAt: "2026-03-23T10:45:00.000Z", line: 7.5, overOdds: -112, underOdds: -108 }, { capturedAt: "2026-03-23T15:05:00.000Z", line: 7.5, overOdds: -114, underOdds: -106 }] },
  { id: "prop_butler_points", gameId: "game_nyk_mia", playerId: "player_butler", sportsbookId: "book_czr", marketType: "player_points", line: 22.5, overOdds: -102, underOdds: -120, history: [{ capturedAt: "2026-03-22T15:10:00.000Z", line: 23.5, overOdds: -108, underOdds: -112 }, { capturedAt: "2026-03-23T10:45:00.000Z", line: 23.0, overOdds: -105, underOdds: -115 }, { capturedAt: "2026-03-23T15:05:00.000Z", line: 22.5, overOdds: -102, underOdds: -120 }] },
  { id: "prop_flagg_points", gameId: "game_duke_hou", playerId: "player_flagg", sportsbookId: "book_fd", marketType: "player_points", line: 18.5, overOdds: -110, underOdds: -110, history: [{ capturedAt: "2026-03-22T16:20:00.000Z", line: 17.5, overOdds: -108, underOdds: -112 }, { capturedAt: "2026-03-23T10:40:00.000Z", line: 18.0, overOdds: -109, underOdds: -111 }, { capturedAt: "2026-03-23T15:18:00.000Z", line: 18.5, overOdds: -110, underOdds: -110 }] },
  { id: "prop_crier_threes", gameId: "game_duke_hou", playerId: "player_crier", sportsbookId: "book_dk", marketType: "player_threes", line: 3.5, overOdds: 104, underOdds: -126, history: [{ capturedAt: "2026-03-22T16:20:00.000Z", line: 3.0, overOdds: 100, underOdds: -120 }, { capturedAt: "2026-03-23T10:40:00.000Z", line: 3.5, overOdds: 102, underOdds: -124 }, { capturedAt: "2026-03-23T15:18:00.000Z", line: 3.5, overOdds: 104, underOdds: -126 }] },
  { id: "prop_karaban_rebounds", gameId: "game_uconn_arizona", playerId: "player_karaban", sportsbookId: "book_mgm", marketType: "player_rebounds", line: 7.5, overOdds: -106, underOdds: -114, history: [{ capturedAt: "2026-03-22T16:40:00.000Z", line: 7.0, overOdds: -108, underOdds: -112 }, { capturedAt: "2026-03-23T11:05:00.000Z", line: 7.5, overOdds: -107, underOdds: -113 }, { capturedAt: "2026-03-23T15:20:00.000Z", line: 7.5, overOdds: -106, underOdds: -114 }] },
  { id: "prop_caleb_points", gameId: "game_uconn_arizona", playerId: "player_caleb", sportsbookId: "book_fd", marketType: "player_points", line: 18.5, overOdds: -108, underOdds: -112, history: [{ capturedAt: "2026-03-22T16:40:00.000Z", line: 17.5, overOdds: -110, underOdds: -110 }, { capturedAt: "2026-03-23T11:05:00.000Z", line: 18.0, overOdds: -109, underOdds: -111 }, { capturedAt: "2026-03-23T15:20:00.000Z", line: 18.5, overOdds: -108, underOdds: -112 }] },
  { id: "prop_braden_assists", gameId: "game_kansas_purdue", playerId: "player_braden", sportsbookId: "book_dk", marketType: "player_assists", line: 8.5, overOdds: -104, underOdds: -118, history: [{ capturedAt: "2026-03-22T17:00:00.000Z", line: 8.0, overOdds: -108, underOdds: -112 }, { capturedAt: "2026-03-23T11:20:00.000Z", line: 8.5, overOdds: -106, underOdds: -114 }, { capturedAt: "2026-03-23T15:25:00.000Z", line: 8.5, overOdds: -104, underOdds: -118 }] },
  { id: "prop_dickinson_points", gameId: "game_kansas_purdue", playerId: "player_dickinson", sportsbookId: "book_czr", marketType: "player_points", line: 17.5, overOdds: -102, underOdds: -120, history: [{ capturedAt: "2026-03-22T17:00:00.000Z", line: 18.5, overOdds: -108, underOdds: -112 }, { capturedAt: "2026-03-23T11:20:00.000Z", line: 18.0, overOdds: -105, underOdds: -115 }, { capturedAt: "2026-03-23T15:25:00.000Z", line: 17.5, overOdds: -102, underOdds: -120 }] }
];

const teamById = new Map(teams.map((team) => [team.id, team]));

function buildGameMarkets() {
  const markets: MockDatabase["markets"] = [];
  const snapshots: MockDatabase["marketSnapshots"] = [];

  for (const blueprint of gameBookBlueprints) {
    const game = games.find((candidate) => candidate.id === blueprint.gameId);
    if (!game) {
      continue;
    }

    const homeSpreadId = `${blueprint.gameId}_${blueprint.sportsbookId}_spread_home`;
    const awaySpreadId = `${blueprint.gameId}_${blueprint.sportsbookId}_spread_away`;
    const homeMoneylineId = `${blueprint.gameId}_${blueprint.sportsbookId}_moneyline_home`;
    const awayMoneylineId = `${blueprint.gameId}_${blueprint.sportsbookId}_moneyline_away`;
    const overId = `${blueprint.gameId}_${blueprint.sportsbookId}_total_over`;
    const underId = `${blueprint.gameId}_${blueprint.sportsbookId}_total_under`;

    markets.push(
      { id: homeSpreadId, gameId: blueprint.gameId, sportsbookId: blueprint.sportsbookId, marketType: "spread", period: "game", side: game.homeTeamId, playerId: null, line: blueprint.spreadHomeLine, oddsAmerican: blueprint.spreadHomeOdds, oddsDecimal: americanToDecimal(blueprint.spreadHomeOdds), impliedProbability: americanToImpliedProbability(blueprint.spreadHomeOdds), isLive: false, updatedAt: blueprint.updatedAt, createdAt: timestamps.created },
      { id: awaySpreadId, gameId: blueprint.gameId, sportsbookId: blueprint.sportsbookId, marketType: "spread", period: "game", side: game.awayTeamId, playerId: null, line: -blueprint.spreadHomeLine, oddsAmerican: blueprint.spreadAwayOdds, oddsDecimal: americanToDecimal(blueprint.spreadAwayOdds), impliedProbability: americanToImpliedProbability(blueprint.spreadAwayOdds), isLive: false, updatedAt: blueprint.updatedAt, createdAt: timestamps.created },
      { id: homeMoneylineId, gameId: blueprint.gameId, sportsbookId: blueprint.sportsbookId, marketType: "moneyline", period: "game", side: game.homeTeamId, playerId: null, line: null, oddsAmerican: blueprint.moneylineHome, oddsDecimal: americanToDecimal(blueprint.moneylineHome), impliedProbability: americanToImpliedProbability(blueprint.moneylineHome), isLive: false, updatedAt: blueprint.updatedAt, createdAt: timestamps.created },
      { id: awayMoneylineId, gameId: blueprint.gameId, sportsbookId: blueprint.sportsbookId, marketType: "moneyline", period: "game", side: game.awayTeamId, playerId: null, line: null, oddsAmerican: blueprint.moneylineAway, oddsDecimal: americanToDecimal(blueprint.moneylineAway), impliedProbability: americanToImpliedProbability(blueprint.moneylineAway), isLive: false, updatedAt: blueprint.updatedAt, createdAt: timestamps.created },
      { id: overId, gameId: blueprint.gameId, sportsbookId: blueprint.sportsbookId, marketType: "total", period: "game", side: "OVER", playerId: null, line: blueprint.totalLine, oddsAmerican: blueprint.overOdds, oddsDecimal: americanToDecimal(blueprint.overOdds), impliedProbability: americanToImpliedProbability(blueprint.overOdds), isLive: false, updatedAt: blueprint.updatedAt, createdAt: timestamps.created },
      { id: underId, gameId: blueprint.gameId, sportsbookId: blueprint.sportsbookId, marketType: "total", period: "game", side: "UNDER", playerId: null, line: blueprint.totalLine, oddsAmerican: blueprint.underOdds, oddsDecimal: americanToDecimal(blueprint.underOdds), impliedProbability: americanToImpliedProbability(blueprint.underOdds), isLive: false, updatedAt: blueprint.updatedAt, createdAt: timestamps.created }
    );

    for (const point of blueprint.history) {
      snapshots.push(
        { id: `${homeSpreadId}_${point.capturedAt}`, marketId: homeSpreadId, capturedAt: point.capturedAt, line: point.spreadHomeLine, oddsAmerican: point.spreadHomeOdds, impliedProbability: americanToImpliedProbability(point.spreadHomeOdds) },
        { id: `${awaySpreadId}_${point.capturedAt}`, marketId: awaySpreadId, capturedAt: point.capturedAt, line: -point.spreadHomeLine, oddsAmerican: point.spreadAwayOdds, impliedProbability: americanToImpliedProbability(point.spreadAwayOdds) },
        { id: `${homeMoneylineId}_${point.capturedAt}`, marketId: homeMoneylineId, capturedAt: point.capturedAt, line: null, oddsAmerican: point.moneylineHome, impliedProbability: americanToImpliedProbability(point.moneylineHome) },
        { id: `${awayMoneylineId}_${point.capturedAt}`, marketId: awayMoneylineId, capturedAt: point.capturedAt, line: null, oddsAmerican: point.moneylineAway, impliedProbability: americanToImpliedProbability(point.moneylineAway) },
        { id: `${overId}_${point.capturedAt}`, marketId: overId, capturedAt: point.capturedAt, line: point.totalLine, oddsAmerican: point.overOdds, impliedProbability: americanToImpliedProbability(point.overOdds) },
        { id: `${underId}_${point.capturedAt}`, marketId: underId, capturedAt: point.capturedAt, line: point.totalLine, oddsAmerican: point.underOdds, impliedProbability: americanToImpliedProbability(point.underOdds) }
      );
    }
  }

  return { markets, snapshots };
}

function buildPropMarkets() {
  const markets: MockDatabase["markets"] = [];
  const snapshots: MockDatabase["marketSnapshots"] = [];

  for (const blueprint of propBlueprints) {
    const overId = `${blueprint.id}_over`;
    const underId = `${blueprint.id}_under`;

    markets.push(
      { id: overId, gameId: blueprint.gameId, sportsbookId: blueprint.sportsbookId, marketType: blueprint.marketType, period: "game", side: "OVER", playerId: blueprint.playerId, line: blueprint.line, oddsAmerican: blueprint.overOdds, oddsDecimal: americanToDecimal(blueprint.overOdds), impliedProbability: americanToImpliedProbability(blueprint.overOdds), isLive: false, updatedAt: blueprint.history.at(-1)?.capturedAt ?? timestamps.updated, createdAt: timestamps.created },
      { id: underId, gameId: blueprint.gameId, sportsbookId: blueprint.sportsbookId, marketType: blueprint.marketType, period: "game", side: "UNDER", playerId: blueprint.playerId, line: blueprint.line, oddsAmerican: blueprint.underOdds, oddsDecimal: americanToDecimal(blueprint.underOdds), impliedProbability: americanToImpliedProbability(blueprint.underOdds), isLive: false, updatedAt: blueprint.history.at(-1)?.capturedAt ?? timestamps.updated, createdAt: timestamps.created }
    );

    for (const point of blueprint.history) {
      snapshots.push(
        { id: `${overId}_${point.capturedAt}`, marketId: overId, capturedAt: point.capturedAt, line: point.line, oddsAmerican: point.overOdds, impliedProbability: americanToImpliedProbability(point.overOdds) },
        { id: `${underId}_${point.capturedAt}`, marketId: underId, capturedAt: point.capturedAt, line: point.line, oddsAmerican: point.underOdds, impliedProbability: americanToImpliedProbability(point.underOdds) }
      );
    }
  }

  return { markets, snapshots };
}

const seededBetsSource = [
  ["bet_1", "2026-03-18T19:30:00.000Z", "BASKETBALL", "NBA", "game_bos_mil", null, "spread", "BOS", -3.5, -110, "book_fd", 1.5, "WIN", -4.0, 0.5, "Beat the close on Boston.", ["steam", "pregame"], false],
  ["bet_2", "2026-03-18T23:15:00.000Z", "BASKETBALL", "NBA", "game_den_lal", "player_jokic", "player_assists", "OVER", 8.5, -105, "book_dk", 1.0, "WIN", 9.0, 0.5, "Lakers gave up middle all week.", ["props"], false],
  ["bet_3", "2026-03-19T00:45:00.000Z", "BASKETBALL", "NCAAB", "game_duke_hou", null, "total", "UNDER", 140.5, -110, "book_mgm", 1.0, "LOSS", 139.0, -1.5, "Bought into the semifinal nerves angle.", ["totals"], false],
  ["bet_4", "2026-03-19T21:10:00.000Z", "BASKETBALL", "NBA", "game_nyk_mia", "player_brunson", "player_assists", "OVER", 7.0, -112, "book_fd", 1.0, "WIN", 7.5, 0.5, "Usage spike without Randle.", ["props", "injury"], false],
  ["bet_5", "2026-03-20T01:00:00.000Z", "BASKETBALL", "NCAAB", "game_kansas_purdue", null, "moneyline", "PUR", null, -170, "book_dk", 2.0, "WIN", null, null, "Faded Kansas interior depth.", ["side"], false],
  ["bet_6", "2026-03-20T17:45:00.000Z", "BASKETBALL", "NBA", null, "player_lebron", "player_points", "UNDER", 27.5, -110, "book_czr", 1.0, "LOSS", 26.5, 1.0, "Late number move but wrong read.", ["props"], false],
  ["bet_7", "2026-03-21T18:20:00.000Z", "BASKETBALL", "NCAAB", null, "player_flagg", "player_points", "OVER", 17.5, -108, "book_fd", 1.0, "WIN", 18.5, 1.0, "Freshman usage never dipped.", ["props"], false],
  ["bet_8", "2026-03-22T23:00:00.000Z", "BASKETBALL", "NBA", "game_bos_mil", null, "total", "OVER", 227.5, -105, "book_mgm", 1.0, "PUSH", 228.5, 1.0, "Market landed right on it.", ["totals"], false],
  ["bet_9", "2026-03-23T13:10:00.000Z", "BASKETBALL", "NBA", "game_den_lal", null, "spread", "DEN", -5.5, -110, "book_dk", 1.25, "OPEN", -6.0, 0.5, "Still playable to -6.", ["today", "board"], false],
  ["bet_10", "2026-03-23T13:35:00.000Z", "BASKETBALL", "NCAAB", "game_kansas_purdue", "player_braden", "player_assists", "OVER", 8.5, -104, "book_dk", 0.75, "OPEN", 9.0, 0.5, "Need pace and paint touches.", ["today", "props"], false]
] as const;

const bets: BetRecord[] = seededBetsSource.map(
  ([id, placedAt, sport, league, gameId, playerId, marketType, side, line, oddsAmerican, sportsbookId, stake, result, closingLine, clvValue, notes, tagsJson, isLive]) => ({
    id,
    userId: "user_demo",
    placedAt,
    sport,
    league,
    gameId,
    playerId,
    marketType,
    side,
    line,
    oddsAmerican,
    sportsbookId,
    stake,
    toWin: calculateToWin(stake * 50, oddsAmerican) / 50,
    result,
    closingLine,
    clvValue,
    notes,
    tagsJson: [...tagsJson],
    isLive,
    createdAt: timestamps.created,
    updatedAt: timestamps.updated
  })
);

const savedTrends: SavedTrendRecord[] = [
  {
    id: "trend_home_favorites",
    userId: "user_demo",
    name: "Home Favorites, Low Total",
    sport: "BASKETBALL",
    queryJson: { league: "NBA", side: "favorite", totalMax: 220, minSample: 50 },
    createdAt: timestamps.created,
    updatedAt: timestamps.updated
  }
];

const trendRuns: TrendRunRecord[] = [
  {
    id: "trend_run_1",
    savedTrendId: "trend_home_favorites",
    userId: "user_demo",
    queryJson: { league: "NBA", side: "favorite", totalMax: 220, minSample: 50 },
    resultJson: { hitRate: 56.8, roi: 4.2, sampleSize: 186, averageMargin: 3.1 },
    createdAt: "2026-03-23T12:20:00.000Z"
  }
];

const builtGameMarkets = buildGameMarkets();
const builtPropMarkets = buildPropMarkets();

export const mockDatabase: MockDatabase = {
  leagues,
  teams,
  players,
  games,
  sportsbooks,
  markets: [...builtGameMarkets.markets, ...builtPropMarkets.markets],
  marketSnapshots: [...builtGameMarkets.snapshots, ...builtPropMarkets.snapshots],
  teamGameStats,
  playerGameStats,
  injuries,
  users,
  bets,
  savedTrends,
  trendRuns,
  standings,
  previousGames,
  gameAngles,
  propAngles
};

export function buildMockDatabase() {
  return mockDatabase;
}

export function getTeamName(teamId: string) {
  return teamById.get(teamId)?.name ?? teamId;
}
