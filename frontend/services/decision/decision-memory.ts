import type { LeagueKey, MarketType } from "@/lib/types/domain";
import type {
  DecisionMemoryRecord,
  DecisionMemorySummary
} from "@/lib/types/decision-memory";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_USER_ID } from "@/services/account/user-service";
import { getLatestDecisionMemorySummary } from "@/services/decision/decision-memory-sync";
import { getDecisionMemoryFromContextJson } from "@/services/decision/decision-memory-repository";

export function getDecisionMemoryKey(input: {
  marketType: string;
  selection: string;
}) {
  return `${input.marketType}::${input.selection.trim().toLowerCase()}`;
}

export function getDecisionMemoryEventSelectionKey(input: {
  league: LeagueKey;
  eventExternalId: string;
  marketType: string;
  selection: string;
}) {
  return [
    input.league,
    input.eventExternalId.trim(),
    getDecisionMemoryKey({
      marketType: input.marketType,
      selection: input.selection
    })
  ].join("::");
}

export async function getDecisionMemoryForEvent(input: {
  league: LeagueKey;
  eventExternalId: string | null;
}) {
  const memory = new Map<string, DecisionMemoryRecord>();

  if (!input.eventExternalId) {
    return memory;
  }

  const rows = await prisma.watchlistItem.findMany({
    where: {
      userId: DEFAULT_USER_ID,
      status: "ACTIVE",
      league: input.league,
      eventExternalId: input.eventExternalId
    },
    select: {
      marketType: true,
      selection: true,
      contextJson: true
    }
  });

  for (const row of rows) {
    const record = getDecisionMemoryFromContextJson(row.contextJson);
    if (!record) {
      continue;
    }

    memory.set(
      getDecisionMemoryKey({
        marketType: row.marketType as MarketType,
        selection: row.selection
      }),
      record
    );
  }

  return memory;
}

export async function getDecisionMemorySummaryForEvent(input: {
  league: LeagueKey;
  eventExternalId: string | null;
}) {
  const memory = await getDecisionMemoryForEvent(input);
  const summary = new Map<string, DecisionMemorySummary>();

  for (const [key, record] of memory) {
    const latest = getLatestDecisionMemorySummary(record);
    if (latest) {
      summary.set(key, latest);
    }
  }

  return summary;
}

export async function getDecisionMemorySummaryForEventSelections(input: {
  selections: Array<{
    league: LeagueKey;
    eventExternalId: string | null;
    marketType: string;
    selection: string;
  }>;
}) {
  const summary = new Map<string, DecisionMemorySummary>();
  const validSelections = input.selections.filter(
    (selection): selection is {
      league: LeagueKey;
      eventExternalId: string;
      marketType: string;
      selection: string;
    } => Boolean(selection.eventExternalId)
  );

  if (!validSelections.length) {
    return summary;
  }

  const eventExternalIds = Array.from(
    new Set(validSelections.map((selection) => selection.eventExternalId))
  );
  const leagues = Array.from(new Set(validSelections.map((selection) => selection.league)));
  const requestedKeys = new Set(
    validSelections.map((selection) =>
      getDecisionMemoryEventSelectionKey({
        league: selection.league,
        eventExternalId: selection.eventExternalId,
        marketType: selection.marketType,
        selection: selection.selection
      })
    )
  );

  const rows = await prisma.watchlistItem.findMany({
    where: {
      userId: DEFAULT_USER_ID,
      status: "ACTIVE",
      league: {
        in: leagues
      },
      eventExternalId: {
        in: eventExternalIds
      }
    },
    select: {
      league: true,
      eventExternalId: true,
      marketType: true,
      selection: true,
      contextJson: true
    }
  });

  for (const row of rows) {
    if (!row.eventExternalId) {
      continue;
    }

    const record = getDecisionMemoryFromContextJson(row.contextJson);
    const latest = getLatestDecisionMemorySummary(record);
    if (!latest) {
      continue;
    }

    const key = getDecisionMemoryEventSelectionKey({
      league: row.league as LeagueKey,
      eventExternalId: row.eventExternalId,
      marketType: row.marketType as MarketType,
      selection: row.selection
    });

    if (requestedKeys.has(key)) {
      summary.set(key, latest);
    }
  }

  return summary;
}
