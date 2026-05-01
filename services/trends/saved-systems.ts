import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type {
  SavedTrendSystemView,
  TrendFilters,
  TrendMode
} from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";

const DEFAULT_USER_ID = "user_demo";

type SavedTrendQueryJson = {
  filters: TrendFilters;
  aiQuery?: string | null;
  mode?: TrendMode;
};

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isUsableSavedTrendId(id: string | null | undefined) {
  const value = id?.trim();
  if (!value) return false;
  const bad = new Set(["null", "undefined", "none", "trend", "trends", "saved", "savedtrend"]);
  if (bad.has(value.toLowerCase())) return false;
  return value.length >= 6;
}

type SavedTrendListRow = {
  id: string;
  name: string;
  sport: SavedTrendSystemView["sport"];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  lastRunAt: string | null;
  filters: TrendFilters;
  aiQuery: string | null;
  mode: TrendMode;
};

function readQueryJson(value: unknown): SavedTrendQueryJson {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    filters: trendFiltersSchema.parse(record.filters ?? {}),
    aiQuery: typeof record.aiQuery === "string" ? record.aiQuery : null,
    mode: record.mode === "power" ? "power" : "simple"
  };
}

export async function ensureTrendUser() {
  await prisma.user.upsert({
    where: {
      id: DEFAULT_USER_ID
    },
    update: {},
    create: {
      id: DEFAULT_USER_ID,
      username: "demo_bettor",
      bankrollSettingsJson: {
        unitSize: 100,
        bankroll: 5000
      }
    }
  });
}

export function buildSavedTrendHref(id: string, filters: TrendFilters, mode: TrendMode, aiQuery: string | null) {
  const params = new URLSearchParams();
  params.set("savedId", id);
  params.set("savedTrendId", id);
  params.set("mode", mode);
  if (aiQuery) {
    params.set("q", aiQuery);
  }

  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || value === "ALL" || value === "all") continue;
    params.set(key, String(value));
  }

  return `/trends?${params.toString()}`;
}

export async function listSavedTrendRows(): Promise<SavedTrendListRow[]> {
  await ensureTrendUser();

  const rows = await prisma.savedTrend.findMany({
    where: {
      userId: DEFAULT_USER_ID
    },
    include: {
      trendRuns: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    },
    orderBy: [
      {
        archivedAt: "asc"
      },
      {
        updatedAt: "desc"
      }
    ]
  });

  return rows.map((row) => {
    const query = readQueryJson(row.queryJson);

    return {
      id: row.id,
      name: row.name,
      sport: row.sport as SavedTrendSystemView["sport"],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
      lastRunAt: row.trendRuns[0]?.createdAt?.toISOString() ?? null,
      filters: query.filters,
      aiQuery: query.aiQuery ?? null,
      mode: query.mode ?? "simple"
    };
  });
}

export async function createSavedTrend(args: {
  name: string;
  filters: TrendFilters;
  aiQuery: string | null;
  mode: TrendMode;
}) {
  await ensureTrendUser();

  return prisma.savedTrend.create({
    data: {
      userId: DEFAULT_USER_ID,
      name: args.name,
      sport: args.filters.sport === "ALL" ? "OTHER" : args.filters.sport,
      queryJson: toInputJsonValue({
        filters: args.filters,
        aiQuery: args.aiQuery,
        mode: args.mode
      })
    }
  });
}

export async function updateSavedTrend(
  id: string,
  args: {
    name?: string;
    filters?: TrendFilters;
    aiQuery?: string | null;
    mode?: TrendMode;
  }
) {
  if (!isUsableSavedTrendId(id)) return null;

  const existing = await prisma.savedTrend.findFirst({
    where: {
      id,
      userId: DEFAULT_USER_ID
    }
  });

  if (!existing) return null;

  const current = readQueryJson(existing.queryJson);
  const nextFilters = args.filters ?? current.filters;
  const nextMode = args.mode ?? current.mode ?? "simple";
  const nextAiQuery = args.aiQuery ?? current.aiQuery ?? null;

  await prisma.savedTrend.updateMany({
    where: {
      id,
      userId: DEFAULT_USER_ID
    },
    data: {
      name: args.name ?? existing.name,
      sport: nextFilters.sport === "ALL" ? "OTHER" : nextFilters.sport,
      queryJson: toInputJsonValue({
        filters: nextFilters,
        aiQuery: nextAiQuery,
        mode: nextMode
      }),
      archivedAt: args.filters || args.name || args.aiQuery !== undefined || args.mode
        ? null
        : existing.archivedAt
    }
  });

  return prisma.savedTrend.findFirst({
    where: {
      id,
      userId: DEFAULT_USER_ID
    }
  });
}

export async function archiveSavedTrend(id: string, archived: boolean) {
  if (!isUsableSavedTrendId(id)) return null;

  await prisma.savedTrend.updateMany({
    where: {
      id,
      userId: DEFAULT_USER_ID
    },
    data: {
      archivedAt: archived ? new Date() : null
    }
  });

  return prisma.savedTrend.findFirst({
    where: {
      id,
      userId: DEFAULT_USER_ID
    }
  });
}

export async function deleteSavedTrend(id: string) {
  if (!isUsableSavedTrendId(id)) return null;

  await prisma.trendRun.deleteMany({
    where: {
      savedTrendId: id,
      userId: DEFAULT_USER_ID
    }
  });

  const result = await prisma.savedTrend.deleteMany({
    where: {
      id,
      userId: DEFAULT_USER_ID
    }
  });

  return {
    id,
    deleted: result.count > 0
  };
}

export async function recordSavedTrendRun(args: {
  savedTrendId: string;
  queryJson: Record<string, unknown>;
  resultJson: Record<string, unknown>;
}) {
  if (!isUsableSavedTrendId(args.savedTrendId)) return null;

  const savedTrend = await prisma.savedTrend.findFirst({
    where: {
      id: args.savedTrendId,
      userId: DEFAULT_USER_ID
    },
    select: {
      id: true
    }
  });

  if (!savedTrend) return null;

  return prisma.trendRun.create({
    data: {
      savedTrendId: args.savedTrendId,
      userId: DEFAULT_USER_ID,
      queryJson: toInputJsonValue(args.queryJson),
      resultJson: toInputJsonValue(args.resultJson)
    }
  });
}
