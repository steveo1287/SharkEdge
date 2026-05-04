"use server";

import { recordOddsApiIoRun } from "@/services/ingestion/odds-api-io-health";
import { ingestOddsApiIo } from "@/services/ingestion/odds-api-io-ingestion";

export type ProviderTriggerState = {
  ok: boolean;
  mode: "idle" | "dry" | "write";
  message: string;
  stats?: {
    providerEvents: number;
    matchedInternalEvents: number;
    oddsRows: number;
    snapshotsWritten: number;
    lineRowsWritten: number;
    skippedOddsRows: number;
  };
  error?: string;
};

const DEFAULT_OPTIONS = {
  sport: "baseball",
  league: "MLB",
  status: "upcoming",
  eventLimit: 10
};

async function run(mode: "dry" | "write"): Promise<ProviderTriggerState> {
  const options = { ...DEFAULT_OPTIONS, dryRun: mode === "dry" };
  try {
    const result = await ingestOddsApiIo(options);
    await recordOddsApiIoRun({ mode: `manual-${mode}`, options, result });
    return {
      ok: result.configured && (mode === "dry" || result.stats.snapshotsWritten > 0 || result.stats.lineRowsWritten > 0),
      mode,
      message: result.sourceNote,
      stats: {
        providerEvents: result.stats.providerEvents,
        matchedInternalEvents: result.stats.matchedInternalEvents,
        oddsRows: result.stats.oddsRows,
        snapshotsWritten: result.stats.snapshotsWritten,
        lineRowsWritten: result.stats.lineRowsWritten,
        skippedOddsRows: result.stats.skippedOddsRows
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider trigger failed.";
    await recordOddsApiIoRun({ mode: `manual-${mode}`, options, error: message });
    return { ok: false, mode, message: "Provider trigger failed.", error: message };
  }
}

export async function runProviderDryTest(): Promise<ProviderTriggerState> {
  return run("dry");
}

export async function runProviderWriteIngestion(): Promise<ProviderTriggerState> {
  return run("write");
}
