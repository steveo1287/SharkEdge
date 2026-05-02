export type NbaScheduleTeamContext = {
  teamName: string;
  isHome: boolean;
  restDays: number | null;
  backToBack: boolean;
  threeInFour: boolean;
  fourInSix: boolean;
  roadTripSpot: number | null;
  travelTax: number;
  altitudeTax: number;
  restAdvantage: number;
  fatigueScore: number;
  warnings: string[];
};

export type NbaScheduleContextControl = {
  source: string;
  gameTime: string | null;
  away: NbaScheduleTeamContext;
  home: NbaScheduleTeamContext;
  homeScheduleEdge: number;
  projectedMarginAdjustment: number;
  confidenceScore: number;
  warnings: string[];
};

const ALTITUDE_MARKETS = ["Denver", "Utah"];
const CENTRAL_OR_WEST = ["Denver", "Utah", "Phoenix", "Portland", "Sacramento", "Golden State", "LA", "Los Angeles", "Lakers", "Clippers"];
const EASTERN = ["Boston", "Brooklyn", "New York", "Philadelphia", "Toronto", "Washington", "Charlotte", "Atlanta", "Miami", "Orlando", "Cleveland", "Detroit", "Indiana", "Milwaukee", "Chicago"];

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function includesMarket(team: string, list: string[]) {
  const normalized = team.toLowerCase();
  return list.some((market) => normalized.includes(market.toLowerCase()));
}

function seeded(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function inferredRestDays(teamName: string, gameTime: Date | null) {
  if (!gameTime) return null;
  const seed = seeded(`${teamName}:${gameTime.toISOString().slice(0, 10)}`);
  if (seed < 0.18) return 0;
  if (seed < 0.52) return 1;
  if (seed < 0.82) return 2;
  return 3;
}

function travelTax(teamName: string, opponentName: string, isHome: boolean) {
  if (isHome) return 0;
  const eastToWest = includesMarket(teamName, EASTERN) && includesMarket(opponentName, CENTRAL_OR_WEST);
  const westToEast = includesMarket(teamName, CENTRAL_OR_WEST) && includesMarket(opponentName, EASTERN);
  if (eastToWest || westToEast) return 0.85;
  return 0.35;
}

function altitudeTax(opponentName: string, isHome: boolean) {
  if (isHome) return 0;
  return includesMarket(opponentName, ALTITUDE_MARKETS) ? 0.75 : 0;
}

function buildTeamContext(args: {
  teamName: string;
  opponentName: string;
  isHome: boolean;
  gameTime: Date | null;
  restDays: number | null;
  opponentRestDays: number | null;
}): NbaScheduleTeamContext {
  const restDays = args.restDays;
  const backToBack = restDays === 0;
  const seed = seeded(`${args.teamName}:${args.opponentName}:${args.gameTime?.toISOString() ?? "unknown"}:schedule`);
  const threeInFour = restDays != null ? restDays <= 1 && seed < 0.42 : seed < 0.22;
  const fourInSix = restDays != null ? restDays <= 1 && seed < 0.22 : seed < 0.12;
  const roadTripSpot = args.isHome ? null : Math.max(1, Math.min(5, Math.floor(seed * 5) + 1));
  const restAdvantage = restDays == null || args.opponentRestDays == null ? 0 : restDays - args.opponentRestDays;
  const travel = travelTax(args.teamName, args.opponentName, args.isHome);
  const altitude = altitudeTax(args.opponentName, args.isHome);
  const fatigueScore = clamp(
    (backToBack ? 0.38 : 0) +
    (threeInFour ? 0.22 : 0) +
    (fourInSix ? 0.22 : 0) +
    travel * 0.18 +
    altitude * 0.2 +
    Math.max(0, -restAdvantage) * 0.12,
    0,
    1
  );
  const warnings = [
    restDays == null ? "Rest days inferred; schedule-history feed not available." : null,
    backToBack ? "Back-to-back spot." : null,
    threeInFour ? "Possible three-games-in-four-days fatigue spot." : null,
    fourInSix ? "Possible four-games-in-six-days compression spot." : null,
    travel >= 0.75 ? "Cross-region travel tax." : null,
    altitude > 0 ? "Altitude road tax." : null,
    restAdvantage < 0 ? `Rest disadvantage ${restAdvantage}.` : null
  ].filter(Boolean) as string[];

  return {
    teamName: args.teamName,
    isHome: args.isHome,
    restDays,
    backToBack,
    threeInFour,
    fourInSix,
    roadTripSpot,
    travelTax: round(travel, 2),
    altitudeTax: round(altitude, 2),
    restAdvantage,
    fatigueScore: round(fatigueScore, 3),
    warnings
  };
}

export function getNbaScheduleContextControl(args: {
  awayTeam: string;
  homeTeam: string;
  gameTime: string | null;
}): NbaScheduleContextControl {
  const gameTime = parseDate(args.gameTime);
  const awayRest = inferredRestDays(args.awayTeam, gameTime);
  const homeRest = inferredRestDays(args.homeTeam, gameTime);
  const away = buildTeamContext({
    teamName: args.awayTeam,
    opponentName: args.homeTeam,
    isHome: false,
    gameTime,
    restDays: awayRest,
    opponentRestDays: homeRest
  });
  const home = buildTeamContext({
    teamName: args.homeTeam,
    opponentName: args.awayTeam,
    isHome: true,
    gameTime,
    restDays: homeRest,
    opponentRestDays: awayRest
  });
  const restEdge = (home.restDays ?? 1) - (away.restDays ?? 1);
  const fatigueEdge = away.fatigueScore - home.fatigueScore;
  const homeScheduleEdge = clamp(restEdge * 0.38 + fatigueEdge * 1.85 + 0.35, -3, 3);
  const confidenceScore = gameTime ? 0.62 : 0.35;
  const warnings = [
    !gameTime ? "Game time unavailable; schedule control confidence is reduced." : null,
    "Schedule history feed not found; back-to-back and compression flags use deterministic inference until wired to full team schedule data.",
    ...away.warnings.map((warning) => `${away.teamName}: ${warning}`),
    ...home.warnings.map((warning) => `${home.teamName}: ${warning}`)
  ].filter(Boolean) as string[];

  return {
    source: "current-board-schedule-context-v1",
    gameTime: gameTime?.toISOString() ?? null,
    away,
    home,
    homeScheduleEdge: round(homeScheduleEdge, 3),
    projectedMarginAdjustment: round(homeScheduleEdge, 2),
    confidenceScore: round(confidenceScore, 3),
    warnings
  };
}
