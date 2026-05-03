import { fetchUfcStatsSnapshotWithDiagnostics, type UfcStatsFetchOptions, type UfcStatsFetchResult } from "@/services/ufc/ufcstats-fetcher";
import type { UfcRealDataSnapshot, UfcRealFighterSnapshot } from "@/services/ufc/real-data-ingestion";

export type UfcStatsSmokeFightReport = {
  sourceFightId: string;
  eventLabel: string;
  fighterAName: string;
  fighterBName: string;
  missingFields: string[];
  wouldSimulate: boolean;
  skipReason: string | null;
};

export type UfcStatsSmokeReport = {
  ok: boolean;
  eventName: string | null;
  eventDate: string | null;
  sourceKey: string;
  dataQualityGrade: "A" | "B" | "C" | "D";
  fightLinksFound: number;
  fightDetailsParsed: number;
  fighterProfilesRequested: number;
  fighterProfilesParsed: number;
  fightsInSnapshot: number;
  wouldIngest: boolean;
  wouldSimulateCount: number;
  wouldSkipCount: number;
  warnings: string[];
  fatalErrors: string[];
  missingFieldCounts: Record<string, number>;
  fights: UfcStatsSmokeFightReport[];
};

const REQUIRED_FIGHTER_FIELDS: Array<keyof UfcRealFighterSnapshot> = [
  "sigStrikesLandedPerMin",
  "sigStrikesAbsorbedPerMin",
  "takedownsPer15",
  "takedownDefensePct",
  "submissionAttemptsPer15"
];

const REQUIRED_FEATURE_FIELDS = [
  "sigStrikeAccuracyPct",
  "sigStrikeDefensePct",
  "takedownAccuracyPct"
];

function hasNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function missingForFighter(prefix: "fighterA" | "fighterB", fighter: UfcRealFighterSnapshot) {
  const missing: string[] = [];
  for (const field of REQUIRED_FIGHTER_FIELDS) {
    if (!hasNumber(fighter[field])) missing.push(`${prefix}.${field}`);
  }
  for (const field of REQUIRED_FEATURE_FIELDS) {
    if (!hasNumber(fighter.feature?.[field])) missing.push(`${prefix}.feature.${field}`);
  }
  return missing;
}

function missingFieldCounts(fights: UfcStatsSmokeFightReport[]) {
  const counts: Record<string, number> = {};
  for (const fight of fights) {
    for (const field of fight.missingFields) counts[field] = (counts[field] ?? 0) + 1;
  }
  return counts;
}

function buildFightReports(snapshot: UfcRealDataSnapshot): UfcStatsSmokeFightReport[] {
  return snapshot.fights.map((fight) => {
    const missingFields = [
      ...missingForFighter("fighterA", fight.fighterA),
      ...missingForFighter("fighterB", fight.fighterB)
    ];
    const wouldSimulate = missingFields.length <= 4 && Boolean(fight.fighterA.sourceId && fight.fighterB.sourceId);
    return {
      sourceFightId: fight.sourceFightId,
      eventLabel: fight.eventLabel,
      fighterAName: fight.fighterA.name,
      fighterBName: fight.fighterB.name,
      missingFields,
      wouldSimulate,
      skipReason: wouldSimulate ? null : missingFields.length ? "missing-required-feature-fields" : "missing-fighter-identifiers"
    };
  });
}

export function buildUfcStatsSmokeReport(fetchResult: UfcStatsFetchResult): UfcStatsSmokeReport {
  const fightReports = buildFightReports(fetchResult.snapshot);
  const wouldSimulateCount = fightReports.filter((fight) => fight.wouldSimulate).length;
  const wouldSkipCount = fightReports.length - wouldSimulateCount;
  const fatalErrors = fetchResult.diagnostics.fatalErrors;
  return {
    ok: fatalErrors.length === 0 && fetchResult.snapshot.fights.length > 0,
    eventName: fetchResult.event.eventName ?? null,
    eventDate: fetchResult.event.eventDate ?? null,
    sourceKey: fetchResult.snapshot.sourceKey,
    dataQualityGrade: fetchResult.diagnostics.dataQualityGrade,
    fightLinksFound: fetchResult.diagnostics.fightLinksFound,
    fightDetailsParsed: fetchResult.diagnostics.fightDetailsParsed,
    fighterProfilesRequested: fetchResult.diagnostics.fighterProfilesRequested,
    fighterProfilesParsed: fetchResult.diagnostics.fighterProfilesParsed,
    fightsInSnapshot: fetchResult.snapshot.fights.length,
    wouldIngest: fatalErrors.length === 0 && fetchResult.snapshot.fights.length > 0,
    wouldSimulateCount,
    wouldSkipCount,
    warnings: fetchResult.diagnostics.warnings,
    fatalErrors,
    missingFieldCounts: missingFieldCounts(fightReports),
    fights: fightReports
  };
}

export async function runUfcStatsSmokeReport(options: UfcStatsFetchOptions): Promise<UfcStatsSmokeReport> {
  return buildUfcStatsSmokeReport(await fetchUfcStatsSnapshotWithDiagnostics(options));
}
