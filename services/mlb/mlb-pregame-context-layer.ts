import { buildMlbEliteDecisionTrends, type MlbActionability, type MlbDecisionGate, type MlbEliteTrend, type MlbEliteTrendsPayload } from "./mlb-elite-decision-layer";

export type MlbRoofType = "dome" | "retractable" | "open" | "unknown";
export type MlbContextStatus = "CLEAR" | "WATCH" | "BLOCKED" | "PENDING";

export type MlbPregameContext = {
  roofType: MlbRoofType;
  weatherSensitivity: "low" | "medium" | "high" | "unknown";
  gameStartBucket: "live_or_started" | "late_lock" | "same_day" | "early" | "unknown";
  lineupStatus: MlbContextStatus;
  weatherStatus: MlbContextStatus;
  umpireStatus: MlbContextStatus;
  lineupsConfirmed: boolean;
  weatherObserved: boolean;
  homePlateUmpire: string | null;
  officialWeather: string | null;
  promotionBlockedBy: string[];
  notes: string[];
};

export type MlbPregameTrend = MlbEliteTrend & {
  pregameContext: MlbPregameContext;
};

export type MlbPregameTrendsPayload = Omit<MlbEliteTrendsPayload, "trends" | "stats"> & {
  stats: MlbEliteTrendsPayload["stats"] & {
    contextReady: number;
    contextBlocked: number;
    domeOrRetractable: number;
    lineupPending: number;
    weatherSensitive: number;
    umpirePending: number;
  };
  trends: MlbPregameTrend[];
};

type VenueProfile = {
  roofType: MlbRoofType;
  weatherSensitivity: MlbPregameContext["weatherSensitivity"];
  note: string;
};

type BoxscoreTeam = {
  battingOrder?: unknown[];
  players?: Record<string, { battingOrder?: string | number | null }>;
};

type MlbOfficialBoxscore = {
  teams?: {
    away?: BoxscoreTeam;
    home?: BoxscoreTeam;
  };
  officials?: Array<{
    officialType?: string;
    official?: { fullName?: string };
  }>;
  info?: Array<{
    label?: string;
    value?: string;
  }>;
};

type OfficialPregameTruth = {
  gamePk: number;
  awayLineupCount: number;
  homeLineupCount: number;
  lineupsConfirmed: boolean;
  homePlateUmpire: string | null;
  weather: string | null;
  wind: string | null;
  fetched: boolean;
  error: string | null;
};

const VENUE_PROFILES: Record<string, VenueProfile> = {
  "american family field": { roofType: "retractable", weatherSensitivity: "low", note: "Retractable-roof park; weather still matters only if roof status is unknown." },
  "chase field": { roofType: "retractable", weatherSensitivity: "low", note: "Retractable-roof park; roof status can neutralize weather." },
  "daikin park": { roofType: "retractable", weatherSensitivity: "low", note: "Retractable-roof park; roof status can neutralize weather." },
  "loanDepot park": { roofType: "retractable", weatherSensitivity: "low", note: "Retractable-roof park; roof status can neutralize weather." },
  "loan depot park": { roofType: "retractable", weatherSensitivity: "low", note: "Retractable-roof park; roof status can neutralize weather." },
  "minute maid park": { roofType: "retractable", weatherSensitivity: "low", note: "Retractable-roof park; roof status can neutralize weather." },
  "rogers centre": { roofType: "retractable", weatherSensitivity: "low", note: "Retractable-roof park; roof status can neutralize weather." },
  "safeco field": { roofType: "retractable", weatherSensitivity: "medium", note: "Retractable roof covers rain but leaves some air conditions relevant." },
  "t-mobile park": { roofType: "retractable", weatherSensitivity: "medium", note: "Retractable roof covers rain but leaves some air conditions relevant." },
  "tropicana field": { roofType: "dome", weatherSensitivity: "low", note: "Fixed dome; weather should not drive total/run environment decisions." },
  "globe life field": { roofType: "retractable", weatherSensitivity: "low", note: "Retractable-roof park; roof status can neutralize weather." },
  "sutter health park": { roofType: "open", weatherSensitivity: "high", note: "Open-air temporary Athletics home; wind/temperature should be checked before totals." },
  "coors field": { roofType: "open", weatherSensitivity: "high", note: "Open-air run environment; weather and park factors are material." },
  "wrigley field": { roofType: "open", weatherSensitivity: "high", note: "Open-air park with wind-sensitive run environment." },
  "oracle park": { roofType: "open", weatherSensitivity: "high", note: "Open-air marine layer/wind context can matter for totals." },
  "fenway park": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "yankee stadium": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "citi field": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "dodger stadium": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "petco park": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "progressive field": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "kauffman stadium": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "busch stadium": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "great american ball park": { roofType: "open", weatherSensitivity: "medium", note: "Open-air hitter-friendly park; weather can affect run environment." },
  "citizens bank park": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "pnc park": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "target field": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "guaranteed rate field": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "rate field": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "comerica park": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "camden yards": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "oriole park at camden yards": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "truist park": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." },
  "nationals park": { roofType: "open", weatherSensitivity: "medium", note: "Open-air park; weather can affect run environment." }
};

function normalizeVenue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function venueProfile(venue: string): VenueProfile {
  const key = normalizeVenue(venue);
  const direct = VENUE_PROFILES[key];
  if (direct) return direct;
  const fuzzy = Object.entries(VENUE_PROFILES).find(([name]) => key.includes(name) || name.includes(key))?.[1];
  return fuzzy ?? { roofType: "unknown", weatherSensitivity: "unknown", note: "Venue profile is unknown; keep weather/roof gate pending." };
}

function startBucket(startTime: string): MlbPregameContext["gameStartBucket"] {
  const start = new Date(startTime).getTime();
  if (!Number.isFinite(start)) return "unknown";
  const hours = (start - Date.now()) / (1000 * 60 * 60);
  if (hours <= 0) return "live_or_started";
  if (hours <= 2.5) return "late_lock";
  if (hours <= 18) return "same_day";
  return "early";
}

function lineupCount(team: BoxscoreTeam | undefined) {
  if (Array.isArray(team?.battingOrder)) return team?.battingOrder.length ?? 0;
  return Object.values(team?.players ?? {}).filter((player) => player?.battingOrder != null && player.battingOrder !== "").length;
}

function infoValue(info: MlbOfficialBoxscore["info"], pattern: RegExp) {
  const row = (info ?? []).find((item) => pattern.test(`${item.label ?? ""} ${item.value ?? ""}`));
  if (!row) return null;
  if (row.label && row.value) return `${row.label}: ${row.value}`;
  return row.value ?? row.label ?? null;
}

function homePlateUmpire(officials: MlbOfficialBoxscore["officials"]) {
  const row = (officials ?? []).find((official) => /home|plate/i.test(official.officialType ?? ""));
  return row?.official?.fullName ?? null;
}

async function fetchOfficialPregameTruth(gamePk: number): Promise<OfficialPregameTruth> {
  try {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`, { cache: "no-store" });
    if (!response.ok) throw new Error(`MLB boxscore ${response.status}`);
    const payload = await response.json() as MlbOfficialBoxscore;
    const awayLineupCount = lineupCount(payload.teams?.away);
    const homeLineupCount = lineupCount(payload.teams?.home);
    const weather = infoValue(payload.info, /weather|temperature|temp/i);
    const wind = infoValue(payload.info, /wind/i);
    return {
      gamePk,
      awayLineupCount,
      homeLineupCount,
      lineupsConfirmed: awayLineupCount >= 9 && homeLineupCount >= 9,
      homePlateUmpire: homePlateUmpire(payload.officials),
      weather,
      wind,
      fetched: true,
      error: null
    };
  } catch (error) {
    return {
      gamePk,
      awayLineupCount: 0,
      homeLineupCount: 0,
      lineupsConfirmed: false,
      homePlateUmpire: null,
      weather: null,
      wind: null,
      fetched: false,
      error: error instanceof Error ? error.message : "Unknown MLB boxscore error"
    };
  }
}

function lineupStatus(bucket: MlbPregameContext["gameStartBucket"], official: OfficialPregameTruth): MlbContextStatus {
  if (official.lineupsConfirmed) return "CLEAR";
  if (bucket === "live_or_started") return "BLOCKED";
  if (bucket === "late_lock") return "WATCH";
  return "PENDING";
}

function weatherStatus(profile: VenueProfile, official: OfficialPregameTruth, trend: MlbEliteTrend): MlbContextStatus {
  if (profile.roofType === "dome") return "CLEAR";
  if (profile.roofType === "unknown") return "PENDING";
  if (profile.roofType === "retractable") return official.weather || official.wind ? "WATCH" : "PENDING";
  if (official.weather || official.wind) return profile.weatherSensitivity === "high" && trend.market === "total" ? "WATCH" : "CLEAR";
  return "PENDING";
}

function umpireStatus(bucket: MlbPregameContext["gameStartBucket"], official: OfficialPregameTruth): MlbContextStatus {
  if (official.homePlateUmpire) return "CLEAR";
  if (bucket === "live_or_started") return "WATCH";
  return "PENDING";
}

function pregameGateStatus(context: MlbPregameContext): MlbDecisionGate["status"] {
  if (context.lineupStatus === "BLOCKED" || context.weatherStatus === "BLOCKED" || context.umpireStatus === "BLOCKED") return "FAIL";
  if (context.lineupStatus === "CLEAR" && context.weatherStatus === "CLEAR" && context.umpireStatus === "CLEAR") return "PASS";
  if (context.weatherStatus === "WATCH" || context.lineupStatus === "WATCH" || context.umpireStatus === "WATCH") return "WARN";
  return "PENDING";
}

function buildPregameContext(trend: MlbEliteTrend, official: OfficialPregameTruth): MlbPregameContext {
  const profile = venueProfile(trend.venue);
  const bucket = startBucket(trend.startTime);
  const lineup = lineupStatus(bucket, official);
  const weather = weatherStatus(profile, official, trend);
  const umpire = umpireStatus(bucket, official);
  const officialWeather = [official.weather, official.wind].filter(Boolean).join(" · ") || null;
  const promotionBlockedBy = [
    bucket === "live_or_started" ? "Game already started" : null,
    lineup !== "CLEAR" ? `Lineups ${lineup.toLowerCase()} (${official.awayLineupCount}/${official.homeLineupCount})` : null,
    weather !== "CLEAR" ? `Weather/roof ${weather.toLowerCase()}` : null,
    umpire !== "CLEAR" ? "Umpire pending" : null
  ].filter((item): item is string => Boolean(item));
  const notes = [
    profile.note,
    official.fetched ? "Official MLB boxscore context loaded." : `Official MLB boxscore context unavailable: ${official.error ?? "unknown error"}.`,
    official.lineupsConfirmed ? `Official lineups detected (${official.awayLineupCount}/${official.homeLineupCount}).` : `Official lineups not fully detected (${official.awayLineupCount}/${official.homeLineupCount}).`,
    officialWeather ? `Official weather: ${officialWeather}.` : null,
    official.homePlateUmpire ? `Home-plate umpire: ${official.homePlateUmpire}.` : null,
    bucket === "late_lock" ? "Game is near lock; lineup confirmation should be prioritized." : null,
    bucket === "early" ? "Game is still early; keep lineup and weather gates pending." : null,
    bucket === "live_or_started" ? "Game appears live or already started; do not promote as pregame action." : null,
    trend.market === "total" && profile.weatherSensitivity === "high" ? "High weather sensitivity matters more because this is a total/run-environment trend." : null
  ].filter((item): item is string => Boolean(item));

  return {
    roofType: profile.roofType,
    weatherSensitivity: profile.weatherSensitivity,
    gameStartBucket: bucket,
    lineupStatus: lineup,
    weatherStatus: weather,
    umpireStatus: umpire,
    lineupsConfirmed: official.lineupsConfirmed,
    weatherObserved: Boolean(official.weather || official.wind),
    homePlateUmpire: official.homePlateUmpire,
    officialWeather,
    promotionBlockedBy,
    notes
  };
}

function contextGate(context: MlbPregameContext): MlbDecisionGate {
  return {
    key: "pregame-context",
    label: "Pregame context",
    status: pregameGateStatus(context),
    note: context.promotionBlockedBy.length ? `Promotion blocked by: ${context.promotionBlockedBy.join(", ")}.` : "Pregame context is clear."
  };
}

function replaceLineupWeatherGate(gates: MlbDecisionGate[], context: MlbPregameContext) {
  const next = gates.filter((gate) => gate.key !== "lineup-weather");
  const insertAt = Math.min(2, next.length);
  next.splice(insertAt, 0, contextGate(context));
  return next;
}

function downgradedActionability(trend: MlbEliteTrend, context: MlbPregameContext, decisionScore: number): MlbActionability {
  if (context.gameStartBucket === "live_or_started") return "PASS";
  if (trend.actionability === "ACTIONABLE_CANDIDATE" && context.promotionBlockedBy.length > 0) return "PRICE_REQUIRED";
  if (decisionScore < 50) return "PASS";
  return trend.actionability;
}

function decorateTrend(trend: MlbEliteTrend, official: OfficialPregameTruth): MlbPregameTrend {
  const pregameContext = buildPregameContext(trend, official);
  const gates = replaceLineupWeatherGate(trend.gates, pregameContext);
  const pregamePenalty = pregameContext.gameStartBucket === "live_or_started" ? 20 : pregameContext.weatherSensitivity === "high" && trend.market === "total" && pregameContext.weatherStatus !== "CLEAR" ? 5 : 0;
  const decisionScore = Math.max(0, Number((trend.decisionScore - pregamePenalty).toFixed(1)));
  const actionability = downgradedActionability(trend, pregameContext, decisionScore);
  const riskFlags = [
    ...trend.riskFlags.filter((flag) => !/Lineup\/weather\/umpire not confirmed/i.test(flag)),
    ...pregameContext.promotionBlockedBy.map((blocker) => `Pregame gate: ${blocker}.`)
  ];
  const edgeStack = [
    ...trend.edgeStack,
    `Pregame: ${pregameContext.roofType} roof · ${pregameContext.weatherSensitivity} weather sensitivity · ${pregameContext.gameStartBucket}`,
    pregameContext.officialWeather ? `Weather: ${pregameContext.officialWeather}` : null,
    pregameContext.homePlateUmpire ? `Umpire: ${pregameContext.homePlateUmpire}` : null
  ].filter((item): item is string => Boolean(item));
  const decisionSummary = pregameContext.promotionBlockedBy.length
    ? `${trend.decisionSummary} Pregame promotion is still blocked by ${pregameContext.promotionBlockedBy.join(", ")}.`
    : trend.decisionSummary;

  return {
    ...trend,
    decisionScore,
    actionability,
    gates,
    riskFlags,
    edgeStack,
    decisionSummary,
    pregameContext
  };
}

function actionabilityStats(trends: MlbPregameTrend[]) {
  return {
    actionableCandidates: trends.filter((trend) => trend.actionability === "ACTIONABLE_CANDIDATE").length,
    priceRequired: trends.filter((trend) => trend.actionability === "PRICE_REQUIRED").length,
    watchlist: trends.filter((trend) => trend.actionability === "WATCHLIST").length,
    pass: trends.filter((trend) => trend.actionability === "PASS").length,
    avgDecisionScore: trends.length ? Number((trends.reduce((sum, trend) => sum + trend.decisionScore, 0) / trends.length).toFixed(1)) : 0
  };
}

export async function buildMlbPregameContextTrends(args: { date?: string } = {}): Promise<MlbPregameTrendsPayload> {
  const payload = await buildMlbEliteDecisionTrends(args);
  const truthByGamePk = new Map<number, Promise<OfficialPregameTruth>>();
  for (const trend of payload.trends) {
    if (!truthByGamePk.has(trend.gamePk)) truthByGamePk.set(trend.gamePk, fetchOfficialPregameTruth(trend.gamePk));
  }
  const resolvedTruth = new Map<number, OfficialPregameTruth>();
  await Promise.all([...truthByGamePk.entries()].map(async ([gamePk, promise]) => {
    resolvedTruth.set(gamePk, await promise);
  }));
  const trends = payload.trends.map((trend) => decorateTrend(trend, resolvedTruth.get(trend.gamePk) ?? {
    gamePk: trend.gamePk,
    awayLineupCount: 0,
    homeLineupCount: 0,
    lineupsConfirmed: false,
    homePlateUmpire: null,
    weather: null,
    wind: null,
    fetched: false,
    error: "Official context missing"
  })).sort((left, right) => right.decisionScore - left.decisionScore || right.confidence - left.confidence);
  const actionability = actionabilityStats(trends);
  return {
    ...payload,
    sourceNote: `${payload.sourceNote} Pregame context layer adds official MLB boxscore lineups, venue roof/weather sensitivity, weather/wind notes, umpire status, and promotion blockers.`,
    stats: {
      ...payload.stats,
      ...actionability,
      contextReady: trends.filter((trend) => trend.pregameContext.promotionBlockedBy.length === 0).length,
      contextBlocked: trends.filter((trend) => trend.pregameContext.promotionBlockedBy.length > 0).length,
      domeOrRetractable: trends.filter((trend) => trend.pregameContext.roofType === "dome" || trend.pregameContext.roofType === "retractable").length,
      lineupPending: trends.filter((trend) => trend.pregameContext.lineupStatus !== "CLEAR").length,
      weatherSensitive: trends.filter((trend) => trend.pregameContext.weatherSensitivity === "high").length,
      umpirePending: trends.filter((trend) => trend.pregameContext.umpireStatus !== "CLEAR").length
    },
    trends
  };
}
