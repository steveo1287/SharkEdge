import { prisma } from "@/lib/db/prisma";

export type UfcSourceAuditRow = {
  fightId: string | null;
  eventId: string | null;
  sourceName: string;
  sourceUrl: string | null;
  sourceFighterA: string | null;
  sourceFighterB: string | null;
  sourceWeightClass: string | null;
  sourceBoutOrder: number | null;
  sourceCardSection: string | null;
  sourceStatus: string;
  confidence: string;
  seenAt: string;
};

export type UfcSourceAuditSummary = {
  eventId: string;
  sourceCount: number;
  sourceNames: string[];
  officialCount: number;
  crossCheckedCount: number;
  earlyReportedCount: number;
  manualReviewCount: number;
  lastSeenAt: string | null;
  rows: UfcSourceAuditRow[];
};

type SourceRow = {
  fight_id: string | null;
  event_id: string | null;
  source_name: string;
  source_url: string | null;
  source_fighter_a: string | null;
  source_fighter_b: string | null;
  source_weight_class: string | null;
  source_bout_order: number | null;
  source_card_section: string | null;
  source_status: string;
  confidence: string;
  seen_at: Date | string;
};

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function confidenceRank(value: string) {
  if (value === "OFFICIAL_CONFIRMED") return 5;
  if (value === "OFFICIAL_PARTIAL") return 4;
  if (value === "CROSS_CHECKED") return 3;
  if (value === "EARLY_REPORTED") return 2;
  if (value === "MANUAL_REVIEW") return 1;
  return 0;
}

export function summarizeUfcSourceAudit(eventId: string, rows: UfcSourceAuditRow[]): UfcSourceAuditSummary {
  const sourceNames = [...new Set(rows.map((row) => row.sourceName))].sort();
  return {
    eventId,
    sourceCount: rows.length,
    sourceNames,
    officialCount: rows.filter((row) => row.confidence === "OFFICIAL_CONFIRMED" || row.confidence === "OFFICIAL_PARTIAL").length,
    crossCheckedCount: rows.filter((row) => row.confidence === "CROSS_CHECKED").length,
    earlyReportedCount: rows.filter((row) => row.confidence === "EARLY_REPORTED").length,
    manualReviewCount: rows.filter((row) => row.confidence === "MANUAL_REVIEW").length,
    lastSeenAt: rows.map((row) => row.seenAt).sort().at(-1) ?? null,
    rows: [...rows].sort((a, b) => {
      const orderA = a.sourceBoutOrder ?? 999;
      const orderB = b.sourceBoutOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return confidenceRank(b.confidence) - confidenceRank(a.confidence);
    })
  };
}

export async function getUfcSourceAuditForEvent(eventId: string): Promise<UfcSourceAuditSummary> {
  try {
    const rows = await prisma.$queryRaw<SourceRow[]>`
      SELECT fight_id, event_id, source_name, source_url, source_fighter_a, source_fighter_b, source_weight_class, source_bout_order, source_card_section, source_status, confidence, seen_at
      FROM ufc_fight_sources
      WHERE event_id = ${eventId}
      ORDER BY source_bout_order NULLS LAST, source_name, seen_at DESC
    `;
    return summarizeUfcSourceAudit(eventId, rows.map((row) => ({
      fightId: row.fight_id,
      eventId: row.event_id,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      sourceFighterA: row.source_fighter_a,
      sourceFighterB: row.source_fighter_b,
      sourceWeightClass: row.source_weight_class,
      sourceBoutOrder: row.source_bout_order,
      sourceCardSection: row.source_card_section,
      sourceStatus: row.source_status,
      confidence: row.confidence,
      seenAt: iso(row.seen_at) ?? new Date(0).toISOString()
    })));
  } catch {
    return summarizeUfcSourceAudit(eventId, []);
  }
}
