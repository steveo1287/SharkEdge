import { buildMlbStatBackedTrends, type MlbStatTrend, type MlbStatTrendsPayload } from "./mlb-stat-trends";
import { buildMlbConsensusLine, fetchMlbSportsbookLines, type SportsbookLine } from "../simulation/mlb-edge-detector";

export type MlbDecisionGateStatus = "PASS" | "WARN" | "FAIL" | "PENDING";
export type MlbActionability = "ACTIONABLE_CANDIDATE" | "PRICE_REQUIRED" | "WATCHLIST" | "PASS";

export type MlbDecisionGate = {
  key: string;
  label: string;
  status: MlbDecisionGateStatus;
  note: string;
};

export type MlbMarketContext = {
  matched: boolean;
  marketSide: string | null;
  sportsbook: string | null;
  currentPriceAmerican: number | null;
  consensusTotal: number | null;
  noVigProbability: number | null;
  sourceCount: number;
  hold: number | null;
  warnings: string[];
  note: string;
};

export type MlbEliteTrend = MlbStatTrend & {
  decisionScore: number;
  actionability: MlbActionability;
  decisionSummary: string;
  gates: MlbDecisionGate[];
  edgeStack: string[];
  riskFlags: string[];
  marketContext: MlbMarketContext;
};

export type MlbEliteTrendsPayload = Omit<MlbStatTrendsPayload, "trends" | "stats"> & {
  stats: MlbStatTrendsPayload["stats"] & {
    actionableCandidates: number;
    priceRequired: number;
    watchlist: number;
    pass: number;
    avgDecisionScore: number;
    marketMatched: number;
    marketReady: number;
  };
  trends: MlbEliteTrend[];
};

type Matchup = { away: string; home: string };
type ConsensusLine = NonNullable<ReturnType<typeof buildMlbConsensusLine>>;

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function normalizeTeam(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^the/, "")
    .replace("whitesox", "chicagowhitesox")
    .replace("redsox", "bostonredsox")
    .replace("bluejays", "torontobluejays")
    .replace("diamondbacks", "arizonadiamondbacks")
    .replace("dbacks", "arizonadiamondbacks");
}

function teamMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeTeam(left);
  const b = normalizeTeam(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function parseMatchup(value: string): Matchup | null {
  const [away, home] = value.split(" @ ").map((part) => part.trim()).filter(Boolean);
  if (!away || !home) return null;
  return { away, home };
}

function lineMatches(line: SportsbookLine, matchup: Matchup) {
  return Boolean(line.homeTeam && line.awayTeam && teamMatch(line.homeTeam, matchup.home) && teamMatch(line.awayTeam, matchup.away));
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

function marketSide(trend: MlbStatTrend, matchup: Matchup | null) {
  if (trend.market === "total") return trend.side === "over" ? "over" : trend.side === "under" ? "under" : null;
  if (!matchup || !trend.team) return null;
  if (teamMatch(trend.team, matchup.home) || trend.side === "home") return "home";
  if (teamMatch(trend.team, matchup.away) || trend.side === "away") return "away";
  return null;
}

function buildMarketContext(trend: MlbStatTrend, lines: SportsbookLine[]): MlbMarketContext {
  const matchup = parseMatchup(trend.matchup);
  if (!matchup) {
    return { matched: false, marketSide: null, sportsbook: null, currentPriceAmerican: null, consensusTotal: null, noVigProbability: null, sourceCount: 0, hold: null, warnings: ["Could not parse matchup for market match."], note: "Market match unavailable." };
  }

  const matchedLines = lines.filter((line) => lineMatches(line, matchup));
  const consensus = buildMlbConsensusLine(matchedLines, matchup) as ConsensusLine | null;
  if (!consensus) {
    return { matched: false, marketSide: marketSide(trend, matchup), sportsbook: null, currentPriceAmerican: null, consensusTotal: null, noVigProbability: null, sourceCount: 0, hold: null, warnings: [], note: "No matching MLB sportsbook consensus found from persisted/external/snapshot lines." };
  }

  const side = marketSide(trend, matchup);
  const isTotal = trend.market === "total";
  const currentPriceAmerican = side === "home" ? consensus.homeMoneyline ?? null : side === "away" ? consensus.awayMoneyline ?? null : side === "over" ? consensus.overPrice ?? null : side === "under" ? consensus.underPrice ?? null : null;
  const noVigProbability = side === "home" ? consensus.homeNoVigProbability : side === "away" ? consensus.awayNoVigProbability : null;
  const sourceCount = isTotal ? consensus.totalSourceCount : consensus.moneylineSourceCount;
  const hold = isTotal ? consensus.totalHold : consensus.moneylineHold;
  const warnings = [...(consensus.warnings ?? [])];
  if (!sourceCount) warnings.push("Consensus matched but no valid source count for this market side.");
  if (currentPriceAmerican == null && !isTotal) warnings.push("Moneyline price missing for selected side.");
  if (currentPriceAmerican == null && isTotal) warnings.push("Total price missing for selected side.");

  const note = isTotal
    ? `Consensus total ${consensus.total ?? "TBD"}${currentPriceAmerican == null ? " with missing side price" : ` at ${currentPriceAmerican > 0 ? "+" : ""}${currentPriceAmerican}`}.`
    : `${side ?? "Selected side"} ML ${currentPriceAmerican == null ? "price missing" : `${currentPriceAmerican > 0 ? "+" : ""}${currentPriceAmerican}`} · no-vig ${noVigProbability == null ? "TBD" : `${(noVigProbability * 100).toFixed(1)}%`}.`;

  return {
    matched: true,
    marketSide: side,
    sportsbook: consensus.sportsbook ?? null,
    currentPriceAmerican,
    consensusTotal: consensus.total ?? null,
    noVigProbability,
    sourceCount,
    hold,
    warnings,
    note
  };
}

function priceGate(market: MlbMarketContext): MlbDecisionGate {
  if (!market.matched) {
    return { key: "price", label: "Market price", status: "PENDING", note: market.note };
  }
  if (market.sourceCount >= 2 && market.currentPriceAmerican != null && market.warnings.length === 0) {
    return { key: "price", label: "Market price", status: "PASS", note: `${market.note} ${market.sourceCount} valid books${market.hold == null ? "" : ` · hold ${(market.hold * 100).toFixed(1)}%`}.` };
  }
  return { key: "price", label: "Market price", status: "WARN", note: `${market.note} ${market.warnings.join(" ")}`.trim() };
}

function buildGates(trend: MlbStatTrend, score: number, market: MlbMarketContext): MlbDecisionGate[] {
  const hasStarterRisk = trend.warnings.some((warning) => /starter|probable|pitcher/i.test(warning));
  const hasSmallSample = trend.warnings.some((warning) => /small recent sample|sample/i.test(warning));
  return [
    {
      key: "stat-edge",
      label: "Stat edge",
      status: score >= 72 ? "PASS" : score >= 58 ? "WARN" : "FAIL",
      note: score >= 72 ? "Stat stack is strong enough for premium placement." : score >= 58 ? "Stat stack is useful but still needs confirmation." : "Stat stack is not strong enough for top placement."
    },
    priceGate(market),
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
  const price = gates.find((gate) => gate.key === "price");
  const stat = gates.find((gate) => gate.key === "stat-edge");
  if (trend.grade === "Pass" || score < 50 || stat?.status === "FAIL") return "PASS";
  if (score >= 72 && trend.grade === "A" && price?.status === "PASS") return "ACTIONABLE_CANDIDATE";
  if (score >= 60 && (price?.status === "PASS" || price?.status === "WARN")) return "PRICE_REQUIRED";
  if (score >= 60) return "PRICE_REQUIRED";
  return "WATCHLIST";
}

function actionabilitySummary(actionability: MlbActionability, trend: MlbStatTrend, market: MlbMarketContext) {
  if (actionability === "ACTIONABLE_CANDIDATE") return `${trend.title} has stat strength and matched market price. Final lineup/weather/umpire gates still decide whether it can be promoted.`;
  if (actionability === "PRICE_REQUIRED") return market.matched ? `${trend.title} has market context, but price quality or final edge gates are not clean enough yet.` : `${trend.title} has a real stat stack, but it needs sportsbook price/no-vig context before it can become a bet.`;
  if (actionability === "WATCHLIST") return `${trend.title} is useful context, but the score is not high enough for premium placement yet.`;
  return `${trend.title} does not clear the decision gate.`;
}

function enrichTrend(trend: MlbStatTrend, lines: SportsbookLine[]): MlbEliteTrend {
  const warningPenalty = trend.warnings.length * 5;
  const marketContext = buildMarketContext(trend, lines);
  const marketBonus = marketContext.matched ? marketContext.sourceCount >= 2 ? 7 : 3 : 0;
  const score = round(clamp(baseScore(trend) + statSeparationScore(trend) + marketBonus - warningPenalty, 0, 100), 1);
  const gates = buildGates(trend, score, marketContext);
  const actionability = actionabilityFor(score, gates, trend);
  const edgeStack = [
    ...trend.receipts.map((receipt) => `${receipt.label}: ${receipt.value}`),
    marketContext.matched ? `Market: ${marketContext.note}` : null
  ].filter((item): item is string => Boolean(item));
  const riskFlags = [
    ...trend.warnings,
    ...marketContext.warnings,
    !marketContext.matched ? "No attached MLB market consensus yet." : null,
    gates.some((gate) => gate.key === "lineup-weather" && gate.status === "PENDING") ? "Lineup/weather/umpire not confirmed in this card." : null
  ].filter((flag): flag is string => Boolean(flag));

  return {
    ...trend,
    decisionScore: score,
    actionability,
    decisionSummary: actionabilitySummary(actionability, trend, marketContext),
    gates,
    edgeStack,
    riskFlags,
    marketContext
  };
}

export async function buildMlbEliteDecisionTrends(args: { date?: string } = {}): Promise<MlbEliteTrendsPayload> {
  const [payload, lines] = await Promise.all([
    buildMlbStatBackedTrends(args),
    fetchMlbSportsbookLines({ allowRefresh: false }).catch(() => [] as SportsbookLine[])
  ]);
  const trends = payload.trends.map((trend) => enrichTrend(trend, lines)).sort((left, right) => right.decisionScore - left.decisionScore || right.confidence - left.confidence);
  const avgDecisionScore = trends.length ? round(trends.reduce((sum, trend) => sum + trend.decisionScore, 0) / trends.length, 1) : 0;
  return {
    ...payload,
    sourceNote: `${payload.sourceNote} Elite decision layer adds score, actionability, market context, and hard gates before promotion.`,
    stats: {
      ...payload.stats,
      actionableCandidates: trends.filter((trend) => trend.actionability === "ACTIONABLE_CANDIDATE").length,
      priceRequired: trends.filter((trend) => trend.actionability === "PRICE_REQUIRED").length,
      watchlist: trends.filter((trend) => trend.actionability === "WATCHLIST").length,
      pass: trends.filter((trend) => trend.actionability === "PASS").length,
      avgDecisionScore,
      marketMatched: trends.filter((trend) => trend.marketContext.matched).length,
      marketReady: trends.filter((trend) => trend.gates.some((gate) => gate.key === "price" && gate.status === "PASS")).length
    },
    trends
  };
}
