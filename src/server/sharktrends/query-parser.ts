import { sharkTrendFilterZodSchema, type SharkTrendFilter, type SharkTrendParsedQuery } from "./types";

const TEAM_ALIASES = ([
  ["arizona diamondbacks", "Arizona Diamondbacks"], ["diamondbacks", "Arizona Diamondbacks"], ["dbacks", "Arizona Diamondbacks"],
  ["atlanta braves", "Atlanta Braves"], ["braves", "Atlanta Braves"],
  ["baltimore orioles", "Baltimore Orioles"], ["orioles", "Baltimore Orioles"],
  ["boston red sox", "Boston Red Sox"], ["red sox", "Boston Red Sox"],
  ["chicago cubs", "Chicago Cubs"], ["cubs", "Chicago Cubs"],
  ["chicago white sox", "Chicago White Sox"], ["white sox", "Chicago White Sox"],
  ["cincinnati reds", "Cincinnati Reds"], ["reds", "Cincinnati Reds"],
  ["cleveland guardians", "Cleveland Guardians"], ["guardians", "Cleveland Guardians"],
  ["colorado rockies", "Colorado Rockies"], ["rockies", "Colorado Rockies"],
  ["detroit tigers", "Detroit Tigers"], ["tigers", "Detroit Tigers"],
  ["houston astros", "Houston Astros"], ["astros", "Houston Astros"],
  ["kansas city royals", "Kansas City Royals"], ["royals", "Kansas City Royals"],
  ["los angeles angels", "Los Angeles Angels"], ["angels", "Los Angeles Angels"],
  ["los angeles dodgers", "Los Angeles Dodgers"], ["dodgers", "Los Angeles Dodgers"],
  ["miami marlins", "Miami Marlins"], ["marlins", "Miami Marlins"],
  ["milwaukee brewers", "Milwaukee Brewers"], ["brewers", "Milwaukee Brewers"],
  ["minnesota twins", "Minnesota Twins"], ["twins", "Minnesota Twins"],
  ["new york mets", "New York Mets"], ["mets", "New York Mets"],
  ["new york yankees", "New York Yankees"], ["yankees", "New York Yankees"],
  ["athletics", "Athletics"], ["oakland athletics", "Athletics"],
  ["philadelphia phillies", "Philadelphia Phillies"], ["phillies", "Philadelphia Phillies"],
  ["pittsburgh pirates", "Pittsburgh Pirates"], ["pirates", "Pittsburgh Pirates"],
  ["san diego padres", "San Diego Padres"], ["padres", "San Diego Padres"],
  ["san francisco giants", "San Francisco Giants"], ["giants", "San Francisco Giants"],
  ["seattle mariners", "Seattle Mariners"], ["mariners", "Seattle Mariners"],
  ["st. louis cardinals", "St. Louis Cardinals"], ["st louis cardinals", "St. Louis Cardinals"], ["cardinals", "St. Louis Cardinals"],
  ["tampa bay rays", "Tampa Bay Rays"], ["rays", "Tampa Bay Rays"],
  ["texas rangers", "Texas Rangers"], ["rangers", "Texas Rangers"],
  ["toronto blue jays", "Toronto Blue Jays"], ["blue jays", "Toronto Blue Jays"],
  ["washington nationals", "Washington Nationals"], ["nationals", "Washington Nationals"]
] as Array<[string, string]>).sort((a, b) => b[0].length - a[0].length);

function clean(input: string) {
  return input.toLowerCase().replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
}

function parsePriceRange(text: string): Partial<SharkTrendFilter> {
  const filters: Partial<SharkTrendFilter> = {};
  const between = text.match(/-?(\d{2,4})\s*(?:to|and|-)\s*-?(\d{2,4})/);
  if (between) {
    const a = Math.abs(Number(between[1]));
    const b = Math.abs(Number(between[2]));
    filters.favoriteMinAbsPrice = Math.min(a, b);
    filters.favoriteMaxAbsPrice = Math.max(a, b);
    filters.oddsMin = -Math.max(a, b);
    filters.oddsMax = -Math.min(a, b);
    return filters;
  }
  const atLeast = text.match(/(?:at least|or higher|higher than|favorites? of)\s*-?(\d{2,4})/);
  if (atLeast) {
    const price = Math.abs(Number(atLeast[1]));
    filters.favoriteMinAbsPrice = price;
    filters.oddsMax = -price;
  }
  return filters;
}

function parseTeam(text: string) {
  for (const [alias, team] of TEAM_ALIASES) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|\\b)${escaped}(\\b|$)`).test(text)) return team;
  }
  return undefined;
}

export function parseSharkTrendQuery(input: string): SharkTrendParsedQuery {
  const text = clean(input);
  const unresolved: string[] = [];
  const filters: SharkTrendFilter = {
    league: "MLB",
    sourceKeys: ["oddsharvester_historical", "sportsbookreview_historical", "arnavsaraogi_mlb_scraper"]
  };

  const team = parseTeam(text);
  if (team) filters.team = team;
  if (/since\s+(20\d{2}|19\d{2})/.test(text)) {
    const start = Number(text.match(/since\s+(20\d{2}|19\d{2})/)?.[1]);
    const thisYear = new Date().getFullYear();
    filters.seasons = Array.from({ length: thisYear - start + 1 }, (_, i) => start + i);
  }

  if (/moneyline|ml|favorite|underdog/.test(text)) filters.marketType = "moneyline";
  if (/spread|run line|runline/.test(text)) filters.marketType = "spread";
  if (/total|over|under/.test(text)) filters.marketType = "total";
  if (/\bover\b|overs\b/.test(text)) filters.side = "OVER";
  if (/\bunder\b|unders\b/.test(text)) filters.side = "UNDER";
  if (/favorite|favored|chalk/.test(text)) filters.side = "FAVORITE";
  if (/underdog|dog\b/.test(text)) filters.side = "UNDERDOG";
  if (/\bhome\b|at wrigley|wrigley/.test(text)) filters.homeAway = "HOME";
  if (/\broad\b|away/.test(text)) filters.homeAway = "AWAY";
  if (/division/.test(text)) filters.divisionGame = true;
  if (/day game|\bday\b/.test(text)) filters.dayGame = true;
  if (/night game|\bnight\b/.test(text)) filters.nightGame = true;
  if (/wrigley/.test(text)) filters.venue = "Wrigley";
  if (/wind (?:is )?(?:blowing )?out|wind-out|wind out/.test(text)) filters.windOut = true;
  if (/wind (?:is )?(?:blowing )?in|wind-in|wind in/.test(text)) filters.windIn = true;
  const wind = text.match(/wind[^0-9]*(\d{1,2})\+?\s*mph/);
  if (wind) filters.windMphMin = Number(wind[1]);
  const runsMax = text.match(/(?:scoring|score|scored)\s+(\d+)\s+or fewer/);
  if (runsMax) filters.previousRunsScoredMax = Number(runsMax[1]);
  const lastTwo = text.match(/back-to-back|two straight|last two/);
  if (lastTwo && filters.previousRunsScoredMax !== undefined) filters.lastTwoRunsScoredMax = filters.previousRunsScoredMax * 2;
  const rest = text.match(/(\d+)\s*days? rest|on\s*(\d+)\s*days? rest/);
  if (rest) {
    const value = Number(rest[1] ?? rest[2]);
    filters.daysRestMin = value;
    filters.daysRestMax = value;
  }
  Object.assign(filters, parsePriceRange(text));
  const totalRange = text.match(/total\s*(?:under|below|<=?)\s*(\d+(?:\.5)?)/);
  if (totalRange) filters.totalMax = Number(totalRange[1]);

  if (!filters.marketType) filters.marketType = filters.side === "OVER" || filters.side === "UNDER" ? "total" : "moneyline";
  if (/travel/.test(text)) unresolved.push("travel spot requires built travel context");
  if (/bullpen/.test(text)) unresolved.push("bullpen stress requires Retrosheet pitcher context enrichment");
  if (/coach|manager/.test(text)) unresolved.push("manager/coach style is not currently stored in MLB context");

  const confidence = unresolved.length ? "medium" : team || filters.side || filters.homeAway ? "high" : "low";
  return {
    input,
    confidence,
    filters: sharkTrendFilterZodSchema.parse(filters),
    unresolved,
    explanation: `Parsed ${filters.marketType ?? "MLB"} trend${team ? ` for ${team}` : ""}.`
  };
}
