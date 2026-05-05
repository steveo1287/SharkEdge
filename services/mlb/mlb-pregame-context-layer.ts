import { buildMlbEliteDecisionTrends, type MlbDecisionGate, type MlbEliteTrend, type MlbEliteTrendsPayload } from "./mlb-elite-decision-layer";

export type MlbRoofType = "dome" | "retractable" | "open" | "unknown";
export type MlbContextStatus = "CLEAR" | "WATCH" | "BLOCKED" | "PENDING";

export type MlbPregameContext = {
  roofType: MlbRoofType;
  weatherSensitivity: "low" | "medium" | "high" | "unknown";
  gameStartBucket: "live_or_started" | "late_lock" | "same_day" | "early" | "unknown";
  lineupStatus: MlbContextStatus;
  weatherStatus: MlbContextStatus;
  umpireStatus: MlbContextStatus;
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

function lineupStatus(bucket: MlbPregameContext["gameStartBucket"]): MlbContextStatus {
  if (bucket === "live_or_started") return "WATCH";
  if (bucket === "late_lock") return "WATCH";
  return "PENDING";
}

function weatherStatus(profile: VenueProfile): MlbContextStatus {
  if (profile.roofType === "dome") return "CLEAR";
  if (profile.roofType === "retractable") return "WATCH";
  return "PENDING";
}

function pregameGateStatus(context: MlbPregameContext): MlbDecisionGate["status"] {
  if (context.lineupStatus === "BLOCKED" || context.weatherStatus === "BLOCKED" || context.umpireStatus === "BLOCKED") return "FAIL";
  if (context.lineupStatus === "CLEAR" && context.weatherStatus === "CLEAR" && context.umpireStatus === "CLEAR") return "PASS";
  if (context.weatherStatus === "WATCH" || context.lineupStatus === "WATCH") return "WARN";
  return "PENDING";
}

function buildPregameContext(trend: MlbEliteTrend): MlbPregameContext {
  const profile = venueProfile(trend.venue);
  const bucket = startBucket(trend.startTime);
  const lineup = lineupStatus(bucket);
  const weather = weatherStatus(profile);
  const umpire: MlbContextStatus = "PENDING";
  const promotionBlockedBy = [
    lineup !== "CLEAR" ? `Lineups ${lineup.toLowerCase()}` : null,
    weather !== "CLEAR" ? `Weather/roof ${weather.toLowerCase()}` : null,
    umpire !== "CLEAR" ? "Umpire pending" : null
  ].filter((item): item is string => Boolean(item));
  const notes = [
    profile.note,
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

function decorateTrend(trend: MlbEliteTrend): MlbPregameTrend {
  const pregameContext = buildPregameContext(trend);
  const gates = replaceLineupWeatherGate(trend.gates, pregameContext);
  const pregamePenalty = pregameContext.gameStartBucket === "live_or_started" ? 12 : pregameContext.weatherSensitivity === "high" && trend.market === "total" ? 5 : 0;
  const decisionScore = Math.max(0, Number((trend.decisionScore - pregamePenalty).toFixed(1)));
  const riskFlags = [
    ...trend.riskFlags.filter((flag) => !/Lineup\/weather\/umpire not confirmed/i.test(flag)),
    ...pregameContext.promotionBlockedBy.map((blocker) => `Pregame gate: ${blocker}.`)
  ];
  const edgeStack = [
    ...trend.edgeStack,
    `Pregame: ${pregameContext.roofType} roof · ${pregameContext.weatherSensitivity} weather sensitivity · ${pregameContext.gameStartBucket}`
  ];
  const decisionSummary = pregameContext.promotionBlockedBy.length
    ? `${trend.decisionSummary} Pregame promotion is still blocked by ${pregameContext.promotionBlockedBy.join(", ")}.`
    : trend.decisionSummary;

  return {
    ...trend,
    decisionScore,
    gates,
    riskFlags,
    edgeStack,
    decisionSummary,
    pregameContext
  };
}

export async function buildMlbPregameContextTrends(args: { date?: string } = {}): Promise<MlbPregameTrendsPayload> {
  const payload = await buildMlbEliteDecisionTrends(args);
  const trends = payload.trends.map(decorateTrend).sort((left, right) => right.decisionScore - left.decisionScore || right.confidence - left.confidence);
  return {
    ...payload,
    sourceNote: `${payload.sourceNote} Pregame context layer adds venue roof/weather sensitivity, lineup timing, umpire pending status, and promotion blockers.`,
    stats: {
      ...payload.stats,
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
