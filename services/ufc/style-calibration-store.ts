import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { calculateUfcStyleCalibrationReport, type UfcStyleCalibrationRow } from "@/services/ufc/style-calibration";

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function styleGenomeFromPayload(payload: unknown) {
  const root = asRecord(payload);
  const sim = asRecord(root.sim);
  return asRecord(root.styleGenome ?? sim.styleGenome);
}

function sourceOutputsFromPayload(payload: unknown) {
  const root = asRecord(payload);
  const sim = asRecord(root.sim);
  return asRecord(root.sourceOutputs ?? sim.sourceOutputs);
}

type ResolvedStyleRawRow = {
  fight_id: string;
  fighter_a_id: string;
  fighter_b_id: string;
  pick_fighter_id: string | null;
  actual_winner_fighter_id: string | null;
  fighter_a_win_probability: number;
  fighter_b_win_probability: number;
  payload_json: unknown;
};

export function extractUfcStyleCalibrationRow(row: ResolvedStyleRawRow): UfcStyleCalibrationRow | null {
  if (!row.actual_winner_fighter_id) return null;
  const genome = styleGenomeFromPayload(row.payload_json);
  const fighterA = asRecord(genome.fighterA);
  const fighterB = asRecord(genome.fighterB);
  const clash = asRecord(genome.clash);
  const archetypeA = asRecord(fighterA.archetype);
  const archetypeB = asRecord(fighterB.archetype);
  const clashArchetypes = asRecord(clash.archetypes);
  const sourceOutputs = sourceOutputsFromPayload(row.payload_json);
  const styleOutput = asRecord(sourceOutputs.styleMatchup);
  const fighterAArchetype = asString(archetypeA.primary) ?? asString(clashArchetypes.fighterA) ?? "Unknown";
  const fighterBArchetype = asString(archetypeB.primary) ?? asString(clashArchetypes.fighterB) ?? "Unknown";
  if (fighterAArchetype === "Unknown" && fighterBArchetype === "Unknown") return null;

  return {
    fightId: row.fight_id,
    actualWinner: row.actual_winner_fighter_id === row.fighter_a_id ? "A" : "B",
    pickSide: row.pick_fighter_id === row.fighter_a_id ? "A" : row.pick_fighter_id === row.fighter_b_id ? "B" : null,
    fighterAWinProbability: row.fighter_a_win_probability,
    fighterBWinProbability: row.fighter_b_win_probability,
    styleMatchupFighterAWinProbability: asNumber(styleOutput.fighterAWinProbability),
    fighterAArchetype,
    fighterBArchetype,
    fighterASecondary: asStringArray(archetypeA.secondary ?? clashArchetypes.fighterASecondary),
    fighterBSecondary: asStringArray(archetypeB.secondary ?? clashArchetypes.fighterBSecondary),
    styleWarnings: asStringArray(clash.styleWarnings),
    pathToVictoryA: asStringArray(clash.pathToVictoryA),
    pathToVictoryB: asStringArray(clash.pathToVictoryB),
    paceProjection: asNumber(clash.paceProjection),
    wrestlingInitiativeEdgeA: asNumber(clash.wrestlingInitiativeEdgeA),
    chaosIndex: asNumber(clash.chaosIndex),
    finishVolatility: asNumber(clash.finishVolatility),
    decisionReliability: asNumber(clash.decisionReliability)
  };
}

export async function loadResolvedUfcStyleCalibrationRows(modelVersion = "ufc-fight-iq-v1") {
  const rows = await prisma.$queryRaw<ResolvedStyleRawRow[]>`
    SELECT s.fight_id, f.fighter_a_id, f.fighter_b_id, s.pick_fighter_id, s.actual_winner_fighter_id,
      s.fighter_a_win_probability, s.fighter_b_win_probability, s.payload_json
    FROM ufc_shadow_predictions s
    JOIN ufc_fights f ON f.id = s.fight_id
    WHERE s.model_version = ${modelVersion}
      AND s.status IN ('RESOLVED', 'SETTLED')
      AND s.actual_winner_fighter_id IS NOT NULL
      AND s.payload_json IS NOT NULL
  `;
  return rows.map(extractUfcStyleCalibrationRow).filter((item): item is UfcStyleCalibrationRow => item !== null);
}

export async function persistUfcStyleCalibrationSnapshot(modelVersion = "ufc-fight-iq-v1", label = "style-calibration") {
  const rows = await loadResolvedUfcStyleCalibrationRows(modelVersion);
  const report = calculateUfcStyleCalibrationReport(rows);
  const id = stableId("ufcstylecal", `${modelVersion}:${label}:${new Date().toISOString()}`);
  await prisma.$executeRaw`
    INSERT INTO ufc_calibration_snapshots (id, model_version, snapshot_label, generated_at, fight_count, accuracy_pct, log_loss, brier_score, calibration_error, avg_clv_pct, bucket_json, metrics_json, updated_at)
    VALUES (${id}, ${modelVersion}, ${label}, now(), ${report.sampleCount}, ${report.pickAccuracyPct}, null, ${report.avgBrier}, null, null, ${JSON.stringify({ archetypes: report.archetypes, warnings: report.warnings, paths: report.paths, clashBuckets: report.clashBuckets })}::jsonb, ${JSON.stringify(report)}::jsonb, now())
  `;
  return { id, report };
}
