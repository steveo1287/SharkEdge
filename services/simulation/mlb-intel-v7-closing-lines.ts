import { prisma } from "@/lib/db/prisma";
import { buildMlbIntelV7LiveBoard } from "@/services/simulation/mlb-intel-v7-live-board";
import { ensureMlbIntelV7Ledgers } from "@/services/simulation/mlb-intel-v7-ledgers";

type PendingLedgerRow = {
  id: string;
  game_id: string;
  side: "HOME" | "AWAY";
  market_no_vig_probability: number | null;
};

type TableName = "mlb_model_snapshot_ledger" | "mlb_official_pick_ledger";

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function sideProbabilityFromHome(side: "HOME" | "AWAY", homeProbability: number | null | undefined) {
  if (typeof homeProbability !== "number" || !Number.isFinite(homeProbability)) return null;
  return side === "HOME" ? homeProbability : 1 - homeProbability;
}

async function updateTableClosingLines(tableName: TableName, closeByGameId: Map<string, number>) {
  const pendingRows = await prisma.$queryRawUnsafe<PendingLedgerRow[]>(`
    SELECT id, game_id, side, market_no_vig_probability
    FROM ${tableName}
    WHERE graded_at IS NULL
      AND market = 'moneyline'
      AND model_version = 'mlb-intel-v7'
    ORDER BY captured_at DESC
    LIMIT 2000;
  `);

  let updated = 0;
  let missing = 0;

  for (const row of pendingRows) {
    const closeHomeProbability = closeByGameId.get(row.game_id);
    const closeSideProbability = round(sideProbabilityFromHome(row.side, closeHomeProbability));
    if (closeSideProbability == null) {
      missing += 1;
      continue;
    }
    await prisma.$executeRawUnsafe(`
      UPDATE ${tableName}
      SET closing_probability = $1,
        updated_at = now()
      WHERE id = $2;
    `, closeSideProbability, row.id);
    updated += 1;
  }

  return { updated, missing, scanned: pendingRows.length };
}

export async function updateMlbIntelV7ClosingLines(limit = 60) {
  const databaseReady = await ensureMlbIntelV7Ledgers();
  if (!databaseReady) {
    return {
      ok: false,
      databaseReady,
      snapshotRows: { updated: 0, missing: 0, scanned: 0 },
      officialPickRows: { updated: 0, missing: 0, scanned: 0 },
      marketGames: 0,
      error: "No usable server database URL is configured."
    };
  }

  const board = await buildMlbIntelV7LiveBoard({ limit });
  const closeByGameId = new Map<string, number>();
  for (const row of board.rows) {
    if (typeof row.market.homeNoVigProbability === "number" && Number.isFinite(row.market.homeNoVigProbability)) {
      closeByGameId.set(row.game.id, row.market.homeNoVigProbability);
    }
  }

  const [snapshotRows, officialPickRows] = await Promise.all([
    updateTableClosingLines("mlb_model_snapshot_ledger", closeByGameId),
    updateTableClosingLines("mlb_official_pick_ledger", closeByGameId)
  ]);

  return {
    ok: true,
    databaseReady,
    marketGames: closeByGameId.size,
    boardWarnings: board.warnings,
    snapshotRows,
    officialPickRows
  };
}
