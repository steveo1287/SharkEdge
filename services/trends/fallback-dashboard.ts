import type {
  TrendCardView,
  TrendDashboardView,
  TrendFilters,
  SavedTrendSystemView
} from "@/lib/types/domain";
import { mockDatabase } from "@/prisma/seed-data";

function buildMockTrendCard(
  league: string,
  market: string,
  team: string,
  index: number
): TrendCardView | any {
  const hitRates = [0.52, 0.55, 0.58, 0.48, 0.61, 0.51];
  const roiValues = [-0.05, 0.08, 0.12, -0.03, 0.15, 0.02];
  const samples = [20, 35, 18, 42, 28, 31];
  const sides = ["HOME", "AWAY", "OVER", "UNDER"];

  const hitRate = hitRates[index % hitRates.length] ?? 0.5;
  const roi = roiValues[index % roiValues.length] ?? 0.0;
  const sample = samples[index % samples.length] ?? 25;
  const side = sides[index % sides.length];

  return {
    label: `${team} ${market} trend`,
    sport: "BASKETBALL" as any,
    league: league as any,
    marketType: (market.toLowerCase() === "spread" ? "spread" : market.toLowerCase() === "total" ? "total" : "moneyline") as any,
    side: side as any,
    sample,
    hitRate,
    roi,
    pValue: 0.05 + Math.random() * 0.4,
    confidenceScore: Math.max(0.3, hitRate - 0.4),
    explanation: `${team} in ${market} shows a ${(hitRate * 100).toFixed(1)}% hit rate over ${sample} games`,
    sourceNote: "Mock historical data (database unavailable)",
    isSaved: false,
    detailHref: `/trends?team=${team}&market=${market}`,
    trend: {
      direction: roi > 0 ? "UP" : roi < 0 ? "DOWN" : "NEUTRAL",
      recentForm: ["WIN", "WIN", "LOSS", "WIN", "WIN"][index % 5] as any,
      momentum: roi > 0.1 ? "STRONG" : roi > 0 ? "MILD" : "NEUTRAL"
    }
  };
}

function buildMockSavedTrend(index: number): SavedTrendSystemView | any {
  const names = [
    "Hot home teams",
    "Rest advantage moneyline",
    "Back-to-back underdog moneylines",
    "Spread flatness after big wins",
    "Revenge game spreads"
  ];

  const name = names[index % names.length] ?? "Unnamed trend";

  return {
    id: `mock-trend-${index}`,
    name,
    description: `${name} - a historically profitable pattern from mock data`,
    sport: "basketball",
    league: "NBA",
    marketType: "spread",
    side: ["HOME", "AWAY", "OVER", "UNDER"][index % 4] as any,
    sample: 20 + index * 5,
    hitRate: 0.48 + Math.random() * 0.15,
    roi: -0.05 + Math.random() * 0.2,
    tier: (["A", "B", "C", "D", "F"] as const)[index % 5],
    status: index % 3 === 0 ? ("INACTIVE" as const) : ("ACTIVE" as const),
    isSystemGenerated: index % 2 === 0,
    detailHref: `/trends?savedTrendId=mock-trend-${index}`,
    sourceNote: "Mock historical trend (database unavailable)"
  };
}

export function buildFallbackTrendDashboard(filters: TrendFilters): TrendDashboardView | any {
  const teams = mockDatabase.teams.slice(0, 5).map((t) => t.name);
  const markets = ["spread", "moneyline", "total"];

  const cards: TrendCardView[] = [];
  let cardIndex = 0;

  for (const team of teams) {
    for (const market of markets) {
      cards.push(
        buildMockTrendCard(filters.league, market, team, cardIndex++)
      );
      if (cards.length >= 12) break;
    }
    if (cards.length >= 12) break;
  }

  const savedTrends = Array.from({ length: 3 }, (_, i) =>
    buildMockSavedTrend(i)
  );

  const cardsAsAny = cards as any[];
  const profitableCards = cardsAsAny.filter((c) => (c.roi ?? 0) > 0);
  const totalRoi = cardsAsAny.reduce((sum, c) => sum + (c.roi ?? 0), 0);
  const avgRoi = cardsAsAny.length > 0 ? totalRoi / cardsAsAny.length : 0;
  const avgHitRate = cardsAsAny.length > 0 ? cardsAsAny.reduce((sum, c) => sum + c.hitRate, 0) / cardsAsAny.length : 0;
  const totalSampleSize = cardsAsAny.reduce((sum, c) => sum + (c.sample ?? 0), 0);

  return {
    filters,
    setup: {
      available: false,
      reason: "Database not available - displaying mock historical trends",
      status: "blocked" as const,
      detailedMessage:
        "SharkEdge database is not connected. Trends page is showing mock data to demonstrate functionality. Set DATABASE_URL and run migrations for real historical trend analysis.",
      nextSteps: [
        "Set DATABASE_URL environment variable",
        "Run: npx prisma migrate deploy",
        "Run: npm run import:free-historical",
        "Trends will then use real historical odds and game data"
      ]
    },
    trend: {
      labelSingle: "trend",
      labelPlural: "trends",
      description: "Historical patterns from mock data"
    },
    cards,
    savedSystems: savedTrends,
    summary: {
      totalTrends: cards.length,
      profitableTrends: profitableCards.length,
      avgRoi,
      avgHitRate,
      sampleSize: totalSampleSize
    },
    diagnostics: {
      dataSource: "mock",
      recordsQueried: cards.length,
      queryDuration: "instant",
      warnings: [
        "Mock data is for UI demonstration only",
        "Connect to database for real historical analysis"
      ]
    }
  };
}
