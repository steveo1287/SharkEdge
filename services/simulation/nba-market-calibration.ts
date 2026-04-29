import { readLatestOddsApiSnapshot } from "@/services/odds/the-odds-api-budget-service";

export type NbaMarketCalibration = {
  marketAvailable: boolean;
  marketSpreadHome: number | null;
  marketTotal: number | null;
  modelSpreadHome: number;
  modelTotal: number;
  spreadEdge: number | null;
  totalEdge: number | null;
  marketConfidenceAdjustment: number;
  signal: "model-only" | "aligned" | "spread-edge" | "total-edge" | "conflict";
  notes: string[];
};

type OddsOutcome = { name?: string; point?: number; price?: number };
type OddsMarket = { key?: string; outcomes?: OddsOutcome[] };
type OddsBook = { key?: string; title?: string; markets?: OddsMarket[] };
type OddsEvent = { sport_key?: string; home_team?: string; away_team?: string; bookmakers?: OddsBook[] };

const MAX_SPREAD_SIDE_MISMATCH = 0.25;
const MAX_OUTLIER_DISTANCE_FROM_MEDIAN = 2.5;

function normalize(value: string | undefined | null) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function robustConsensus(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) {
    return { value: null, usedCount: 0, rejectedCount: 0, medianValue: null };
  }

  const medianValue = median(valid);
  if (medianValue === null || valid.length < 3) {
    return { value: average(valid), usedCount: valid.length, rejectedCount: 0, medianValue };
  }

  const filtered = valid.filter((value) => Math.abs(value - medianValue) <= MAX_OUTLIER_DISTANCE_FROM_MEDIAN);
  const used = filtered.length >= 2 ? filtered : valid;
  return {
    value: average(used),
    usedCount: used.length,
    rejectedCount: valid.length - used.length,
    medianValue
  };
}

function findEvent(events: OddsEvent[], awayTeam: string, homeTeam: string) {
  const away = normalize(awayTeam);
  const home = normalize(homeTeam);
  return events.find((event) => event.sport_key === "basketball_nba" && normalize(event.away_team) === away && normalize(event.home_team) === home) ?? null;
}

export function normalizeHomeSpreadMarketPoint(point: number | null | undefined) {
  if (typeof point !== "number" || !Number.isFinite(point)) return null;

  // The Odds API stores spreads in sportsbook ticket notation.
  // Example: home favorite -6.5 means the home team must win by 7+.
  // SharkEdge's sim spread is projected home margin, so convert the market
  // line into the equivalent home-margin threshold before comparing.
  return Number((-point).toFixed(2));
}

function homeMarginThresholdFromAwayPoint(point: number | null | undefined) {
  if (typeof point !== "number" || !Number.isFinite(point)) return null;
  return Number(point.toFixed(2));
}

export function extractConsensusSpreadHome(event: OddsEvent, homeTeam: string, awayTeam: string) {
  const home = normalize(homeTeam);
  const away = normalize(awayTeam);
  const bookValues: number[] = [];
  let rejectedBooks = 0;
  let missingSideBooks = 0;

  for (const book of event.bookmakers ?? []) {
    for (const market of book.markets ?? []) {
      if (market.key !== "spreads") continue;

      const homeOutcome = (market.outcomes ?? []).find((outcome) => normalize(outcome.name) === home);
      const awayOutcome = (market.outcomes ?? []).find((outcome) => normalize(outcome.name) === away);
      const homeThreshold = normalizeHomeSpreadMarketPoint(homeOutcome?.point);
      const awayThreshold = homeMarginThresholdFromAwayPoint(awayOutcome?.point);

      if (homeThreshold === null && awayThreshold === null) {
        missingSideBooks += 1;
        continue;
      }

      if (homeThreshold !== null && awayThreshold !== null) {
        if (Math.abs(homeThreshold - awayThreshold) > MAX_SPREAD_SIDE_MISMATCH) {
          rejectedBooks += 1;
          continue;
        }
        bookValues.push(Number(((homeThreshold + awayThreshold) / 2).toFixed(2)));
        continue;
      }

      missingSideBooks += 1;
      bookValues.push(homeThreshold ?? awayThreshold!);
    }
  }

  const consensus = robustConsensus(bookValues);
  return {
    value: consensus.value,
    usedBookCount: consensus.usedCount,
    outlierBookCount: consensus.rejectedCount,
    rejectedBookCount: rejectedBooks,
    missingSideBookCount: missingSideBooks,
    rawBookCount: bookValues.length,
    medianValue: consensus.medianValue
  };
}

function extractTotal(event: OddsEvent) {
  const values: number[] = [];
  for (const book of event.bookmakers ?? []) {
    for (const market of book.markets ?? []) {
      if (market.key !== "totals") continue;
      for (const outcome of market.outcomes ?? []) {
        if (typeof outcome.point === "number") values.push(outcome.point);
      }
    }
  }
  return robustConsensus(values);
}

function classify(spreadEdge: number | null, totalEdge: number | null) {
  const spreadStrong = spreadEdge !== null && Math.abs(spreadEdge) >= 2.5;
  const totalStrong = totalEdge !== null && Math.abs(totalEdge) >= 4;
  if (spreadStrong && totalStrong && Math.sign(spreadEdge) !== Math.sign(totalEdge)) return "conflict" as const;
  if (spreadStrong) return "spread-edge" as const;
  if (totalStrong) return "total-edge" as const;
  if (spreadEdge !== null || totalEdge !== null) return "aligned" as const;
  return "model-only" as const;
}

export async function calibrateNbaAgainstMarket(args: {
  awayTeam: string;
  homeTeam: string;
  modelSpreadHome: number;
  modelTotal: number;
}): Promise<NbaMarketCalibration> {
  const snapshot = await readLatestOddsApiSnapshot();
  const event = findEvent((snapshot?.events ?? []) as OddsEvent[], args.awayTeam, args.homeTeam);

  if (!event) {
    return {
      marketAvailable: false,
      marketSpreadHome: null,
      marketTotal: null,
      modelSpreadHome: args.modelSpreadHome,
      modelTotal: args.modelTotal,
      spreadEdge: null,
      totalEdge: null,
      marketConfidenceAdjustment: -4,
      signal: "model-only",
      notes: ["No cached NBA market line found; using model-only projection."]
    };
  }

  const spreadConsensus = extractConsensusSpreadHome(event, args.homeTeam, args.awayTeam);
  const totalConsensus = extractTotal(event);
  const marketSpreadHome = spreadConsensus.value;
  const marketTotal = totalConsensus.value;
  const spreadEdge = marketSpreadHome === null ? null : Number((args.modelSpreadHome - marketSpreadHome).toFixed(2));
  const totalEdge = marketTotal === null ? null : Number((args.modelTotal - marketTotal).toFixed(2));
  const signal = classify(spreadEdge, totalEdge);
  const dataPenalty = spreadConsensus.usedBookCount < 2 || totalConsensus.usedCount < 2 ? -3 : 0;
  const outlierPenalty = spreadConsensus.outlierBookCount || spreadConsensus.rejectedBookCount || totalConsensus.rejectedCount ? -2 : 0;
  const marketConfidenceAdjustment =
    (signal === "conflict" ? -9 : signal === "spread-edge" || signal === "total-edge" ? 4 : signal === "aligned" ? 1 : -4) +
    dataPenalty +
    outlierPenalty;

  return {
    marketAvailable: true,
    marketSpreadHome: marketSpreadHome === null ? null : Number(marketSpreadHome.toFixed(2)),
    marketTotal: marketTotal === null ? null : Number(marketTotal.toFixed(2)),
    modelSpreadHome: args.modelSpreadHome,
    modelTotal: args.modelTotal,
    spreadEdge,
    totalEdge,
    marketConfidenceAdjustment,
    signal,
    notes: [
      spreadEdge === null ? "Spread market unavailable." : `Spread edge vs market: ${spreadEdge > 0 ? "+" : ""}${spreadEdge}.`,
      totalEdge === null ? "Total market unavailable." : `Total edge vs market: ${totalEdge > 0 ? "+" : ""}${totalEdge}.`,
      `Spread consensus used ${spreadConsensus.usedBookCount} book(s); rejected ${spreadConsensus.rejectedBookCount} bad side pair(s) and ${spreadConsensus.outlierBookCount} outlier(s).`,
      `Total consensus used ${totalConsensus.usedCount} line(s); rejected ${totalConsensus.rejectedCount} outlier(s).`,
      `Market calibration signal: ${signal}.`
    ]
  };
}
