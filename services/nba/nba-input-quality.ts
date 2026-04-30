import type {
  NbaPlayerAvailability,
  NbaPlayerGameProfile,
  NbaPlayerImpactRating,
  NbaSourceAttribution,
  NbaTeamAdvancedProfile
} from "@/services/nba/nba-source-types";

export type NbaInputQualityGrade = "GREEN" | "YELLOW" | "RED";
export type NbaVerdictConfidenceCap = "HIGH" | "MEDIUM" | "LOW" | "PASS";
export type NbaInputActionGate = "ALLOW_STRONG" | "ALLOW_LEAN" | "WATCH_ONLY" | "PASS" | "PROJECTION_ONLY";

export type NbaOddsInput = {
  generatedAt: string | null;
  freshnessMinutes: number | null;
  sportsbookCount: number;
  hasMoneyline: boolean;
  hasSpread: boolean;
  hasTotal: boolean;
  hasPlayerProps: boolean;
  source?: NbaSourceAttribution | null;
};

export type NbaMarketAnchorInput = {
  total: number | null;
  spreadHome: number | null;
  homeMoneylineOdds: number | null;
  awayMoneylineOdds: number | null;
};

export type NbaParticipantContextInput = {
  homeRestDays: number | null;
  awayRestDays: number | null;
  homeBackToBack: boolean | null;
  awayBackToBack: boolean | null;
  homeTravelProxyScore: number | null;
  awayTravelProxyScore: number | null;
};

export type NbaCalibrationInput = {
  gamesTracked: number;
  brierScore: number | null;
  spreadMae: number | null;
  totalMae: number | null;
  clvSamples: number;
};

export type NbaGameInputQualityInput = {
  gameId: string;
  leagueKey?: string;
  odds: NbaOddsInput | null;
  marketAnchor: NbaMarketAnchorInput | null;
  teamProfiles: {
    home: NbaTeamAdvancedProfile | null;
    away: NbaTeamAdvancedProfile | null;
  };
  playerProfiles: NbaPlayerGameProfile[];
  availability: NbaPlayerAvailability[];
  impactRatings: NbaPlayerImpactRating[];
  participantContext: NbaParticipantContextInput | null;
  calibration: NbaCalibrationInput | null;
  now?: Date;
};

export type NbaInputQualityComponent = {
  key:
    | "odds_freshness"
    | "book_coverage"
    | "market_anchor"
    | "team_advanced_stats"
    | "rolling_form"
    | "player_stats"
    | "injuries"
    | "projected_minutes"
    | "player_impact"
    | "schedule_context"
    | "calibration";
  label: string;
  score: number;
  maxScore: number;
  warnings: string[];
  details: Record<string, number | string | boolean | null>;
};

export type NbaGameInputQualityReport = {
  gameId: string;
  leagueKey: string;
  generatedAt: string;
  score: number;
  grade: NbaInputQualityGrade;
  actionGate: NbaInputActionGate;
  confidenceCap: NbaVerdictConfidenceCap;
  canIssueStrongBet: boolean;
  canIssueBetVerdict: boolean;
  projectionOnly: boolean;
  components: NbaInputQualityComponent[];
  warnings: string[];
  missingData: string[];
  sourceWarnings: string[];
  caps: string[];
};

const ADVANCED_STAT_FIELDS = [
  "offensiveRating",
  "defensiveRating",
  "netRating",
  "pace",
  "effectiveFieldGoalPct",
  "turnoverPct",
  "offensiveReboundPct",
  "freeThrowRate"
] as const;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function scoreToGrade(score: number): NbaInputQualityGrade {
  if (score >= 80) return "GREEN";
  if (score >= 55) return "YELLOW";
  return "RED";
}

function minConfidenceCap(a: NbaVerdictConfidenceCap, b: NbaVerdictConfidenceCap): NbaVerdictConfidenceCap {
  const rank: Record<NbaVerdictConfidenceCap, number> = {
    PASS: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3
  };
  return rank[a] <= rank[b] ? a : b;
}

function component(args: NbaInputQualityComponent): NbaInputQualityComponent {
  return {
    ...args,
    score: round(clamp(args.score, 0, args.maxScore), 1),
    warnings: Array.from(new Set(args.warnings))
  };
}

function sourceRiskWarnings(sources: Array<NbaSourceAttribution | null | undefined>) {
  return Array.from(
    new Set(
      sources
        .filter((source): source is NbaSourceAttribution => Boolean(source))
        .flatMap((source) => {
          const warnings: string[] = [];
          if (source.licenseRisk === "HIGH") {
            warnings.push(`${source.sourceLabel} is marked HIGH license risk; do not treat it as production-safe without rights.`);
          }
          if (source.licenseRisk === "UNKNOWN") {
            warnings.push(`${source.sourceLabel} has unknown license risk; keep it behind a source-aware gate.`);
          }
          if (source.confidence === "LOW" || source.confidence === "UNKNOWN") {
            warnings.push(`${source.sourceLabel} confidence is ${source.confidence.toLowerCase()}.`);
          }
          return warnings;
        })
    )
  );
}

function teamAdvancedCoverage(profile: NbaTeamAdvancedProfile | null) {
  if (!profile) return 0;
  const present = ADVANCED_STAT_FIELDS.filter((field) => isFiniteNumber(profile[field])).length;
  return present / ADVANCED_STAT_FIELDS.length;
}

function evaluateOdds(input: NbaGameInputQualityInput): NbaInputQualityComponent[] {
  const odds = input.odds;
  const freshnessWarnings: string[] = [];
  const bookWarnings: string[] = [];

  let freshnessScore = 0;
  if (!odds) {
    freshnessWarnings.push("No NBA odds payload is available.");
  } else if (!isFiniteNumber(odds.freshnessMinutes)) {
    freshnessWarnings.push("Odds payload does not expose a usable freshness age.");
    freshnessScore = 6;
  } else if (odds.freshnessMinutes <= 5) {
    freshnessScore = 15;
  } else if (odds.freshnessMinutes <= 15) {
    freshnessScore = 12;
  } else if (odds.freshnessMinutes <= 45) {
    freshnessWarnings.push("Odds are aging; keep NBA verdicts cautious.");
    freshnessScore = 6;
  } else {
    freshnessWarnings.push("Odds are stale beyond the hard freshness window.");
    freshnessScore = 0;
  }

  let bookScore = 0;
  if (!odds) {
    bookWarnings.push("No sportsbook coverage is available.");
  } else {
    bookScore = odds.sportsbookCount >= 5
      ? 10
      : odds.sportsbookCount >= 3
        ? 8
        : odds.sportsbookCount >= 2
          ? 5
          : odds.sportsbookCount === 1
            ? 2
            : 0;
    if (odds.sportsbookCount < 3) {
      bookWarnings.push("NBA market has thin sportsbook coverage; one-book edges may be traps.");
    }
    if (!odds.hasMoneyline || !odds.hasSpread || !odds.hasTotal) {
      bookWarnings.push("Core NBA markets are incomplete; moneyline, spread, and total are all required for full verdicts.");
    }
  }

  return [
    component({
      key: "odds_freshness",
      label: "Odds freshness",
      score: freshnessScore,
      maxScore: 15,
      warnings: freshnessWarnings,
      details: {
        freshnessMinutes: odds?.freshnessMinutes ?? null,
        generatedAt: odds?.generatedAt ?? null
      }
    }),
    component({
      key: "book_coverage",
      label: "Book coverage",
      score: bookScore,
      maxScore: 10,
      warnings: bookWarnings,
      details: {
        sportsbookCount: odds?.sportsbookCount ?? 0,
        hasMoneyline: Boolean(odds?.hasMoneyline),
        hasSpread: Boolean(odds?.hasSpread),
        hasTotal: Boolean(odds?.hasTotal),
        hasPlayerProps: Boolean(odds?.hasPlayerProps)
      }
    })
  ];
}

function evaluateMarketAnchor(input: NbaGameInputQualityInput) {
  const anchor = input.marketAnchor;
  const present = [anchor?.total, anchor?.spreadHome, anchor?.homeMoneylineOdds, anchor?.awayMoneylineOdds].filter(isFiniteNumber).length;
  const warnings: string[] = [];
  if (!anchor || present === 0) {
    warnings.push("No market anchor is available; NBA sim may project but should not issue a bet verdict.");
  } else if (!isFiniteNumber(anchor.total) || !isFiniteNumber(anchor.spreadHome)) {
    warnings.push("Market anchor is incomplete; total and home spread are required for full NBA verdicts.");
  }

  return component({
    key: "market_anchor",
    label: "Market anchor",
    score: (present / 4) * 10,
    maxScore: 10,
    warnings,
    details: {
      total: anchor?.total ?? null,
      spreadHome: anchor?.spreadHome ?? null,
      hasHomeMoneyline: isFiniteNumber(anchor?.homeMoneylineOdds),
      hasAwayMoneyline: isFiniteNumber(anchor?.awayMoneylineOdds)
    }
  });
}

function evaluateTeamStats(input: NbaGameInputQualityInput): NbaInputQualityComponent[] {
  const homeCoverage = teamAdvancedCoverage(input.teamProfiles.home);
  const awayCoverage = teamAdvancedCoverage(input.teamProfiles.away);
  const coverage = (homeCoverage + awayCoverage) / 2;
  const warnings: string[] = [];

  if (!input.teamProfiles.home || !input.teamProfiles.away) {
    warnings.push("Home and away NBA advanced team profiles are both required.");
  }
  if (coverage < 0.75) {
    warnings.push("NBA advanced team stat coverage is thin; no STRONG_BET should be issued.");
  }

  const rollingSignals = [
    input.teamProfiles.home?.rollingNetRatingLast5,
    input.teamProfiles.home?.rollingNetRatingLast10,
    input.teamProfiles.away?.rollingNetRatingLast5,
    input.teamProfiles.away?.rollingNetRatingLast10
  ];
  const rollingPresent = rollingSignals.filter(isFiniteNumber).length;
  const rollingWarnings: string[] = [];
  if (rollingPresent < 2) {
    rollingWarnings.push("Rolling NBA form is missing or incomplete.");
  }

  return [
    component({
      key: "team_advanced_stats",
      label: "Team advanced stats",
      score: coverage * 20,
      maxScore: 20,
      warnings,
      details: {
        homeCoveragePct: round(homeCoverage * 100),
        awayCoveragePct: round(awayCoverage * 100)
      }
    }),
    component({
      key: "rolling_form",
      label: "Rolling team form",
      score: (rollingPresent / 4) * 7,
      maxScore: 7,
      warnings: rollingWarnings,
      details: {
        rollingSignalsPresent: rollingPresent
      }
    })
  ];
}

function evaluatePlayerStats(input: NbaGameInputQualityInput) {
  const profiles = input.playerProfiles;
  const usableProfiles = profiles.filter((profile) => profile.gamesIncluded >= 3 && isFiniteNumber(profile.averageMinutes));
  const coverageRatio = Math.min(1, usableProfiles.length / 16);
  const warnings: string[] = [];
  if (usableProfiles.length < 10) {
    warnings.push("NBA player stat coverage is below a reliable rotation baseline.");
  }

  return component({
    key: "player_stats",
    label: "Player stat coverage",
    score: coverageRatio * 8,
    maxScore: 8,
    warnings,
    details: {
      playerProfiles: profiles.length,
      usableProfiles: usableProfiles.length
    }
  });
}

function evaluateAvailability(input: NbaGameInputQualityInput): NbaInputQualityComponent[] {
  const availability = input.availability;
  const warnings: string[] = [];
  if (!availability.length) {
    warnings.push("No NBA injury/availability feed is available; cap confidence at MEDIUM.");
  }
  const availabilityScore = Math.min(1, availability.length / 10) * 8;
  const withProjectedMinutes = availability.filter((entry) => isFiniteNumber(entry.expectedMinutes));
  const minuteWarnings: string[] = [];
  if (availability.length === 0 || withProjectedMinutes.length < Math.min(8, availability.length)) {
    minuteWarnings.push("Projected minutes are missing or incomplete; cap player props at LOW.");
  }

  return [
    component({
      key: "injuries",
      label: "Injury and availability coverage",
      score: availabilityScore,
      maxScore: 8,
      warnings,
      details: {
        availabilityRows: availability.length,
        outOrDoubtful: availability.filter((entry) => entry.status === "OUT" || entry.status === "DOUBTFUL").length,
        questionable: availability.filter((entry) => entry.status === "QUESTIONABLE").length
      }
    }),
    component({
      key: "projected_minutes",
      label: "Projected minutes",
      score: Math.min(1, withProjectedMinutes.length / 10) * 8,
      maxScore: 8,
      warnings: minuteWarnings,
      details: {
        playersWithProjectedMinutes: withProjectedMinutes.length
      }
    })
  ];
}

function evaluateImpact(input: NbaGameInputQualityInput) {
  const usable = input.impactRatings.filter((rating) => isFiniteNumber(rating.totalImpactPer100));
  const warnings: string[] = [];
  if (!usable.length) {
    warnings.push("No NBA player-impact ratings are available; injury point adjustments must stay disabled.");
  } else if (usable.length < 10) {
    warnings.push("NBA player-impact coverage is thin; injury adjustments should be conservative.");
  }

  return component({
    key: "player_impact",
    label: "Player impact ratings",
    score: Math.min(1, usable.length / 12) * 6,
    maxScore: 6,
    warnings,
    details: {
      impactRows: input.impactRatings.length,
      usableImpactRows: usable.length
    }
  });
}

function evaluateSchedule(input: NbaGameInputQualityInput) {
  const context = input.participantContext;
  const values = [
    context?.homeRestDays,
    context?.awayRestDays,
    context?.homeBackToBack,
    context?.awayBackToBack,
    context?.homeTravelProxyScore,
    context?.awayTravelProxyScore
  ];
  const present = values.filter((value) => value !== null && value !== undefined).length;
  const warnings: string[] = [];
  if (!context || present < 4) {
    warnings.push("NBA rest/back-to-back/travel context is incomplete.");
  }

  return component({
    key: "schedule_context",
    label: "Schedule context",
    score: (present / 6) * 5,
    maxScore: 5,
    warnings,
    details: {
      signalsPresent: present,
      homeBackToBack: context?.homeBackToBack ?? null,
      awayBackToBack: context?.awayBackToBack ?? null
    }
  });
}

function evaluateCalibration(input: NbaGameInputQualityInput) {
  const calibration = input.calibration;
  const warnings: string[] = [];
  if (!calibration || calibration.gamesTracked < 25) {
    warnings.push("NBA calibration history is too small to validate strong confidence.");
  }
  let score = 0;
  if (calibration) {
    score += Math.min(5, calibration.gamesTracked / 10);
    if (isFiniteNumber(calibration.brierScore) && calibration.brierScore <= 0.23) score += 2;
    if (isFiniteNumber(calibration.spreadMae) && calibration.spreadMae <= 10.5) score += 1;
    if (calibration.clvSamples >= 25) score += 1;
  }

  return component({
    key: "calibration",
    label: "Calibration history",
    score,
    maxScore: 9,
    warnings,
    details: {
      gamesTracked: calibration?.gamesTracked ?? 0,
      brierScore: calibration?.brierScore ?? null,
      spreadMae: calibration?.spreadMae ?? null,
      totalMae: calibration?.totalMae ?? null,
      clvSamples: calibration?.clvSamples ?? 0
    }
  });
}

export function buildNbaInputQualityReport(input: NbaGameInputQualityInput): NbaGameInputQualityReport {
  const now = input.now ?? new Date();
  const components = [
    ...evaluateOdds(input),
    evaluateMarketAnchor(input),
    ...evaluateTeamStats(input),
    evaluatePlayerStats(input),
    ...evaluateAvailability(input),
    evaluateImpact(input),
    evaluateSchedule(input),
    evaluateCalibration(input)
  ];

  const maxScore = components.reduce((sum, item) => sum + item.maxScore, 0);
  const rawScore = components.reduce((sum, item) => sum + item.score, 0);
  const score = round((rawScore / maxScore) * 100, 1);
  const grade = scoreToGrade(score);
  const warnings = Array.from(new Set(components.flatMap((item) => item.warnings)));
  const missingData = components
    .filter((item) => item.score < item.maxScore * 0.5)
    .map((item) => item.label);

  const sourceWarnings = sourceRiskWarnings([
    input.odds?.source,
    input.teamProfiles.home?.source,
    input.teamProfiles.away?.source,
    ...input.playerProfiles.map((profile) => profile.source),
    ...input.availability.map((entry) => entry.source),
    ...input.impactRatings.map((entry) => entry.source)
  ]);

  let confidenceCap: NbaVerdictConfidenceCap = "HIGH";
  const caps: string[] = [];

  const oddsFreshness = input.odds?.freshnessMinutes;
  if (!input.odds || !isFiniteNumber(oddsFreshness) || oddsFreshness > 45) {
    confidenceCap = minConfidenceCap(confidenceCap, "PASS");
    caps.push("No fresh odds: force PASS.");
  } else if (oddsFreshness > 15) {
    confidenceCap = minConfidenceCap(confidenceCap, "LOW");
    caps.push("Aging odds: cap confidence at LOW.");
  }

  const hasMarketAnchor = Boolean(
    input.marketAnchor &&
    (isFiniteNumber(input.marketAnchor.total) || isFiniteNumber(input.marketAnchor.spreadHome))
  );
  if (!hasMarketAnchor) {
    confidenceCap = minConfidenceCap(confidenceCap, "LOW");
    caps.push("No market anchor: projection only, no bet verdict.");
  }

  const teamStatsScore = components.find((item) => item.key === "team_advanced_stats")?.score ?? 0;
  const teamStatsMax = components.find((item) => item.key === "team_advanced_stats")?.maxScore ?? 1;
  if (teamStatsScore < teamStatsMax * 0.75) {
    confidenceCap = minConfidenceCap(confidenceCap, "MEDIUM");
    caps.push("Thin team advanced stats: no STRONG_BET.");
  }

  if (!input.availability.length) {
    confidenceCap = minConfidenceCap(confidenceCap, "MEDIUM");
    caps.push("Missing injury feed: cap confidence at MEDIUM.");
  }

  const projectedMinutesScore = components.find((item) => item.key === "projected_minutes")?.score ?? 0;
  const projectedMinutesMax = components.find((item) => item.key === "projected_minutes")?.maxScore ?? 1;
  if (projectedMinutesScore < projectedMinutesMax * 0.75) {
    confidenceCap = minConfidenceCap(confidenceCap, "LOW");
    caps.push("Missing projected minutes: player props cap at LOW.");
  }

  const impactScore = components.find((item) => item.key === "player_impact")?.score ?? 0;
  if (impactScore === 0) {
    caps.push("Missing player impact: injury point adjustments disabled.");
  }

  if (score < 55) {
    confidenceCap = minConfidenceCap(confidenceCap, "LOW");
    caps.push("RED input score: force WATCH/PASS.");
  }

  let actionGate: NbaInputActionGate = "ALLOW_STRONG";
  if (!hasMarketAnchor) {
    actionGate = "PROJECTION_ONLY";
  } else if (confidenceCap === "PASS") {
    actionGate = "PASS";
  } else if (grade === "RED") {
    actionGate = "WATCH_ONLY";
  } else if (grade === "YELLOW" || confidenceCap === "LOW" || confidenceCap === "MEDIUM") {
    actionGate = "ALLOW_LEAN";
  }

  const canIssueBetVerdict = actionGate !== "PROJECTION_ONLY" && actionGate !== "PASS";
  const canIssueStrongBet = actionGate === "ALLOW_STRONG" && confidenceCap === "HIGH";

  return {
    gameId: input.gameId,
    leagueKey: input.leagueKey ?? "NBA",
    generatedAt: now.toISOString(),
    score,
    grade,
    actionGate,
    confidenceCap,
    canIssueStrongBet,
    canIssueBetVerdict,
    projectionOnly: actionGate === "PROJECTION_ONLY",
    components,
    warnings,
    missingData,
    sourceWarnings,
    caps: Array.from(new Set(caps))
  };
}
