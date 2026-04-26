import type {
  TrendExplanationView,
  TrendFilters,
  TrendParsedQueryView
} from "@/lib/types/domain";

const SPORT_KEYWORDS: Array<{
  pattern: RegExp;
  sport: TrendFilters["sport"];
  league?: TrendFilters["league"];
}> = [
  { pattern: /\bnba\b/i, sport: "BASKETBALL", league: "NBA" },
  { pattern: /\bncaab\b|\bcollege basketball\b|\bmens college basketball\b/i, sport: "BASKETBALL" },
  { pattern: /\bmlb\b|\bbaseball\b/i, sport: "BASEBALL", league: "MLB" },
  { pattern: /\bnhl\b|\bhockey\b/i, sport: "HOCKEY", league: "NHL" },
  { pattern: /\bnfl\b/i, sport: "FOOTBALL", league: "NFL" },
  { pattern: /\bncaaf\b|\bcollege football\b/i, sport: "FOOTBALL", league: "NCAAF" },
  { pattern: /\bufc\b|\bmma\b/i, sport: "MMA", league: "UFC" },
  { pattern: /\bboxing\b|\bboxer\b/i, sport: "BOXING", league: "BOXING" }
];

const MARKET_KEYWORDS: Array<{
  pattern: RegExp;
  market: TrendFilters["market"];
  side?: TrendFilters["side"];
}> = [
  { pattern: /\bats\b|\bagainst the spread\b|\bspread\b/i, market: "spread" },
  { pattern: /\bmoneyline\b|\bml\b/i, market: "moneyline" },
  { pattern: /\bover\b/i, market: "total", side: "OVER" },
  { pattern: /\bunder\b/i, market: "total", side: "UNDER" },
  { pattern: /\bplayer points\b|\bpoints prop\b/i, market: "player_points" },
  { pattern: /\bplayer rebounds\b|\brebounds prop\b/i, market: "player_rebounds" },
  { pattern: /\bplayer assists\b|\bassists prop\b/i, market: "player_assists" },
  { pattern: /\bthrees\b|\b3pt\b|\bthree pointers\b/i, market: "player_threes" },
  { pattern: /\bfight winner\b|\bwinner\b/i, market: "fight_winner" },
  { pattern: /\bmethod\b|\bmethod of victory\b/i, market: "method_of_victory" },
  { pattern: /\bround total\b/i, market: "round_total" },
  { pattern: /\bround winner\b/i, market: "round_winner" }
];

export const TREND_QUERY_EXAMPLES = [
  "Show me NBA road underdogs after a loss",
  "Find NCAAB under trends with at least 20 games",
  "Compare Cubs vs Cardinals totals with weather context",
  'Show player points prop tape for "Jalen Brunson" vs "Tyrese Maxey"',
  "Show today's NHL games matching over systems",
  "Show UFC fighters with finish trends"
] as const;

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function getQuotedSubject(input: string) {
  const match = input.match(/"([^"]+)"/);
  return match?.[1]?.trim() ?? null;
}

function parseWindow(input: string): TrendFilters["window"] | null {
  if (/last\s+30\s+days|\b30d\b/i.test(input)) return "30d";
  if (/last\s+90\s+days|\b90d\b/i.test(input)) return "90d";
  if (/last\s+(365|12\s+months|year)\b|\b365d\b/i.test(input)) return "365d";
  if (/all\s+history|all\s+time|last\s+\d+\s+seasons?/i.test(input)) return "all";
  return null;
}

function parseSample(input: string) {
  const sampleMatch = input.match(/(?:at least|min(?:imum)?|sample(?: size)?)\s+(\d{1,3})/i);
  if (!sampleMatch) return null;
  const value = Number(sampleMatch[1]);
  return Number.isFinite(value) ? Math.min(100, Math.max(1, value)) : null;
}

function parseOpponent(input: string) {
  const quotedMatch = input.match(/\b(?:vs|versus|against)\s+"([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();

  const match = input.match(/\b(?:vs|versus|against)\s+([a-z0-9 .'-]+)/i);
  return match?.[1]?.trim() ?? null;
}

function parseRole(input: string): TrendFilters["side"] | null {
  if (/\broad\b|\baway\b/i.test(input)) return "AWAY";
  if (/\bhome\b/i.test(input)) return "HOME";
  if (/\bfavorite\b|\bfaves?\b/i.test(input)) return "FAVORITE";
  if (/\bunderdog\b|\bdogs?\b/i.test(input)) return "UNDERDOG";
  return null;
}

function parseExplicitSubject(input: string) {
  const teamMatch = input.match(/\bteam\s+([a-z0-9 .'-]+)/i);
  const playerMatch = input.match(/\bplayer\s+([a-z0-9 .'-]+)/i);
  const fighterMatch = input.match(/\bfighter\s+([a-z0-9 .'-]+)/i);

  return {
    team: teamMatch?.[1]?.trim() ?? null,
    player: playerMatch?.[1]?.trim() ?? null,
    fighter: fighterMatch?.[1]?.trim() ?? null
  };
}

export function parseTrendAiQuery(
  input: string,
  fallback: TrendFilters
): TrendParsedQueryView | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parsed: TrendFilters = { ...fallback };
  const unresolved: string[] = [];

  const sportKeyword = SPORT_KEYWORDS.find(({ pattern }) => pattern.test(trimmed));
  if (sportKeyword) {
    parsed.sport = sportKeyword.sport;
    if (sportKeyword.league) {
      parsed.league = sportKeyword.league;
    }
  }

  const marketKeyword = MARKET_KEYWORDS.find(({ pattern }) => pattern.test(trimmed));
  if (marketKeyword) {
    parsed.market = marketKeyword.market;
    if (marketKeyword.side) {
      parsed.side = marketKeyword.side;
    }
  }

  const parsedRole = parseRole(trimmed);
  if (parsedRole) {
    parsed.side = parsedRole;
  }

  const window = parseWindow(trimmed);
  if (window) {
    parsed.window = window;
  }

  const sample = parseSample(trimmed);
  if (sample) {
    parsed.sample = sample;
  }

  const opponent = parseOpponent(trimmed);
  if (opponent) {
    parsed.opponent = opponent;
  }

  const explicitSubject = parseExplicitSubject(trimmed);
  if (explicitSubject.team) parsed.team = explicitSubject.team;
  if (explicitSubject.player) parsed.player = explicitSubject.player;
  if (explicitSubject.fighter) parsed.fighter = explicitSubject.fighter;

  const quotedSubject = getQuotedSubject(trimmed);
  if (quotedSubject) {
    if (parsed.sport === "MMA" || parsed.league === "UFC" || parsed.league === "BOXING") {
      parsed.fighter = quotedSubject;
    } else if (parsed.market.startsWith("player_")) {
      parsed.player = quotedSubject;
    } else {
      parsed.team = quotedSubject;
    }
  }

  if (/after a loss|off a loss/i.test(trimmed)) {
    unresolved.push("after a loss");
  }
  if (/\bweather\b|\bwind\b|\brain\b|\bcold\b|\bheat\b|\bhumidity\b|\broof\b/i.test(trimmed)) {
    unresolved.push("live weather bucket");
  }
  if (/\bplayer\s+vs\s+player\b|\bprop tape\b/i.test(trimmed)) {
    unresolved.push("player-vs-player stat settlement");
  }
  if (/last \d+ seasons?/i.test(trimmed)) {
    unresolved.push("season-level slicing");
  }
  if (/profitable/i.test(trimmed)) {
    unresolved.push("profitability threshold");
  }

  const confidence: TrendParsedQueryView["confidence"] =
    sportKeyword && marketKeyword ? "high" : sportKeyword || marketKeyword ? "medium" : "low";

  return {
    input: trimmed,
    confidence,
    note:
      unresolved.length
        ? `SharkEdge mapped the query into real trend filters and left unsupported phrases visible for manual correction: ${unresolved.join(", ")}.`
        : "SharkEdge translated the request into real stored-data trend filters. Edit any field in power mode if you want tighter control.",
    parsedFilters: parsed,
    unresolved
  };
}

export function buildTrendExplanation(args: {
  headline: string;
  sampleSize: number;
  roi: string | null;
  hitRate: string | null;
  querySummary: string;
  sampleNote: string | null;
}): TrendExplanationView {
  const sampleCaution =
    args.sampleSize < 10
      ? "Small samples can swing hard and should be treated as context, not a signal to auto-fire a bet."
      : "This trend has enough history to be useful context, but it is still not a predictive guarantee.";

  return {
    headline: args.headline,
    whyItMatters:
      args.roi || args.hitRate
        ? `ROI ${args.roi ?? "Unavailable"} and hit rate ${args.hitRate ?? "Unavailable"} help separate a loud story from a pattern that has actually held up in the stored sample.`
        : "This trend still matters as context, but SharkEdge is not inventing ROI or hit-rate precision where the stored sample cannot support it.",
    caution: args.sampleNote ?? sampleCaution,
    queryLogic: `Current query logic: ${args.querySummary}`
  };
}
