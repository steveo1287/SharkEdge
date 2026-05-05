import { buildMlbStatBackedTrends, type MlbStatTrend, type MlbStatTrendsPayload } from "./mlb-stat-trends";

export type MlbDecisionGateStatus = "PASS" | "WARN" | "FAIL" | "PENDING";
export type MlbActionability = "ACTIONABLE_CANDIDATE" | "PRICE_REQUIRED" | "WATCHLIST" | "PASS";

export type MlbDecisionGate = {
  key: string;
  label: string;
  status: MlbDecisionGateStatus;
  note: string;
};

export type MlbEliteTrend = MlbStatTrend & {
  decisionScore: number;
  actionability: MlbActionability;
  decisionSummary: string;
  gates: MlbDecisionGate[];
  edgeStack: string[];
  riskFlags: string[];
};

export type MlbEliteTrendsPayload = Omit<MlbStatTrendsPayload, "trends" | "stats"> & {
  stats: MlbStatTrendsPayload["stats"] & {
    actionableCandidates: number;
    priceRequired: number;
    watchlist: number;
    pass: number;
    avgDecisionScore: number;
  };
  trends: MlbEliteTrend[];
};

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function receiptValue(trend: MlbStatTrend, label: string) {
  return trend.receipts.find((receipt) => receipt.label.toLowerCase() === label.toLowerCase())?.value ?? null;
}

function signedNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function baseScore(trend: MlbStatTrend) {
  const gradePoints = trend.grade === "A" ? 25 : trend.grade === "B" ? 17 : trend.grade === "Watch" ? 8 : 0;
  const confidencePoints = clamp((trend.confidence - 0.5) * 100, 0, 28);
  const goodReceipts = trend.receipts.filter((receipt) => receipt.tone === "good").length;
  const warnReceipts = trend.receipts.filter((receipt) => receipt.tone === "warn").length;
  return gradePoints + confidencePoints + goodReceipts * 6 - warnReceipts * 4;
}

function statSeparationScore(trend: MlbStatTrend) {
  if (trend.category === "Recent Form") {
    const diff = Math.abs(signedNumber(receiptValue(trend, "Run diff/game")) ?? 0);
    return clamp(diff * 5, 0, 18);
  }
  if (trend.category === "Starter Edge") {
    const kbb = signedNumber(receiptValue(trend, "K/BB"));
    const last3 = signedNumber(receiptValue(trend, "Last 3 ERA"));
    return clamp((kbb ?? 0) * 2 + (last3 != null && last3 <= 3.5 ? 8 : 0), 0, 18);
  }
  if (trend.category === "Run Environment") {
    const runEnv = signedNumber(receiptValue(trend, "Projected run env"));
    if (runEnv == null) return 4;
    const distance = trend.side === "over" ? Math.abs(runEnv - 8.5) : Math.abs(8.0 - runEnv);
    return clamp(distance * 4, 0, 16);
  }
  return 0;
}

function buildGates(trend: MlbStatTrend, score: number): MlbDecisionGate[] {
  const hasStarterRisk = trend.warnings.some((warning) => /starter|probable|pitcher/i.test(warning));
  const hasSmallSample = trend.warnings.some((warning) => /small recent sample|sample/i.test(warning));
  return [
    {
      key: "stat-edge",
      label: "Stat edge",
      status: score >= 72 ? "PASS" : score >= 58 ? "WARN" : "FAIL",
      note: score >= 72 ? "Stat stack is strong enough for premium placement." : score >= 58 ? "Stat stack is useful but still needs confirmation." : "Stat stack is not strong enough for top placement."
    },
    {
      key: "price",
      label: "Market price",
      status: "PENDING",
      note: "Sportsbook line and no-vig price are not attached to this stat card yet."
    },
    {
      key: "lineup-weather",
      label: "Lineup/weather",
      status: "PENDING",
      note: "Confirmed MLB lineups, weather, umpire, and park run environment are still external gates."
    },
    {
      key: "pitcher-truth",
      label: "Pitcher truth",
      status: hasStarterRisk ? "WARN" : "PASS",
      note: hasStarterRisk ? "Trend depends on probable pitcher staying confirmed." : "No probable-pitcher warning on this card."
    },
    {
      key: "sample",
      label: "Sample quality",
      status: hasSmallSample ? "WARN" : "PASS",
      note: hasSmallSample ? "Recent sample is thin; avoid premium action until sample clears." : "No small-sample warning on this card."
    }
  ];
}

function actionabilityFor(score: number, gates: MlbDecisionGate[], trend: MlbStatTrend): MlbActionability {
  if (trend.grade === "Pass" || score < 50 || gates.some((gate) => gate.status === "FAIL")) return "PASS";
  if (score >= 72 && trend.grade === "A") return "PRICE_REQUIRED";
  if (score >= 60) return "PRICE_REQUIRED";
  return "WATCHLIST";
}

function actionabilitySummary(actionability: MlbActionability, trend: MlbStatTrend) {
  if (actionability === "ACTIONABLE_CANDIDATE") return "Actionable candidate after price, lineup, weather, and pitcher-truth checks clear.";
  if (actionability === "PRICE_REQUIRED") return `${trend.title} has a real stat stack, but it needs sportsbook price/no-vig edge before it can become a bet.`;
  if (actionability === "WATCHLIST") return `${trend.title} is useful context, but the score is not high enough for premium placement yet.`;
  return `${trend.title} does not clear the decision gate.`;
}

function enrichTrend(trend: MlbStatTrend): MlbEliteTrend {
  const warningPenalty = trend.warnings.length * 5;
  const score = round(clamp(baseScore(trend) + statSeparationScore(trend) - warningPenalty, 0, 100), 1);
  const gates = buildGates(trend, score);
  const actionability = actionabilityFor(score, gates, trend);
  const edgeStack = trend.receipts.map((receipt) => `${receipt.label}: ${receipt.value}`);
  const riskFlags = [
    ...trend.warnings,
    gates.some((gate) => gate.key === "price" && gate.status === "PENDING") ? "No attached market price/no-vig edge yet." : null,
    gates.some((gate) => gate.key === "lineup-weather" && gate.status === "PENDING") ? "Lineup/weather/umpire not confirmed in this card." : null
  ].filter((flag): flag is string => Boolean(flag));

  return {
    ...trend,
    decisionScore: score,
    actionability,
    decisionSummary: actionabilitySummary(actionability, trend),
    gates,
    edgeStack,
    riskFlags
  };
}

export async function buildMlbEliteDecisionTrends(args: { date?: string } = {}): Promise<MlbEliteTrendsPayload> {
  const payload = await buildMlbStatBackedTrends(args);
  const trends = payload.trends.map(enrichTrend).sort((left, right) => right.decisionScore - left.decisionScore || right.confidence - left.confidence);
  const avgDecisionScore = trends.length ? round(trends.reduce((sum, trend) => sum + trend.decisionScore, 0) / trends.length, 1) : 0;
  return {
    ...payload,
    sourceNote: `${payload.sourceNote} Elite decision layer adds score, actionability, and hard gates before promotion.`,
    stats: {
      ...payload.stats,
      actionableCandidates: trends.filter((trend) => trend.actionability === "ACTIONABLE_CANDIDATE").length,
      priceRequired: trends.filter((trend) => trend.actionability === "PRICE_REQUIRED").length,
      watchlist: trends.filter((trend) => trend.actionability === "WATCHLIST").length,
      pass: trends.filter((trend) => trend.actionability === "PASS").length,
      avgDecisionScore
    },
    trends
  };
}
