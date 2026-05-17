import { fetchAndIngestBackendUfcMoneylineOdds } from "@/services/ufc/backend-moneyline-odds";
import { fetchAndIngestUfcMoneylineOdds } from "@/services/ufc/the-odds-api-moneyline";

export type RefreshUfcMoneylineOddsOptions = {
  dryRun?: boolean;
  horizonDays?: number;
  minMatchScore?: number;
  skipBackend?: boolean;
  skipDirect?: boolean;
  regions?: string;
  bookmakers?: string;
  sportKey?: string;
};

function settledValue<T>(result: PromiseSettledResult<T>) {
  if (result.status === "fulfilled") return result.value;
  return { ok: false, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
}

function okResult(value: unknown) {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as { ok?: unknown }).ok);
}

function numericField(value: unknown, key: string) {
  return value && typeof value === "object" && key in value && typeof (value as Record<string, unknown>)[key] === "number"
    ? (value as Record<string, number>)[key]
    : 0;
}

export async function refreshUfcMoneylineOddsSources(options: RefreshUfcMoneylineOddsOptions = {}) {
  const [backend, direct] = await Promise.allSettled([
    options.skipBackend ? Promise.resolve(null) : fetchAndIngestBackendUfcMoneylineOdds({ dryRun: options.dryRun, horizonDays: options.horizonDays, minMatchScore: options.minMatchScore }),
    options.skipDirect ? Promise.resolve(null) : fetchAndIngestUfcMoneylineOdds({ dryRun: options.dryRun, horizonDays: options.horizonDays, minMatchScore: options.minMatchScore, regions: options.regions, bookmakers: options.bookmakers, sportKey: options.sportKey })
  ]);
  const backendResult = settledValue(backend);
  const directResult = settledValue(direct);
  return {
    ok: okResult(backendResult) || okResult(directResult),
    primary: "backend-current-odds-mma_ufc",
    backup: "the-odds-api-mma",
    matched: numericField(backendResult, "matched") + numericField(directResult, "matched"),
    updated: numericField(backendResult, "updated") + numericField(directResult, "updated"),
    backend: backendResult,
    direct: directResult
  };
}
