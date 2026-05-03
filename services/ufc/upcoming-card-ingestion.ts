import { fetchGenericUpcomingProvider, fetchUfcStatsUpcomingProvider } from "@/services/ufc/upcoming-card-providers";
import { normalizeUpcomingUfcProviderResults } from "@/services/ufc/upcoming-card-normalizer";
import type { UfcUpcomingIngestionSummary, UfcUpcomingProviderResult, UfcUpcomingSourceEvent } from "@/services/ufc/upcoming-card-types";
import { upsertUfcWarehousePayload, summarizeUfcWarehousePayload } from "@/services/ufc/warehouse-ingestion";

export type UfcUpcomingCardIngestionOptions = {
  fetchImpl?: typeof fetch;
  includeUfcStats?: boolean;
  ufcStatsListUrl?: string;
  ufcComUrls?: string[];
  espnUrls?: string[];
  tapologyUrls?: string[];
  manualEvents?: UfcUpcomingSourceEvent[];
  dryRun?: boolean;
};

const DEFAULT_UFC_COM_URLS = ["https://www.ufc.com/events"];
const DEFAULT_ESPN_URLS = ["https://www.espn.com/mma/schedule"];
const DEFAULT_TAPOLOGY_URLS = ["https://www.tapology.com/fightcenter?group=ufc"];

function manualProvider(events: UfcUpcomingSourceEvent[] = []): UfcUpcomingProviderResult {
  return {
    provider: "manual",
    fetchedAt: new Date().toISOString(),
    events,
    warnings: [],
    errors: []
  };
}

function summarize(results: UfcUpcomingProviderResult[], sourceAuditCount: number): UfcUpcomingIngestionSummary {
  const warnings = results.flatMap((result) => result.warnings.map((warning) => `${result.provider}: ${warning}`));
  const errors = results.flatMap((result) => result.errors.map((error) => `${result.provider}: ${error}`));
  const eventCount = results.reduce((sum, result) => sum + result.events.length, 0);
  const fightCount = results.reduce((sum, result) => sum + result.events.reduce((eventSum, event) => eventSum + event.fights.length, 0), 0);
  return {
    ok: errors.length === 0,
    providerCount: results.length,
    eventCount,
    fightCount,
    sourceAuditCount,
    warnings,
    errors
  };
}

export async function fetchUpcomingUfcCardProviders(options: UfcUpcomingCardIngestionOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const results: UfcUpcomingProviderResult[] = [];

  if (options.includeUfcStats !== false) {
    results.push(await fetchUfcStatsUpcomingProvider({ listUrl: options.ufcStatsListUrl, fetchImpl }));
  }

  if (options.ufcComUrls !== undefined) {
    results.push(await fetchGenericUpcomingProvider("ufc.com", options.ufcComUrls, fetchImpl));
  } else {
    results.push(await fetchGenericUpcomingProvider("ufc.com", DEFAULT_UFC_COM_URLS, fetchImpl));
  }

  if (options.espnUrls !== undefined) {
    results.push(await fetchGenericUpcomingProvider("espn", options.espnUrls, fetchImpl));
  } else {
    results.push(await fetchGenericUpcomingProvider("espn", DEFAULT_ESPN_URLS, fetchImpl));
  }

  if (options.tapologyUrls !== undefined) {
    results.push(await fetchGenericUpcomingProvider("tapology", options.tapologyUrls, fetchImpl));
  } else {
    results.push(await fetchGenericUpcomingProvider("tapology", DEFAULT_TAPOLOGY_URLS, fetchImpl));
  }

  if (options.manualEvents?.length) results.push(manualProvider(options.manualEvents));
  return results;
}

export async function ingestUpcomingUfcCards(options: UfcUpcomingCardIngestionOptions = {}) {
  const fetchedAt = new Date().toISOString();
  const results = await fetchUpcomingUfcCardProviders(options);
  const payload = normalizeUpcomingUfcProviderResults(results, fetchedAt);
  const ingestionSummary = summarize(results, payload.fightSources.length);

  if (options.dryRun) {
    return {
      ok: ingestionSummary.ok,
      mode: "dry-run" as const,
      summary: ingestionSummary,
      warehouseSummary: summarizeUfcWarehousePayload(payload),
      payload
    };
  }

  const result = await upsertUfcWarehousePayload(payload);
  return {
    ok: result.ok && ingestionSummary.ok,
    mode: "ingest" as const,
    summary: ingestionSummary,
    warehouseSummary: result.summary
  };
}
