import type { MlbBacktestFeatureRow } from "@/services/simulation/mlb-backtesting-engine";

type BacktestDataQuality = "training-grade-snapshots" | "configured-derived" | "results-only-fallback";

function num(value: unknown, fallback: number) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); return fallback; }
function text(...values: unknown[]) { for (const value of values) if (typeof value === "string" && value.trim()) return value.trim(); return null; }
function has(value: unknown) { return value !== undefined && value !== null && !(typeof value === "string" && !value.trim()); }
function rowsFromBody(body: any): any[] { if (Array.isArray(body)) return body; if (Array.isArray(body?.games)) return body.games; if (Array.isArray(body?.rows)) return body.rows; if (Array.isArray(body?.data)) return body.data; if (Array.isArray(body?.snapshots)) return body.snapshots; return []; }

function requiredFeatureCount(row: any) {
  const keys = ["teamEdge", "playerEdge", "statcastEdge", "weatherEdge", "pitcherEdge", "bullpenEdge", "lockEdge", "parkEdge", "formEdge", "totalWeatherEdge", "totalStatcastEdge", "totalPitchingEdge", "totalParkEdge", "totalBullpenEdge"];
  return keys.filter((key) => has(row[key])).length;
}

function normalizeSnapshotRow(row: any): MlbBacktestFeatureRow | null {
  const gameId = text(row.gameId, row.id, row.gamePk, row.eventId);
  const awayTeam = text(row.awayTeam, row.away, row.away_team, row.awayName);
  const homeTeam = text(row.homeTeam, row.home, row.home_team, row.homeName);
  if (!gameId || !awayTeam || !homeTeam) return null;
  if (requiredFeatureCount(row) < 10) return null;
  return {
    gameId,
    date: text(row.date, row.gameDate, row.startTime, row.snapshotAt) ?? "unknown",
    awayTeam,
    homeTeam,
    homeScore: num(row.homeScore, num(row.home_score, 0)),
    awayScore: num(row.awayScore, num(row.away_score, 0)),
    marketTotal: row.marketTotal == null ? null : num(row.marketTotal, 0),
    closingTotal: row.closingTotal == null ? row.marketTotal == null ? null : num(row.marketTotal, 0) : num(row.closingTotal, 0),
    teamEdge: num(row.teamEdge, 0),
    playerEdge: num(row.playerEdge, 0),
    statcastEdge: num(row.statcastEdge, 0),
    weatherEdge: num(row.weatherEdge, 0),
    pitcherEdge: num(row.pitcherEdge, 0),
    bullpenEdge: num(row.bullpenEdge, 0),
    lockEdge: num(row.lockEdge, 0),
    parkEdge: num(row.parkEdge, 0),
    formEdge: num(row.formEdge, 0),
    totalWeatherEdge: num(row.totalWeatherEdge, 0),
    totalStatcastEdge: num(row.totalStatcastEdge, 0),
    totalPitchingEdge: num(row.totalPitchingEdge, 0),
    totalParkEdge: num(row.totalParkEdge, 0),
    totalBullpenEdge: num(row.totalBullpenEdge, 0)
  };
}

async function fetchSnapshotSource(limit: number) {
  const url = process.env.MLB_HISTORICAL_SNAPSHOT_URL?.trim() || process.env.MLB_HISTORICAL_FEATURE_SOURCE_URL?.trim();
  if (!url) return null;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const rows = rowsFromBody(await res.json()).map(normalizeSnapshotRow).filter((row): row is MlbBacktestFeatureRow => Boolean(row));
  return rows.slice(0, limit);
}

function hashString(value: string) { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function seedUnit(seed: number) { return ((seed >>> 0) % 10000) / 10000; }
function seededEdge(key: string, salt: number, min: number, max: number) { const seed = hashString(`${key}:${salt}`); return Number((min + seedUnit(seed) * (max - min)).toFixed(3)); }
function ymd(date: Date) { return date.toISOString().slice(0, 10); }

function normalizeResultsOnlyRow(row: any): MlbBacktestFeatureRow | null {
  const gameId = text(row.gameId, row.id, row.gamePk, row.eventId);
  const awayTeam = text(row.awayTeam, row.away, row.away_team, row.awayName);
  const homeTeam = text(row.homeTeam, row.home, row.home_team, row.homeName);
  if (!gameId || !awayTeam || !homeTeam) return null;
  const key = `${gameId}:${awayTeam}:${homeTeam}`;
  const homeScore = num(row.homeScore, num(row.home_score, 0));
  const awayScore = num(row.awayScore, num(row.away_score, 0));
  const totalRuns = homeScore + awayScore;
  const closingTotal = row.closingTotal == null ? num(row.marketTotal, Math.max(6.5, Math.min(12, totalRuns + seededEdge(key, 99, -1.2, 1.2)))) : num(row.closingTotal, 0);
  return { gameId, date: text(row.date, row.gameDate, row.startTime) ?? "unknown", awayTeam, homeTeam, homeScore, awayScore, marketTotal: row.marketTotal == null ? closingTotal : num(row.marketTotal, closingTotal), closingTotal, teamEdge: seededEdge(key, 1, -1, 1), playerEdge: seededEdge(key, 2, -0.8, 0.8), statcastEdge: seededEdge(key, 3, -0.9, 0.9), weatherEdge: seededEdge(key, 4, -0.45, 0.45), pitcherEdge: seededEdge(key, 5, -1.1, 1.1), bullpenEdge: seededEdge(key, 6, -0.7, 0.7), lockEdge: seededEdge(key, 7, -0.25, 0.25), parkEdge: seededEdge(key, 8, -0.35, 0.35), formEdge: seededEdge(key, 9, -0.4, 0.4), totalWeatherEdge: seededEdge(key, 10, -0.7, 0.7), totalStatcastEdge: seededEdge(key, 11, -0.9, 0.9), totalPitchingEdge: seededEdge(key, 12, -0.85, 0.85), totalParkEdge: seededEdge(key, 13, -0.45, 0.45), totalBullpenEdge: seededEdge(key, 14, -0.55, 0.55) };
}

async function fetchConfiguredResultsOnly(limit: number) {
  const url = process.env.MLB_BACKTEST_RAW_RESULTS_URL?.trim();
  if (!url) return null;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return rowsFromBody(await res.json()).map(normalizeResultsOnlyRow).filter((row): row is MlbBacktestFeatureRow => Boolean(row)).slice(0, limit);
}

async function fetchMlbStatsApiResults(limit: number, daysBack: number) {
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - daysBack);
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1"); url.searchParams.set("startDate", ymd(start)); url.searchParams.set("endDate", ymd(end)); url.searchParams.set("hydrate", "team");
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];
  const body = await res.json();
  const rawRows: any[] = [];
  for (const date of body.dates ?? []) for (const game of date.games ?? []) {
    const awayScore = game.teams?.away?.score; const homeScore = game.teams?.home?.score;
    if (awayScore == null || homeScore == null) continue;
    rawRows.push({ gameId: String(game.gamePk), date: date.date, awayTeam: game.teams?.away?.team?.name, homeTeam: game.teams?.home?.team?.name, awayScore, homeScore });
  }
  return rawRows.map(normalizeResultsOnlyRow).filter((row): row is MlbBacktestFeatureRow => Boolean(row)).slice(0, limit);
}

export async function buildMlbBacktestData(limit = 1000, daysBack = 220) {
  const snapshots = await fetchSnapshotSource(limit).catch(() => null);
  if (snapshots?.length) return { source: "historical-pregame-snapshots", quality: "training-grade-snapshots" satisfies BacktestDataQuality, warning: null, games: snapshots };
  const configuredResults = await fetchConfiguredResultsOnly(limit).catch(() => null);
  if (configuredResults?.length) return { source: "configured-results-only-derived", quality: "configured-derived" satisfies BacktestDataQuality, warning: "Results-only data is not training-grade. Use MLB_HISTORICAL_SNAPSHOT_URL with pregame feature snapshots to avoid data leakage.", games: configuredResults };
  const fallback = await fetchMlbStatsApiResults(limit, daysBack);
  return { source: "mlb-stats-api-results-only-derived", quality: "results-only-fallback" satisfies BacktestDataQuality, warning: "Fallback is structure-only. Do not treat optimized weights from this source as real edge.", games: fallback };
}
