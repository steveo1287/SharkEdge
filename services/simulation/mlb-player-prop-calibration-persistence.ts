import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import {
  buildMlbBatterPropProbabilityCalibration,
  type MlbBatterPropProbabilityCalibration,
  type MlbSettledBatterPropProbabilityRow
} from "@/services/simulation/mlb-batter-prop-probability-calibration";

export type MlbPlayerPropCalibrationPersistRow = MlbSettledBatterPropProbabilityRow & {
  id?: string;
  rowKey?: string;
  sourceKey?: string;
  eventId?: string | null;
  gameId?: string | null;
  team?: string | null;
  opponentTeam?: string | null;
  rawModelProbability?: number | null;
  actualValue?: number | null;
  projectedMean?: number | null;
  impliedProbability?: number | null;
  metadataJson?: Record<string, unknown> | null;
};

export type MlbCalibrationRefreshReport = {
  modelVersion: "mlb-player-prop-calibration-refresh-v1";
  rowCount: number;
  calibration: MlbBatterPropProbabilityCalibration;
  snapshotCount: number;
  persistedSnapshotCount: number;
  warnings: string[];
};

function sqlString(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "NULL";
}

function sqlBool(value: boolean) {
  return value ? "TRUE" : "FALSE";
}

function id(prefix = "mlbcal") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRowKey(row: MlbPlayerPropCalibrationPersistRow) {
  if (row.rowKey) return row.rowKey;
  return [
    row.sourceKey ?? "SIM_SETTLEMENT",
    row.eventId ?? row.gameId ?? "eventless",
    row.playerId ?? row.playerName ?? "unknown-player",
    row.market,
    row.line,
    row.side,
    row.modelProbability,
    row.settledAt ?? "undated"
  ].join(":");
}

export async function persistMlbPlayerPropCalibrationRows(rows: MlbPlayerPropCalibrationPersistRow[]) {
  if (!hasUsableServerDatabaseUrl()) {
    return { persistedCount: 0, skippedCount: rows.length, warnings: ["DATABASE_URL is unavailable; calibration rows were not persisted."] };
  }
  let persistedCount = 0;
  const warnings: string[] = [];
  for (const row of rows) {
    try {
      const rowKey = normalizeRowKey(row);
      const metadata = row.metadataJson ? JSON.stringify(row.metadataJson) : null;
      await prisma.$executeRawUnsafe(`
        INSERT INTO mlb_player_prop_calibration_rows (
          id, row_key, source_key, event_id, game_id, player_id, player_name, team, opponent_team,
          market, line, side, model_probability, raw_model_probability, confidence, won,
          actual_value, projected_mean, book, odds_american, implied_probability,
          hitter_archetype, pitcher_archetype, matchup_cluster_key, settled_at, metadata_json, updated_at
        ) VALUES (
          ${sqlString(row.id ?? id("calrow"))}, ${sqlString(rowKey)}, ${sqlString(row.sourceKey ?? "SIM_SETTLEMENT")},
          ${sqlString(row.eventId)}, ${sqlString(row.gameId)}, ${sqlString(row.playerId)}, ${sqlString(row.playerName)},
          ${sqlString(row.team)}, ${sqlString(row.opponentTeam)}, ${sqlString(row.market)}, ${sqlNumber(row.line)}, ${sqlString(row.side)},
          ${sqlNumber(row.modelProbability)}, ${sqlNumber(row.rawModelProbability ?? row.modelProbability)}, ${sqlNumber(row.confidence)}, ${sqlBool(row.won)},
          ${sqlNumber(row.actualValue)}, ${sqlNumber(row.projectedMean)}, ${sqlString(row.book)}, ${sqlNumber(row.oddsAmerican)}, ${sqlNumber(row.impliedProbability)},
          ${sqlString(row.hitterArchetype)}, ${sqlString(row.pitcherArchetype)}, ${sqlString(row.matchupClusterKey)}, ${row.settledAt ? `${sqlString(row.settledAt)}::timestamptz` : "NULL"}, ${metadata ? `${sqlString(metadata)}::jsonb` : "NULL"}, NOW()
        )
        ON CONFLICT (row_key) DO UPDATE SET
          model_probability = EXCLUDED.model_probability,
          raw_model_probability = EXCLUDED.raw_model_probability,
          confidence = EXCLUDED.confidence,
          won = EXCLUDED.won,
          actual_value = EXCLUDED.actual_value,
          projected_mean = EXCLUDED.projected_mean,
          metadata_json = EXCLUDED.metadata_json,
          updated_at = NOW()
      `);
      persistedCount += 1;
    } catch (error) {
      warnings.push(`Failed to persist calibration row: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { persistedCount, skippedCount: rows.length - persistedCount, warnings };
}

type DbCalibrationRow = {
  market: string;
  line: number;
  side: string;
  model_probability: number;
  won: boolean;
  player_id: string | null;
  player_name: string | null;
  hitter_archetype: string | null;
  pitcher_archetype: string | null;
  matchup_cluster_key: string | null;
  book: string | null;
  odds_american: number | null;
  confidence: number | null;
  settled_at: Date | string | null;
};

function toCalibrationRow(row: DbCalibrationRow): MlbSettledBatterPropProbabilityRow {
  return {
    market: row.market as MlbSettledBatterPropProbabilityRow["market"],
    line: Number(row.line),
    side: row.side as MlbSettledBatterPropProbabilityRow["side"],
    modelProbability: Number(row.model_probability),
    won: Boolean(row.won),
    playerId: row.player_id,
    playerName: row.player_name,
    hitterArchetype: row.hitter_archetype,
    pitcherArchetype: row.pitcher_archetype,
    matchupClusterKey: row.matchup_cluster_key,
    book: row.book,
    oddsAmerican: row.odds_american,
    confidence: row.confidence,
    settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null
  };
}

export async function fetchPersistedMlbPlayerPropCalibrationRows(args: { lookbackDays?: number; limit?: number } = {}) {
  if (!hasUsableServerDatabaseUrl()) return [] as MlbSettledBatterPropProbabilityRow[];
  const lookbackDays = Math.max(1, args.lookbackDays ?? 365);
  const limit = Math.max(1, Math.min(args.limit ?? 20000, 100000));
  const rows = await prisma.$queryRawUnsafe<DbCalibrationRow[]>(`
    SELECT market, line, side, model_probability, won, player_id, player_name, hitter_archetype, pitcher_archetype,
           matchup_cluster_key, book, odds_american, confidence, settled_at
    FROM mlb_player_prop_calibration_rows
    WHERE settled_at IS NULL OR settled_at >= NOW() - INTERVAL '${lookbackDays} days'
    ORDER BY settled_at DESC NULLS LAST, created_at DESC
    LIMIT ${limit}
  `);
  return rows.map(toCalibrationRow);
}

export async function refreshMlbPlayerPropCalibrationSnapshots(args: { lookbackDays?: number; minBinSample?: number; persist?: boolean } = {}): Promise<MlbCalibrationRefreshReport> {
  const warnings: string[] = [];
  const rows = await fetchPersistedMlbPlayerPropCalibrationRows({ lookbackDays: args.lookbackDays });
  const calibration = buildMlbBatterPropProbabilityCalibration({ rows, minBinSample: args.minBinSample });
  warnings.push(...calibration.warnings);
  let persistedSnapshotCount = 0;
  if (args.persist !== false && hasUsableServerDatabaseUrl()) {
    for (const bin of calibration.bins) {
      const snapshotKey = `${bin.key}:${calibration.sampleSize}`;
      const payload = JSON.stringify(bin);
      await prisma.$executeRawUnsafe(`
        INSERT INTO mlb_player_prop_calibration_snapshots (
          id, snapshot_key, model_version, scope_type, scope_key, market, line, side, probability_min, probability_max,
          sample_size, average_predicted, observed_rate, probability_offset, brier_score, log_loss, reliability,
          roi, hit_rate, calibration_drift, payload_json, refreshed_at, updated_at
        ) VALUES (
          ${sqlString(id("calsnap"))}, ${sqlString(snapshotKey)}, ${sqlString(calibration.modelVersion)}, ${sqlString(bin.scopeType)}, ${sqlString(bin.scopeKey)},
          ${sqlString(bin.market)}, ${sqlNumber(bin.line)}, ${sqlString(bin.side)}, ${sqlNumber(bin.probabilityMin)}, ${sqlNumber(bin.probabilityMax)},
          ${sqlNumber(bin.sampleSize)}, ${sqlNumber(bin.averagePredicted)}, ${sqlNumber(bin.observedRate)}, ${sqlNumber(bin.probabilityOffset)}, ${sqlNumber(bin.brierScore)}, ${sqlNumber(bin.logLoss)}, ${sqlNumber(bin.reliability)},
          NULL, ${sqlNumber(bin.observedRate)}, ${sqlNumber(bin.observedRate - bin.averagePredicted)}, ${sqlString(payload)}::jsonb, NOW(), NOW()
        )
        ON CONFLICT (snapshot_key) DO UPDATE SET
          sample_size = EXCLUDED.sample_size,
          average_predicted = EXCLUDED.average_predicted,
          observed_rate = EXCLUDED.observed_rate,
          probability_offset = EXCLUDED.probability_offset,
          brier_score = EXCLUDED.brier_score,
          log_loss = EXCLUDED.log_loss,
          reliability = EXCLUDED.reliability,
          payload_json = EXCLUDED.payload_json,
          refreshed_at = NOW(),
          updated_at = NOW()
      `);
      persistedSnapshotCount += 1;
    }
  }
  return {
    modelVersion: "mlb-player-prop-calibration-refresh-v1",
    rowCount: rows.length,
    calibration,
    snapshotCount: calibration.bins.length,
    persistedSnapshotCount,
    warnings
  };
}
