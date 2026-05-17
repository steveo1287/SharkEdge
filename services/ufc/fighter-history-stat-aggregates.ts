import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type AggregateRow = {
  fighter_id: string;
  fighter_name: string;
  rounds_fought: number | null;
  seconds_fought: number | null;
  sig_landed: number | null;
  sig_attempted: number | null;
  sig_absorbed: number | null;
  td_landed: number | null;
  td_attempted: number | null;
  sub_attempts: number | null;
  control_seconds: number | null;
  opp_sig_attempted: number | null;
  opp_td_landed: number | null;
  opp_td_attempted: number | null;
  fight_count: number | null;
  wins: number | null;
  losses: number | null;
  finish_wins: number | null;
  ko_tko_losses: number | null;
  submission_losses: number | null;
};

function safeNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function pct(numerator: number, denominator: number, fallback: number | null = null) {
  if (denominator <= 0) return fallback;
  return round((numerator / denominator) * 100, 2);
}

function per15(count: number, seconds: number) {
  if (seconds <= 0) return null;
  return round((count / seconds) * 900, 3);
}

function perMinute(count: number, seconds: number) {
  if (seconds <= 0) return null;
  return round((count / seconds) * 60, 3);
}

function methodText(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function buildStats(row: AggregateRow) {
  const seconds = safeNumber(row.seconds_fought);
  const sigLanded = safeNumber(row.sig_landed);
  const sigAttempted = safeNumber(row.sig_attempted);
  const sigAbsorbed = safeNumber(row.sig_absorbed);
  const tdLanded = safeNumber(row.td_landed);
  const tdAttempted = safeNumber(row.td_attempted);
  const subAttempts = safeNumber(row.sub_attempts);
  const controlSeconds = safeNumber(row.control_seconds);
  const oppSigAttempted = safeNumber(row.opp_sig_attempted);
  const oppTdLanded = safeNumber(row.opp_td_landed);
  const oppTdAttempted = safeNumber(row.opp_td_attempted);
  const fightCount = safeNumber(row.fight_count);
  const wins = safeNumber(row.wins);
  const losses = safeNumber(row.losses);
  const finishWins = safeNumber(row.finish_wins);
  const koTkoLosses = safeNumber(row.ko_tko_losses);
  const submissionLosses = safeNumber(row.submission_losses);
  const slpm = perMinute(sigLanded, seconds);
  const sapm = perMinute(sigAbsorbed, seconds);
  const sigStrikeDefensePct = oppSigAttempted > 0 ? round(Math.max(0, Math.min(100, (1 - sigAbsorbed / oppSigAttempted) * 100)), 2) : null;
  const takedownDefensePct = oppTdAttempted > 0 ? round(Math.max(0, Math.min(100, (1 - oppTdLanded / oppTdAttempted) * 100)), 2) : null;
  const totalKnownResults = wins + losses;
  return {
    source: "ufc_fight_stats_rounds_history_aggregate",
    sampleQuality: fightCount >= 8 ? "strong" : fightCount >= 4 ? "usable" : "thin",
    proFights: fightCount || null,
    ufcFights: fightCount || null,
    wins: wins || null,
    losses: losses || null,
    roundsFought: row.rounds_fought == null ? seconds > 0 ? round(seconds / 300, 2) : null : safeNumber(row.rounds_fought),
    secondsFought: seconds || null,
    slpm,
    sapm,
    sigStrikesLandedPerMin: slpm,
    sigStrikesAbsorbedPerMin: sapm,
    strikingDifferential: slpm != null && sapm != null ? round(slpm - sapm, 3) : null,
    sigStrikeAccuracyPct: pct(sigLanded, sigAttempted),
    sigStrikeDefensePct,
    knockdownsPer15: null,
    takedownsPer15: per15(tdLanded, seconds),
    takedownAccuracyPct: pct(tdLanded, tdAttempted),
    takedownDefensePct,
    submissionAttemptsPer15: per15(subAttempts, seconds),
    submissionDefensePct: takedownDefensePct == null ? null : round(Math.max(30, Math.min(96, 56 + takedownDefensePct * 0.22 - (per15(subAttempts, seconds) ?? 0) * 1.4)), 2),
    controlTimePct: pct(controlSeconds, seconds),
    controlEscapePct: takedownDefensePct == null ? null : round(Math.max(25, Math.min(94, takedownDefensePct * 0.8)), 2),
    finishRate: wins > 0 ? round(finishWins / wins, 3) : null,
    koLossRate: totalKnownResults > 0 ? round(koTkoLosses / totalKnownResults, 3) : null,
    submissionLossRate: totalKnownResults > 0 ? round(submissionLosses / totalKnownResults, 3) : null,
    officialHistory: {
      fightCount,
      roundsSampled: row.rounds_fought,
      secondsFought: seconds,
      sigLanded,
      sigAttempted,
      sigAbsorbed,
      oppSigAttempted,
      tdLanded,
      tdAttempted,
      oppTdLanded,
      oppTdAttempted,
      subAttempts,
      controlSeconds,
      wins,
      losses,
      finishWins,
      koTkoLosses,
      submissionLosses
    }
  };
}

export async function aggregateUfcHistoryStatsIntoProfiles(options: { limit?: number; minRows?: number; dryRun?: boolean } = {}) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, mode: options.dryRun ? "dry-run" : "write", error: "No usable server database URL is configured." };
  const limit = Math.max(1, Math.min(5000, Math.floor(options.limit ?? 500)));
  const minRows = Math.max(1, Math.min(20, Math.floor(options.minRows ?? 1)));
  const dryRun = Boolean(options.dryRun);
  const rows = await prisma.$queryRaw<AggregateRow[]>`
    WITH base AS (
      SELECT
        fsr.fighter_id,
        MAX(f.full_name) AS fighter_name,
        COUNT(*)::double precision AS rounds_fought,
        SUM(COALESCE(fsr.seconds_fought, 300))::double precision AS seconds_fought,
        SUM(fsr.sig_strikes_landed)::double precision AS sig_landed,
        SUM(fsr.sig_strikes_attempted)::double precision AS sig_attempted,
        SUM(fsr.sig_strikes_absorbed)::double precision AS sig_absorbed,
        SUM(fsr.takedowns_landed)::double precision AS td_landed,
        SUM(fsr.takedowns_attempted)::double precision AS td_attempted,
        SUM(fsr.submission_attempts)::double precision AS sub_attempts,
        SUM(fsr.control_seconds)::double precision AS control_seconds,
        COUNT(DISTINCT fsr.fight_id)::double precision AS fight_count
      FROM ufc_fight_stats_rounds fsr
      JOIN ufc_fighters f ON f.id = fsr.fighter_id
      GROUP BY fsr.fighter_id
      HAVING COUNT(*) >= ${minRows}
    ), opp AS (
      SELECT
        fsr.opponent_fighter_id AS fighter_id,
        SUM(fsr.sig_strikes_attempted)::double precision AS opp_sig_attempted,
        SUM(fsr.takedowns_landed)::double precision AS opp_td_landed,
        SUM(fsr.takedowns_attempted)::double precision AS opp_td_attempted
      FROM ufc_fight_stats_rounds fsr
      WHERE fsr.opponent_fighter_id IS NOT NULL
      GROUP BY fsr.opponent_fighter_id
    ), results AS (
      SELECT
        p.fighter_id,
        COUNT(DISTINCT uf.id) FILTER (WHERE uf.winner_fighter_id = p.fighter_id)::double precision AS wins,
        COUNT(DISTINCT uf.id) FILTER (WHERE uf.winner_fighter_id IS NOT NULL AND uf.winner_fighter_id <> p.fighter_id)::double precision AS losses,
        COUNT(DISTINCT uf.id) FILTER (WHERE uf.winner_fighter_id = p.fighter_id AND lower(COALESCE(uf.payload_json->>'method', '')) NOT LIKE '%decision%')::double precision AS finish_wins,
        COUNT(DISTINCT uf.id) FILTER (WHERE uf.winner_fighter_id IS NOT NULL AND uf.winner_fighter_id <> p.fighter_id AND (lower(COALESCE(uf.payload_json->>'method', '')) LIKE '%ko%' OR lower(COALESCE(uf.payload_json->>'method', '')) LIKE '%tko%'))::double precision AS ko_tko_losses,
        COUNT(DISTINCT uf.id) FILTER (WHERE uf.winner_fighter_id IS NOT NULL AND uf.winner_fighter_id <> p.fighter_id AND (lower(COALESCE(uf.payload_json->>'method', '')) LIKE '%sub%'))::double precision AS submission_losses
      FROM (
        SELECT fighter_a_id AS fighter_id, id AS fight_id FROM ufc_fights
        UNION ALL
        SELECT fighter_b_id AS fighter_id, id AS fight_id FROM ufc_fights
      ) p
      JOIN ufc_fights uf ON uf.id = p.fight_id
      GROUP BY p.fighter_id
    )
    SELECT
      base.*,
      COALESCE(opp.opp_sig_attempted, 0) AS opp_sig_attempted,
      COALESCE(opp.opp_td_landed, 0) AS opp_td_landed,
      COALESCE(opp.opp_td_attempted, 0) AS opp_td_attempted,
      COALESCE(results.wins, 0) AS wins,
      COALESCE(results.losses, 0) AS losses,
      COALESCE(results.finish_wins, 0) AS finish_wins,
      COALESCE(results.ko_tko_losses, 0) AS ko_tko_losses,
      COALESCE(results.submission_losses, 0) AS submission_losses
    FROM base
    LEFT JOIN opp ON opp.fighter_id = base.fighter_id
    LEFT JOIN results ON results.fighter_id = base.fighter_id
    ORDER BY base.fight_count DESC, base.fighter_name
    LIMIT ${limit}
  `;

  let updated = 0;
  const items = [];
  const errors: string[] = [];
  for (const row of rows) {
    const stats = buildStats(row);
    items.push({ fighterId: row.fighter_id, fighterName: row.fighter_name, fightCount: stats.ufcFights, roundsFought: stats.roundsFought, slpm: stats.slpm, sapm: stats.sapm, takedownDefensePct: stats.takedownDefensePct, controlTimePct: stats.controlTimePct, finishRate: stats.finishRate });
    if (dryRun) { updated += 1; continue; }
    try {
      await prisma.$executeRaw`
        UPDATE ufc_fighters
        SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify({
          historyDerivedStats: stats,
          careerStats: stats,
          stats: stats,
          profileAccuracy: {
            source: "ufc_fight_stats_rounds",
            updatedAt: new Date().toISOString(),
            fightCount: stats.ufcFights,
            roundsFought: stats.roundsFought,
            confidence: stats.ufcFights && stats.ufcFights >= 8 ? 0.9 : stats.ufcFights && stats.ufcFights >= 4 ? 0.78 : 0.62
          }
        })}::jsonb,
          updated_at = now()
        WHERE id = ${row.fighter_id}
      `;
      updated += 1;
    } catch (error) {
      errors.push(`${row.fighter_name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: errors.length === 0, mode: dryRun ? "dry-run" : "write", aggregateCount: rows.length, updatedFighters: updated, items: items.slice(0, 50), errors: errors.slice(0, 50) };
}
