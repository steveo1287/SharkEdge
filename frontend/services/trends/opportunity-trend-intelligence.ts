import type {
  OpportunityTrendIntelligenceView,
  OpportunityTrendLensConfidence,
  OpportunityTrendLensKey,
  OpportunityTrendLensState,
  OpportunityTrendLensView,
  OpportunityView
} from "@/lib/types/opportunity";

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

function joinedContext(opportunity: OpportunityView) {
  return normalizeText(
    [
      opportunity.eventLabel,
      opportunity.selectionLabel,
      opportunity.marketType,
      opportunity.reasonSummary,
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

function confidenceFromScore(score: number, evidenceCount: number): OpportunityTrendLensConfidence {
  if (score >= 72 && evidenceCount >= 2) return "HIGH";
  if (score >= 52 && evidenceCount >= 1) return "MEDIUM";
  return "LOW";
}

function buildLens(args: {
  key: OpportunityTrendLensKey;
  label: string;
  state: OpportunityTrendLensState;
  score: number;
  summary: string;
  evidence?: string[];
  tags?: string[];
}): OpportunityTrendLensView {
  const evidence = unique(args.evidence ?? []);
  return {
    key: args.key,
    label: args.label,
    state: args.state,
    score: clamp(round(args.score), 0, 100),
    confidence: confidenceFromScore(args.score, evidence.length),
    summary: args.summary,
    evidence,
    tags: unique(args.tags ?? [])
  };
}

function buildWeatherLens(opportunity: OpportunityView): OpportunityTrendLensView {
  const outdoorLeague = ["MLB", "NFL", "NCAAF"].includes(opportunity.league);
  const marketType = normalizeText(opportunity.marketType);
  const direction = inferSelectionDirection(opportunity.selectionLabel);
  const text = joinedContext(opportunity);

  if (!outdoorLeague) {
    return buildLens({
      key: "WEATHER_DRIVEN",
      label: "Weather driven",
      state: "NOT_APPLICABLE",
      score: 0,
      summary: "Weather lens is inactive because this league is usually insulated from outdoor conditions."
    });
  }

  const supportiveWeatherPatterns = [
    /\bweather run factor\b/,
    /\bwind out\b/,
    /\btailwind\b/,
    /\bwarm\b/,
    /\bheat\b/,
    /\bhumid\b/,
    /\bpark factor\b/,
    /\boutdoor\b/,
    /\baltitude\b/
  ];
  const suppressiveWeatherPatterns = [
    /\bwind in\b/,
    /\bcold\b/,
    /\brain\b/,
    /\bsnow\b/,
    /\bweather suppression\b/,
    /\broof closed\b/,
    /\bbad field\b/
  ];

  const weatherMentioned = /weather|wind|rain|snow|roof|park|altitude|temperature|humid|cold|warm/.test(text);
  const positive = hasAny(text, supportiveWeatherPatterns);
  const negative = hasAny(text, suppressiveWeatherPatterns);
  const totalLike =
    marketType.includes("total") ||
    marketType.includes("team total") ||
    marketType.includes("moneyline") ||
    marketType.includes("player pitcher");

  if (!totalLike && !weatherMentioned) {
    return buildLens({
      key: "WEATHER_DRIVEN",
      label: "Weather driven",
      state: "PENDING_DATA",
      score: 32,
      summary: "Weather can matter here, but the current opportunity payload is not carrying enough stadium-weather context yet.",
      tags: ["outdoor", "weather-pending"]
    });
  }

  let state: OpportunityTrendLensState = "NEUTRAL";
  let score = 48;
  const evidence: string[] = [];

  if (weatherMentioned) {
    evidence.push("Opportunity context mentions weather or park environment.");
    score += 8;
  }
  if (positive) {
    evidence.push("Text signals a more favorable scoring or carry environment.");
  }
  if (negative) {
    evidence.push("Text signals a suppressive environment such as wind in, cold, or precipitation.");
  }

  if (direction === "OVER") {
    if (positive && !negative) {
      state = "SUPPORTIVE";
      score += 18;
    } else if (negative && !positive) {
      state = "CONTRARY";
      score += 14;
    } else if (positive && negative) {
      state = "MIXED";
      score += 8;
    }
  } else if (direction == "UNDER") {
    if (negative && !positive) {
      state = "SUPPORTIVE";
      score += 18;
    } else if (positive && !negative) {
      state = "CONTRARY";
      score += 14;
    } else if (positive && negative) {
      state = "MIXED";
      score += 8;
    }
  } else if (positive || negative) {
    state = "MIXED";
    score += 10;
  } else if (weatherMentioned) {
    state = "NEUTRAL";
    score += 4;
  } else {
    state = "PENDING_DATA";
    score = 34;
  }

  return buildLens({
    key: "WEATHER_DRIVEN",
    label: "Weather driven",
    state,
    score,
    summary:
      state === "SUPPORTIVE"
        ? "Outdoor weather and run-environment signals line up with the current side of the bet."
        : state === "CONTRARY"
          ? "Weather context is pulling against the current side, so the bet should clear a higher quality bar."
          : state === "MIXED"
            ? "Weather is in play, but the current feed is not cleanly one-directional."
            : state === "PENDING_DATA"
              ? "Weather lens is relevant, but this opportunity still needs a cleaner stadium-weather join."
              : "Weather is either neutral here or not yet strong enough to move the recommendation.",
    evidence,
    tags: ["weather", outdoorLeague ? "outdoor-league" : "indoor-league"]
  });
}

function buildPlayerVsPlayerLens(opportunity: OpportunityView): OpportunityTrendLensView {
  const marketType = normalizeText(opportunity.marketType);
  const isPlayerProp = marketType.startsWith("player ");
  const text = joinedContext(opportunity);

  if (!isPlayerProp) {
    return buildLens({
      key: "PLAYER_VS_PLAYER",
      label: "Player vs player",
      state: "NOT_APPLICABLE",
      score: 0,
      summary: "Player-vs-player lens is inactive because this is not an individual player market."
    });
  }

  const matchupSignals = [
    /\bmatchup\b/,
    /\bopponent\b/,
    /\bvs\b/,
    /\bcoverage\b/,
    /\bdefender\b/,
    /\bstarter\b/,
    /\bpitcher\b/,
    /\bbullpen\b/,
    /\ballow\b/,
    /\busage\b/,
    /\bminutes\b/,
    /\brole\b/
  ];
  const adverseSignals = [/\bminutes cap\b/, /\bblowout\b/, /\brotation uncertainty\b/, /\bmodel and market conflict\b/];

  const evidence: string[] = [];
  let score = 42 + opportunity.sourceQuality.score * 0.2;

  if (hasAny(text, matchupSignals)) {
    evidence.push("Opportunity text references opponent or role-specific matchup context.");
    score += 16;
  }

  if (opportunity.marketMicrostructure.status === "APPLIED") {
    evidence.push("Market microstructure is qualified, which reduces fake player-prop heat.");
    score += 8;
  }

  if (hasAny(text, adverseSignals) || opportunity.trapFlags.includes("MODEL_MARKET_CONFLICT")) {
    evidence.push("The current player-prop thesis is carrying conflict or volatility warnings.");
    score -= 10;
    return buildLens({
      key: "PLAYER_VS_PLAYER",
      label: "Player vs player",
      state: "CONTRARY",
      score,
      summary: "The player-vs-opponent angle exists, but role or matchup uncertainty is pushing against conviction.",
      evidence,
      tags: ["player-prop", "matchup", "volatility"]
    });
  }

  return buildLens({
    key: "PLAYER_VS_PLAYER",
    label: "Player vs player",
    state: evidence.length ? "SUPPORTIVE" : "PENDING_DATA",
    score: evidence.length ? score : 36,
    summary: evidence.length
      ? "This player prop is being framed as a direct role-versus-opponent problem, not a blind last-five trend."
      : "Player-vs-player lens is relevant, but the current payload needs cleaner opponent-role joins to grade it harder.",
    evidence,
    tags: ["player-prop", "opponent-context"]
  });
}

function buildTeamVsTeamLens(opportunity: OpportunityView): OpportunityTrendLensView {
  const marketType = normalizeText(opportunity.marketType);
  const text = joinedContext(opportunity);
  const evidence: string[] = [];

  let score =
    40 +
    opportunity.sourceQuality.score * 0.18 +
    (opportunity.marketMicrostructure.pathTrusted ? 8 : 0) +
    (opportunity.truthCalibration.status === "APPLIED" ? 6 : 0) -
    opportunity.trapFlags.length * 2;

  if (opportunity.bookCount >= 3) {
    evidence.push("Multiple books are contributing to the current event context.");
    score += 6;
  }

  if (marketType.includes("spread") || marketType.includes("moneyline") || marketType.includes("total")) {
    evidence.push("This market is directly sensitive to team-vs-team strength and environment.");
    score += 8;
  }

  if (/opponent|matchup|pace|net rating|efficiency|bullpen|starter|defense|offense/.test(text)) {
    evidence.push("Opportunity text references opponent or team-context pressure.");
    score += 10;
  }

  if ((opportunity.marketDisagreementScore ?? 0) >= 0.18 || opportunity.trapFlags.length >= 3) {
    evidence.push("Market disagreement is elevated, which weakens a clean team-vs-team read.");
    return buildLens({
      key: "TEAM_VS_TEAM",
      label: "Team vs team",
      state: "MIXED",
      score,
      summary: "Team context is active, but the current board is not clean enough to treat this as a fully settled matchup edge.",
      evidence,
      tags: ["team-context", "market-disagreement"]
    });
  }

  return buildLens({
    key: "TEAM_VS_TEAM",
    label: "Team vs team",
    state: "SUPPORTIVE",
    score,
    summary: "The event-level matchup is carrying enough cross-team context to matter beyond a one-line market read.",
    evidence,
    tags: ["team-context", "event-level"]
  });
}

function buildCoachVsCoachLens(opportunity: OpportunityView): OpportunityTrendLensView {
  const coachRelevantLeague = ["NBA", "NCAAB", "NFL", "NCAAF", "NHL", "MLB"].includes(opportunity.league);
  const text = joinedContext(opportunity);

  if (!coachRelevantLeague) {
    return buildLens({
      key: "COACH_VS_COACH",
      label: "Coach vs coach",
      state: "NOT_APPLICABLE",
      score: 0,
      summary: "Coach-vs-coach lens is inactive for this league or market."
    });
  }

  const signals = [
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

  const evidence: string[] = [];
  let score = 34;

  if (hasAny(text, signals)) {
    evidence.push("Current opportunity text references coaching, scheme, or rotation control points.");
    score += 26;
  }

  if (/(rotation uncertainty|injury uncertainty)/.test(text) || opportunity.trapFlags.includes("INJURY_UNCERTAINTY")) {
    evidence.push("Personnel uncertainty can blur coach-specific readouts.");
    score -= 6;
  }

  return buildLens({
    key: "COACH_VS_COACH",
    label: "Coach vs coach",
    state: evidence.length ? "SUPPORTIVE" : "PENDING_DATA",
    score: evidence.length ? score : 28,
    summary: evidence.length
      ? "Coaching and rotation context are influencing this angle instead of leaving it as a flat market stat."
      : "Coach-vs-coach modeling is wired as a lens, but this opportunity still needs cleaner staff and scheme feeds to grade it harder.",
    evidence,
    tags: ["coach", "scheme"]
  });
}

function buildPlaystyleLens(opportunity: OpportunityView): OpportunityTrendLensView {
  const text = joinedContext(opportunity);
  const marketType = normalizeText(opportunity.marketType);
  const styleSignals = [
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

  const evidence: string[] = [];
  let score =
    38 +
    opportunity.sourceQuality.score * 0.16 +
    (opportunity.marketMicrostructure.status === "APPLIED" ? 8 : 0) +
    (opportunity.bookLeadership.influenceAdjustment >= 0 ? 4 : 0);

  if (hasAny(text, styleSignals)) {
    evidence.push("Opportunity text references pace, scheme, role volume, or environment style.");
    score += 18;
  }

  if (marketType.includes("total") || marketType.includes("player") || marketType.includes("team total")) {
    evidence.push("This market type is highly sensitive to playstyle interaction.");
    score += 8;
  }

  if ((opportunity.marketDisagreementScore ?? 0) >= 0.16) {
    evidence.push("Books are disagreeing more than usual, which can mean the style thesis is not settled.");
    score -= 6;
  }

  return buildLens({
    key: "PLAYSTYLE_VS_PLAYSTYLE",
    label: "Playstyle vs playstyle",
    state: evidence.length >= 2 ? "SUPPORTIVE" : evidence.length === 1 ? "NEUTRAL" : "PENDING_DATA",
    score: evidence.length ? score : 30,
    summary:
      evidence.length >= 2
        ? "This angle is being treated as a style-collision problem, not just a generic historical split."
        : evidence.length === 1
          ? "Style interaction matters here, but the current feed only exposes part of the thesis."
          : "Playstyle modeling is scaffolded, but this opportunity still needs deeper pace/scheme joins to become a first-class signal.",
    evidence,
    tags: ["style", "pace", "scheme"]
  });
}

function summarize(lenses: OpportunityTrendLensView[]) {
  const active = lenses.filter((lens) => !["NOT_APPLICABLE"].includes(lens.state));
  const supportive = active.filter((lens) => lens.state === "SUPPORTIVE");
  const contrary = active.filter((lens) => lens.state === "CONTRARY");
  const pending = active.filter((lens) => lens.state === "PENDING_DATA");

  const weighted = active.length
    ? active.reduce((sum, lens) => sum + lens.score, 0) / active.length
    : 0;

  const reliabilityRaw =
    active.length
      ? active.reduce((sum, lens) => {
          const confidenceWeight =
            lens.confidence === "HIGH" ? 1 : lens.confidence === "MEDIUM" ? 0.75 : 0.5;
          return sum + lens.score * confidenceWeight;
        }, 0) / active.length
      : 0;

  const tags = unique(active.flatMap((lens) => lens.tags));
  const topLens = [...active].sort((a, b) => b.score - a.score)[0] ?? null;

  const summary =
    supportive.length > contrary.length
      ? "Trend stack is supportive across multiple matchup lenses."
      : contrary.length > 0
        ? "Trend stack has at least one lens pushing against the bet and needs a cleaner price."
        : pending.length >= 2
          ? "Trend stack is wired, but several lenses still need deeper source joins."
          : "Trend stack is neutral and should be treated as context, not conviction.";

  return {
    intelligenceScore: clamp(round(weighted), 0, 100),
    reliabilityScore: clamp(round(reliabilityRaw), 0, 100),
    summary,
    topAngle: topLens?.summary ?? null,
    activeLensCount: active.length,
    supportiveLensCount: supportive.length,
    contraryLensCount: contrary.length,
    pendingLensCount: pending.length,
    tags
  };
}

export function buildOpportunityTrendIntelligence(
  opportunity: OpportunityView
): OpportunityTrendIntelligenceView {
  const lenses = [
    buildWeatherLens(opportunity),
    buildPlayerVsPlayerLens(opportunity),
    buildTeamVsTeamLens(opportunity),
    buildCoachVsCoachLens(opportunity),
    buildPlaystyleLens(opportunity)
  ];

  const summary = summarize(lenses);

  return {
    ...summary,
    lenses
  };
}
