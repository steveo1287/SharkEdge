import { parseUfcStatsEventPage, parseUfcStatsFightDetail, parseUfcStatsFighterProfile, type UfcStatsEventPage, type UfcStatsFightDetail, type UfcStatsFighterProfile } from "@/services/ufc/ufcstats-parser";
import { normalizeUfcStatsSnapshot } from "@/services/ufc/ufcstats-normalizer";
import type { UfcRealDataSnapshot } from "@/services/ufc/real-data-ingestion";

export type UfcStatsFetchOptions = {
  eventUrl: string;
  snapshotAt?: string;
  modelVersion?: string;
  fetchImpl?: typeof fetch;
};

export type UfcStatsFetchDiagnostics = {
  eventUrl: string;
  eventName: string | null;
  eventDate: string | null;
  fightLinksFound: number;
  fightDetailsParsed: number;
  fighterProfilesRequested: number;
  fighterProfilesParsed: number;
  warnings: string[];
  fatalErrors: string[];
  dataQualityGrade: "A" | "B" | "C" | "D";
};

export type UfcStatsFetchResult = {
  snapshot: UfcRealDataSnapshot;
  event: UfcStatsEventPage;
  fights: UfcStatsFightDetail[];
  fighters: UfcStatsFighterProfile[];
  diagnostics: UfcStatsFetchDiagnostics;
};

async function getHtml(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, { headers: { "User-Agent": "SharkEdge-UFCStats-Snapshot/1.0" } });
  if (!response.ok) throw new Error(`UFCStats fetch failed ${response.status} for ${url}`);
  return response.text();
}

function gradeDiagnostics(diagnostics: Omit<UfcStatsFetchDiagnostics, "dataQualityGrade">): UfcStatsFetchDiagnostics["dataQualityGrade"] {
  if (diagnostics.fatalErrors.length > 0 || diagnostics.fightLinksFound === 0) return "D";
  const fightParseRate = diagnostics.fightDetailsParsed / Math.max(1, diagnostics.fightLinksFound);
  const fighterParseRate = diagnostics.fighterProfilesParsed / Math.max(1, diagnostics.fighterProfilesRequested);
  if (fightParseRate >= 0.95 && fighterParseRate >= 0.95 && diagnostics.warnings.length === 0) return "A";
  if (fightParseRate >= 0.8 && fighterParseRate >= 0.8) return "B";
  if (fightParseRate >= 0.55 && fighterParseRate >= 0.55) return "C";
  return "D";
}

export async function fetchUfcStatsSnapshotWithDiagnostics(options: UfcStatsFetchOptions): Promise<UfcStatsFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const warnings: string[] = [];
  const fatalErrors: string[] = [];
  let event: UfcStatsEventPage;

  try {
    const eventHtml = await getHtml(options.eventUrl, fetchImpl);
    event = parseUfcStatsEventPage(eventHtml, options.eventUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fatalErrors.push(message);
    event = { sourceEventId: "ufcstats-unparsed-event", eventName: "Unparsed UFCStats Event", eventDate: options.snapshotAt ?? new Date().toISOString(), fights: [] };
  }

  const fights: UfcStatsFightDetail[] = [];
  const fighterUrls = new Set<string>();

  for (const fightLink of event.fights) {
    try {
      const fightHtml = await getHtml(fightLink.url, fetchImpl);
      const fight = parseUfcStatsFightDetail(fightHtml, fightLink.url);
      fights.push(fight);
      if (fight.fighterAUrl) fighterUrls.add(fight.fighterAUrl);
      if (fight.fighterBUrl) fighterUrls.add(fight.fighterBUrl);
    } catch (error) {
      warnings.push(`Skipped fight ${fightLink.sourceFightId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const fighters: UfcStatsFighterProfile[] = [];
  for (const fighterUrl of fighterUrls) {
    try {
      fighters.push(parseUfcStatsFighterProfile(await getHtml(fighterUrl, fetchImpl), fighterUrl));
    } catch (error) {
      warnings.push(`Skipped fighter profile ${fighterUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const snapshot = normalizeUfcStatsSnapshot({
    event,
    fights,
    fighters,
    snapshotAt: options.snapshotAt ?? new Date().toISOString(),
    modelVersion: options.modelVersion
  });

  const diagnosticsBase = {
    eventUrl: options.eventUrl,
    eventName: event.eventName ?? null,
    eventDate: event.eventDate ?? null,
    fightLinksFound: event.fights.length,
    fightDetailsParsed: fights.length,
    fighterProfilesRequested: fighterUrls.size,
    fighterProfilesParsed: fighters.length,
    warnings,
    fatalErrors
  };

  return {
    snapshot,
    event,
    fights,
    fighters,
    diagnostics: {
      ...diagnosticsBase,
      dataQualityGrade: gradeDiagnostics(diagnosticsBase)
    }
  };
}

export async function fetchUfcStatsSnapshot(options: UfcStatsFetchOptions) {
  return (await fetchUfcStatsSnapshotWithDiagnostics(options)).snapshot;
}
