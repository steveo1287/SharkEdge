import { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { calculateTrendStats } from "@/lib/trends/statisticalValidator";
import { matchTrendToGames, parseFilterConditions } from "@/lib/trends/trendMatcher";
import { generateTrendNaming } from "@/lib/trends/trendNamer";
import type {
  FilterConditions,
  TrendBuilderPreview,
  TrendDefinitionRecord,
  TrendMatchResult,
  TrendSnapshotView
} from "@/types/trends";

const DEFAULT_USER_ID = "user_demo";
const trendPrisma = prisma as unknown as PrismaClient;

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function ensureTrendUser() {
  await prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    update: {},
    create: {
      id: DEFAULT_USER_ID,
      username: "demo_bettor",
      bankrollSettingsJson: {
        bankroll: 5000,
        unitSize: 100
      }
    }
  });
}

function mapDefinition(definition: {
  id: string;
  name: string;
  description: string | null;
  sport: string;
  league: string | null;
  betType: string;
  filterConditionsJson: unknown;
  isSystemGenerated: boolean;
  isUserCreated: boolean;
  isPublic: boolean;
  isPremium: boolean;
  lastComputedAt: Date | null;
}): TrendDefinitionRecord {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    sport: definition.sport as TrendDefinitionRecord["sport"],
    league: definition.league as TrendDefinitionRecord["league"],
    betType: definition.betType as TrendDefinitionRecord["betType"],
    filterConditions: parseFilterConditions(definition.filterConditionsJson),
    isSystemGenerated: definition.isSystemGenerated,
    isUserCreated: definition.isUserCreated,
    isPublic: definition.isPublic,
    isPremium: definition.isPremium,
    lastComputedAt: definition.lastComputedAt?.toISOString() ?? null
  };
}

function mapSnapshot(snapshot: {
  id: string;
  trendDefinitionId: string;
  calculatedAt: Date;
  totalGames: number;
  wins: number;
  losses: number;
  pushes: number;
  winPercentage: number | null;
  roi: number | null;
  totalProfit: number | null;
  confidenceScore: number | null;
  sampleSizeRating: string | null;
  activeGameCount: number;
  warningsJson: unknown;
}): TrendSnapshotView {
  return {
    id: snapshot.id,
    trendDefinitionId: snapshot.trendDefinitionId,
    calculatedAt: snapshot.calculatedAt.toISOString(),
    totalGames: snapshot.totalGames,
    wins: snapshot.wins,
    losses: snapshot.losses,
    pushes: snapshot.pushes,
    winPercentage: snapshot.winPercentage,
    roi: snapshot.roi,
    totalProfit: snapshot.totalProfit,
    confidenceScore: snapshot.confidenceScore,
    sampleSizeRating: snapshot.sampleSizeRating,
    activeGameCount: snapshot.activeGameCount,
    warnings: Array.isArray(snapshot.warningsJson) ? snapshot.warningsJson.map(String) : []
  };
}

export async function previewTrendDefinition(filterConditions: FilterConditions): Promise<TrendBuilderPreview> {
  const historicalMatches = await matchTrendToGames(filterConditions);
  const stats = calculateTrendStats(historicalMatches);
  const activeMatches = await matchTrendToGames(filterConditions, { activeOnly: true, limit: 50 });
  const naming = generateTrendNaming(filterConditions, stats);

  return {
    stats,
    matches: historicalMatches.slice(-100),
    activeMatches,
    title: naming.title,
    shortDescription: naming.shortDescription,
    explanation: naming.explanation
  };
}

export async function createTrendDefinition(input: {
  name?: string;
  description?: string | null;
  filterConditions: FilterConditions;
  isPublic?: boolean;
}) {
  await ensureTrendUser();

  const filterConditions = parseFilterConditions(input.filterConditions);
  const preview = await previewTrendDefinition(filterConditions);

  if (preview.stats.totalGames < filterConditions.minGames) {
    const error = new Error(`Trend requires at least ${filterConditions.minGames} matched games.`);
    error.name = "TrendSampleSizeError";
    throw error;
  }

  const naming = generateTrendNaming(filterConditions, preview.stats);

  const definition = await trendPrisma.savedTrendDefinition.create({
    data: {
      creatorId: DEFAULT_USER_ID,
      name: input.name?.trim() || naming.title,
      description: input.description?.trim() || naming.shortDescription,
      sport: filterConditions.sport === "ALL" ? "OTHER" : filterConditions.sport,
      league: filterConditions.league === "ALL" ? null : filterConditions.league,
      betType: filterConditions.betType,
      filterConditionsJson: toInputJsonValue(filterConditions),
      currentStatsJson: toInputJsonValue(preview.stats),
      isPublic: input.isPublic ?? false,
      isUserCreated: true,
      lastComputedAt: new Date()
    }
  });

  if (preview.matches.length) {
    await trendPrisma.savedTrendMatch.createMany({
      data: preview.matches.map((match) => ({
        trendDefinitionId: definition.id,
        eventId: match.eventId,
        matchedAt: new Date(match.startTime),
        betResult: match.betResult,
        unitsWon: match.unitsWon,
        cumulativeProfit: match.cumulativeProfit,
        metadataJson: toInputJsonValue(match.metadata)
      })),
      skipDuplicates: true
    });
  }

  await trendPrisma.savedTrendSnapshot.create({
    data: {
      trendDefinitionId: definition.id,
      totalGames: preview.stats.totalGames,
      wins: preview.stats.wins,
      losses: preview.stats.losses,
      pushes: preview.stats.pushes,
      winPercentage: preview.stats.winPercentage,
      roi: preview.stats.roi,
      totalProfit: preview.stats.totalProfit,
      currentStreak: preview.stats.currentStreak,
      streakType: preview.stats.streakType,
      pValue: preview.stats.pValue,
      chiSquareStat: preview.stats.chiSquareStat,
      isStatisticallySignificant: preview.stats.isStatisticallySignificant,
      confidenceScore: preview.stats.confidenceScore,
      sampleSizeRating: preview.stats.sampleSizeRating,
      warningsJson: toInputJsonValue(preview.stats.warnings),
      activeGameCount: preview.activeMatches.length
    }
  });

  return {
    definition: mapDefinition(definition),
    preview
  };
}

export async function listTrendDefinitions(args?: {
  sport?: string;
  betType?: string;
  minConfidence?: number;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(args?.page ?? 1, 1);
  const limit = Math.min(Math.max(args?.limit ?? 20, 1), 50);
  const skip = (page - 1) * limit;

  const rows = await trendPrisma.savedTrendDefinition.findMany({
    where: {
      ...(args?.sport && args.sport !== "ALL" ? { sport: args.sport as never } : {}),
      ...(args?.betType ? { betType: args.betType } : {}),
      snapshots:
        typeof args?.minConfidence === "number" && args.minConfidence > 0
          ? {
              some: {
                confidenceScore: {
                  gte: args.minConfidence
                }
              }
            }
          : undefined
    },
    include: {
      snapshots: {
        orderBy: { calculatedAt: "desc" },
        take: 1
      }
    },
    orderBy: [{ lastComputedAt: "desc" }, { updatedAt: "desc" }],
    skip,
    take: limit
  });

  return rows.map((row: (typeof rows)[number]) => ({
    ...mapDefinition(row),
    latestSnapshot: row.snapshots[0] ? mapSnapshot(row.snapshots[0]) : null
  }));
}

export async function getTrendDefinitionDetail(id: string) {
  const definition = await trendPrisma.savedTrendDefinition.findUnique({
    where: { id },
    include: {
      matches: {
        orderBy: { matchedAt: "asc" },
        include: {
          event: {
            select: {
              id: true,
              name: true,
              startTime: true,
              sport: { select: { code: true } },
              league: { select: { key: true } }
            }
          }
        }
      },
      snapshots: {
        orderBy: { calculatedAt: "desc" },
        take: 20
      }
    }
  });

  if (!definition) {
    return null;
  }

  const filterConditions = parseFilterConditions(definition.filterConditionsJson);
  const matches: TrendMatchResult[] = definition.matches.map((match: (typeof definition.matches)[number]) => ({
    id: match.id,
    eventId: match.eventId,
    eventLabel: match.event.name,
    startTime: match.event.startTime.toISOString(),
    sport: match.event.sport.code,
    league: match.event.league.key,
    marketType: definition.betType,
    selection: definition.name,
    side: null,
    selectionCompetitorId: null,
    betResult: match.betResult as TrendMatchResult["betResult"],
    unitsWon: match.unitsWon,
    cumulativeProfit: match.cumulativeProfit,
    oddsAmerican: -110,
    line: null,
    closingLine: null,
    role: filterConditions.homeAway,
    todayEligible: false,
    whyMatched: [],
    metadata: (match.metadataJson as Record<string, unknown> | null) ?? {}
  }));

  return {
    definition: mapDefinition(definition),
    matches,
    snapshots: definition.snapshots.map(mapSnapshot)
  };
}

export async function getTrendDefinitionActiveMatches(id: string) {
  const definition = await trendPrisma.savedTrendDefinition.findUnique({
    where: { id },
    select: { filterConditionsJson: true }
  });

  if (!definition) {
    return null;
  }

  const filterConditions = parseFilterConditions(definition.filterConditionsJson);
  return matchTrendToGames(filterConditions, {
    activeOnly: true,
    limit: 50
  });
}
