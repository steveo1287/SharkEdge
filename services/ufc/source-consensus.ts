import { getUfcSourceAuditForEvent, type UfcSourceAuditRow, type UfcSourceAuditSummary } from "@/services/ufc/source-audit";

export type UfcFightSourceConsensus = {
  fightKey: string;
  displayLabel: string;
  sourceCount: number;
  sourceNames: string[];
  confidenceGrade: "HIGH" | "MEDIUM" | "LOW" | "REVIEW";
  hasOfficialSource: boolean;
  hasCrossCheck: boolean;
  earlyOnly: boolean;
  nameDisagreement: boolean;
  weightClassDisagreement: boolean;
  cardSectionDisagreement: boolean;
  stale: boolean;
  reviewFlags: string[];
};

export type UfcCardSourceConsensus = {
  eventId: string;
  overallGrade: "HIGH" | "MEDIUM" | "LOW" | "REVIEW";
  fightCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  reviewCount: number;
  disagreementCount: number;
  earlyOnlyCount: number;
  staleCount: number;
  fights: UfcFightSourceConsensus[];
};

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function slug(value: string | null | undefined) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function unique<T>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function latestSeen(rows: UfcSourceAuditRow[]) {
  return rows.map((row) => new Date(row.seenAt).getTime()).filter(Number.isFinite).sort((a, b) => b - a)[0] ?? 0;
}

function confidenceRank(value: string) {
  if (value === "OFFICIAL_CONFIRMED") return 5;
  if (value === "OFFICIAL_PARTIAL") return 4;
  if (value === "CROSS_CHECKED") return 3;
  if (value === "EARLY_REPORTED") return 2;
  if (value === "MANUAL_REVIEW") return 1;
  return 0;
}

function groupKey(row: UfcSourceAuditRow) {
  if (row.fightId) return `fight:${row.fightId}`;
  const names = [slug(row.sourceFighterA), slug(row.sourceFighterB)].sort().join("-vs-");
  return `names:${names || "unknown"}`;
}

function label(rows: UfcSourceAuditRow[]) {
  const row = rows[0];
  return `${clean(row?.sourceFighterA) || "Fighter A"} vs ${clean(row?.sourceFighterB) || "Fighter B"}`;
}

export function buildUfcFightSourceConsensus(fightKey: string, rows: UfcSourceAuditRow[], nowMs = Date.now()): UfcFightSourceConsensus {
  const sourceNames = unique(rows.map((row) => row.sourceName)).sort();
  const confidences = rows.map((row) => row.confidence);
  const maxRank = Math.max(...confidences.map(confidenceRank), 0);
  const hasOfficialSource = confidences.some((value) => value === "OFFICIAL_CONFIRMED" || value === "OFFICIAL_PARTIAL");
  const hasCrossCheck = sourceNames.length > 1 || confidences.some((value) => value === "CROSS_CHECKED");
  const earlyOnly = !hasOfficialSource && confidences.every((value) => value === "EARLY_REPORTED" || value === "MANUAL_REVIEW");
  const pairNames = unique(rows.map((row) => [slug(row.sourceFighterA), slug(row.sourceFighterB)].sort().join("|")));
  const weightClasses = unique(rows.map((row) => slug(row.sourceWeightClass)));
  const cardSections = unique(rows.map((row) => slug(row.sourceCardSection)));
  const nameDisagreement = pairNames.length > 1;
  const weightClassDisagreement = weightClasses.length > 1;
  const cardSectionDisagreement = cardSections.length > 1;
  const stale = latestSeen(rows) > 0 && nowMs - latestSeen(rows) > 1000 * 60 * 60 * 48;
  const reviewFlags = [
    nameDisagreement ? "fighter-name-disagreement" : null,
    weightClassDisagreement ? "weight-class-disagreement" : null,
    cardSectionDisagreement ? "card-section-disagreement" : null,
    earlyOnly ? "early-only-source" : null,
    stale ? "stale-source-row" : null,
    sourceNames.length < 2 ? "single-source" : null
  ].filter((value): value is string => Boolean(value));

  const confidenceGrade: UfcFightSourceConsensus["confidenceGrade"] = nameDisagreement || weightClassDisagreement
    ? "REVIEW"
    : earlyOnly || stale || maxRank <= 2
      ? "LOW"
      : hasOfficialSource && hasCrossCheck
        ? "HIGH"
        : "MEDIUM";

  return {
    fightKey,
    displayLabel: label(rows),
    sourceCount: rows.length,
    sourceNames,
    confidenceGrade,
    hasOfficialSource,
    hasCrossCheck,
    earlyOnly,
    nameDisagreement,
    weightClassDisagreement,
    cardSectionDisagreement,
    stale,
    reviewFlags
  };
}

export function buildUfcCardSourceConsensus(audit: UfcSourceAuditSummary, nowMs = Date.now()): UfcCardSourceConsensus {
  const groups = new Map<string, UfcSourceAuditRow[]>();
  for (const row of audit.rows) groups.set(groupKey(row), [...(groups.get(groupKey(row)) ?? []), row]);
  const fights = [...groups.entries()].map(([key, rows]) => buildUfcFightSourceConsensus(key, rows, nowMs));
  const reviewCount = fights.filter((fight) => fight.confidenceGrade === "REVIEW").length;
  const lowCount = fights.filter((fight) => fight.confidenceGrade === "LOW").length;
  const mediumCount = fights.filter((fight) => fight.confidenceGrade === "MEDIUM").length;
  const highCount = fights.filter((fight) => fight.confidenceGrade === "HIGH").length;
  const disagreementCount = fights.filter((fight) => fight.nameDisagreement || fight.weightClassDisagreement || fight.cardSectionDisagreement).length;
  const earlyOnlyCount = fights.filter((fight) => fight.earlyOnly).length;
  const staleCount = fights.filter((fight) => fight.stale).length;
  const overallGrade: UfcCardSourceConsensus["overallGrade"] = reviewCount > 0
    ? "REVIEW"
    : lowCount > 0 || earlyOnlyCount > 0
      ? "LOW"
      : mediumCount > 0 || fights.length === 0
        ? "MEDIUM"
        : "HIGH";
  return { eventId: audit.eventId, overallGrade, fightCount: fights.length, highCount, mediumCount, lowCount, reviewCount, disagreementCount, earlyOnlyCount, staleCount, fights };
}

export async function getUfcSourceConsensusForEvent(eventId: string) {
  return buildUfcCardSourceConsensus(await getUfcSourceAuditForEvent(eventId));
}
