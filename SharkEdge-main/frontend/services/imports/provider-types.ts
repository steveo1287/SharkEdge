import type { LedgerBetFormInput } from "@/lib/types/ledger";
import type { ImportProviderKey, ImportResultView } from "@/lib/types/product";

export type NormalizedImportedBet = {
  externalId: string | null;
  fingerprint: string;
  bet: LedgerBetFormInput;
  sourceMetadata: Record<string, unknown>;
};

export type CsvImportProvider = {
  key: ImportProviderKey;
  label: string;
  note: string;
  parse: (csvText: string) => Array<{
    rowIndex: number;
    normalized: NormalizedImportedBet | null;
    error: string | null;
    raw: Record<string, string>;
  }>;
};

export type SyncProvider = {
  key: string;
  label: string;
  mode: "IMPORT_ONLY" | "SYNC_READY";
  supportsAutomatedSync: boolean;
  importCsv?: (csvText: string, fileName?: string) => Promise<ImportResultView>;
};
