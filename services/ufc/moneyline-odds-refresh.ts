import { fetchAndIngestBackendUfcMoneylineOdds } from "@/services/ufc/backend-moneyline-odds";
import { fetchAndIngestOddsApiIoUfcMoneyline } from "@/services/ufc/odds-api-io-moneyline";
import { fetchAndIngestUfcMoneylineOdds } from "@/services/ufc/the-odds-api-moneyline";

export type RefreshUfcMoneylineOddsOptions = {
  dryRun?: boolean;
  horizonDays?: number;
  minMatchScore?: number;
  skipBackend?: boolean;
  skipOddsApiIo?: boolean;
  skipDirect?: boolean;
  regions?: string;
  bookmakers?: string;
  sportKey?: string;
  oddsApiIoBookmakers?: string;
  oddsApiIoSport?: string;
  oddsApiIoLeague?: string;
  oddsApiIoEventLimit?: number;
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
  const [backend, oddsApiIo, direct] = await Promise.allSettled([
    options.skipBackend ? Promise.resolve(null) : fetchAndIngestBackendUfcMoneylineOdds({ dryRun: options.dryRun, horizonDays: options.horizonDays, minMatchScore: options.minMatchScore }),
    options.skipOddsApiIo ? Promise.resolve(null) : fetchAndIngestOddsApiIoUfcMoneyline({ dryRun: options.dryRun, horizonDays: options.horizonDays, minMatchScore: options.minMatchScore, bookmakers: options.oddsApiIoBookmakers, sport: options.oddsApiIoSport, league: options.oddsApiIoLeague, eventLimit: options.oddsApiIoEventLimit }),
    options.skipDirect ? Promise.resolve(null) : fetchAndIngestUfcMoneylineOdds({ dryRun: options.dryRun, horizonDays: options.horizonDays, minMatchScore: options.minMatchScore, regions: options.regions, bookmakers: options.bookmakers, sportKey: options.sportKey })
  ]);
  const backendResult = settledValue(backend);
  const oddsApiIoResult = settledValue(oddsApiIo);
  const directResult = settledValue(direct);
  return {
    ok: okResult(backendResult) || okResult(oddsApiIoResult) || okResult(directResult),
    primary: "backend-current-odds-mma_ufc",
    backup: "odds-api-io-ufc-moneyline",
    tertiary: "the-odds-api-mma",
    matched: numericField(backendResult, "matched") + numericField(oddsApiIoResult, "matched") + numericField(directResult, "matched"),
    updated: numericField(backendResult, "updated") + numericField(oddsApiIoResult, "updated") + numericField(directResult, "updated"),
    backend: backendResult,
    oddsApiIo: oddsApiIoResult,
    direct: directResult
  };
}
