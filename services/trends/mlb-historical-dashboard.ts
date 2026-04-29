import type {
  LeagueKey,
  SportCode,
  TrendCardView,
  TrendDashboardView,
  TrendFilters,
  TrendInsightCard,
  TrendMatchView,
  TrendMetricCard,
  TrendMode,
  TrendTableRow
} from "@/lib/types/domain";
import type { MlbTrendHistoryRow, PublishedMlbTrendCard } from "@/lib/types/mlb-trend-feed";

import { buildDeepMlbTrendSystems } from "./mlb-deep-trend-systems";

function pct(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(digits)}%` : null;
}

function hit(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : null;
}

function units(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}u` : null;
}

function price(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "price N/A";
  return value > 0 ? `+${value}` : String(value);
}

function marketLabel(card: PublishedMlbTrendCard) {
  if (card.betSide === "over" || card.betSide === "under") return "Total";
  if (card.betSide === "home_ml" || card.betSide === "away_ml") return "Moneyline";
  return "Runline";
}

function cardSide(card: PublishedMlbTrendCard) {
  if (card.betSide === "over") return "Over";
  if (card.betSide === "under") return "Under";
  if (card.betSide === "home_ml") return "Home ML";
  if (card.betSide === "away_ml") return "Away ML";
  if (card.betSide === "home_runline") return "Home RL";
  return "Away RL";
}

function sportForCard(_card: PublishedMlbTrendCard): SportCode {
  return "BASEBALL";
}

function leagueForCard(_card: PublishedMlbTrendCard): LeagueKey {
  return "MLB";
}

function actionGate(card: PublishedMlbTrendCard) {
  const hasActiveMatch = card.todayMatches.length > 0;
  const positiveRoi = typeof card.roi === "number" && card.roi > 0;
  const positiveUnits = typeof card.units === "number" && card.units > 0;
  const strongHit = typeof card.hitRate === "number" && card.hitRate >= 56;

  if (hasActiveMatch && card.sampleSize >= 40 && (positiveRoi || positiveUnits || strongHit) && card.confidenceLabel !== "LOW") {
    return "REVIEW LIVE PRICE";
  }

  if (card.sampleSize >= 25 && (positiveRoi || positiveUnits || strongHit)) {
    return "WATCH FOR PRICE";
  }

  if (card.sampleSize >= 10) return "HISTORICAL CONTEXT";
  return "THIN HISTORY";
}

function scoreHistoricalCard(card: PublishedMlbTrendCard) {
  const sample = Math.min(card.sampleSize, 150) * 2;
  const hitScore = typeof card.hitRate === "number" ? Math.max(0, card.hitRate - 50) * 8 : 0;
  const roiScore = typeof card.roi === "number" ? Math.max(0, card.roi) * 6 : 0;
  const unitScore = typeof card.units === "number" ? Math.max(0, card.units) * 3 : 0;
  const conditionBoost = Math.min(card.conditionCount ?? 0, 12) * 14;
  const activeBoost = Math.min(card.todayMatches.length, 4) * 60;
  const confidenceBoost = card.confidenceLabel === "HIGH" ? 120 : card.confidenceLabel === "MEDIUM" ? 60 : 10;
  const stabilityBoost = card.stabilityLabel === "STRONG" ? 90 : card.stabilityLabel === "STEADY" ? 45 : 5;
  return Math.round(sample + hitScore + roiScore + unitScore + conditionBoost + activeBoost + confidenceBoost + stabilityBoost);
}

function tone(card: PublishedMlbTrendCard): TrendCardView["tone"] {
  const gate = actionGate(card);
  if (gate === "REVIEW LIVE PRICE") return "success";
  if (gate === "WATCH FOR PRICE") return "brand";
  if (card.family === "TOTALS") return "premium";
  return "muted";
}

function fairPriceNote(card: PublishedMlbTrendCard) {
  if (card.roi === null) {
    return `ROI unavailable until enough historical closing prices are attached. Price coverage ${(card.roiCoverage ?? 0) * 100}% across ${card.pricedRows ?? 0} priced games.`;
  }

  if (card.roi <= 0) {
    return `Stored ROI is ${pct(card.roi)}. Do not chase worse current pricing.`;
  }

  return `Stored ROI is ${pct(card.roi)} with ${units(card.units)}. Current price must be at least as good as the historical closing-price profile.`;
}

function killSwitches(card: PublishedMlbTrendCard) {
  const warnings = [...card.warnings];
  if (!card.todayMatches.length) warnings.push("no current board match");
  if (card.sampleSize < 25) warnings.push("sample below 25");
  if (card.roi === null) warnings.push("ROI not fully supported by closing prices");

  return warnings.length
    ? `Kill switches: ${warnings.slice(0, 4).join("; ")}.`
    : "Kill switches: stale line, pitcher/lineup change, weather move, current price worse than historical fair checkpoint, or market moving against the setup.";
}

function matchHref(match: PublishedMlbTrendCard["todayMatches"][number]) {
  return match.gameId ? `/sim/mlb/${encodeURIComponent(match.gameId)}` : "/sim?league=MLB";
}

function mapMatches(card: PublishedMlbTrendCard): TrendMatchView[] {
  return card.todayMatches.slice(0, 8).map((match) => ({
    id: `${card.id}:${match.gameId}`,
    sport: sportForCard(card),
    leagueKey: leagueForCard(card),
    eventLabel: match.matchup,
    startTime: match.startsAt ?? new Date().toISOString(),
    status: "PREGAME",
    stateDetail: null,
    matchingLogic: `${card.conditionCount ?? 0} conditions · ${card.family} · ${marketLabel(card)} · ${cardSide(card)}`,
    recommendedBetLabel: actionGate(card),
    oddsContext: [
      `${card.record} historical record`,
      hit(card.hitRate) ? `${hit(card.hitRate)} hit` : null,
      pct(card.roi) ? `${pct(card.roi)} ROI` : "ROI pending closing-price coverage",
      units(card.units)
    ].filter(Boolean).join(" · "),
    matchupHref: matchHref(match),
    boardHref: "/?league=MLB",
    propsHref: null,
    supportNote: match.explanation || card.whyThisMatters
  }));
}

function historySummary(history: MlbTrendHistoryRow[] | undefined) {
  return (history ?? []).slice(0, 8).map((row) => {
    const result = row.result === "win" ? "W" : row.result === "loss" ? "L" : "P";
    return `${new Date(row.gameDate).toLocaleDateString()} ${result} ${row.recommendedBet} ${row.awayTeamName} ${row.awayScore}-${row.homeScore} ${row.homeTeamName} (${price(row.price)}, ${units(row.profitUnits)})`;
  });
}

function conditionSummary(card: PublishedMlbTrendCard) {
  const conditions = card.conditions ?? [];
  if (!conditions.length) return "No explicit condition labels attached.";
  return conditions.slice(0, 10).map((condition, index) => `${index + 1}. ${condition}`).join(" | ");
}

function mapCard(card: PublishedMlbTrendCard): TrendCardView {
  const gate = actionGate(card);
  const primary = units(card.units) ?? pct(card.roi) ?? hit(card.hitRate) ?? card.record;
  const historyRows = historySummary(card.history);

  return {
    id: `mlb-history-${card.id}`,
    title: `${card.title} · ${gate}`,
    value: primary,
    hitRate: hit(card.hitRate),
    roi: pct(card.roi),
    sampleSize: card.sampleSize,
    dateRange: `Deep MLB system · ${card.conditionCount ?? card.conditions?.length ?? 0} conditions · ${marketLabel(card)} · ${cardSide(card)}`,
    note: [
      card.description,
      `Action Gate: ${gate}`,
      `Conditions: ${conditionSummary(card)}`,
      `Record: ${card.record}`,
      `Last 10: ${card.last10 ?? "N/A"}`,
      `Streak: ${card.streak ?? "N/A"}`,
      `Years: ${card.yearsCovered ?? card.seasons?.length ?? "N/A"}`,
      `Confidence: ${card.confidenceLabel}`,
      `Stability: ${card.stabilityLabel}`,
      fairPriceNote(card),
      historyRows.length ? `Recent history: ${historyRows.join(" || ")}` : null
    ].filter(Boolean).join(". "),
    explanation: "Built from normalized MLB historical rows, condition matching, graded results, units, closing prices, and active-board matching.",
    whyItMatters: [
      card.whyThisMatters,
      `${card.sampleSize} historical graded games`,
      card.hitRate !== null ? `${card.hitRate.toFixed(1)}% hit rate` : null,
      card.roi !== null ? `${card.roi > 0 ? "+" : ""}${card.roi.toFixed(1)}% ROI` : null,
      units(card.units),
      `${card.todayMatches.length} active match${card.todayMatches.length === 1 ? "" : "es"}`
    ].filter(Boolean).join(" · "),
    caution: killSwitches(card),
    href: "/trends?league=MLB",
    tone: tone(card),
    todayMatches: mapMatches(card)
  };
}

function matchesFilter(card: PublishedMlbTrendCard, filters: TrendFilters) {
  if (filters.league !== "ALL" && filters.league !== "MLB") return false;
  if (filters.market !== "ALL") {
    const market = marketLabel(card).toLowerCase();
    if (filters.market === "total" && market !== "total") return false;
    if (filters.market === "moneyline" && market !== "moneyline") return false;
    if (filters.market === "spread" && market !== "runline") return false;
  }

  if (filters.side !== "ALL") {
    const side = card.betSide.toLowerCase();
    if (filters.side === "OVER" && side !== "over") return false;
    if (filters.side === "UNDER" && side !== "under") return false;
    if (filters.side === "HOME" && !side.startsWith("home")) return false;
    if (filters.side === "AWAY" && !side.startsWith("away")) return false;
  }

  return true;
}

function metrics(cards: PublishedMlbTrendCard[], warnings: string[]): TrendMetricCard[] {
  const currentMatches = cards.reduce((sum, card) => sum + card.todayMatches.length, 0);
  const pricedRoi = cards.filter((card) => card.roi !== null).length;
  const top = cards[0];
  const averageSample = cards.length
    ? Math.round(cards.reduce((sum, card) => sum + card.sampleSize, 0) / cards.length)
    : 0;
  const totalUnits = cards.reduce((sum, card) => sum + (card.units ?? 0), 0);
  const avgConditions = cards.length
    ? Math.round(cards.reduce((sum, card) => sum + (card.conditionCount ?? card.conditions?.length ?? 0), 0) / cards.length)
    : 0;

  return [
    { label: "Deep systems", value: String(cards.length), note: "Real MLB historical systems with condition stacks and graded history." },
    { label: "Avg conditions", value: String(avgConditions), note: "Average conditions attached to visible systems." },
    { label: "Avg sample", value: String(averageSample), note: "Average historical graded games per visible system." },
    { label: "Total units", value: units(totalUnits) ?? "0u", note: "Combined units across visible deep systems where price is known." },
    { label: "Current matches", value: String(currentMatches), note: "Current MLB board matches attached to deep historical systems." },
    { label: "Top score", value: top ? String(scoreHistoricalCard(top)) : "N/A", note: top?.title ?? "No historical trend card." },
    { label: "ROI-backed", value: String(pricedRoi), note: "Systems with enough closing-price support for ROI." },
    { label: "Warnings", value: String(warnings.length), note: warnings[0] ?? "No historical coverage warnings." }
  ];
}

function rows(cards: PublishedMlbTrendCard[]): TrendTableRow[] {
  return cards.slice(0, 20).map((card) => ({
    label: `${card.title}`,
    movement: actionGate(card),
    note: [
      `${card.conditionCount ?? card.conditions?.length ?? 0} conditions`,
      card.record,
      hit(card.hitRate) ? `${hit(card.hitRate)} hit` : null,
      pct(card.roi) ? `${pct(card.roi)} ROI` : "ROI pending",
      units(card.units),
      `Last 10 ${card.last10 ?? "N/A"}`,
      `Years ${card.yearsCovered ?? card.seasons?.length ?? "N/A"}`,
      `${card.todayMatches.length} active matches`
    ].filter(Boolean).join(" · "),
    href: "/trends?league=MLB"
  }));
}

function historyRows(cards: PublishedMlbTrendCard[]): TrendTableRow[] {
  return cards.flatMap((card) => (card.history ?? []).slice(0, 8).map((row) => ({
    label: `${row.matchup}`,
    movement: row.result === "win" ? "WIN" : row.result === "loss" ? "LOSS" : "PUSH",
    note: [
      new Date(row.gameDate).toLocaleDateString(),
      row.recommendedBet,
      `${row.awayScore}-${row.homeScore}`,
      price(row.price),
      units(row.profitUnits),
      card.title
    ].filter(Boolean).join(" · "),
    href: "/trends?league=MLB"
  }))).slice(0, 24);
}

function insights(cards: PublishedMlbTrendCard[]): TrendInsightCard[] {
  return cards.slice(0, 4).map((card) => ({
    id: `mlb-history-insight-${card.id}`,
    title: card.title,
    value: actionGate(card),
    note: [
      `${card.conditionCount ?? card.conditions?.length ?? 0} conditions`,
      card.whyThisMatters,
      `${card.record} record`,
      hit(card.hitRate),
      pct(card.roi),
      units(card.units),
      `Last 10 ${card.last10 ?? "N/A"}`,
      card.warnings[0] ?? null
    ]
      .filter(Boolean)
      .join(" · "),
    tone: tone(card)
  }));
}

export async function buildMlbHistoricalTrendDashboard(
  filters: TrendFilters,
  options?: { mode?: TrendMode; aiQuery?: string }
): Promise<TrendDashboardView | null> {
  if (filters.league !== "ALL" && filters.league !== "MLB") return null;

  const feed = await buildDeepMlbTrendSystems();
  const visibleCards = feed.cards
    .filter((card) => card.sampleSize > 0)
    .filter((card) => matchesFilter(card, filters))
    .sort((left, right) => scoreHistoricalCard(right) - scoreHistoricalCard(left));

  if (!visibleCards.length) return null;

  const cards = visibleCards.slice(0, 24).map(mapCard);
  const currentMatches = cards.flatMap((card) => card.todayMatches ?? []);
  const top = visibleCards[0];

  return {
    setup: null,
    mode: options?.mode ?? "simple",
    aiQuery: options?.aiQuery ?? "",
    aiHelper: null,
    explanation: {
      headline: `${cards.length} deep MLB historical system${cards.length === 1 ? "" : "s"} loaded`,
      whyItMatters: `${top.title} leads with ${top.conditionCount ?? top.conditions?.length ?? 0} conditions, ${top.record}, ${hit(top.hitRate) ?? "no hit rate"}, ${pct(top.roi) ?? "ROI pending"}, and ${units(top.units) ?? "units pending"}.`,
      caution: "Deep systems are not blind bets. Confirm current price, pitcher/lineup/weather, and whether the current game still matches every archived condition.",
      queryLogic: [filters.league, filters.market, filters.side, filters.window].filter(Boolean).join(" | ")
    },
    filters,
    cards,
    metrics: metrics(visibleCards, feed.warnings),
    insights: insights(visibleCards),
    movementRows: rows(visibleCards),
    segmentRows: historyRows(visibleCards),
    todayMatches: currentMatches,
    todayMatchesNote: currentMatches.length
      ? `${currentMatches.length} current MLB game qualifier${currentMatches.length === 1 ? "" : "s"} attached to deep historical systems.`
      : "Deep historical systems are loaded, but no current MLB games match those exact definitions right now.",
    savedSystems: [],
    savedTrendName: "",
    sourceNote: "Loaded from deep MLB historical systems: condition stacks, normalized historical rows, graded records, units, ROI, recent history, and active-board matching.",
    querySummary: [filters.league, filters.market, filters.side, filters.window].filter(Boolean).join(" | "),
    sampleNote: feed.warnings.length ? feed.warnings.slice(0, 3).join(" ") : null
  };
}
