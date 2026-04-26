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

function normalize(value: string | undefined | null) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function findEvent(events: OddsEvent[], awayTeam: string, homeTeam: string) {
  const away = normalize(awayTeam);
  const home = normalize(homeTeam);
  return events.find((event) => event.sport_key === "basketball_nba" && normalize(event.away_team) === away && normalize(event.home_team) === home) ?? null;
}

function extractSpreadHome(event: OddsEvent, homeTeam: string) {
  const home = normalize(homeTeam);
  const values: number[] = [];
  for (const book of event.bookmakers ?? []) {
    for (const market of book.markets ?? []) {
      if (market.key !== "spreads") continue;
      for (const outcome of market.outcomes ?? []) {
        if (normalize(outcome.name) === home && typeof outcome.point === "number") values.push(outcome.point);
      }
    }
  }
  return average(values);
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
  return average(values);
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

  const marketSpreadHome = extractSpreadHome(event, args.homeTeam);
  const marketTotal = extractTotal(event);
  const spreadEdge = marketSpreadHome === null ? null : Number((args.modelSpreadHome - marketSpreadHome).toFixed(2));
  const totalEdge = marketTotal === null ? null : Number((args.modelTotal - marketTotal).toFixed(2));
  const signal = classify(spreadEdge, totalEdge);
  const marketConfidenceAdjustment = signal === "conflict" ? -9 : signal === "spread-edge" || signal === "total-edge" ? 4 : signal === "aligned" ? 1 : -4;

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
      `Market calibration signal: ${signal}.`
    ]
  };
}
