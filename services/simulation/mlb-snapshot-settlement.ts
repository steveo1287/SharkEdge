import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { computeMlbSnapshotSettlementMath } from "@/services/simulation/mlb-settlement-math";

export type MlbSnapshotSettlementOptions = {
  limit?: number;
  dryRun?: boolean;
  olderThanHours?: number;
};

export type MlbSnapshotSettlementSummary = {
  ok: boolean;
  databaseReady: boolean;
  dryRun: boolean;
  scanned: number;
  matched: number;
  settled: number;
  skippedNoFinal: number;
  skippedAmbiguous: number;
  errors: string[];
  samples: Array<{ id: string; gameId: string; eventLabel: string; finalHomeScore: number; finalAwayScore: number; homeWon: boolean | null }>;
};

type SnapshotRow = {
  id: string;
  game_id: string;
  event_label: string;
  away_team: string;
  home_team: string;
  start_time: Date | string;
  model_home_win_pct: number | string;
  model_spread: number | string | null;
  model_total: number | string | null;
};

type FinalScore = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  homeScore: number;
  awayScore: number;
  final: boolean;
};

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function norm(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function dayKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function makeFallbackKey(row: { home_team: string; away_team: string; start_time: Date | string }) {
  const day = dayKey(row.start_time);
  if (!day) return null;
  return `${day}:${norm(row.away_team)}:${norm(row.home_team)}`;
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function fetchMlbStatsApiFinals(rows: SnapshotRow[]) {
  const dates = rows.map((row) => dayKey(row.start_time)).filter((value): value is string => Boolean(value));
  if (!dates.length) return { byGameId: new Map<string, FinalScore>(), byFallback: new Map<string, FinalScore[]>() };

  const sorted = [...new Set(dates)].sort();
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1");
  url.searchParams.set("startDate", start);
  url.searchParams.set("endDate", end);
  url.searchParams.set("hydrate", "team");

  const byGameId = new Map<string, FinalScore>();
  const byFallback = new Map<string, FinalScore[]>();
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return { byGameId, byFallback };

  const body = await response.json();
  for (const date of body.dates ?? []) {
    for (const game of date.games ?? []) {
      const homeScore = num(game.teams?.home?.score);
      const awayScore = num(game.teams?.away?.score);
      const gameId = String(game.gamePk ?? "");
      const homeTeam = String(game.teams?.home?.team?.name ?? "");
      const awayTeam = String(game.teams?.away?.team?.name ?? "");
      const startTime = String(game.gameDate ?? "");
      const status = String(game.status?.abstractGameState ?? game.status?.detailedState ?? "").toLowerCase();
      const final = status.includes("final") || status.includes("completed");
      if (!gameId || homeScore == null || awayScore == null || !final) continue;
      const finalScore: FinalScore = { gameId, homeTeam, awayTeam, startTime, homeScore, awayScore, final };
      byGameId.set(gameId, finalScore);
      const fallbackKey = makeFallbackKey({ away_team: awayTeam, home_team: homeTeam, start_time: startTime });
      if (fallbackKey) byFallback.set(fallbackKey, [...(byFallback.get(fallbackKey) ?? []), finalScore]);
    }
  }
  return { byGameId, byFallback };
}

async function fetchDatabaseFinals(rows: SnapshotRow[]) {
  const gameIds = rows.map((row) => row.game_id).filter(Boolean);
  if (!gameIds.length) return new Map<string, FinalScore>();
  const events = await prisma.event.findMany({
    where: {
      league: { key: "MLB" },
      OR: [{ id: { in: gameIds } }, { externalEventId: { in: gameIds } }],
      eventResult: { isNot: null }
    },
    include: { participants: true, eventResult: true }
  }).catch(() => []);
  const finals = new Map<string, FinalScore>();
  for (const event of events) {
    const home = event.participants.find((participant) => participant.role === "HOME");
    const away = event.participants.find((participant) => participant.role === "AWAY");
    const homeScore = num(home?.score);
    const awayScore = num(away?.score);
    if (homeScore == null || awayScore == null) continue;
    const finalScore: FinalScore = {
      gameId: event.externalEventId ?? event.id,
      homeTeam: home?.competitorId ?? "HOME",
      awayTeam: away?.competitorId ?? "AWAY",
      startTime: event.startTime.toISOString(),
      homeScore,
      awayScore,
      final: true
    };
    finals.set(event.id, finalScore);
    if (event.externalEventId) finals.set(event.externalEventId, finalScore);
  }
  return finals;
}

function pickFinal(row: SnapshotRow, dbFinals: Map<string, FinalScore>, api: Awaited<ReturnType<typeof fetchMlbStatsApiFinals>>) {
  const exact = dbFinals.get(row.game_id) ?? api.byGameId.get(row.game_id);
  if (exact) return { final: exact, ambiguous: false };
  const fallbackKey = makeFallbackKey(row);
  if (!fallbackKey) return { final: null, ambiguous: false };
  const candidates = api.byFallback.get(fallbackKey) ?? [];
  if (candidates.length === 1) return { final: candidates[0], ambiguous: false };
  if (candidates.length > 1) return { final: null, ambiguous: true };
  return { final: null, ambiguous: false };
}

export async function settleMlbSimPredictionSnapshots(options: MlbSnapshotSettlementOptions = {}): Promise<MlbSnapshotSettlementSummary> {
  const databaseReady = hasUsableServerDatabaseUrl();
  const dryRun = options.dryRun === true;
  const limit = Math.max(1, Math.min(1000, Math.round(options.limit ?? 500)));
  const olderThanHours = Math.max(1, Math.min(168, Math.round(options.olderThanHours ?? 4)));
  const summary: MlbSnapshotSettlementSummary = { ok: databaseReady, databaseReady, dryRun, scanned: 0, matched: 0, settled: 0, skippedNoFinal: 0, skippedAmbiguous: 0, errors: [], samples: [] };
  if (!databaseReady) {
    summary.errors.push("No usable server database URL is configured.");
    return summary;
  }

  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT id, game_id, event_label, away_team, home_team, start_time,
      model_home_win_pct, model_spread, model_total
    FROM sim_prediction_snapshots
    WHERE UPPER(league) = 'MLB'
      AND graded_at IS NULL
      AND start_time < ${cutoff}
    ORDER BY start_time ASC
    LIMIT ${limit};
  `;
  summary.scanned = rows.length;
  if (!rows.length) return summary;

  const [dbFinals, apiFinals] = await Promise.all([fetchDatabaseFinals(rows), fetchMlbStatsApiFinals(rows)]);

  for (const row of rows) {
    try {
      const { final, ambiguous } = pickFinal(row, dbFinals, apiFinals);
      if (ambiguous) {
        summary.skippedAmbiguous += 1;
        continue;
      }
      if (!final) {
        summary.skippedNoFinal += 1;
        continue;
      }
      summary.matched += 1;
      const homeWinProbability = num(row.model_home_win_pct);
      if (homeWinProbability == null) {
        summary.errors.push(`${row.id}: missing model_home_win_pct`);
        continue;
      }
      const math = computeMlbSnapshotSettlementMath({
        homeWinProbability,
        modelSpread: num(row.model_spread),
        modelTotal: num(row.model_total),
        finalHomeScore: final.homeScore,
        finalAwayScore: final.awayScore
      });

      if (!dryRun) {
        await prisma.$executeRaw`
          UPDATE sim_prediction_snapshots
          SET final_home_score = ${final.homeScore},
            final_away_score = ${final.awayScore},
            final_margin = ${math.finalMargin},
            final_total = ${math.finalTotal},
            home_won = ${math.homeWon},
            brier = ${math.brier},
            log_loss = ${math.logLoss},
            spread_error = ${math.spreadError},
            total_error = ${math.totalError},
            calibration_bucket = ${math.calibrationBucket},
            result_json = ${JSON.stringify({ source: "mlb-stats-api-or-db", final })}::jsonb,
            graded_at = now(),
            updated_at = now()
          WHERE id = ${row.id};
        `;
      }
      summary.settled += 1;
      if (summary.samples.length < 10) {
        summary.samples.push({ id: row.id, gameId: row.game_id, eventLabel: row.event_label, finalHomeScore: final.homeScore, finalAwayScore: final.awayScore, homeWon: math.homeWon });
      }
    } catch (error) {
      summary.errors.push(`${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  summary.ok = summary.errors.length === 0 || summary.settled > 0;
  return summary;
}
