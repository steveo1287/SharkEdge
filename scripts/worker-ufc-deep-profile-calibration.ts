import { prisma } from "@/lib/db/prisma";
import { getUfcFightIqDetail, type UfcFightIqDetail } from "@/services/ufc/card-feed";
import { buildUfcDeepFighterProfileV2FromFeature } from "@/services/ufc/deep-fighter-profile-v2";
import { buildUfcDeepProfileMatchupEngine } from "@/services/ufc/deep-profile-matchup-engine";
import { buildUfcDeepProfileCalibrationReport, type UfcActualFightResult, type UfcCalibrationMethod, type UfcCalibrationSide, type UfcDeepProfileCalibrationReport } from "@/services/ufc/deep-profile-calibration";

type CompletedFightRow = {
  fight_id: string;
  fighter_a_id: string;
  fighter_b_id: string;
  winner_fighter_id: string | null;
  scheduled_rounds: number | null;
  method_kind: string | null;
  method: string | null;
  round: number | null;
  fight_time: string | null;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string, fallback: number) {
  const value = argValue(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric arg --${name}=${value}`);
  return parsed;
}

function methodKind(value: string | null | undefined): UfcCalibrationMethod {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("sub")) return "SUBMISSION";
  if (raw.includes("ko") || raw.includes("tko")) return "KO_TKO";
  if (raw.includes("decision")) return "DECISION";
  if (raw.includes("dq") || raw.includes("disqualification")) return "DQ";
  if (raw.includes("no contest")) return "NO_CONTEST";
  return "UNKNOWN";
}

function winnerSide(row: CompletedFightRow): UfcCalibrationSide {
  if (!row.winner_fighter_id) return "NO_CONTEST";
  if (row.winner_fighter_id === row.fighter_a_id) return "A";
  if (row.winner_fighter_id === row.fighter_b_id) return "B";
  return "NO_CONTEST";
}

function actualFromRow(row: CompletedFightRow): UfcActualFightResult {
  return {
    fightId: row.fight_id,
    winner: winnerSide(row),
    method: methodKind(row.method_kind ?? row.method),
    round: row.round,
    time: row.fight_time,
    scheduledRounds: row.scheduled_rounds
  };
}

function buildMatchup(fight: UfcFightIqDetail) {
  const aSnapshot = fight.featureSnapshots?.fighterA;
  const bSnapshot = fight.featureSnapshots?.fighterB;
  if (!aSnapshot || !bSnapshot) throw new Error(`Missing feature snapshots for ${fight.fightId}`);
  const fighterA = buildUfcDeepFighterProfileV2FromFeature({
    fighterName: fight.fighters.fighterA.name,
    feature: aSnapshot,
    payload: aSnapshot.feature,
    generatedAt: aSnapshot.snapshotAt
  });
  const fighterB = buildUfcDeepFighterProfileV2FromFeature({
    fighterName: fight.fighters.fighterB.name,
    feature: bSnapshot,
    payload: bSnapshot.feature,
    generatedAt: bSnapshot.snapshotAt
  });
  return buildUfcDeepProfileMatchupEngine({ fighterA, fighterB, fightId: fight.fightId });
}

async function completedFights(fightId: string | null, limit: number): Promise<CompletedFightRow[]> {
  if (fightId) {
    return prisma.$queryRaw<CompletedFightRow[]>`
      SELECT id AS fight_id,
             fighter_a_id,
             fighter_b_id,
             winner_fighter_id,
             scheduled_rounds,
             payload_json->>'methodKind' AS method_kind,
             payload_json->>'method' AS method,
             NULLIF(payload_json->>'round', '')::integer AS round,
             payload_json->>'time' AS fight_time
      FROM ufc_fights
      WHERE id = ${fightId}
        AND winner_fighter_id IS NOT NULL
      LIMIT 1
    `;
  }
  return prisma.$queryRaw<CompletedFightRow[]>`
    SELECT id AS fight_id,
           fighter_a_id,
           fighter_b_id,
           winner_fighter_id,
           scheduled_rounds,
           payload_json->>'methodKind' AS method_kind,
           payload_json->>'method' AS method,
           NULLIF(payload_json->>'round', '')::integer AS round,
           payload_json->>'time' AS fight_time
    FROM ufc_fights
    WHERE winner_fighter_id IS NOT NULL
      AND fight_date <= now()
    ORDER BY fight_date DESC, updated_at DESC
    LIMIT ${limit}
  `;
}

function aggregate(reports: UfcDeepProfileCalibrationReport[]) {
  const adjustmentCounts: Record<string, number> = {};
  for (const report of reports) {
    for (const adjustment of report.adjustments) adjustmentCounts[adjustment.type] = (adjustmentCounts[adjustment.type] ?? 0) + 1;
  }
  const avgCalibrationError = reports.length ? reports.reduce((sum, report) => sum + report.scores.calibrationError, 0) / reports.length : 0;
  return {
    avgCalibrationError: Number(avgCalibrationError.toFixed(3)),
    highMissCount: reports.filter((report) => report.scores.calibrationError >= 35).length,
    adjustmentCounts,
    worstFights: [...reports]
      .sort((a, b) => b.scores.calibrationError - a.scores.calibrationError)
      .slice(0, 10)
      .map((report) => ({ fightId: report.fightId, calibrationError: report.scores.calibrationError, summary: report.summary }))
  };
}

async function main() {
  const fightId = argValue("fightId");
  const limit = numberArg("limit", 50);
  const generatedAt = argValue("generatedAt") ?? new Date().toISOString();
  const compact = hasFlag("compact");
  const rows = await completedFights(fightId, limit);
  const reports: UfcDeepProfileCalibrationReport[] = [];
  const skipped: Array<{ fightId: string; reason: string }> = [];
  for (const row of rows) {
    try {
      const fight = await getUfcFightIqDetail(row.fight_id);
      if (!fight) {
        skipped.push({ fightId: row.fight_id, reason: "fight-detail-not-found" });
        continue;
      }
      const matchup = buildMatchup(fight);
      const actual = actualFromRow(row);
      reports.push(buildUfcDeepProfileCalibrationReport({ matchup, actual, generatedAt }));
    } catch (error) {
      skipped.push({ fightId: row.fight_id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  const payload = {
    ok: skipped.length === 0,
    command: "worker-ufc-deep-profile-calibration",
    dryRun: true,
    scanned: rows.length,
    calibrated: reports.length,
    skipped,
    aggregate: aggregate(reports),
    reports: compact ? reports.map((report) => ({ fightId: report.fightId, calibrationError: report.scores.calibrationError, summary: report.summary, adjustments: report.adjustments })) : reports
  };
  console.log(JSON.stringify(payload, null, 2));
  if (skipped.length && reports.length === 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, command: "worker-ufc-deep-profile-calibration", error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
