import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { buildUfcFighterIntelligenceProfile } from "@/services/modeling/ufc-fighter-intelligence";
import { buildUfcOpponentGraphSnapshot } from "@/services/modeling/ufc-opponent-graph";
import { buildUfcSourceProfile } from "@/services/modeling/ufc-source-profile";

export type CombatHistoryRow = {
  competitorId: string;
  opponentCompetitorId: string | null;
  opponentRecord: string | null;
  winnerCompetitorId: string | null;
  loserCompetitorId: string | null;
  method: string | null;
  period: string | null;
  officialAt: Date | null;
};

export type CombatProfile = {
  sampleSize: number;
  historicalWinPct: number;
  finishWinRate: number;
  decisionWinRate: number;
  finishLossRate: number;
  averageOpponentWinPct: number;
  averageRound: number;
  durabilityScore: number;
  powerScore: number;
  controlScore: number;
  activityScore: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function parseRecordWinPct(record: string | null | undefined) {
  const match = (record ?? "").match(/(\d+)-(\d+)(?:-(\d+))?/);
  if (!match) return null;
  const wins = Number(match[1] ?? 0);
  const losses = Number(match[2] ?? 0);
  const draws = Number(match[3] ?? 0);
  const total = wins + losses + draws;
  return total ? (wins + draws * 0.5) / total : null;
}

function isFinish(method: string | null | undefined) {
  const normalized = (method ?? "").toLowerCase();
  return normalized.includes("ko") || normalized.includes("tko") || normalized.includes("sub") || normalized.includes("submission");
}

function parseRound(period: string | null | undefined) {
  const digits = Number((period ?? "").replace(/[^0-9]/g, ""));
  return Number.isFinite(digits) && digits > 0 ? digits : null;
}

export function buildCombatProfileFromRows(rows: CombatHistoryRow[]): CombatProfile {
  if (!rows.length) {
    return {
      sampleSize: 0,
      historicalWinPct: 0.5,
      finishWinRate: 0,
      decisionWinRate: 0,
      finishLossRate: 0,
      averageOpponentWinPct: 0.5,
      averageRound: 2.5,
      durabilityScore: 6,
      powerScore: 6,
      controlScore: 6,
      activityScore: 4
    };
  }

  let wins = 0;
  let finishWins = 0;
  let decisionWins = 0;
  let finishLosses = 0;
  let opponentWinPctTotal = 0;
  let opponentWinPctCount = 0;
  let roundTotal = 0;
  let roundCount = 0;

  const latest = rows.map((row) => row.officialAt?.getTime() ?? 0).sort((a, b) => b - a)[0] ?? 0;
  const oldest = rows.map((row) => row.officialAt?.getTime() ?? latest).sort((a, b) => a - b)[0] ?? latest;
  const spanDays = Math.max(1, (latest - oldest) / 86400000);

  for (const row of rows) {
    const won = row.winnerCompetitorId === row.competitorId;
    if (won) {
      wins += 1;
      if (isFinish(row.method)) finishWins += 1;
      else decisionWins += 1;
    } else if (row.loserCompetitorId === row.competitorId && isFinish(row.method)) {
      finishLosses += 1;
    }

    const opponentWinPct = parseRecordWinPct(row.opponentRecord);
    if (typeof opponentWinPct === "number") {
      opponentWinPctTotal += opponentWinPct;
      opponentWinPctCount += 1;
    }

    const round = parseRound(row.period);
    if (typeof round === "number") {
      roundTotal += round;
      roundCount += 1;
    }
  }

  const sampleSize = rows.length;
  const historicalWinPct = wins / sampleSize;
  const finishWinRate = finishWins / Math.max(1, sampleSize);
  const decisionWinRate = decisionWins / Math.max(1, sampleSize);
  const finishLossRate = finishLosses / Math.max(1, sampleSize);
  const averageOpponentWinPct = opponentWinPctCount ? opponentWinPctTotal / opponentWinPctCount : 0.5;
  const averageRound = roundCount ? roundTotal / roundCount : 2.5;
  const activityScore = clamp(10 - spanDays / Math.max(1, sampleSize * 45), 2.5, 9.5);
  const durabilityScore = clamp(8.2 - finishLossRate * 6 + historicalWinPct * 0.9, 3.5, 9.7);
  const powerScore = clamp(5.2 + finishWinRate * 6 + averageOpponentWinPct * 1.2, 3.5, 9.8);
  const controlScore = clamp(5.3 + decisionWinRate * 4 + (4 - Math.min(4, averageRound)) * 0.45, 3.5, 9.6);

  return {
    sampleSize,
    historicalWinPct: round(historicalWinPct, 4),
    finishWinRate: round(finishWinRate, 4),
    decisionWinRate: round(decisionWinRate, 4),
    finishLossRate: round(finishLossRate, 4),
    averageOpponentWinPct: round(averageOpponentWinPct, 4),
    averageRound: round(averageRound, 3),
    durabilityScore: round(durabilityScore, 3),
    powerScore: round(powerScore, 3),
    controlScore: round(controlScore, 3),
    activityScore: round(activityScore, 3)
  };
}

export async function fetchCombatHistoryRowsForCompetitor(competitorId: string, currentEventId?: string | null) {
  const participations = await prisma.eventParticipant.findMany({
    where: {
      competitorId,
      ...(currentEventId ? { eventId: { not: currentEventId } } : {}),
      event: {
        status: "FINAL",
        league: { key: { in: ["UFC", "BOXING"] } }
      }
    },
    include: {
      event: {
        include: {
          eventResult: true,
          participants: true
        }
      }
    },
    orderBy: {
      event: { startTime: "desc" }
    },
    take: 12
  });

  return participations
    .map((entry) => {
      const opponent = entry.event.participants.find((participant) => participant.competitorId !== competitorId) ?? null;
      return {
        competitorId,
        opponentCompetitorId: opponent?.competitorId ?? null,
        opponentRecord: opponent?.record ?? null,
        winnerCompetitorId: entry.event.eventResult?.winnerCompetitorId ?? null,
        loserCompetitorId: entry.event.eventResult?.loserCompetitorId ?? null,
        method: entry.event.eventResult?.method ?? null,
        period: entry.event.eventResult?.period ?? null,
        officialAt: entry.event.eventResult?.officialAt ?? entry.event.startTime ?? null
      } satisfies CombatHistoryRow;
    })
    .filter((row) => row.winnerCompetitorId || row.loserCompetitorId);
}

export async function buildCombatProfileForCompetitor(competitorId: string, currentEventId?: string | null) {
  const rows = await fetchCombatHistoryRowsForCompetitor(competitorId, currentEventId);
  return buildCombatProfileFromRows(rows);
}

export async function buildUfcFighterIntelligenceForCompetitor(args: {
  competitorId: string;
  currentEventId?: string | null;
  record: string | null;
  recentWinRate?: number | null;
  recentMargin?: number | null;
  metadata?: Record<string, unknown> | null;
}) {
  const rows = await fetchCombatHistoryRowsForCompetitor(args.competitorId, args.currentEventId);
  const combatProfile = buildCombatProfileFromRows(rows);
  return buildUfcFighterIntelligenceProfile({
    record: args.record,
    recentWinRate: args.recentWinRate ?? null,
    recentMargin: args.recentMargin ?? null,
    metadata: args.metadata ?? null,
    combatProfile,
    historyRows: rows
  });
}

function mergeMetadata(base: Prisma.JsonValue | null, updates: Record<string, unknown>) {
  const record = base && typeof base === "object" && !Array.isArray(base) ? (base as Record<string, unknown>) : {};
  return {
    ...record,
    ...updates
  } as Prisma.InputJsonValue;
}

export async function refreshCombatParticipantProfiles(args?: { eventIds?: string[]; limit?: number; leagues?: string[] }) {
  const events = await prisma.event.findMany({
    where: {
      league: { key: { in: args?.leagues?.length ? args.leagues : ["UFC", "BOXING"] } },
      status: { in: ["SCHEDULED", "LIVE"] },
      ...(args?.eventIds?.length ? { id: { in: args.eventIds } } : {})
    },
    include: {
      participants: {
        include: {
          competitor: true
        }
      },
      participantContexts: true
    },
    orderBy: { startTime: "asc" },
    take: args?.limit ?? 40
  });

  let updated = 0;
  for (const event of events) {
    for (const participant of event.participants) {
      const existing = event.participantContexts.find((row) => row.competitorId === participant.competitorId) ?? null;
      const mergedSourceMetadata = {
        ...((participant.competitor.metadataJson && typeof participant.competitor.metadataJson === "object" && !Array.isArray(participant.competitor.metadataJson)
          ? (participant.competitor.metadataJson as Record<string, unknown>)
          : {})),
        ...((participant.metadataJson && typeof participant.metadataJson === "object" && !Array.isArray(participant.metadataJson)
          ? (participant.metadataJson as Record<string, unknown>)
          : {})),
        ...((existing?.metadataJson && typeof existing.metadataJson === "object" && !Array.isArray(existing.metadataJson)
          ? (existing.metadataJson as Record<string, unknown>)
          : {}))
      };
      const historyRows = await fetchCombatHistoryRowsForCompetitor(participant.competitorId, event.id);
      const profile = buildCombatProfileFromRows(historyRows);
      const ufcIntelligenceProfile =
        event.league.key === "UFC"
          ? buildUfcFighterIntelligenceProfile({
              record: participant.record,
              recentWinRate: existing?.recentWinRate ?? null,
              recentMargin: existing?.recentMargin ?? null,
              metadata: mergedSourceMetadata,
              combatProfile: profile,
              historyRows
            })
          : null;
      const ufcOpponentGraph = event.league.key === "UFC" ? buildUfcOpponentGraphSnapshot(historyRows) : null;
      const ufcSourceProfile = event.league.key === "UFC" ? buildUfcSourceProfile(mergedSourceMetadata) : null;
      const metadataPayload = {
        combatProfile: profile,
        combatProfileGeneratedAt: new Date().toISOString(),
        ...(ufcIntelligenceProfile ? { ufcIntelligenceProfile, ufcIntelligenceGeneratedAt: new Date().toISOString() } : {}),
        ...(ufcOpponentGraph ? { ufcOpponentGraph, ufcOpponentGraphGeneratedAt: new Date().toISOString() } : {}),
        ...(ufcSourceProfile ? { ufcSourceProfile, ufcSourceProfileGeneratedAt: new Date().toISOString() } : {})
      };
      if (existing) {
        await prisma.eventParticipantContext.update({
          where: { id: existing.id },
          data: {
            metadataJson: mergeMetadata(existing.metadataJson, metadataPayload)
          }
        });
      } else {
        await prisma.eventParticipantContext.create({
          data: {
            eventId: event.id,
            competitorId: participant.competitorId,
            role: participant.role,
            metadataJson: metadataPayload as Prisma.InputJsonValue
          }
        });
      }
      updated += 1;
    }
  }

  return {
    events: events.length,
    participantProfilesUpdated: updated
  };
}
