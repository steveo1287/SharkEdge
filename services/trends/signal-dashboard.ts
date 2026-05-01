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

import { buildTrendSignals, type TrendSignal } from "./trends-engine";
import {
  buildTrendSystemRun,
  trendSystemMatchesToTodayMatches,
  type TrendSystemRun
} from "./trend-system-engine";

function leagueToSport(league: LeagueKey | "ALL"): SportCode {
  if (league === "MLB") return "BASEBALL";
  if (league === "NBA") return "BASKETBALL";
  if (league === "NHL") return "HOCKEY";
  if (league === "NFL" || league === "NCAAF") return "FOOTBALL";
  if (league === "UFC") return "MMA";
  if (league === "BOXING") return "BOXING";
  return "OTHER";
}

function formatPct(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}%` : null;
}

function formatEdge(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function isRealGameSignal(signal: TrendSignal) {
  return Boolean(signal.gameId && signal.matchup && signal.source !== "research-pattern");
}

function signalTone(signal: TrendSignal): TrendCardView["tone"] {
  if (signal.quality.actionability === "ACTIONABLE" || signal.qualityTier === "S" || signal.qualityTier === "A") return "success";
  if (signal.quality.actionability === "WATCHLIST" || signal.qualityTier === "B") return "brand";
  if (signal.source === "market-edge" || signal.category === "Totals") return "premium";
  return "muted";
}

function actionLabel(signal: TrendSignal) {
  if (signal.quality.actionability === "ACTIONABLE") return "REVIEW LIVE PRICE";
  if (signal.quality.actionability === "WATCHLIST") return "WATCH FOR PRICE";
  if (signal.source === "market-edge") return "PRICE CHECK";
  if (isRealGameSignal(signal)) return "GAME CONTEXT";
  return "RESEARCH ONLY";
}

function systemTone(system: TrendSystemRun["systems"][number]): TrendCardView["tone"] {
  if (system.actionability === "ACTIVE") return "success";
  if (system.activeMatches.length) return "brand";
  if (system.metrics.roiPct >= 12 || system.category === "Most Profitable") return "premium";
  return "muted";
}

function systemActionLabel(system: TrendSystemRun["systems"][number]) {
  if (system.actionability === "ACTIVE") return "ACTIVE MATCH";
  if (system.actionability === "WATCHLIST") return "WATCHLIST MATCH";
  if (system.actionability === "RESEARCH") return "RESEARCH SYSTEM";
  return "NO ACTIVE MATCH";
}

function safeLeague(league: LeagueKey | "ALL"): LeagueKey {
  return league === "ALL" ? "MLB" : league;
}

function signalMatch(signal: TrendSignal): TrendMatchView[] {
  if (!signal.gameId || !signal.matchup) return [];
  const league = safeLeague(signal.league);
  const eventLabel = `${signal.matchup.away} @ ${signal.matchup.home}`;
  const href = signal.actionHref || `/sim/${String(league).toLowerCase()}/${encodeURIComponent(signal.gameId)}`;

  return [
    {
      id: `${signal.id}:live`,
      sport: leagueToSport(signal.league),
      leagueKey: league,
      eventLabel,
      startTime: signal.startTime ?? new Date().toISOString(),
      status: "PREGAME",
      stateDetail: signal.status ?? null,
      matchingLogic: `${signal.league} | ${signal.market ?? signal.category} | ${signal.source}`,
      recommendedBetLabel: actionLabel(signal),
      oddsContext: [
        `Quality ${signal.qualityTier} · ${signal.qualityScore}/100`,
        signal.marketQuality.edgePercent != null ? `Edge ${signal.marketQuality.edgePercent}%` : null,
        signal.marketQuality.fairOddsAmerican != null ? `Fair ${signal.marketQuality.fairOddsAmerican > 0 ? "+" : ""}${signal.marketQuality.fairOddsAmerican}` : null,
        signal.warnings.includes("No current sportsbook price attached; keep as research/watchlist only.") ? "Current price needed" : null
      ].filter(Boolean).join(" · "),
      matchupHref: href,
      boardHref: league === "UFC" || league === "BOXING" ? null : `/?league=${league}`,
      propsHref: null,
      supportNote: signal.warnings[0] ?? signal.notes[0] ?? null
    }
  ];
}

function systemCard(system: TrendSystemRun["systems"][number], filters: TrendFilters): TrendCardView {
  const activeMatches = trendSystemMatchesToTodayMatches(system, system.activeMatches);
  const best = system.activeMatches[0];
  const systemHref = best?.href ?? `/trends?league=${system.league}&market=${system.market}`;

  return {
    id: `system:${system.id}`,
    title: `${system.name} · ${system.category}`,
    value: `${system.metrics.roiPct > 0 ? "+" : ""}${system.metrics.roiPct.toFixed(1)}% ROI`,
    hitRate: `${system.metrics.winRatePct.toFixed(1)}%`,
    roi: `${system.metrics.profitUnits > 0 ? "+" : ""}${system.metrics.profitUnits.toFixed(1)}u`,
    sampleSize: system.metrics.sampleSize,
    dateRange: `${system.metrics.seasons} season${system.metrics.seasons === 1 ? "" : "s"} · ${system.league} · ${system.market}`,
    note: [
      system.description,
      `Action Gate: ${systemActionLabel(system)}`,
      `${system.metrics.wins}-${system.metrics.losses}${system.metrics.pushes ? `-${system.metrics.pushes}` : ""}`,
      `Current streak ${system.metrics.currentStreak}`,
      best ? `Top active match: ${best.eventLabel}` : "No current slate match yet"
    ].filter(Boolean).join(". "),
    explanation: `Published SharkEdge trend system. Filter: ${system.filters.league} ${system.filters.market} ${system.filters.side}. Page filter: ${filters.league} ${filters.market}.`,
    whyItMatters: [
      `Historical record ${system.metrics.wins}-${system.metrics.losses}${system.metrics.pushes ? `-${system.metrics.pushes}` : ""}`,
      `Profit ${system.metrics.profitUnits > 0 ? "+" : ""}${system.metrics.profitUnits.toFixed(1)}u`,
      `Last 30 ${system.metrics.last30WinRatePct.toFixed(1)}%`,
      system.metrics.clvPct != null ? `CLV ${system.metrics.clvPct.toFixed(1)}%` : null,
      `${system.activeMatches.length} active match${system.activeMatches.length === 1 ? "" : "es"}`,
      ...system.rules.map((rule) => rule.label)
    ].filter(Boolean).join(" · "),
    caution: `Risk: ${system.risk}. Historical systems are not automatic bets; require current price, injury/news checks, and market confirmation before action.`,
    href: systemHref,
    tone: systemTone(system),
    todayMatches: activeMatches
  };
}

function signalCard(signal: TrendSignal, filters: TrendFilters): TrendCardView {
  const edge = formatEdge(signal.marketQuality.edgePercent ?? signal.edge);
  const score = `${signal.qualityScore}/100`;
  const hitRate = formatPct(signal.hitRate);
  const warningText = signal.warnings.length ? signal.warnings.slice(0, 3).join("; ") : null;
  const notes = signal.notes.filter(Boolean).slice(0, 6);
  const matchup = signal.matchup ? `${signal.matchup.away} @ ${signal.matchup.home}` : signal.title;

  return {
    id: signal.id,
    title: `${matchup} · ${signal.market ?? signal.category}`,
    value: edge ?? (signal.confidence ? `${(signal.confidence * 100).toFixed(1)}%` : score),
    hitRate,
    roi: null,
    sampleSize: signal.sample ?? 0,
    dateRange: `Current games · ${signal.league} · ${signal.market ?? signal.category}`,
    note: [
      signal.angle,
      `Action Gate: ${actionLabel(signal)}`,
      `Model confidence ${(signal.confidence * 100).toFixed(1)}%`,
      `Quality ${signal.qualityTier} ${score}`,
      signal.marketQuality.fairOddsAmerican != null ? `Fair-price checkpoint: ${signal.marketQuality.fairOddsAmerican > 0 ? "+" : ""}${signal.marketQuality.fairOddsAmerican} or better` : "Fair-price checkpoint: current sportsbook price required before this becomes actionable",
      signal.source === "sim-engine" ? "Real current game signal from the sim/model path; not a historical filler card" : null
    ].filter(Boolean).join(". "),
    explanation: `Real current ${signal.league} game/team trend generated from ${signal.source}. League filter: ${filters.league}.`,
    whyItMatters: [
      `Action Gate: ${actionLabel(signal)}`,
      `Quality tier ${signal.qualityTier}`,
      `Overfit risk ${signal.overfitRisk}`,
      signal.gameId ? `Game ${signal.gameId}` : null,
      ...notes
    ].filter(Boolean).join(" · "),
    caution: warningText
      ? `Kill switches: ${warningText}.`
      : "Kill switches: stale price, late lineup/news change, market moving through fair price, or quality tier downgrade.",
    href: signal.actionHref,
    tone: signalTone(signal),
    todayMatches: signalMatch(signal)
  };
}

function metrics(signals: TrendSignal[], hiddenCount: number, systemRun: TrendSystemRun): TrendMetricCard[] {
  const actionable = signals.filter((signal) => signal.quality.actionability === "ACTIONABLE").length;
  const priced = signals.filter((signal) => signal.source === "market-edge" || signal.marketQuality.currentOddsAmerican != null).length;
  const games = new Set(signals.map((signal) => signal.gameId).filter(Boolean)).size;
  const top = signals[0];

  return [
    { label: "Published systems", value: String(systemRun.summary.systems), note: `${systemRun.summary.activeSystems} active · ${systemRun.summary.actionableMatches} actionable matches.` },
    { label: "Real game trends", value: String(signals.length), note: "Current game/team signals only. Static research filler is excluded." },
    { label: "Games covered", value: String(games), note: "Unique current games represented on the trends page." },
    { label: "Priced signals", value: String(priced), note: "Signals with a market-edge or current price context." },
    { label: "Suppressed", value: String(hiddenCount), note: "Weak non-game/static signals kept out of the visible page." },
    { label: "Top read", value: top ? `${(top.confidence * 100).toFixed(1)}%` : "N/A", note: top?.title ?? "No current game signal." }
  ];
}

function rows(signals: TrendSignal[], systemRun: TrendSystemRun): TrendTableRow[] {
  const systemRows = systemRun.systems.slice(0, 12).map((system) => ({
    label: system.name,
    movement: systemActionLabel(system),
    note: [
      system.category,
      `${system.metrics.wins}-${system.metrics.losses}${system.metrics.pushes ? `-${system.metrics.pushes}` : ""}`,
      `${system.metrics.roiPct > 0 ? "+" : ""}${system.metrics.roiPct.toFixed(1)}% ROI`,
      `${system.activeMatches.length} active match${system.activeMatches.length === 1 ? "" : "es"}`
    ].join(" · "),
    href: system.activeMatches[0]?.href ?? `/trends?league=${system.league}&market=${system.market}`
  }));
  const signalRows = signals.slice(0, 20).map((signal) => ({
    label: signal.matchup ? `${signal.matchup.away} @ ${signal.matchup.home}` : `${signal.league} ${signal.market ?? signal.category}`,
    movement: actionLabel(signal),
    note: [
      signal.title,
      `${signal.market ?? signal.category}`,
      `Confidence ${(signal.confidence * 100).toFixed(1)}%`,
      `Quality ${signal.qualityTier} ${signal.qualityScore}/100`,
      signal.marketQuality.edgePercent != null ? `Edge ${signal.marketQuality.edgePercent}%` : null,
      signal.warnings[0] ?? null
    ].filter(Boolean).join(" · "),
    href: signal.actionHref
  }));
  return [...systemRows, ...signalRows];
}

function insights(signals: TrendSignal[], systemRun: TrendSystemRun): TrendInsightCard[] {
  const systemInsights = systemRun.systems.filter((system) => system.activeMatches.length || system.metrics.roiPct >= 10).slice(0, 3).map((system) => ({
    id: `system-insight-${system.id}`,
    title: system.name,
    value: systemActionLabel(system),
    note: `${system.metrics.roiPct > 0 ? "+" : ""}${system.metrics.roiPct.toFixed(1)}% ROI · ${system.metrics.winRatePct.toFixed(1)}% hit · ${system.activeMatches.length} active`,
    tone: systemTone(system)
  }));
  const signalInsights = signals.slice(0, Math.max(0, 4 - systemInsights.length)).map((signal) => ({
    id: `signal-insight-${signal.id}`,
    title: signal.matchup ? `${signal.matchup.away} @ ${signal.matchup.home}` : signal.title,
    value: actionLabel(signal),
    note: [signal.angle, `Quality ${signal.qualityTier}`, signal.warnings[0] ?? null].filter(Boolean).join(" · "),
    tone: signalTone(signal)
  }));
  return [...systemInsights, ...signalInsights];
}

function matchesMarketFilter(signal: TrendSignal, filterMarket: TrendFilters["market"]) {
  if (filterMarket === "ALL") return true;
  const market = String(signal.market ?? "").toLowerCase();
  const category = String(signal.category ?? "").toLowerCase();
  if (filterMarket === "total") return market.includes("total") || market.includes("over") || market.includes("under") || category.includes("total");
  if (filterMarket === "moneyline") return market.includes("moneyline") || market.includes("ml");
  if (filterMarket === "spread") return market.includes("spread") || market.includes("ats");
  return market.includes(filterMarket) || category.includes(filterMarket);
}

function matchesSystemMarketFilter(system: TrendSystemRun["systems"][number], filterMarket: TrendFilters["market"]) {
  return filterMarket === "ALL" || system.market === filterMarket;
}

function signalRank(signal: TrendSignal) {
  const pricedBoost = signal.source === "market-edge" ? 100 : 0;
  const actionableBoost = signal.quality.actionability === "ACTIONABLE" ? 80 : signal.quality.actionability === "WATCHLIST" ? 45 : 0;
  const confidenceScore = signal.confidence * 100;
  const edgeScore = typeof signal.marketQuality.edgePercent === "number" ? Math.abs(signal.marketQuality.edgePercent) * 4 : 0;
  return pricedBoost + actionableBoost + confidenceScore + edgeScore + signal.qualityScore;
}

function systemRank(system: TrendSystemRun["systems"][number]) {
  const actionBoost = system.actionability === "ACTIVE" ? 160 : system.actionability === "WATCHLIST" ? 100 : 20;
  const matchBoost = Math.min(5, system.activeMatches.length) * 20;
  return actionBoost + matchBoost + system.metrics.roiPct * 3 + system.metrics.winRatePct + (system.verified ? 25 : 0);
}

export async function buildSignalTrendDashboard(
  filters: TrendFilters,
  options?: { mode?: TrendMode; aiQuery?: string }
): Promise<TrendDashboardView | null> {
  const [payload, rawSystemRun] = await Promise.all([
    buildTrendSignals({
      league: filters.league === "ALL" ? "ALL" : filters.league,
      includeResearch: false,
      includeHidden: true
    }),
    buildTrendSystemRun({
      league: filters.league === "ALL" ? "ALL" : filters.league,
      includeInactive: true
    })
  ]);

  const signals = payload.signals
    .filter(isRealGameSignal)
    .filter((signal) => matchesMarketFilter(signal, filters.market))
    .sort((left, right) => signalRank(right) - signalRank(left))
    .slice(0, 40);

  const systemRun: TrendSystemRun = {
    ...rawSystemRun,
    systems: rawSystemRun.systems
      .filter((system) => matchesSystemMarketFilter(system, filters.market))
      .sort((left, right) => systemRank(right) - systemRank(left))
  };

  if (!signals.length && !systemRun.systems.length) return null;

  const systemCards = systemRun.systems.slice(0, 12).map((system) => systemCard(system, filters));
  const signalCards = signals.map((signal) => signalCard(signal, filters));
  const cards = [...systemCards, ...signalCards].slice(0, 48);
  const liveMatches = cards.flatMap((card) => card.todayMatches ?? []);
  const topSystem = systemRun.systems[0] ?? null;
  const topSignal = signals[0] ?? null;
  const hiddenStaticCount = Math.max(0, (payload.counts.totalRaw ?? payload.signals.length) - signals.length);

  return {
    setup: null,
    mode: options?.mode ?? "simple",
    aiQuery: options?.aiQuery ?? "",
    aiHelper: null,
    explanation: {
      headline: `${systemRun.systems.length} published systems and ${signals.length} real current-game trend${signals.length === 1 ? "" : "s"} loaded`,
      whyItMatters: topSystem
        ? `${topSystem.name} leads the system board with ${topSystem.metrics.roiPct > 0 ? "+" : ""}${topSystem.metrics.roiPct.toFixed(1)}% ROI and ${topSystem.activeMatches.length} active match${topSystem.activeMatches.length === 1 ? "" : "es"}.`
        : topSignal
          ? `${topSignal.matchup ? `${topSignal.matchup.away} @ ${topSignal.matchup.home}` : topSignal.title} leads the board. This view uses current game/team signals only; static fallback cards are excluded.`
          : "Published systems are loaded, but no current-game sim signals are available yet.",
      caution: "Historical systems and current-game signals are not automatic bets. Use action gates, price checkpoints, injury/news checks, and market confirmation before acting.",
      queryLogic: [filters.league, filters.market, filters.side, filters.window].filter(Boolean).join(" | ")
    },
    filters,
    cards,
    metrics: metrics(signals, hiddenStaticCount, systemRun),
    insights: insights(signals, systemRun),
    movementRows: rows(signals, systemRun),
    segmentRows: [
      { label: "Published systems", movement: `${systemRun.summary.systems} systems`, note: `${systemRun.summary.activeSystems} active systems and ${systemRun.summary.actionableMatches} actionable matches.`, href: "/api/trends/systems" },
      { label: "Current games", movement: `${new Set(signals.map((signal) => signal.gameId).filter(Boolean)).size} games`, note: "Real board/sim game signals represented on the trends page.", href: "/trends?mode=signals" },
      { label: "Priced market edges", movement: String(signals.filter((signal) => signal.source === "market-edge").length), note: "Signals with sportsbook/market edge support.", href: "/api/trends?mode=signals&debug=true" },
      { label: "Context-only signals", movement: String(signals.filter((signal) => signal.source === "sim-engine").length), note: "Real game model signals waiting for current price confirmation.", href: "/sim" }
    ],
    todayMatches: liveMatches,
    todayMatchesNote: liveMatches.length
      ? `${liveMatches.length} current game/system qualifier${liveMatches.length === 1 ? "" : "s"} attached from the real signal and published-system feeds.`
      : "Systems loaded, but no current game qualifiers were attached.",
    savedSystems: [],
    savedTrendName: "",
    sourceNote: "Showing published SharkEdge systems plus real current game/team trends from the signal engine. Static filler cards are disabled.",
    querySummary: [filters.league, filters.market, filters.side, filters.window].filter(Boolean).join(" | "),
    sampleNote: hiddenStaticCount
      ? `${hiddenStaticCount} static/non-game signal${hiddenStaticCount === 1 ? " was" : "s were"} excluded so the page shows real games and published systems only.`
      : null
  };
}
