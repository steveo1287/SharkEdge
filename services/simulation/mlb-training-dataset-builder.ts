import { readMlbHistoricalSnapshots } from "@/services/simulation/mlb-historical-snapshot-worker";

type FinalResult = {
  gameId: string;
  homeScore: number;
  awayScore: number;
  closingTotal: number | null;
  marketTotal: number | null;
};

function num(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function text(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function rowsFromBody(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.games)) return body.games;
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function normalizeResult(row: any): FinalResult | null {
  const gameId = text(row.gameId, row.id, row.gamePk, row.eventId);
  if (!gameId) return null;
  const homeScore = num(row.homeScore, num(row.home_score, NaN));
  const awayScore = num(row.awayScore, num(row.away_score, NaN));
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
  const closingTotalRaw = row.closingTotal ?? row.total ?? row.marketTotal;
  return {
    gameId,
    homeScore,
    awayScore,
    closingTotal: closingTotalRaw == null ? null : num(closingTotalRaw, 0),
    marketTotal: row.marketTotal == null ? null : num(row.marketTotal, 0)
  };
}

async function fetchConfiguredResults() {
  const url = process.env.MLB_FINAL_RESULTS_URL?.trim() || process.env.MLB_BACKTEST_RAW_RESULTS_URL?.trim();
  if (!url) return null;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const results: Record<string, FinalResult> = {};
  for (const row of rowsFromBody(await res.json())) {
    const normalized = normalizeResult(row);
    if (normalized) results[normalized.gameId] = normalized;
  }
  return Object.keys(results).length ? results : null;
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function fetchMlbStatsApiResults(daysBack: number) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - daysBack);
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1");
  url.searchParams.set("startDate", ymd(start));
  url.searchParams.set("endDate", ymd(end));
  url.searchParams.set("hydrate", "team");
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return {};
  const body = await res.json();
  const results: Record<string, FinalResult> = {};
  for (const date of body.dates ?? []) {
    for (const game of date.games ?? []) {
      const gameId = String(game.gamePk ?? "");
      const homeScore = game.teams?.home?.score;
      const awayScore = game.teams?.away?.score;
      if (!gameId || homeScore == null || awayScore == null) continue;
      results[gameId] = { gameId, homeScore, awayScore, closingTotal: null, marketTotal: null };
    }
  }
  return results;
}

export async function buildMlbTrainingDataset(limit = 1000, daysBack = 220) {
  const snapshots = await readMlbHistoricalSnapshots(limit * 3);
  const configuredResults = await fetchConfiguredResults().catch(() => null);
  const results = configuredResults ?? await fetchMlbStatsApiResults(daysBack);
  const joined = [];

  for (const snapshot of snapshots) {
    const result = results[snapshot.gameId];
    if (!result) continue;
    joined.push({
      ...snapshot,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      marketTotal: result.marketTotal ?? snapshot.marketTotal,
      closingTotal: result.closingTotal ?? snapshot.closingTotal
    });
  }

  return {
    ok: true,
    source: configuredResults ? "snapshots+configured-final-results" : "snapshots+mlb-stats-api-final-results",
    quality: joined.length ? "training-grade-joined-snapshots" : "empty-waiting-for-completed-games",
    snapshotCount: snapshots.length,
    joinedCount: joined.length,
    games: joined.slice(-limit),
    warning: joined.length ? null : "No stored snapshots matched completed final results yet. Capture pregame snapshots first, then rerun after games finish."
  };
}
