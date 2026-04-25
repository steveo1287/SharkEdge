import { Prisma } from "@prisma/client";

import type { LedgerBetFormInput, LedgerMarketType } from "@/lib/types/ledger";
import type {
  ImportPageData,
  ImportProviderKey,
  ImportResultView
} from "@/lib/types/product";
import { prisma } from "@/lib/db/prisma";
import { csvImportSchema } from "@/lib/validation/product";
import { createBet } from "@/services/bets/bets-service";
import {
  buildProductSetupState,
  DEFAULT_USER_ID,
  ensureDefaultUser,
  getDefaultSubscriptionSummary
} from "@/services/account/user-service";
import { getSubscriptionSummaryForCurrentUser } from "@/services/account/entitlements-service";

import type {
  CsvImportProvider,
  NormalizedImportedBet,
  SyncProvider
} from "./provider-types";

type ParsedRow = {
  rowIndex: number;
  normalized: NormalizedImportedBet | null;
  error: string | null;
  raw: Record<string, string>;
};

function parseCsv(csvText: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(current);
      if (row.some((value) => value.trim().length)) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    if (row.some((value) => value.trim().length)) {
      rows.push(row);
    }
  }

  if (!rows.length) {
    return {
      headers: [] as string[],
      records: [] as Record<string, string>[]
    };
  }

  const headers = rows[0].map((value) => value.trim());
  const records = rows.slice(1).map((values) => {
    const entry: Record<string, string> = {};
    headers.forEach((header, index) => {
      entry[header] = (values[index] ?? "").trim();
    });
    return entry;
  });

  return { headers, records };
}

function getValue(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const entry = row[alias];
    if (entry && entry.trim().length) {
      return entry.trim();
    }
  }

  return "";
}

function parseAmericanOdds(value: string) {
  const normalized = value.replace(/[^\d+-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

function parseFloatSafe(value: string) {
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePlacedAt(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return new Date().toISOString().slice(0, 16);
  }

  return new Date(parsed).toISOString().slice(0, 16);
}

function normalizeLeague(value: string) {
  const normalized = value.toUpperCase();
  if (normalized.includes("NBA") || normalized.includes("NCAAB") || normalized.includes("COLLEGE BASKETBALL")) return "NBA";
  if (normalized.includes("MLB") || normalized.includes("BASEBALL")) return "MLB";
  if (normalized.includes("NHL") || normalized.includes("HOCKEY")) return "NHL";
  if (normalized.includes("NFL")) return "NFL";
  if (normalized.includes("NCAAF") || normalized.includes("COLLEGE FOOTBALL")) return "NCAAF";
  if (normalized.includes("UFC") || normalized.includes("MMA")) return "UFC";
  if (normalized.includes("BOX")) return "BOXING";
  return "NBA";
}

function normalizeSport(league: string) {
  if (league === "MLB") return "BASEBALL";
  if (league === "NHL") return "HOCKEY";
  if (league === "NFL" || league === "NCAAF") return "FOOTBALL";
  if (league === "UFC") return "MMA";
  if (league === "BOXING") return "BOXING";
  return "BASKETBALL";
}

function normalizeMarketType(market: string, selection: string): LedgerMarketType {
  const normalized = `${market} ${selection}`.toLowerCase();
  if (normalized.includes("spread")) return "spread";
  if (normalized.includes("moneyline") || normalized.includes("winner")) return normalized.includes("round") ? "round_winner" : normalized.includes("fight") || normalized.includes("method") ? "fight_winner" : "moneyline";
  if (normalized.includes("method")) return "method_of_victory";
  if (normalized.includes("round total")) return "round_total";
  if (normalized.includes("round")) return "round_winner";
  if (normalized.includes("total")) return "total";
  if (normalized.includes("points")) return "player_points";
  if (normalized.includes("rebounds")) return "player_rebounds";
  if (normalized.includes("assists")) return "player_assists";
  if (normalized.includes("threes")) return "player_threes";
  return "other";
}

function normalizeResult(value: string): LedgerBetFormInput["status"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("win")) return "WIN";
  if (normalized.includes("loss") || normalized.includes("lose")) return "LOSS";
  if (normalized.includes("push")) return "PUSH";
  if (normalized.includes("void")) return "VOID";
  if (normalized.includes("cash")) return "CASHED_OUT";
  return "OPEN";
}

function buildFingerprint(values: Array<string | number | null | undefined>) {
  return values
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join("|")
    .replace(/[^a-z0-9|+.-]+/g, "-");
}

function buildBetInput(args: {
  providerKey: ImportProviderKey;
  row: Record<string, string>;
}): NormalizedImportedBet | null {
  const league = normalizeLeague(
    getValue(args.row, ["Sport", "sport", "League", "league"])
  );
  const sport = normalizeSport(league);
  const placedAt = parsePlacedAt(
    getValue(args.row, ["Date", "Placed Date", "placed_at", "Time"])
  );
  const marketLabel = getValue(args.row, ["Market", "Bet Type", "market"]);
  const selection = getValue(args.row, ["Selection", "Bet", "selection"]);
  const marketType = normalizeMarketType(marketLabel, selection);
  const oddsAmerican = parseAmericanOdds(getValue(args.row, ["Odds", "Price", "odds"]));
  const stake = parseFloatSafe(getValue(args.row, ["Stake", "Risk", "stake"]));
  const toWin = parseFloatSafe(getValue(args.row, ["To Win", "Payout", "to_win"]));
  const eventLabel = getValue(args.row, ["Event", "Matchup", "event"]);
  const result = normalizeResult(getValue(args.row, ["Result", "Status", "result"]));
  const externalId = getValue(args.row, ["Bet ID", "Id", "bet_id"]) || null;

  if (!selection || oddsAmerican === null || stake === null) {
    return null;
  }

  const line = parseFloatSafe(getValue(args.row, ["Line", "line"]));
  const sportsbookKey =
    args.providerKey === "draftkings"
      ? "draftkings"
      : args.providerKey === "fanduel"
        ? "fanduel"
        : getValue(args.row, ["Sportsbook", "Book"]).toLowerCase() || "generic";
  const sportsbookName =
    args.providerKey === "draftkings"
      ? "DraftKings"
      : args.providerKey === "fanduel"
        ? "FanDuel"
        : getValue(args.row, ["Sportsbook", "Book"]) || "Imported CSV";

  const fingerprint = buildFingerprint([
    args.providerKey,
    externalId,
    placedAt,
    league,
    eventLabel,
    marketLabel,
    selection,
    oddsAmerican,
    stake
  ]);

  return {
    externalId,
    fingerprint,
    bet: {
      placedAt,
      settledAt: result === "OPEN" ? null : placedAt,
      source: "IMPORTED",
      externalSourceKey: args.providerKey,
      externalSourceId: externalId,
      externalSourceFingerprint: fingerprint,
      betType: selection.includes(" / ") || marketLabel.toLowerCase().includes("parlay") ? "PARLAY" : "STRAIGHT",
      sport,
      league,
      eventId: null,
      sportsbookId: null,
      status: result,
      stake,
      notes: `Imported from ${sportsbookName} CSV.`,
      tags: `imported,${args.providerKey}`,
      isLive: false,
      context: null,
      legs: [
        {
          eventId: null,
          sportsbookId: null,
          marketType,
          marketLabel: marketLabel || marketType,
          selection,
          side: selection,
          line,
          oddsAmerican,
          closingLine: null,
          closingOddsAmerican: null,
          notes: "",
          context: null
        }
      ]
    },
    sourceMetadata: {
      eventLabel,
      sportsbookKey,
      sportsbookName,
      toWin,
      rawResult: getValue(args.row, ["Result", "Status", "result"])
    }
  };
}

function buildProvider(key: ImportProviderKey, label: string, note: string): CsvImportProvider {
  return {
    key,
    label,
    note,
    parse(csvText: string) {
      const { records } = parseCsv(csvText);
      return records.map((row, index) => {
        const normalized = buildBetInput({ providerKey: key, row });

        if (!normalized) {
          return {
            rowIndex: index + 2,
            normalized: null,
            error: "Required import columns are missing or invalid for this row.",
            raw: row
          };
        }

        return {
          rowIndex: index + 2,
          normalized,
          error: null,
          raw: row
        };
      });
    }
  };
}

const CSV_IMPORT_PROVIDERS: Record<ImportProviderKey, CsvImportProvider> = {
  draftkings: buildProvider(
    "draftkings",
    "DraftKings CSV",
    "Import bet history CSV exports from DraftKings. Straight bets are mapped cleanly; parlays are stored as imported tickets with raw source metadata."
  ),
  fanduel: buildProvider(
    "fanduel",
    "FanDuel CSV",
    "Import bet history CSV exports from FanDuel. Straight bets map directly; unsupported multi-leg detail stays preserved in import metadata."
  ),
  generic: buildProvider(
    "generic",
    "Generic betting CSV",
    "Use this when your export has Event, Market, Selection, Odds, Stake, and Result columns."
  )
};

export const SYNC_PROVIDERS: SyncProvider[] = [
  {
    key: "draftkings",
    label: "DraftKings",
    mode: "IMPORT_ONLY",
    supportsAutomatedSync: false
  },
  {
    key: "fanduel",
    label: "FanDuel",
    mode: "IMPORT_ONLY",
    supportsAutomatedSync: false
  },
  {
    key: "manual_csv",
    label: "Generic CSV",
    mode: "IMPORT_ONLY",
    supportsAutomatedSync: false
  }
];

async function resolveSportsbookId(providerKey: string) {
  const book = await prisma.sportsbook.findFirst({
    where: {
      OR: [
        { key: providerKey },
        { name: { equals: providerKey, mode: "insensitive" } }
      ]
    },
    select: {
      id: true
    }
  });

  return book?.id ?? null;
}

async function createImportBatch(providerKey: string, fileName?: string | null) {
  return prisma.importBatch.create({
    data: {
      userId: DEFAULT_USER_ID,
      providerKey,
      sourceType: "CSV",
      fileName: fileName ?? null,
      status: "PENDING"
    }
  });
}

async function findExistingBet(normalized: NormalizedImportedBet) {
  if (normalized.externalId) {
    const existing = await prisma.bet.findFirst({
      where: {
        externalSourceKey: normalized.bet.externalSourceKey,
        externalSourceId: normalized.externalId
      },
      select: {
        id: true
      }
    });

    if (existing?.id) {
      return existing.id;
    }
  }

  const byFingerprint = await prisma.bet.findFirst({
    where: {
      externalSourceFingerprint: normalized.fingerprint
    },
    select: {
      id: true
    }
  });

  return byFingerprint?.id ?? null;
}

export async function importCsvBets(input: {
  providerKey: ImportProviderKey;
  csvText: string;
  fileName?: string;
}): Promise<ImportResultView> {
  await ensureDefaultUser();
  const parsed = csvImportSchema.parse(input);
  const provider = CSV_IMPORT_PROVIDERS[parsed.providerKey];
  const batch = await createImportBatch(parsed.providerKey, parsed.fileName ?? null);
  const parsedRows = provider.parse(parsed.csvText);
  const outcomes: ImportResultView["outcomes"] = [];
  let importedCount = 0;
  let duplicateCount = 0;
  let failedCount = 0;

  for (const row of parsedRows) {
    if (!row.normalized) {
      failedCount += 1;
      outcomes.push({
        rowIndex: row.rowIndex,
        status: "FAILED",
        message: row.error ?? "Import row could not be normalized.",
        externalId: null
      });

      await prisma.importRow.create({
        data: {
          batchId: batch.id,
          rowIndex: row.rowIndex,
          providerKey: parsed.providerKey,
          externalId: null,
          fingerprint: buildFingerprint([batch.id, row.rowIndex, "failed"]),
          status: "FAILED",
          error: row.error ?? "Normalization failed.",
          rawJson: row.raw as Prisma.InputJsonValue
        }
      });
      continue;
    }

    const existingBetId = await findExistingBet(row.normalized);
    if (existingBetId) {
      duplicateCount += 1;
      outcomes.push({
        rowIndex: row.rowIndex,
        status: "DUPLICATE",
        message: "Bet already exists in the SharkEdge ledger.",
        externalId: row.normalized.externalId
      });

      await prisma.importRow.create({
        data: {
          batchId: batch.id,
          rowIndex: row.rowIndex,
          providerKey: parsed.providerKey,
          externalId: row.normalized.externalId,
          fingerprint: row.normalized.fingerprint,
          status: "DUPLICATE",
          rawJson: row.raw as Prisma.InputJsonValue,
          metadataJson: row.normalized.sourceMetadata as Prisma.InputJsonValue,
          betId: existingBetId
        }
      });
      continue;
    }

    try {
      const sportsbookId = await resolveSportsbookId(
        String(row.normalized.sourceMetadata.sportsbookKey ?? parsed.providerKey)
      );
      const bet = await createBet({
        ...row.normalized.bet,
        sportsbookId,
        notes: `${row.normalized.bet.notes} ${String(
          row.normalized.sourceMetadata.eventLabel ?? ""
        )}`.trim()
      });

      importedCount += 1;
      outcomes.push({
        rowIndex: row.rowIndex,
        status: "IMPORTED",
        message: "Bet imported into the SharkEdge ledger.",
        externalId: row.normalized.externalId
      });

      await prisma.importRow.create({
        data: {
          batchId: batch.id,
          rowIndex: row.rowIndex,
          providerKey: parsed.providerKey,
          externalId: row.normalized.externalId,
          fingerprint: row.normalized.fingerprint,
          status: "IMPORTED",
          rawJson: row.raw as Prisma.InputJsonValue,
          metadataJson: row.normalized.sourceMetadata as Prisma.InputJsonValue,
          betId: bet.id
        }
      });
    } catch (error) {
      failedCount += 1;
      outcomes.push({
        rowIndex: row.rowIndex,
        status: "FAILED",
        message: error instanceof Error ? error.message : "Bet import failed.",
        externalId: row.normalized.externalId
      });

      await prisma.importRow.create({
        data: {
          batchId: batch.id,
          rowIndex: row.rowIndex,
          providerKey: parsed.providerKey,
          externalId: row.normalized.externalId,
          fingerprint: row.normalized.fingerprint,
          status: "FAILED",
          error: error instanceof Error ? error.message : "Bet import failed.",
          rawJson: row.raw as Prisma.InputJsonValue,
          metadataJson: row.normalized.sourceMetadata as Prisma.InputJsonValue
        }
      });
    }
  }

  const updated = await prisma.importBatch.update({
    where: {
      id: batch.id
    },
    data: {
      status: failedCount === parsedRows.length ? "FAILED" : "COMPLETED",
      rowCount: parsedRows.length,
      importedCount,
      duplicateCount,
      failedCount,
      summaryJson: {
        newBets: importedCount,
        duplicates: duplicateCount,
        failed: failedCount
      }
    }
  });

  return {
    batch: {
      id: updated.id,
      providerKey: updated.providerKey,
      fileName: updated.fileName,
      status: updated.status,
      rowCount: updated.rowCount,
      importedCount: updated.importedCount,
      duplicateCount: updated.duplicateCount,
      failedCount: updated.failedCount,
      createdAt: updated.createdAt.toISOString(),
      summary: {
        newBets: importedCount,
        duplicates: duplicateCount,
        failed: failedCount
      }
    },
    outcomes
  };
}

export async function getImportPageData(): Promise<ImportPageData> {
  try {
    await ensureDefaultUser();
    const [plan, batches] = await Promise.all([
      getSubscriptionSummaryForCurrentUser(),
      prisma.importBatch.findMany({
        where: {
          userId: DEFAULT_USER_ID
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 24
      })
    ]);

    return {
      setup: null,
      batches: batches.map((batch) => ({
        id: batch.id,
        providerKey: batch.providerKey,
        fileName: batch.fileName,
        status: batch.status,
        rowCount: batch.rowCount,
        importedCount: batch.importedCount,
        duplicateCount: batch.duplicateCount,
        failedCount: batch.failedCount,
        createdAt: batch.createdAt.toISOString(),
        summary: {
          newBets: batch.importedCount,
          duplicates: batch.duplicateCount,
          failed: batch.failedCount
        }
      })),
      supportedProviders: Object.values(CSV_IMPORT_PROVIDERS).map((provider) => ({
        key: provider.key,
        label: provider.label,
        note: provider.note
      })),
      plan
    };
  } catch (error) {
    return {
      setup: buildProductSetupState("Imports", error),
      batches: [],
      supportedProviders: Object.values(CSV_IMPORT_PROVIDERS).map((provider) => ({
        key: provider.key,
        label: provider.label,
        note: provider.note
      })),
      plan: getDefaultSubscriptionSummary()
    };
  }
}
