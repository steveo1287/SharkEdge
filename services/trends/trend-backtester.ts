import type { TrendCandidateSystem, TrendFactoryGate } from "./trend-candidate-types";

export type TrendBacktestOutcome = "WIN" | "LOSS" | "PUSH" | "VOID" | "PENDING" | "UNKNOWN";

export type HistoricalTrendEvent = {
  id: string;
  date: string;
  league: string;
  market: string;
  side: string;
  matchup: string;
  team?: string | null;
  opponent?: string | null;
  venue?: string | null;
  price?: number | null;
  closingPrice?: number | null;
  result?: TrendBacktestOutcome | string | null;
  units?: number | null;
  filters?: Record<string, string | number | boolean | null | undefined>;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type TrendBacktestHistoryRow = {
  id: string;
  date: string;
  matchup: string;
  side: string;
  price: number | null;
  closingPrice: number | null;
  result: TrendBacktestOutcome;
  units: number;
  clvPct: number | null;
  matchedFilters: string[];
  qualifyingReason: string;
};

export type TrendBacktestSummary = {
  candidateId: string;
  candidateName: string;
  status: "ready" | "no_rows" | "no_matches" | "insufficient_sample";
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  pending: number;
  profitUnits: number;
  roiPct: number | null;
  winRatePct: number | null;
  clvPct: number | null;
  averagePrice: number | null;
  last10: string;
  last30: string;
  currentStreak: string | null;
  grade: "A" | "B" | "C" | "D" | "P";
  qualityGate: TrendFactoryGate;
  gateReasons: string[];
  blockers: string[];
  historyRows: TrendBacktestHistoryRow[];
  rejectedRows: number;
  sourceNote: string;
};

export type TrendBacktestOptions = {
  minSample?: number;
  historyLimit?: number;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeOutcome(value: unknown): TrendBacktestOutcome {
  const result = normalize(value).toUpperCase();
  if (["WIN", "W", "WON", "CASH", "FINAL_WON"].includes(result)) return "WIN";
  if (["LOSS", "L", "LOST", "LOSE", "FINAL_LOST"].includes(result)) return "LOSS";
  if (["PUSH", "TIE"].includes(result)) return "PUSH";
  if (["VOID", "CANCELLED", "CANCELED", "NO_ACTION"].includes(result)) return "VOID";
  if (["PENDING", "OPEN", "ACTIVE", "SCHEDULED", "LIVE"].includes(result)) return "PENDING";
  return "UNKNOWN";
}

function impliedProbabilityFromAmerican(price: number | null | undefined) {
  if (typeof price !== "number" || !Number.isFinite(price) || price === 0) return null;
  if (price > 0) return 100 / (price + 100);
  return Math.abs(price) / (Math.abs(price) + 100);
}

function unitsForOutcome(outcome: TrendBacktestOutcome, price: number | null | undefined) {
  if (outcome === "WIN") {
    if (typeof price === "number" && Number.isFinite(price) && price > 0) return price / 100;
    return 1;
  }
  if (outcome === "LOSS") return -1;
  return 0;
}

function clvForRow(price: number | null | undefined, closingPrice: number | null | undefined) {
  const openProb = impliedProbabilityFromAmerican(price);
  const closeProb = impliedProbabilityFromAmerican(closingPrice);
  if (openProb == null || closeProb == null) return null;
  return Number(((closeProb - openProb) * 100).toFixed(2));
}

function rowMatchesBase(candidate: TrendCandidateSystem, row: HistoricalTrendEvent) {
  return normalize(row.league) === normalize(candidate.league)
    && normalize(row.market) === normalize(candidate.market)
    && normalize(row.side) === normalize(candidate.side);
}

function rowFilterValue(row: HistoricalTrendEvent, key: string) {
  return row.filters?.[key] ?? row.metadata?.[key] ?? row.tags?.find((tag) => normalize(tag) === normalize(key));
}

function rowMatchesCondition(row: HistoricalTrendEvent, key: string, expected: string) {
  const value = rowFilterValue(row, key);
  if (value == null) return false;
  if (typeof value === "boolean") return value && normalize(expected) !== "false";
  return normalize(value) === normalize(expected) || normalize(value).includes(normalize(expected));
}

function rowMatchesCandidate(candidate: TrendCandidateSystem, row: HistoricalTrendEvent) {
  if (!rowMatchesBase(candidate, row)) return false;
  return candidate.conditions.every((condition) => rowMatchesCondition(row, condition.key, condition.value));
}

function qualifyingReason(candidate: TrendCandidateSystem, row: HistoricalTrendEvent) {
  const matched = candidate.conditions.filter((condition) => rowMatchesCondition(row, condition.key, condition.value));
  if (!matched.length) return `${candidate.league} ${candidate.market} ${candidate.side} base match.`;
  return matched.map((condition) => condition.label).join(" · ");
}

function matchedFilters(candidate: TrendCandidateSystem, row: HistoricalTrendEvent) {
  return candidate.conditions
    .filter((condition) => rowMatchesCondition(row, condition.key, condition.value))
    .map((condition) => condition.key);
}

function streak(outcomes: TrendBacktestOutcome[]) {
  const settled = outcomes.filter((outcome) => outcome === "WIN" || outcome === "LOSS");
  if (!settled.length) return null;
  const last = settled[settled.length - 1];
  let count = 0;
  for (let index = settled.length - 1; index >= 0; index -= 1) {
    if (settled[index] !== last) break;
    count += 1;
  }
  return `${last === "WIN" ? "W" : "L"}${count}`;
}

function compactRecord(outcomes: TrendBacktestOutcome[], take: number) {
  const settled = outcomes.filter((outcome) => outcome === "WIN" || outcome === "LOSS" || outcome === "PUSH").slice(-take);
  const wins = settled.filter((outcome) => outcome === "WIN").length;
  const losses = settled.filter((outcome) => outcome === "LOSS").length;
  const pushes = settled.filter((outcome) => outcome === "PUSH").length;
  return `${wins}-${losses}${pushes ? `-${pushes}` : ""}`;
}

function gradeSummary(sampleSize: number, roiPct: number | null, winRatePct: number | null, clvPct: number | null, blockers: string[]): TrendBacktestSummary["grade"] {
  if (sampleSize < 25) return "P";
  if (blockers.length) return "C";
  const roi = roiPct ?? 0;
  const win = winRatePct ?? 0;
  const clv = clvPct ?? 0;
  if (sampleSize >= 100 && roi >= 10 && win >= 55 && clv >= 0) return "A";
  if (sampleSize >= 50 && roi > 0 && win >= 52) return "B";
  if (sampleSize >= 25 && roi >= 0) return "C";
  return "D";
}

function chooseGate(sampleSize: number, roiPct: number | null, clvPct: number | null, baseBlockers: string[], minSample: number): Pick<TrendBacktestSummary, "qualityGate" | "gateReasons" | "blockers"> {
  const blockers = [...baseBlockers];
  const gateReasons: string[] = [];
  if (sampleSize < minSample) blockers.push(`Sample below ${minSample}.`);
  if ((roiPct ?? 0) <= 0) blockers.push("ROI is not positive.");
  if (clvPct != null && clvPct < 0) blockers.push("Average CLV is negative.");
  if (sampleSize >= minSample) gateReasons.push("Sample clears minimum backtest floor.");
  if ((roiPct ?? 0) > 0) gateReasons.push("Backtest ROI is positive.");
  if (clvPct != null && clvPct >= 0) gateReasons.push("Average CLV is non-negative.");
  if (blockers.length) return { qualityGate: "research_candidate", gateReasons, blockers };
  if (gateReasons.length >= 3 && sampleSize >= minSample * 2) return { qualityGate: "promote_candidate", gateReasons, blockers };
  return { qualityGate: "watch_candidate", gateReasons, blockers };
}

export function backtestTrendCandidate(candidate: TrendCandidateSystem, rows: HistoricalTrendEvent[], options: TrendBacktestOptions = {}): TrendBacktestSummary {
  const minSample = options.minSample ?? 50;
  const historyLimit = options.historyLimit ?? 100;

  if (!rows.length) {
    return {
      candidateId: candidate.id,
      candidateName: candidate.name,
      status: "no_rows",
      sampleSize: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      voids: 0,
      pending: 0,
      profitUnits: 0,
      roiPct: null,
      winRatePct: null,
      clvPct: null,
      averagePrice: null,
      last10: "0-0",
      last30: "0-0",
      currentStreak: null,
      grade: "P",
      qualityGate: "blocked_candidate",
      gateReasons: [],
      blockers: ["No historical event rows were provided to the backtest engine."],
      historyRows: [],
      rejectedRows: 0,
      sourceNote: "Backtest engine is ready, but no historical source is connected for this candidate."
    };
  }

  const matched = rows.filter((row) => rowMatchesCandidate(candidate, row));
  const rejectedRows = rows.length - matched.length;

  if (!matched.length) {
    return {
      candidateId: candidate.id,
      candidateName: candidate.name,
      status: "no_matches",
      sampleSize: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      voids: 0,
      pending: 0,
      profitUnits: 0,
      roiPct: null,
      winRatePct: null,
      clvPct: null,
      averagePrice: null,
      last10: "0-0",
      last30: "0-0",
      currentStreak: null,
      grade: "P",
      qualityGate: "blocked_candidate",
      gateReasons: [],
      blockers: ["Historical rows were provided, but none matched this candidate's filters."],
      historyRows: [],
      rejectedRows,
      sourceNote: "No matching historical rows for this candidate."
    };
  }

  const historyRows = matched
    .slice()
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
    .map<TrendBacktestHistoryRow>((row) => {
      const result = normalizeOutcome(row.result);
      const units = typeof row.units === "number" && Number.isFinite(row.units) ? row.units : unitsForOutcome(result, row.price);
      return {
        id: row.id,
        date: row.date,
        matchup: row.matchup,
        side: row.side,
        price: typeof row.price === "number" && Number.isFinite(row.price) ? row.price : null,
        closingPrice: typeof row.closingPrice === "number" && Number.isFinite(row.closingPrice) ? row.closingPrice : null,
        result,
        units,
        clvPct: clvForRow(row.price, row.closingPrice),
        matchedFilters: matchedFilters(candidate, row),
        qualifyingReason: qualifyingReason(candidate, row)
      };
    });

  const settled = historyRows.filter((row) => row.result === "WIN" || row.result === "LOSS" || row.result === "PUSH");
  const wins = historyRows.filter((row) => row.result === "WIN").length;
  const losses = historyRows.filter((row) => row.result === "LOSS").length;
  const pushes = historyRows.filter((row) => row.result === "PUSH").length;
  const voids = historyRows.filter((row) => row.result === "VOID").length;
  const pending = historyRows.filter((row) => row.result === "PENDING" || row.result === "UNKNOWN").length;
  const sampleSize = settled.length;
  const profitUnits = Number(historyRows.reduce((total, row) => total + row.units, 0).toFixed(2));
  const roiPct = sampleSize ? Number(((profitUnits / sampleSize) * 100).toFixed(2)) : null;
  const winRatePct = wins + losses ? Number(((wins / (wins + losses)) * 100).toFixed(2)) : null;
  const clvRows = historyRows.map((row) => row.clvPct).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const clvPct = clvRows.length ? Number((clvRows.reduce((total, value) => total + value, 0) / clvRows.length).toFixed(2)) : null;
  const prices = historyRows.map((row) => row.price).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averagePrice = prices.length ? Math.round(prices.reduce((total, value) => total + value, 0) / prices.length) : null;
  const gate = chooseGate(sampleSize, roiPct, clvPct, candidate.blockers, minSample);
  const grade = gradeSummary(sampleSize, roiPct, winRatePct, clvPct, gate.blockers);

  return {
    candidateId: candidate.id,
    candidateName: candidate.name,
    status: sampleSize < minSample ? "insufficient_sample" : "ready",
    sampleSize,
    wins,
    losses,
    pushes,
    voids,
    pending,
    profitUnits,
    roiPct,
    winRatePct,
    clvPct,
    averagePrice,
    last10: compactRecord(historyRows.map((row) => row.result), 10),
    last30: compactRecord(historyRows.map((row) => row.result), 30),
    currentStreak: streak(historyRows.map((row) => row.result)),
    grade,
    qualityGate: gate.qualityGate,
    gateReasons: gate.gateReasons,
    blockers: gate.blockers,
    historyRows: historyRows.slice(-historyLimit).reverse(),
    rejectedRows,
    sourceNote: `Backtested ${matched.length} matching rows from ${rows.length} supplied historical rows.`
  };
}

export function backtestTrendCandidates(candidates: TrendCandidateSystem[], rows: HistoricalTrendEvent[], options: TrendBacktestOptions = {}) {
  return candidates.map((candidate) => backtestTrendCandidate(candidate, rows, options));
}
