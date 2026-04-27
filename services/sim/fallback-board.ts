import { mockDatabase } from "@/prisma/seed-data";

type SimBoardEvent = {
  id: string;
  eventKey: string | null;
  league: string;
  name: string;
  startTime: string;
  status: string;
  participants: Array<{ role: string; competitor: string }>;
  projection: any | null;
  markets: any[];
  topSignals: Array<{
    edgeScore: number | null;
    evPercent: number | null;
    selectionCompetitor: any;
    player: any;
    sportsbook: any;
    marketType: string;
    side: string | null;
  }>;
  diagnostics: {
    hasProjection: boolean;
    signalCount: number;
    bestEdgeScore: number | null;
    bestEvPercent: number | null;
    marketCount: number;
    smartScore: number;
    confidenceBand: "HIGH" | "MEDIUM" | "LOW";
    recommendation: "ATTACK" | "WATCH" | "BUILDING" | "PASS";
  };
};

type SimBoardFeed = {
  generatedAt: string;
  summary: {
    totalEvents: number;
    projectedEvents: number;
    signalEvents: number;
    marketReadyEvents: number;
    attackableEvents: number;
  };
  events: SimBoardEvent[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getConfidenceBand(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 75) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

function getRecommendation(args: {
  hasProjection: boolean;
  marketCount: number;
  signalCount: number;
  bestEdgeScore: number | null;
  bestEvPercent: number | null;
}): "ATTACK" | "WATCH" | "BUILDING" | "PASS" {
  if (!args.hasProjection && args.marketCount === 0 && args.signalCount === 0) {
    return "PASS";
  }

  if (
    args.hasProjection &&
    args.marketCount >= 3 &&
    args.signalCount >= 2 &&
    (args.bestEdgeScore ?? 0) >= 60 &&
    (args.bestEvPercent ?? 0) >= 0.03
  ) {
    return "ATTACK";
  }

  if (
    args.hasProjection &&
    args.marketCount >= 1 &&
    ((args.bestEdgeScore ?? 0) >= 45 || (args.bestEvPercent ?? 0) >= 0.015)
  ) {
    return "WATCH";
  }

  return "BUILDING";
}

function buildMockSimEvent(league: string, index: number): SimBoardEvent {
  const teams = mockDatabase.teams;
  const away = teams[index % teams.length];
  const home = teams[(index + 1) % teams.length];
  const now = new Date();
  const startTime = new Date(now.getTime() + (index + 1) * 60 * 60 * 1000);

  const hasProjection = index % 3 !== 0;
  const marketCount = 5 + Math.floor(Math.random() * 10);
  const signalCount = hasProjection ? 2 + Math.floor(Math.random() * 4) : 0;
  const bestEdgeScore = signalCount > 0 ? 40 + Math.random() * 60 : null;
  const bestEvPercent = signalCount > 0 ? 0.02 + Math.random() * 0.1 : null;

  const smartScore = clamp(
    (hasProjection ? 35 : 0) +
      clamp(marketCount * 7, 0, 21) +
      clamp(signalCount * 6, 0, 24) +
      clamp((bestEdgeScore ?? 0) * 0.35, 0, 28) +
      clamp((bestEvPercent ?? 0) * 400, 0, 20),
    0,
    100
  );

  const confidenceBand = getConfidenceBand(smartScore);
  const recommendation = getRecommendation({
    hasProjection,
    marketCount,
    signalCount,
    bestEdgeScore,
    bestEvPercent
  });

  const topSignals = hasProjection
    ? [
        {
          marketType: "spread",
          edgeScore: (bestEdgeScore ?? 0) * 0.9,
          evPercent: (bestEvPercent ?? 0) * 0.8,
          selectionCompetitor: {
            id: away.id,
            name: away.name
          },
          player: null,
          sportsbook: null,
          side: "AWAY"
        },
        {
          marketType: "moneyline",
          edgeScore: (bestEdgeScore ?? 0) * 0.75,
          evPercent: (bestEvPercent ?? 0) * 0.7,
          selectionCompetitor: {
            id: home.id,
            name: home.name
          },
          player: null,
          sportsbook: null,
          side: "HOME"
        }
      ]
    : [];

  return {
    id: `mock-sim-${index}`,
    eventKey: `mock-${index}`,
    name: `${away.name} @ ${home.name}`,
    league: league || "NBA",
    startTime: startTime.toISOString(),
    status: "SCHEDULED",
    participants: [
      { role: "AWAY", competitor: away.name },
      { role: "HOME", competitor: home.name }
    ],
    diagnostics: {
      hasProjection,
      signalCount,
      bestEdgeScore,
      bestEvPercent,
      marketCount,
      smartScore,
      confidenceBand,
      recommendation
    },
    projection: hasProjection
      ? {
          projectedHomeScore: 102 + Math.random() * 15,
          projectedAwayScore: 98 + Math.random() * 15,
          projectedTotal: 200 + Math.random() * 25,
          winProbHome: 0.45 + Math.random() * 0.1
        }
      : null,
    markets: [],
    topSignals
  };
}

export function buildFallbackSimBoard(): SimBoardFeed {
  const events = Array.from({ length: 6 }, (_, i) => buildMockSimEvent("NBA", i));
  const attackable = events.filter((e) => e.diagnostics.recommendation === "ATTACK").length;
  const projected = events.filter((e) => e.diagnostics.hasProjection).length;
  const withSignals = events.filter((e) => e.diagnostics.signalCount > 0).length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalEvents: events.length,
      projectedEvents: projected,
      signalEvents: withSignals,
      marketReadyEvents: events.filter((e) => e.diagnostics.marketCount > 3).length,
      attackableEvents: attackable
    },
    events
  };
}
