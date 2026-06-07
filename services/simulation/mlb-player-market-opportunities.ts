import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbIntelV7Ledgers } from "@/services/simulation/mlb-intel-v7-ledgers";
import type { MlbCalibratedPlayerMarket, MlbCalibratedPlayerMarketSurface } from "@/services/simulation/mlb-calibrated-player-market-surface";

export type MlbPlayerMarketOpportunity = MlbCalibratedPlayerMarket & {
  snapshotGameId: string;
  snapshotEventLabel: string;
  startTime: string;
  capturedAt: string;
  modelVersion: string | null;
};

export type MlbPlayerMarketOpportunitiesFeed = {
  ok: boolean;
  generatedAt: string;
  source: "mlb_model_snapshot_ledger" | "unavailable";
  total: number;
  promotedCount: number;
  watchCount: number;
  passCount: number;
  opportunities: MlbPlayerMarketOpportunity[];
  warnings: string[];
};

type SnapshotRow = {
  game_id: string;
  event_label: string;
  start_time: Date;
  captured_at: Date;
  model_version: string | null;
  prediction_json: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asSurface(value: unknown): MlbCalibratedPlayerMarketSurface | null {
  if (!isRecord(value)) return null;
  if (value.modelVersion !== "mlb-calibrated-player-market-surface-v1") return null;
  if (!Array.isArray(value.markets)) return null;
  return value as MlbCalibratedPlayerMarketSurface;
}

function predictionSurface(predictionJson: unknown) {
  const root = isRecord(predictionJson) ? predictionJson : {};
  const mlbIntel = isRecord(root.mlbIntel) ? root.mlbIntel : {};
  const playerImpact = isRecord(mlbIntel.playerImpact) ? mlbIntel.playerImpact : {};
  return asSurface(playerImpact.playerMarketSurface);
}

function opportunityKey(item: MlbPlayerMarketOpportunity) {
  return [item.snapshotGameId, item.source, item.market, item.playerId ?? "game", item.side, item.line ?? "none"].join(":");
}

function rankDecision(decision: MlbCalibratedPlayerMarket["decision"]) {
  if (decision === "PROMOTE") return 0;
  if (decision === "WATCH") return 1;
  return 2;
}

export function extractMlbPlayerMarketOpportunitiesFromSnapshots(rows: SnapshotRow[], options: { includePass?: boolean; limit?: number } = {}): MlbPlayerMarketOpportunitiesFeed {
  const warnings: string[] = [];
  const items: MlbPlayerMarketOpportunity[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const surface = predictionSurface(row.prediction_json);
    if (!surface) {
      warnings.push(`No player market surface found for ${row.event_label} (${row.game_id}).`);
      continue;
    }

    const sourceMarkets = options.includePass ? surface.markets : surface.markets.filter((market) => market.decision !== "PASS");
    for (const market of sourceMarkets) {
      const item: MlbPlayerMarketOpportunity = {
        ...market,
        snapshotGameId: row.game_id,
        snapshotEventLabel: row.event_label,
        startTime: row.start_time.toISOString(),
        capturedAt: row.captured_at.toISOString(),
        modelVersion: row.model_version
      };
      const key = opportunityKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }

  const sorted = items.sort((a, b) =>
    rankDecision(a.decision) - rankDecision(b.decision) ||
    b.edgeVsBaseline - a.edgeVsBaseline ||
    b.confidence - a.confidence ||
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  ).slice(0, Math.max(1, Math.min(500, Math.round(options.limit ?? 75))));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: "mlb_model_snapshot_ledger",
    total: sorted.length,
    promotedCount: sorted.filter((item) => item.decision === "PROMOTE").length,
    watchCount: sorted.filter((item) => item.decision === "WATCH").length,
    passCount: sorted.filter((item) => item.decision === "PASS").length,
    opportunities: sorted,
    warnings: warnings.slice(0, 25)
  };
}

export async function getMlbPlayerMarketOpportunities(options: { limit?: number; includePass?: boolean; lookaheadHours?: number; lookbackHours?: number } = {}): Promise<MlbPlayerMarketOpportunitiesFeed> {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, generatedAt: new Date().toISOString(), source: "unavailable", total: 0, promotedCount: 0, watchCount: 0, passCount: 0, opportunities: [], warnings: ["No usable server database URL is configured."] };
  }

  await ensureMlbIntelV7Ledgers();
  const limit = Math.max(1, Math.min(500, Math.round(options.limit ?? 75)));
  const lookaheadHours = Math.max(1, Math.min(240, Math.round(options.lookaheadHours ?? 72)));
  const lookbackHours = Math.max(0, Math.min(72, Math.round(options.lookbackHours ?? 6)));
  const snapshotLimit = Math.max(limit * 4, 100);

  const rows = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT game_id, event_label, start_time, captured_at, model_version, prediction_json
    FROM mlb_model_snapshot_ledger
    WHERE market = 'moneyline'
      AND start_time >= now() - (${lookbackHours}::text || ' hours')::interval
      AND start_time <= now() + (${lookaheadHours}::text || ' hours')::interval
      AND prediction_json IS NOT NULL
      AND prediction_json::text LIKE '%playerMarketSurface%'
    ORDER BY captured_at DESC
    LIMIT ${snapshotLimit};
  `;

  return extractMlbPlayerMarketOpportunitiesFromSnapshots(rows, { includePass: options.includePass, limit });
}
