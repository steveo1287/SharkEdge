
import type {
  OpportunityTrendLensKey,
  OpportunityTrendLensState,
  OpportunityView
} from "@/lib/types/opportunity";
import { buildWeatherSourcePlan } from "@/services/weather/weather-source-planner";

export type OpportunityTrendSourceStatus =
  | "JOINED"
  | "PAYLOAD_ONLY"
  | "MISSING"
  | "NOT_APPLICABLE";

export type FeedNativeLensAssessment = {
  key: OpportunityTrendLensKey;
  label: string;
  stateHint: OpportunityTrendLensState;
  scoreHint: number;
  sourceStatus: OpportunityTrendSourceStatus;
  evidence: string[];
  tags: string[];
  summary: string;
};

export type FeedNativeTrendContext = {
  weather: FeedNativeLensAssessment;
  playerVsPlayer: FeedNativeLensAssessment;
  teamVsTeam: FeedNativeLensAssessment;
  coachVsCoach: FeedNativeLensAssessment;
  playstyleVsPlaystyle: FeedNativeLensAssessment;
  sourceCoverageScore: number;
  sourceSummary: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 0) {
  return Number(value.toFixed(digits));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(items: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      items
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    )
  );
}

function getPayloadText(opportunity: OpportunityView) {
  return normalizeText(
    [
      opportunity.eventLabel,
      opportunity.selectionLabel,
      opportunity.marketType,
      opportunity.reasonSummary
    ].join(" | ")
  );
}

function getJoinedText(opportunity: OpportunityView) {
  return normalizeText(
    [
      opportunity.triggerSummary,
      opportunity.killSummary,
      opportunity.sourceNote,
      ...opportunity.whyItShows,
      ...opportunity.whatCouldKillIt
    ].join(" | ")
  );
}

function inferSelectionDirection(selectionLabel: string) {
  const normalized = normalizeText(selectionLabel);
  if (/\bover\b/.test(normalized)) return "OVER";
  if (/\bunder\b/.test(normalized)) return "UNDER";
  if (/\bhome\b/.test(normalized)) return "HOME";
  if (/\baway\b/.test(normalized)) return "AWAY";
  return "NEUTRAL";
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function deriveSourceStatus(args: {
  applicable: boolean;
  joinedText: string;
  payloadText: string;
  patterns: RegExp[];
}): OpportunityTrendSourceStatus {
  if (!args.applicable) {
    return "NOT_APPLICABLE";
  }

  if (hasAny(args.joinedText, args.patterns)) {
    return "JOINED";
  }

  if (hasAny(args.payloadText, args.patterns)) {
    return "PAYLOAD_ONLY";
  }

  return "MISSING";
}

function sourceCoverageWeight(sourceStatus: OpportunityTrendSourceStatus) {
  switch (sourceStatus) {
    case "JOINED":
      return 100;
    case "PAYLOAD_ONLY":
      return 64;
    case "MISSING":
      return 28;
    case "NOT_APPLICABLE":
    default:
      return 0;
  }
}


function weatherAssessment(opportunity: OpportunityView): FeedNativeLensAssessment {
  const payloadText = getPayloadText(opportunity);
  const joinedText = getJoinedText(opportunity);
  const direction = inferSelectionDirection(opportunity.selectionLabel);
  const plan = buildWeatherSourcePlan(opportunity);
  const applicable = plan.applicable;

  const weatherPatterns = [
    /\bweather\b/,
    /\bwind\b/,
    /\brain\b/,
    /\bsnow\b/,
    /\broof\b/,
    /\bpark\b/,
    /\baltitude\b/,
    /\btemperature\b/,
    /\bcold\b/,
    /\bwarm\b/,
    /\bhumid\b/,
    /\brun environment\b/
  ];
  const positivePatterns = [
    /\bwind out\b/,
    /\btailwind\b/,
    /\bwarm\b/,
    /\bheat\b/,
    /\bhumid\b/,
    /\bpark factor\b/,
    /\baltitude\b/,
    /\brun environment\b/
  ];
  const negativePatterns = [
    /\bwind in\b/,
    /\bcold\b/,
    /\brain\b/,
    /\bsnow\b/,
    /\broof closed\b/,
    /\bweather suppression\b/
  ];

  let sourceStatus: OpportunityTrendSourceStatus = "NOT_APPLICABLE";
  if (applicable) {
    if (plan.stationJoinStatus === "JOINED" || plan.venueJoinStatus === "JOINED") {
      sourceStatus = "JOINED";
    } else if (
      plan.stationJoinStatus === "PAYLOAD_ONLY" ||
      plan.venueJoinStatus === "PAYLOAD_ONLY"
    ) {
      sourceStatus = "PAYLOAD_ONLY";
    } else {
      sourceStatus = deriveSourceStatus({
        applicable,
        joinedText,
        payloadText,
        patterns: weatherPatterns
      });
    }
  }

  if (!applicable) {
    return {
      key: "WEATHER_DRIVEN",
      label: "Weather driven",
      stateHint: "NOT_APPLICABLE",
      scoreHint: 0,
      sourceStatus,
      evidence: [],
      tags: ["indoor-or-insulated"],
      summary: "Weather is not a primary driver for this league or market context."
    };
  }

  const combinedText = `${joinedText} | ${payloadText}`;
  const positive = hasAny(combinedText, positivePatterns);
  const negative = hasAny(combinedText, negativePatterns);

  let stateHint: OpportunityTrendLensState = "PENDING_DATA";
  let scoreHint = 28 + plan.sourceConfidence * 0.22;
  const evidence: string[] = [];

  evidence.push(plan.summary);
  evidence.push(...plan.providerNotes.slice(0, 2));
  if (plan.venueName) {
    evidence.push(`Venue join: ${plan.venueName}.`);
  }
  if (plan.stationCode) {
    evidence.push(`Station join: ${plan.stationCode}${plan.stationName ? ` (${plan.stationName})` : ""}.`);
  }
  if (plan.roofType) {
    evidence.push(`Roof/exposure context: ${plan.roofType.toLowerCase().replace(/_/g, " ")} / ${plan.weatherExposure?.toLowerCase() ?? "unknown"}.`);
  }
  if (typeof plan.altitudeFeet === "number" && plan.altitudeFeet >= 3000) {
    evidence.push("High-altitude environment can amplify carry or kick-distance effects.");
  }

  if (sourceStatus === "JOINED") {
    evidence.push("Weather context has at least one joined source path.");
    scoreHint += 12;
  } else if (sourceStatus === "PAYLOAD_ONLY") {
    evidence.push("Weather context is present, but still relies partly on payload-only clues.");
    scoreHint += 6;
  } else {
    evidence.push("Weather source plan exists, but station and venue joins still need to be wired.");
  }

  if (positive) {
    evidence.push("Environment signals support carry, scoring, or offensive efficiency.");
  }
  if (negative) {
    evidence.push("Environment signals suppress scoring efficiency or play cleanliness.");
  }

  if (direction === "OVER") {
    if (positive && !negative) {
      stateHint = "SUPPORTIVE";
      scoreHint += 14;
    } else if (negative && !positive) {
      stateHint = "CONTRARY";
      scoreHint += 10;
    } else if (positive && negative) {
      stateHint = "MIXED";
      scoreHint += 6;
    }
  } else if (direction === "UNDER") {
    if (negative && !positive) {
      stateHint = "SUPPORTIVE";
      scoreHint += 14;
    } else if (positive && !negative) {
      stateHint = "CONTRARY";
      scoreHint += 10;
    } else if (positive && negative) {
      stateHint = "MIXED";
      scoreHint += 6;
    }
  } else if (positive || negative) {
    stateHint = "MIXED";
    scoreHint += 8;
  }

  return {
    key: "WEATHER_DRIVEN",
    label: "Weather driven",
    stateHint,
    scoreHint: clamp(round(scoreHint), 0, 100),
    sourceStatus,
    evidence: unique(evidence),
    tags: unique([
      "weather",
      sourceStatus.toLowerCase(),
      plan.primaryObservationProvider?.toLowerCase() ?? null,
      plan.primaryForecastProvider?.toLowerCase() ?? null,
      plan.visualizationProvider?.toLowerCase() ?? null,
      plan.roofType?.toLowerCase() ?? null,
      plan.stationCode?.toLowerCase() ?? null,
      plan.windSensitivity?.toLowerCase() ?? null
    ]),
    summary:
      stateHint === "SUPPORTIVE"
        ? `Weather and environment context are aligned with the current side. ${plan.summary}`
        : stateHint === "CONTRARY"
          ? `Weather context is pushing against the current side. ${plan.summary}`
          : stateHint === "MIXED"
            ? `Weather matters here, but the current signal is not one-directional. ${plan.summary}`
            : `Weather lens is applicable, but it still needs cleaner source joins. ${plan.summary}`
  };
}

function playerVsPlayerAssessment(opportunity: OpportunityView): FeedNativeLensAssessment {
  const payloadText = getPayloadText(opportunity);
  const joinedText = getJoinedText(opportunity);
  const marketType = normalizeText(opportunity.marketType);
  const applicable = marketType.startsWith("player ");

  const matchupPatterns = [
    /\bmatchup\b/,
    /\bopponent\b/,
    /\bdefender\b/,
    /\bcoverage\b/,
    /\bstarter\b/,
    /\bpitcher\b/,
    /\bbullpen\b/,
    /\ballow\b/,
    /\busage\b/,
    /\bminutes\b/,
    /\brole\b/
  ];
  const adversePatterns = [
    /\bminutes cap\b/,
    /\bblowout\b/,
    /\brotation uncertainty\b/,
    /\bmodel market conflict\b/
  ];

  const sourceStatus = deriveSourceStatus({
    applicable,
    joinedText,
    payloadText,
    patterns: matchupPatterns
  });

  if (!applicable) {
    return {
      key: "PLAYER_VS_PLAYER",
      label: "Player vs player",
      stateHint: "NOT_APPLICABLE",
      scoreHint: 0,
      sourceStatus,
      evidence: [],
      tags: ["not-player-prop"],
      summary: "Player-vs-player modeling is inactive because this is not an individual player market."
    };
  }

  const combinedText = `${joinedText} | ${payloadText}`;
  const evidence: string[] = [];
  let stateHint: OpportunityTrendLensState = "PENDING_DATA";
  let scoreHint = 36;

  if (sourceStatus === "JOINED") {
    evidence.push("Joined evidence references opponent-role matchup details.");
    scoreHint += 18;
    stateHint = "SUPPORTIVE";
  } else if (sourceStatus === "PAYLOAD_ONLY") {
    evidence.push("Payload context references opponent-role matchup details.");
    scoreHint += 10;
    stateHint = "NEUTRAL";
  }

  if (opportunity.marketMicrostructure.status === "APPLIED") {
    evidence.push("Market microstructure qualification lowers fake matchup heat.");
    scoreHint += 6;
  }

  if (
    hasAny(combinedText, adversePatterns) ||
    opportunity.trapFlags.includes("MODEL_MARKET_CONFLICT")
  ) {
    evidence.push("Role or volatility warnings are active against the matchup angle.");
    scoreHint -= 10;
    stateHint = sourceStatus === "MISSING" ? "CONTRARY" : "MIXED";
  }

  return {
    key: "PLAYER_VS_PLAYER",
    label: "Player vs player",
    stateHint,
    scoreHint: clamp(round(scoreHint), 0, 100),
    sourceStatus,
    evidence: unique(evidence),
    tags: unique(["player-prop", "matchup", sourceStatus.toLowerCase()]),
    summary:
      stateHint === "SUPPORTIVE"
        ? "This prop is supported by direct player-versus-opponent context."
        : stateHint === "MIXED"
          ? "The matchup angle exists, but conflict or volatility warnings are active."
          : stateHint === "CONTRARY"
            ? "The matchup lens is working against the current side."
            : "Player-vs-player lens is relevant, but it still needs deeper joined opponent data."
  };
}

function teamVsTeamAssessment(opportunity: OpportunityView): FeedNativeLensAssessment {
  const payloadText = getPayloadText(opportunity);
  const joinedText = getJoinedText(opportunity);
  const marketType = normalizeText(opportunity.marketType);
  const applicable =
    marketType.includes("spread") ||
    marketType.includes("moneyline") ||
    marketType.includes("total") ||
    marketType.includes("team total");

  const teamPatterns = [
    /\bopponent\b/,
    /\bmatchup\b/,
    /\bpace\b/,
    /\bnet rating\b/,
    /\befficiency\b/,
    /\bdefense\b/,
    /\boffense\b/,
    /\bstarter\b/,
    /\bbullpen\b/
  ];

  const sourceStatus = deriveSourceStatus({
    applicable,
    joinedText,
    payloadText,
    patterns: teamPatterns
  });

  if (!applicable) {
    return {
      key: "TEAM_VS_TEAM",
      label: "Team vs team",
      stateHint: "NOT_APPLICABLE",
      scoreHint: 0,
      sourceStatus,
      evidence: [],
      tags: ["not-team-market"],
      summary: "Team-vs-team modeling is inactive for this market."
    };
  }

  const evidence: string[] = [];
  let stateHint: OpportunityTrendLensState = "PENDING_DATA";
  let scoreHint = 40;

  if (sourceStatus === "JOINED") {
    evidence.push("Joined evidence includes team-versus-team environment or efficiency context.");
    scoreHint += 18;
    stateHint = "SUPPORTIVE";
  } else if (sourceStatus === "PAYLOAD_ONLY") {
    evidence.push("Payload context includes team matchup pressure, but source joins remain partial.");
    scoreHint += 10;
    stateHint = "NEUTRAL";
  }

  if (opportunity.bookCount >= 3) {
    evidence.push("Multiple books contribute to the current event read.");
    scoreHint += 5;
  }

  if ((opportunity.marketDisagreementScore ?? 0) >= 0.18 || opportunity.trapFlags.length >= 3) {
    evidence.push("Board disagreement is elevated, which weakens a clean matchup read.");
    scoreHint -= 8;
    stateHint = stateHint === "SUPPORTIVE" ? "MIXED" : "CONTRARY";
  }

  return {
    key: "TEAM_VS_TEAM",
    label: "Team vs team",
    stateHint,
    scoreHint: clamp(round(scoreHint), 0, 100),
    sourceStatus,
    evidence: unique(evidence),
    tags: unique(["team-context", "event-level", sourceStatus.toLowerCase()]),
    summary:
      stateHint === "SUPPORTIVE"
        ? "The event is supported by team-versus-team context beyond raw price delta."
        : stateHint === "MIXED"
          ? "Team matchup context is active, but the board is not clean enough for full conviction."
          : stateHint === "CONTRARY"
            ? "Team matchup context is currently fighting the thesis."
            : "Team-vs-team lens is wired, but still needs stronger feed joins."
  };
}

function coachVsCoachAssessment(opportunity: OpportunityView): FeedNativeLensAssessment {
  const payloadText = getPayloadText(opportunity);
  const joinedText = getJoinedText(opportunity);
  const applicable = ["NBA", "NCAAB", "NFL", "NCAAF", "NHL", "MLB"].includes(opportunity.league);

  const coachPatterns = [
    /\bcoach\b/,
    /\bscheme\b/,
    /\brotation\b/,
    /\bline matching\b/,
    /\bbullpen\b/,
    /\btempo\b/,
    /\btimeout\b/,
    /\bblitz\b/,
    /\bzone\b/,
    /\bdrop\b/
  ];

  const sourceStatus = deriveSourceStatus({
    applicable,
    joinedText,
    payloadText,
    patterns: coachPatterns
  });

  if (!applicable) {
    return {
      key: "COACH_VS_COACH",
      label: "Coach vs coach",
      stateHint: "NOT_APPLICABLE",
      scoreHint: 0,
      sourceStatus,
      evidence: [],
      tags: ["coach-inactive"],
      summary: "Coach-versus-coach lens is inactive for this league."
    };
  }

  const evidence: string[] = [];
  let stateHint: OpportunityTrendLensState = "PENDING_DATA";
  let scoreHint = 30;

  if (sourceStatus === "JOINED") {
    evidence.push("Joined opportunity evidence includes coaching or scheme context.");
    scoreHint += 22;
    stateHint = "SUPPORTIVE";
  } else if (sourceStatus === "PAYLOAD_ONLY") {
    evidence.push("Coaching context exists in the payload, but not yet as a proper joined source.");
    scoreHint += 12;
    stateHint = "NEUTRAL";
  }

  if (
    /rotation uncertainty|injury uncertainty/.test(`${joinedText} | ${payloadText}`) ||
    opportunity.trapFlags.includes("INJURY_UNCERTAINTY")
  ) {
    evidence.push("Personnel uncertainty blurs coach-specific leverage.");
    scoreHint -= 6;
    stateHint = stateHint === "SUPPORTIVE" ? "MIXED" : "CONTRARY";
  }

  return {
    key: "COACH_VS_COACH",
    label: "Coach vs coach",
    stateHint,
    scoreHint: clamp(round(scoreHint), 0, 100),
    sourceStatus,
    evidence: unique(evidence),
    tags: unique(["coach", "scheme", sourceStatus.toLowerCase()]),
    summary:
      stateHint === "SUPPORTIVE"
        ? "Coaching and rotation tendencies are part of the surfaced thesis."
        : stateHint === "MIXED"
          ? "Coach context exists, but personnel uncertainty weakens the read."
          : stateHint === "CONTRARY"
            ? "Coach-side context is working against the thesis."
            : "Coach-vs-coach lens is wired, but still needs stronger staff and scheme joins."
  };
}

function playstyleAssessment(opportunity: OpportunityView): FeedNativeLensAssessment {
  const payloadText = getPayloadText(opportunity);
  const joinedText = getJoinedText(opportunity);
  const applicable = true;

  const stylePatterns = [
    /\bpace\b/,
    /\btempo\b/,
    /\btransition\b/,
    /\bhalf court\b/,
    /\brun heavy\b/,
    /\bpass heavy\b/,
    /\bshot volume\b/,
    /\bthree point\b/,
    /\bpaint\b/,
    /\bzone\b/,
    /\bpressure\b/,
    /\bblitz\b/,
    /\bbullpen\b/,
    /\bpark factor\b/,
    /\brun environment\b/,
    /\bminutes\b/,
    /\busage\b/
  ];

  const sourceStatus = deriveSourceStatus({
    applicable,
    joinedText,
    payloadText,
    patterns: stylePatterns
  });

  const evidence: string[] = [];
  let stateHint: OpportunityTrendLensState = "PENDING_DATA";
  let scoreHint = 34;

  if (sourceStatus === "JOINED") {
    evidence.push("Joined evidence carries pace, scheme, or role-volume context.");
    scoreHint += 20;
    stateHint = "SUPPORTIVE";
  } else if (sourceStatus === "PAYLOAD_ONLY") {
    evidence.push("Style interaction is visible in payload text, but not yet as a first-class feed join.");
    scoreHint += 10;
    stateHint = "NEUTRAL";
  }

  if (
    normalizeText(opportunity.marketType).includes("total") ||
    normalizeText(opportunity.marketType).includes("player") ||
    normalizeText(opportunity.marketType).includes("team total")
  ) {
    evidence.push("This market is materially sensitive to style collision.");
    scoreHint += 6;
  }

  if ((opportunity.marketDisagreementScore ?? 0) >= 0.16) {
    evidence.push("Books are disagreeing more than usual on the style thesis.");
    scoreHint -= 5;
    stateHint = stateHint === "SUPPORTIVE" ? "MIXED" : stateHint;
  }

  return {
    key: "PLAYSTYLE_VS_PLAYSTYLE",
    label: "Playstyle vs playstyle",
    stateHint,
    scoreHint: clamp(round(scoreHint), 0, 100),
    sourceStatus,
    evidence: unique(evidence),
    tags: unique(["style", "pace", "scheme", sourceStatus.toLowerCase()]),
    summary:
      stateHint === "SUPPORTIVE"
        ? "This bet is being treated as a style-collision problem, not a generic historical split."
        : stateHint === "MIXED"
          ? "Style interaction is relevant, but the board is still debating the thesis."
          : "Playstyle modeling is active, but it still needs deeper team-profile joins."
  };
}

function summarizeSourceCoverage(lenses: FeedNativeLensAssessment[]) {
  const active = lenses.filter((lens) => lens.stateHint !== "NOT_APPLICABLE");
  const score = active.length
    ? active.reduce((sum, lens) => sum + sourceCoverageWeight(lens.sourceStatus), 0) / active.length
    : 0;

  const joinedCount = active.filter((lens) => lens.sourceStatus === "JOINED").length;
  const payloadOnlyCount = active.filter((lens) => lens.sourceStatus === "PAYLOAD_ONLY").length;
  const missingCount = active.filter((lens) => lens.sourceStatus === "MISSING").length;

  const sourceSummary =
    joinedCount >= 3
      ? "Trend stack is now leaning on multiple joined evidence lanes instead of only generic payload text."
      : payloadOnlyCount >= 2
        ? "Trend stack is partially source-aware, but several lenses still rely on payload text instead of clean joins."
        : missingCount >= 2
          ? "Trend stack is wired for feed-native intelligence, but multiple lenses still need live joins."
          : "Trend stack has limited source coverage and should be treated cautiously.";

  return {
    sourceCoverageScore: clamp(round(score), 0, 100),
    sourceSummary
  };
}

export function buildFeedNativeTrendContext(opportunity: OpportunityView): FeedNativeTrendContext {
  const weather = weatherAssessment(opportunity);
  const playerVsPlayer = playerVsPlayerAssessment(opportunity);
  const teamVsTeam = teamVsTeamAssessment(opportunity);
  const coachVsCoach = coachVsCoachAssessment(opportunity);
  const playstyleVsPlaystyle = playstyleAssessment(opportunity);

  const summary = summarizeSourceCoverage([
    weather,
    playerVsPlayer,
    teamVsTeam,
    coachVsCoach,
    playstyleVsPlaystyle
  ]);

  return {
    weather,
    playerVsPlayer,
    teamVsTeam,
    coachVsCoach,
    playstyleVsPlaystyle,
    ...summary
  };
}
