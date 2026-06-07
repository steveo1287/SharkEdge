import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import {
  ensureMlbPlayerPropInningLedgers,
  gradeMlbInningProjectionRow,
  gradeMlbPlayerPropRow,
  type MlbInningProjectionRow,
  type MlbPlayerPropProjectionRow
} from "@/services/simulation/mlb-player-prop-inning-ledgers";

type PendingPlayerPropLedgerRow = {
  id: string;
  game_id: string;
  event_label: string;
  start_time: Date;
  team: string;
  player_id: string;
  player_name: string;
  market: string;
  line: number;
  projected_value: number;
  probability_over: number | null;
  confidence: number;
};

type PendingInningLedgerRow = {
  id: string;
  game_id: string;
  event_label: string;
  start_time: Date;
  market: string;
  line: number | null;
  side: string;
  projected_value: number;
  probability: number;
  confidence: number;
};

type ActualPlayerStatRow = {
  player_id: string;
  player_name: string | null;
  stats_json: unknown;
  outcome_status: string | null;
};

type ActualTeamStatRow = {
  team_id: string;
  team_key: string | null;
  abbreviation: string | null;
  name: string | null;
  stats_json: unknown;
};

export type MlbPlayerPropInningGradeSummary = {
  ok: boolean;
  databaseReady: boolean;
  scannedPlayerProps: number;
  gradedPlayerProps: number;
  pendingPlayerProps: number;
  scannedInningMarkets: number;
  gradedInningMarkets: number;
  pendingInningMarkets: number;
  errors: string[];
};

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function clampLimit(value: number) {
  return Math.max(1, Math.min(5000, Math.round(value)));
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function parseMatchup(label: string) {
  const at = label.split(" @ ");
  if (at.length === 2) return { away: at[0]?.trim() ?? "", home: at[1]?.trim() ?? "" };
  const vs = label.split(" vs ");
  if (vs.length === 2) return { away: vs[0]?.trim() ?? "", home: vs[1]?.trim() ?? "" };
  return { away: "", home: "" };
}

function playerRowForGrade(row: PendingPlayerPropLedgerRow): MlbPlayerPropProjectionRow {
  return {
    gameId: row.game_id,
    eventLabel: row.event_label,
    startTime: row.start_time,
    team: row.team,
    playerId: row.player_id,
    playerName: row.player_name,
    market: row.market,
    line: row.line,
    projectedValue: row.projected_value,
    probabilityOver: row.probability_over,
    confidence: row.confidence
  };
}

function inningRowForGrade(row: PendingInningLedgerRow): MlbInningProjectionRow {
  return {
    gameId: row.game_id,
    eventLabel: row.event_label,
    startTime: row.start_time,
    market: row.market,
    line: row.line,
    side: row.side,
    projectedValue: row.projected_value,
    probability: row.probability,
    confidence: row.confidence
  };
}

async function findActualPlayerStats(row: PendingPlayerPropLedgerRow) {
  const rows = await prisma.$queryRaw<ActualPlayerStatRow[]>`
    SELECT pgs.player_id, p.name AS player_name, pgs.stats_json, pgs.outcome_status
    FROM player_game_stats pgs
    LEFT JOIN players p ON p.id = pgs.player_id
    WHERE pgs.game_id = ${row.game_id}
      AND (
        pgs.player_id = ${row.player_id}
        OR lower(p.name) = lower(${row.player_name})
        OR regexp_replace(lower(p.name), '[^a-z0-9]+', '', 'g') = ${normalize(row.player_name)}
      )
    ORDER BY CASE WHEN pgs.player_id = ${row.player_id} THEN 0 ELSE 1 END
    LIMIT 1;
  `;
  return rows[0] ?? null;
}

function teamMatches(row: ActualTeamStatRow, label: string) {
  const target = normalize(label);
  if (!target) return false;
  return [row.team_key, row.abbreviation, row.name].some((value) => {
    const normalized = normalize(value);
    return normalized === target || Boolean(normalized && (target.includes(normalized) || normalized.includes(target)));
  });
}

async function findActualTeamStats(gameId: string, eventLabel: string) {
  const rows = await prisma.$queryRaw<ActualTeamStatRow[]>`
    SELECT tgs.team_id, t.key AS team_key, t.abbreviation, t.name, tgs.stats_json
    FROM team_game_stats tgs
    LEFT JOIN teams t ON t.id = tgs.team_id
    WHERE tgs.game_id = ${gameId}
    ORDER BY t.abbreviation ASC NULLS LAST, t.name ASC NULLS LAST;
  `;
  const matchup = parseMatchup(eventLabel);
  const away = rows.find((row) => teamMatches(row, matchup.away)) ?? rows[0] ?? null;
  const home = rows.find((row) => teamMatches(row, matchup.home) && row.team_id !== away?.team_id) ?? rows.find((row) => row.team_id !== away?.team_id) ?? null;
  return { away, home, all: rows, matchup };
}

async function updatePlayerPropGrade(row: PendingPlayerPropLedgerRow, grade: ReturnType<typeof gradeMlbPlayerPropRow>, actual: ActualPlayerStatRow) {
  await prisma.$executeRaw`
    UPDATE mlb_player_prop_projection_ledger
    SET result = ${grade.result},
        actual_value = ${grade.actual},
        brier = ${grade.brier},
        log_loss = ${grade.logLoss},
        result_json = ${safeJson({ actualPlayerId: actual.player_id, actualPlayerName: actual.player_name, outcomeStatus: actual.outcome_status, statsJson: actual.stats_json })}::jsonb,
        graded_at = now(),
        updated_at = now()
    WHERE id = ${row.id};
  `;
}

async function updateInningGrade(row: PendingInningLedgerRow, grade: ReturnType<typeof gradeMlbInningProjectionRow>, actual: Awaited<ReturnType<typeof findActualTeamStats>>) {
  await prisma.$executeRaw`
    UPDATE mlb_inning_market_projection_ledger
    SET result = ${grade.result},
        actual_value = ${grade.actual},
        brier = ${grade.brier},
        log_loss = ${grade.logLoss},
        result_json = ${safeJson({ matchup: actual.matchup, away: actual.away, home: actual.home, teamStats: actual.all })}::jsonb,
        graded_at = now(),
        updated_at = now()
    WHERE id = ${row.id};
  `;
}

async function pendingPlayerRows(limit: number) {
  return prisma.$queryRaw<PendingPlayerPropLedgerRow[]>`
    SELECT id, game_id, event_label, start_time, team, player_id, player_name, market, line,
      projected_value, probability_over, confidence
    FROM mlb_player_prop_projection_ledger
    WHERE result = 'PENDING'
      AND start_time <= now()
    ORDER BY start_time ASC, captured_at ASC
    LIMIT ${limit};
  `;
}

async function pendingInningRows(limit: number) {
  return prisma.$queryRaw<PendingInningLedgerRow[]>`
    SELECT id, game_id, event_label, start_time, market, line, side, projected_value, probability, confidence
    FROM mlb_inning_market_projection_ledger
    WHERE result = 'PENDING'
      AND start_time <= now()
    ORDER BY start_time ASC, captured_at ASC
    LIMIT ${limit};
  `;
}

export async function gradePendingMlbPlayerPropInningLedgers(options: { limit?: number; dryRun?: boolean } = {}): Promise<MlbPlayerPropInningGradeSummary> {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, databaseReady: false, scannedPlayerProps: 0, gradedPlayerProps: 0, pendingPlayerProps: 0, scannedInningMarkets: 0, gradedInningMarkets: 0, pendingInningMarkets: 0, errors: ["No usable server database URL is configured."] };
  }

  await ensureMlbPlayerPropInningLedgers();
  const limit = clampLimit(options.limit ?? 1000);
  const errors: string[] = [];
  let gradedPlayerProps = 0;
  let pendingPlayerProps = 0;
  let gradedInningMarkets = 0;
  let pendingInningMarkets = 0;

  const playerRows = await pendingPlayerRows(limit);
  for (const row of playerRows) {
    try {
      const actual = await findActualPlayerStats(row);
      if (!actual) {
        pendingPlayerProps += 1;
        continue;
      }
      const grade = gradeMlbPlayerPropRow(playerRowForGrade(row), actual.stats_json);
      if (grade.result === "PENDING") {
        pendingPlayerProps += 1;
        continue;
      }
      if (!options.dryRun) await updatePlayerPropGrade(row, grade, actual);
      gradedPlayerProps += 1;
    } catch (error) {
      errors.push(`player:${row.id}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const inningRows = await pendingInningRows(limit);
  for (const row of inningRows) {
    try {
      const actual = await findActualTeamStats(row.game_id, row.event_label);
      if (!actual.away || !actual.home) {
        pendingInningMarkets += 1;
        continue;
      }
      const grade = gradeMlbInningProjectionRow(inningRowForGrade(row), { awayStatsJson: actual.away.stats_json, homeStatsJson: actual.home.stats_json });
      if (grade.result === "PENDING") {
        pendingInningMarkets += 1;
        continue;
      }
      if (!options.dryRun) await updateInningGrade(row, grade, actual);
      gradedInningMarkets += 1;
    } catch (error) {
      errors.push(`inning:${row.id}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    ok: errors.length === 0,
    databaseReady: true,
    scannedPlayerProps: playerRows.length,
    gradedPlayerProps,
    pendingPlayerProps,
    scannedInningMarkets: inningRows.length,
    gradedInningMarkets,
    pendingInningMarkets,
    errors
  };
}
