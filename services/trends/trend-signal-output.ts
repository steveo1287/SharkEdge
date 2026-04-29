export type TrendSignalOutputShape = {
  grade: "A" | "B" | "C" | "Watch" | "Pass";
  qualityTier?: "S" | "A" | "B" | "C" | "HIDE";
  quality?: {
    actionability?: "ACTIONABLE" | "WATCHLIST" | "RESEARCH_ONLY" | "HIDE";
  };
};

export function isVisibleTrendSignal(signal: TrendSignalOutputShape) {
  return signal.qualityTier !== "HIDE" && signal.quality?.actionability !== "HIDE";
}

export function filterTrendSignalsForOutput<T extends TrendSignalOutputShape>(signals: T[], includeHidden = false) {
  return includeHidden ? signals : signals.filter(isVisibleTrendSignal);
}

export function summarizeTrendSignalCounts(signals: TrendSignalOutputShape[], visibleSignals = filterTrendSignalsForOutput(signals)) {
  return {
    total: visibleSignals.length,
    totalRaw: signals.length,
    attack: visibleSignals.filter((signal) => signal.grade === "A" || signal.grade === "B").length,
    watch: visibleSignals.filter((signal) => signal.grade === "Watch" || signal.grade === "C").length,
    pass: visibleSignals.filter((signal) => signal.grade === "Pass").length,
    actionable: visibleSignals.filter((signal) => signal.quality?.actionability === "ACTIONABLE").length,
    watchlist: visibleSignals.filter((signal) => signal.quality?.actionability === "WATCHLIST").length,
    researchOnly: visibleSignals.filter((signal) => signal.quality?.actionability === "RESEARCH_ONLY").length,
    hiddenQuality: signals.filter((signal) => signal.qualityTier === "HIDE" || signal.quality?.actionability === "HIDE").length
  };
}
