/**
 * SharkEdge Trends — Context Variable Engine
 *
 * Computes MIT-level situational variables for every historical market row
 * and every upcoming game. These variables are used to:
 *   1. Enrich trend filters (e.g. "road underdogs in cold weather")
 *   2. Score trend confidence with situational adjustments
 *   3. Surface the most predictive variables in the UI
 *
 * Variable families:
 *   - Schedule stress (rest days, back-to-back, travel distance)
 *   - Market structure (line value, CLV delta, sharp vs. public split)
 *   - Situational (home/away, favorite/underdog, division game)
 *   - Weather (outdoor sports: wind, temp, precipitation)
 *   - Momentum (streak, recent form, last-game margin)
 *   - Referee / umpire tendencies (total pace, foul rate)
 *   - Closing line value (beat/missed closing line)
 */

export type ScheduleStressContext = {
  /** Days of rest before this game (0 = back-to-back) */
  restDays: number | null;
  /** True if team played yesterday */
  isBackToBack: boolean;
  /** True if team played 2 of last 3 nights */
  isSecondInThreeNights: boolean;
  /** Estimated travel miles from last game city */
  travelMiles: number | null;
  /** True if team crossed 2+ time zones */
  significantTimezoneShift: boolean;
};

export type MarketStructureContext = {
  /** Opening line value */
  openingLine: number | null;
  /** Closing line value */
  closingLine: number | null;
  /** Line movement direction: positive = moved toward this side */
  lineMovementDelta: number | null;
  /** True if line moved >= 1.5 points (sharp steam indicator) */
  isSteamMove: boolean;
  /** Opening implied probability (vig-stripped) */
  openingFairProb: number | null;
  /** Closing implied probability (vig-stripped) */
  closingFairProb: number | null;
  /** CLV delta: positive = beat the closing line */
  clvDelta: number | null;
  /** True if this side beat the closing line */
  beatClosingLine: boolean;
  /** Number of books offering this line */
  bookCount: number | null;
  /** Market disagreement score 0-1 (high = books disagree) */
  marketDisagreement: number | null;
};

export type SituationalContext = {
  /** Home or away */
  side: "HOME" | "AWAY" | "NEUTRAL" | null;
  /** Favorite, underdog, or pick-em */
  marketRole: "FAVORITE" | "UNDERDOG" | "PICK" | null;
  /** Spread value (negative = favored) */
  spreadValue: number | null;
  /** True if spread is within 3 points (close game) */
  isCloseGame: boolean;
  /** True if spread is 7+ (blowout territory) */
  isLargeSpread: boolean;
  /** True if division/conference game */
  isDivisionGame: boolean | null;
  /** True if playoff / postseason game */
  isPlayoff: boolean;
  /** Day of week (0=Sun, 6=Sat) */
  dayOfWeek: number | null;
  /** True if primetime game (7pm+ local) */
  isPrimetime: boolean;
  /** Month of season (1-12) */
  month: number | null;
  /** True if late season (final 20% of regular season games) */
  isLateSeason: boolean;
};

export type WeatherContext = {
  /** Applicable only for outdoor sports (NFL, NCAAF, MLB) */
  applicable: boolean;
  /** Temperature in Fahrenheit */
  tempF: number | null;
  /** Wind speed in mph */
  windMph: number | null;
  /** Wind direction */
  windDirection: string | null;
  /** True if wind >= 15 mph (affects passing/kicking games) */
  isWindy: boolean;
  /** True if wind >= 20 mph (significant total suppressor) */
  isHighWind: boolean;
  /** True if temp <= 32°F */
  isFreezing: boolean;
  /** True if temp <= 20°F (extreme cold) */
  isExtremeCold: boolean;
  /** Precipitation type: none, rain, snow */
  precipitation: "none" | "rain" | "snow" | null;
  /** True if precipitation expected */
  hasPrecipitation: boolean;
  /** Composite weather impact score 0-100 (higher = more suppressive) */
  weatherImpactScore: number;
};

export type MomentumContext = {
  /** Win/loss streak length (positive = wins, negative = losses) */
  streakLength: number | null;
  /** True if on a winning streak of 3+ */
  isHotStreak: boolean;
  /** True if on a losing streak of 3+ */
  isColdStreak: boolean;
  /** Last game margin (positive = won by, negative = lost by) */
  lastGameMargin: number | null;
  /** True if won last game by 10+ */
  isComingOffBlowoutWin: boolean;
  /** True if lost last game by 10+ */
  isComingOffBlowoutLoss: boolean;
  /** ATS record last 5 games (0-5) */
  atsLast5: number | null;
  /** O/U record last 5 games (0-5) */
  ouLast5: number | null;
};

export type CLVContext = {
  /** True if this bet beat the closing line */
  beatClosingLine: boolean;
  /** CLV in percentage points */
  clvPct: number | null;
  /** True if CLV > 2% (strong beat) */
  isStrongCLV: boolean;
  /** True if CLV < -2% (missed badly) */
  isBadCLV: boolean;
};

export type TrendContextVariables = {
  schedule: ScheduleStressContext;
  market: MarketStructureContext;
  situational: SituationalContext;
  weather: WeatherContext;
  momentum: MomentumContext;
  clv: CLVContext;
  /** Composite edge score 0-100 combining all variable families */
  compositeEdgeScore: number;
  /** Top 3 most predictive variables for this row */
  topSignals: string[];
};

// ---------------------------------------------------------------------------
// Outdoor sports that have weather context
// ---------------------------------------------------------------------------
const OUTDOOR_SPORTS = new Set(["FOOTBALL", "BASEBALL"]);
const OUTDOOR_LEAGUES = new Set(["NFL", "NCAAF", "MLB"]);

export function isOutdoorSport(sport: string, leagueKey?: string) {
  return OUTDOOR_SPORTS.has(sport?.toUpperCase()) || OUTDOOR_LEAGUES.has(leagueKey?.toUpperCase() ?? "");
}

// ---------------------------------------------------------------------------
// Weather impact scoring
// ---------------------------------------------------------------------------
export function computeWeatherImpactScore(ctx: Omit<WeatherContext, "weatherImpactScore" | "applicable">) {
  if (!ctx.applicable) return 0;
  let score = 0;
  // Wind
  if (ctx.windMph !== null) {
    if (ctx.windMph >= 25) score += 35;
    else if (ctx.windMph >= 20) score += 25;
    else if (ctx.windMph >= 15) score += 15;
    else if (ctx.windMph >= 10) score += 5;
  }
  // Temperature
  if (ctx.tempF !== null) {
    if (ctx.tempF <= 20) score += 30;
    else if (ctx.tempF <= 32) score += 20;
    else if (ctx.tempF <= 40) score += 10;
    else if (ctx.tempF >= 95) score += 8; // extreme heat
  }
  // Precipitation
  if (ctx.precipitation === "snow") score += 25;
  else if (ctx.precipitation === "rain") score += 10;
  return Math.min(100, score);
}

// ---------------------------------------------------------------------------
// Build weather context from raw data (from weather API or stored metadata)
// ---------------------------------------------------------------------------
export function buildWeatherContext(
  raw: {
    tempF?: number | null;
    windMph?: number | null;
    windDirection?: string | null;
    precipitation?: string | null;
  } | null,
  sport: string,
  leagueKey?: string
): WeatherContext {
  const applicable = isOutdoorSport(sport, leagueKey);

  if (!applicable || !raw) {
    return {
      applicable,
      tempF: null,
      windMph: null,
      windDirection: null,
      isWindy: false,
      isHighWind: false,
      isFreezing: false,
      isExtremeCold: false,
      precipitation: null,
      hasPrecipitation: false,
      weatherImpactScore: 0
    };
  }

  const tempF = raw.tempF ?? null;
  const windMph = raw.windMph ?? null;
  const windDirection = raw.windDirection ?? null;
  const precipRaw = (raw.precipitation ?? "none").toLowerCase();
  const precipitation: WeatherContext["precipitation"] =
    precipRaw.includes("snow") ? "snow" : precipRaw.includes("rain") ? "rain" : "none";

  const partial = {
    applicable,
    tempF,
    windMph,
    windDirection,
    isWindy: windMph !== null && windMph >= 15,
    isHighWind: windMph !== null && windMph >= 20,
    isFreezing: tempF !== null && tempF <= 32,
    isExtremeCold: tempF !== null && tempF <= 20,
    precipitation,
    hasPrecipitation: precipitation !== "none"
  };

  return {
    ...partial,
    weatherImpactScore: computeWeatherImpactScore(partial)
  };
}

// ---------------------------------------------------------------------------
// Build market structure context from historical row data
// ---------------------------------------------------------------------------
export function buildMarketStructureContext(args: {
  openingLine: number | null;
  closingLine: number | null;
  openingOdds: number | null;
  closingOdds: number | null;
  offeredOdds: number | null;
  bookCount?: number | null;
  marketDisagreement?: number | null;
}): MarketStructureContext {
  const lineMovementDelta =
    args.openingLine !== null && args.closingLine !== null
      ? Number((args.closingLine - args.openingLine).toFixed(2))
      : null;

  const isSteamMove = lineMovementDelta !== null && Math.abs(lineMovementDelta) >= 1.5;

  // Vig-stripped fair probabilities from American odds
  function fairProb(odds: number | null): number | null {
    if (odds === null) return null;
    const implied = odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
    return Number(implied.toFixed(6));
  }

  const openingFairProb = fairProb(args.openingOdds);
  const closingFairProb = fairProb(args.closingOdds);
  const offeredFairProb = fairProb(args.offeredOdds);

  const clvDelta =
    offeredFairProb !== null && closingFairProb !== null
      ? Number((offeredFairProb - closingFairProb).toFixed(6))
      : null;

  return {
    openingLine: args.openingLine,
    closingLine: args.closingLine,
    lineMovementDelta,
    isSteamMove,
    openingFairProb,
    closingFairProb,
    clvDelta,
    beatClosingLine: clvDelta !== null && clvDelta > 0,
    bookCount: args.bookCount ?? null,
    marketDisagreement: args.marketDisagreement ?? null
  };
}

// ---------------------------------------------------------------------------
// Build situational context
// ---------------------------------------------------------------------------
export function buildSituationalContext(args: {
  side: string | null;
  spreadValue: number | null;
  startTime: Date | string | null;
  isPlayoff?: boolean;
  isDivisionGame?: boolean | null;
}): SituationalContext {
  const side =
    args.side === "HOME" ? "HOME"
    : args.side === "AWAY" ? "AWAY"
    : args.side === "NEUTRAL" ? "NEUTRAL"
    : null;

  const spreadValue = args.spreadValue;
  const isCloseGame = spreadValue !== null && Math.abs(spreadValue) <= 3;
  const isLargeSpread = spreadValue !== null && Math.abs(spreadValue) >= 7;
  const marketRole: SituationalContext["marketRole"] =
    spreadValue === null ? null
    : Math.abs(spreadValue) < 0.5 ? "PICK"
    : spreadValue < 0 ? "FAVORITE"
    : "UNDERDOG";

  const startDate = args.startTime ? new Date(args.startTime) : null;
  const dayOfWeek = startDate ? startDate.getDay() : null;
  const month = startDate ? startDate.getMonth() + 1 : null;
  // Primetime: 7pm+ ET (23:00+ UTC)
  const isPrimetime = startDate ? startDate.getUTCHours() >= 23 || startDate.getUTCHours() <= 2 : false;
  // Late season heuristic: Nov-Jan for football, Aug-Sep for baseball
  const isLateSeason = month !== null && (month >= 11 || month <= 1);

  return {
    side,
    marketRole,
    spreadValue,
    isCloseGame,
    isLargeSpread,
    isDivisionGame: args.isDivisionGame ?? null,
    isPlayoff: args.isPlayoff ?? false,
    dayOfWeek,
    isPrimetime,
    month,
    isLateSeason
  };
}

// ---------------------------------------------------------------------------
// Build momentum context from recent game history
// ---------------------------------------------------------------------------
export function buildMomentumContext(args: {
  recentResults: Array<{ won: boolean; margin: number | null }>;
  atsLast5?: number | null;
  ouLast5?: number | null;
}): MomentumContext {
  const results = args.recentResults;
  if (!results.length) {
    return {
      streakLength: null,
      isHotStreak: false,
      isColdStreak: false,
      lastGameMargin: null,
      isComingOffBlowoutWin: false,
      isComingOffBlowoutLoss: false,
      atsLast5: args.atsLast5 ?? null,
      ouLast5: args.ouLast5 ?? null
    };
  }

  const lastGame = results[0];
  const lastGameMargin = lastGame?.margin ?? null;

  // Compute streak
  let streakLength = 0;
  const streakType = results[0]?.won;
  for (const result of results) {
    if (result.won !== streakType) break;
    streakLength += 1;
  }
  if (!results[0]?.won) streakLength = -streakLength;

  return {
    streakLength,
    isHotStreak: streakLength >= 3,
    isColdStreak: streakLength <= -3,
    lastGameMargin,
    isComingOffBlowoutWin: lastGameMargin !== null && lastGameMargin >= 10,
    isComingOffBlowoutLoss: lastGameMargin !== null && lastGameMargin <= -10,
    atsLast5: args.atsLast5 ?? null,
    ouLast5: args.ouLast5 ?? null
  };
}

// ---------------------------------------------------------------------------
// Build CLV context
// ---------------------------------------------------------------------------
export function buildCLVContext(args: {
  offeredOdds: number | null;
  closingOdds: number | null;
}): CLVContext {
  if (args.offeredOdds === null || args.closingOdds === null) {
    return { beatClosingLine: false, clvPct: null, isStrongCLV: false, isBadCLV: false };
  }

  function impliedProb(odds: number) {
    return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
  }

  const offeredProb = impliedProb(args.offeredOdds);
  const closingProb = impliedProb(args.closingOdds);
  const clvPct = Number(((offeredProb - closingProb) * 100).toFixed(3));

  return {
    beatClosingLine: clvPct > 0,
    clvPct,
    isStrongCLV: clvPct > 2,
    isBadCLV: clvPct < -2
  };
}

// ---------------------------------------------------------------------------
// Composite edge score — combines all variable families into 0-100
// ---------------------------------------------------------------------------
export function computeCompositeEdgeScore(ctx: Omit<TrendContextVariables, "compositeEdgeScore" | "topSignals">) {
  let score = 50; // neutral baseline

  // Market structure signals
  if (ctx.market.isSteamMove) score += 8;
  if (ctx.market.beatClosingLine) score += 6;
  if (ctx.clv.isStrongCLV) score += 8;
  if (ctx.clv.isBadCLV) score -= 8;
  if (ctx.market.marketDisagreement !== null && ctx.market.marketDisagreement > 0.5) score += 4;

  // Situational signals
  if (ctx.situational.isPlayoff) score += 5;
  if (ctx.situational.isLateSeason) score += 3;
  if (ctx.situational.isPrimetime) score += 2;

  // Momentum signals
  if (ctx.momentum.isHotStreak) score += 5;
  if (ctx.momentum.isColdStreak) score -= 5;
  if (ctx.momentum.isComingOffBlowoutWin) score += 3;
  if (ctx.momentum.isComingOffBlowoutLoss) score -= 3;

  // Schedule stress
  if (ctx.schedule.isBackToBack) score -= 6;
  if (ctx.schedule.isSecondInThreeNights) score -= 4;
  if (ctx.schedule.significantTimezoneShift) score -= 3;

  // Weather suppression (outdoor sports only)
  if (ctx.weather.applicable) {
    const weatherPenalty = Math.round(ctx.weather.weatherImpactScore * 0.15);
    score -= weatherPenalty;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ---------------------------------------------------------------------------
// Identify top signals for display
// ---------------------------------------------------------------------------
export function identifyTopSignals(ctx: Omit<TrendContextVariables, "compositeEdgeScore" | "topSignals">): string[] {
  const signals: Array<{ label: string; weight: number }> = [];

  if (ctx.market.isSteamMove) signals.push({ label: "Steam move detected", weight: 9 });
  if (ctx.clv.isStrongCLV) signals.push({ label: `Strong CLV +${ctx.clv.clvPct?.toFixed(1)}%`, weight: 9 });
  if (ctx.clv.isBadCLV) signals.push({ label: `Missed closing line ${ctx.clv.clvPct?.toFixed(1)}%`, weight: 8 });
  if (ctx.market.beatClosingLine && !ctx.clv.isStrongCLV) signals.push({ label: "Beat closing line", weight: 6 });
  if (ctx.schedule.isBackToBack) signals.push({ label: "Back-to-back fatigue", weight: 7 });
  if (ctx.schedule.isSecondInThreeNights) signals.push({ label: "2nd in 3 nights", weight: 5 });
  if (ctx.schedule.significantTimezoneShift) signals.push({ label: "Timezone shift", weight: 4 });
  if (ctx.momentum.isHotStreak) signals.push({ label: `Hot streak W${ctx.momentum.streakLength}`, weight: 5 });
  if (ctx.momentum.isColdStreak) signals.push({ label: `Cold streak L${Math.abs(ctx.momentum.streakLength ?? 0)}`, weight: 5 });
  if (ctx.momentum.isComingOffBlowoutWin) signals.push({ label: "Coming off blowout win", weight: 3 });
  if (ctx.momentum.isComingOffBlowoutLoss) signals.push({ label: "Coming off blowout loss", weight: 3 });
  if (ctx.weather.isHighWind) signals.push({ label: `High wind ${ctx.weather.windMph}mph`, weight: 8 });
  else if (ctx.weather.isWindy) signals.push({ label: `Windy ${ctx.weather.windMph}mph`, weight: 5 });
  if (ctx.weather.isFreezing) signals.push({ label: `Freezing ${ctx.weather.tempF}°F`, weight: 6 });
  if (ctx.weather.precipitation === "snow") signals.push({ label: "Snow game", weight: 7 });
  else if (ctx.weather.precipitation === "rain") signals.push({ label: "Rain game", weight: 4 });
  if (ctx.situational.isPlayoff) signals.push({ label: "Playoff game", weight: 5 });
  if (ctx.situational.isLateSeason) signals.push({ label: "Late season", weight: 3 });
  if (ctx.situational.isDivisionGame) signals.push({ label: "Division game", weight: 3 });
  if (ctx.market.marketDisagreement !== null && ctx.market.marketDisagreement > 0.6) {
    signals.push({ label: "High book disagreement", weight: 4 });
  }

  return signals
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((s) => s.label);
}

// ---------------------------------------------------------------------------
// Master builder — assembles all context from available data
// ---------------------------------------------------------------------------
export function buildTrendContextVariables(args: {
  side: string | null;
  sport: string;
  leagueKey?: string;
  startTime: Date | string | null;
  openingLine: number | null;
  closingLine: number | null;
  openingOdds: number | null;
  closingOdds: number | null;
  offeredOdds: number | null;
  spreadValue?: number | null;
  bookCount?: number | null;
  marketDisagreement?: number | null;
  weather?: {
    tempF?: number | null;
    windMph?: number | null;
    windDirection?: string | null;
    precipitation?: string | null;
  } | null;
  recentResults?: Array<{ won: boolean; margin: number | null }>;
  atsLast5?: number | null;
  ouLast5?: number | null;
  restDays?: number | null;
  travelMiles?: number | null;
  isBackToBack?: boolean;
  isSecondInThreeNights?: boolean;
  significantTimezoneShift?: boolean;
  isPlayoff?: boolean;
  isDivisionGame?: boolean | null;
}): TrendContextVariables {
  const schedule: ScheduleStressContext = {
    restDays: args.restDays ?? null,
    isBackToBack: args.isBackToBack ?? (args.restDays !== null && args.restDays !== undefined && args.restDays === 0),
    isSecondInThreeNights: args.isSecondInThreeNights ?? false,
    travelMiles: args.travelMiles ?? null,
    significantTimezoneShift: args.significantTimezoneShift ?? false
  };

  const market = buildMarketStructureContext({
    openingLine: args.openingLine,
    closingLine: args.closingLine,
    openingOdds: args.openingOdds,
    closingOdds: args.closingOdds,
    offeredOdds: args.offeredOdds,
    bookCount: args.bookCount,
    marketDisagreement: args.marketDisagreement
  });

  const situational = buildSituationalContext({
    side: args.side,
    spreadValue: args.spreadValue ?? args.openingLine,
    startTime: args.startTime,
    isPlayoff: args.isPlayoff,
    isDivisionGame: args.isDivisionGame
  });

  const weather = buildWeatherContext(args.weather ?? null, args.sport, args.leagueKey);

  const momentum = buildMomentumContext({
    recentResults: args.recentResults ?? [],
    atsLast5: args.atsLast5,
    ouLast5: args.ouLast5
  });

  const clv = buildCLVContext({
    offeredOdds: args.offeredOdds,
    closingOdds: args.closingOdds
  });

  const partial = { schedule, market, situational, weather, momentum, clv };
  const compositeEdgeScore = computeCompositeEdgeScore(partial);
  const topSignals = identifyTopSignals(partial);

  return { ...partial, compositeEdgeScore, topSignals };
}

// ---------------------------------------------------------------------------
// Filter rows by context variable predicates
// Used by the trend engine to slice historical data by situational conditions
// ---------------------------------------------------------------------------
export type ContextFilter = {
  /** Only include back-to-back games */
  backToBackOnly?: boolean;
  /** Only include games with steam moves */
  steamMovesOnly?: boolean;
  /** Only include games that beat the closing line */
  beatClosingLineOnly?: boolean;
  /** Only include games with weather impact score >= threshold */
  minWeatherImpact?: number;
  /** Only include games with wind >= mph */
  minWindMph?: number;
  /** Only include games with temp <= F */
  maxTempF?: number;
  /** Only include playoff games */
  playoffOnly?: boolean;
  /** Only include division games */
  divisionOnly?: boolean;
  /** Only include late season games */
  lateSeasonOnly?: boolean;
  /** Only include primetime games */
  primetimeOnly?: boolean;
  /** Only include games on hot streak */
  hotStreakOnly?: boolean;
  /** Only include games on cold streak */
  coldStreakOnly?: boolean;
  /** Only include games with CLV >= pct */
  minCLVPct?: number;
  /** Only include games with market disagreement >= score */
  minMarketDisagreement?: number;
};

export function matchesContextFilter(ctx: TrendContextVariables, filter: ContextFilter): boolean {
  if (filter.backToBackOnly && !ctx.schedule.isBackToBack) return false;
  if (filter.steamMovesOnly && !ctx.market.isSteamMove) return false;
  if (filter.beatClosingLineOnly && !ctx.market.beatClosingLine) return false;
  if (filter.minWeatherImpact !== undefined && ctx.weather.weatherImpactScore < filter.minWeatherImpact) return false;
  if (filter.minWindMph !== undefined && (ctx.weather.windMph === null || ctx.weather.windMph < filter.minWindMph)) return false;
  if (filter.maxTempF !== undefined && (ctx.weather.tempF === null || ctx.weather.tempF > filter.maxTempF)) return false;
  if (filter.playoffOnly && !ctx.situational.isPlayoff) return false;
  if (filter.divisionOnly && !ctx.situational.isDivisionGame) return false;
  if (filter.lateSeasonOnly && !ctx.situational.isLateSeason) return false;
  if (filter.primetimeOnly && !ctx.situational.isPrimetime) return false;
  if (filter.hotStreakOnly && !ctx.momentum.isHotStreak) return false;
  if (filter.coldStreakOnly && !ctx.momentum.isColdStreak) return false;
  if (filter.minCLVPct !== undefined && (ctx.clv.clvPct === null || ctx.clv.clvPct < filter.minCLVPct)) return false;
  if (filter.minMarketDisagreement !== undefined && (ctx.market.marketDisagreement === null || ctx.market.marketDisagreement < filter.minMarketDisagreement)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Summarize context variables into human-readable signal strings
// Used by the publisher to generate "why this trend matters" copy
// ---------------------------------------------------------------------------
export function summarizeContextForDisplay(ctx: TrendContextVariables): {
  headline: string;
  bullets: string[];
  weatherNote: string | null;
  scheduleNote: string | null;
  marketNote: string | null;
} {
  const bullets: string[] = [];

  // Market
  if (ctx.market.isSteamMove) {
    bullets.push(`Line moved ${ctx.market.lineMovementDelta && ctx.market.lineMovementDelta > 0 ? "+" : ""}${ctx.market.lineMovementDelta} — sharp steam indicator.`);
  }
  if (ctx.clv.isStrongCLV) {
    bullets.push(`Beat closing line by ${ctx.clv.clvPct?.toFixed(1)}% — strong CLV signal.`);
  }
  if (ctx.market.marketDisagreement !== null && ctx.market.marketDisagreement > 0.5) {
    bullets.push(`Books disagree on this line (disagreement score ${(ctx.market.marketDisagreement * 100).toFixed(0)}%).`);
  }

  // Schedule
  if (ctx.schedule.isBackToBack) bullets.push("Team is on a back-to-back.");
  else if (ctx.schedule.isSecondInThreeNights) bullets.push("2nd game in 3 nights.");
  if (ctx.schedule.significantTimezoneShift) bullets.push("Significant timezone shift from last game.");

  // Momentum
  if (ctx.momentum.isHotStreak) bullets.push(`On a ${ctx.momentum.streakLength}-game winning streak.`);
  if (ctx.momentum.isColdStreak) bullets.push(`On a ${Math.abs(ctx.momentum.streakLength ?? 0)}-game losing streak.`);
  if (ctx.momentum.isComingOffBlowoutLoss) bullets.push("Coming off a blowout loss — bounce-back spot.");

  // Situational
  if (ctx.situational.isPlayoff) bullets.push("Playoff game — elevated variance.");
  if (ctx.situational.isDivisionGame) bullets.push("Division game — tighter spreads historically.");
  if (ctx.situational.isLateSeason) bullets.push("Late season — motivation and rest factors elevated.");

  const weatherNote = ctx.weather.applicable && ctx.weather.weatherImpactScore > 10
    ? [
        ctx.weather.isHighWind ? `High wind (${ctx.weather.windMph}mph)` : ctx.weather.isWindy ? `Windy (${ctx.weather.windMph}mph)` : null,
        ctx.weather.isFreezing ? `Freezing (${ctx.weather.tempF}°F)` : null,
        ctx.weather.precipitation !== "none" ? `${ctx.weather.precipitation} expected` : null
      ].filter(Boolean).join(" · ") || null
    : null;

  const scheduleNote = ctx.schedule.isBackToBack
    ? "Back-to-back"
    : ctx.schedule.isSecondInThreeNights
    ? "2nd in 3 nights"
    : ctx.schedule.restDays !== null
    ? `${ctx.schedule.restDays}d rest`
    : null;

  const marketNote = ctx.market.isSteamMove
    ? `Steam move (${ctx.market.lineMovementDelta && ctx.market.lineMovementDelta > 0 ? "+" : ""}${ctx.market.lineMovementDelta})`
    : ctx.clv.isStrongCLV
    ? `CLV +${ctx.clv.clvPct?.toFixed(1)}%`
    : null;

  const headline = ctx.topSignals.length
    ? ctx.topSignals[0]
    : `Edge score ${ctx.compositeEdgeScore}/100`;

  return { headline, bullets, weatherNote, scheduleNote, marketNote };
}
