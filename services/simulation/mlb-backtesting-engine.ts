import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

export type MlbBacktestFeatureRow = {
  gameId: string;
  date: string;
  awayTeam: string;
  homeTeam: string;
  homeScore: number;
  awayScore: number;
  marketTotal?: number | null;
  closingTotal?: number | null;
  teamEdge: number;
  playerEdge: number;
  statcastEdge: number;
  weatherEdge: number;
  pitcherEdge: number;
  bullpenEdge: number;
  lockEdge: number;
  parkEdge: number;
  formEdge: number;
  totalWeatherEdge: number;
  totalStatcastEdge: number;
  totalPitchingEdge: number;
  totalParkEdge: number;
  totalBullpenEdge: number;
};

export type MlbModelWeights = {
  side: {
    team: number;
    player: number;
    statcast: number;
    weather: number;
    pitcher: number;
    bullpen: number;
    lock: number;
    park: number;
    form: number;
  };
  total: {
    weather: number;
    statcast: number;
    pitching: number;
    park: number;
    bullpen: number;
  };
};

export type MlbBacktestResult = {
  ok: boolean;
  rows: number;
  bestWeights: MlbModelWeights;
  sideAccuracy: number;
  totalAccuracy: number | null;
  combinedScore: number;
  candidatesTested: number;
  generatedAt: string;
};

const CACHE_KEY = "mlb:backtest:weights:v1";
const DEFAULT_WEIGHTS: MlbModelWeights = {
  side: { team: 0.2, player: 0.2, statcast: 0.15, weather: 0.1, pitcher: 0.2, bullpen: 0.08, lock: 0.04, park: 0.02, form: 0.01 },
  total: { weather: 0.3, statcast: 0.25, pitching: 0.2, park: 0.15, bullpen: 0.1 }
};

function num(value: unknown, fallback: number) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); return fallback; }
function text(...values: unknown[]) { for (const value of values) if (typeof value === "string" && value.trim()) return value.trim(); return null; }
function rowsFromBody(body: any): any[] { if (Array.isArray(body)) return body; if (Array.isArray(body?.games)) return body.games; if (Array.isArray(body?.rows)) return body.rows; if (Array.isArray(body?.data)) return body.data; return []; }
function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }
function normalizeWeights<T extends Record<string, number>>(weights: T): T { const total = Object.values(weights).reduce((sum, value) => sum + Math.max(0, value), 0) || 1; return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, round(Math.max(0, value) / total, 4)])) as T; }

export function normalizeMlbBacktestRow(row: any): MlbBacktestFeatureRow | null {
  const gameId = text(row.gameId, row.id, row.eventId);
  const awayTeam = text(row.awayTeam, row.away, row.away_team);
  const homeTeam = text(row.homeTeam, row.home, row.home_team);
  if (!gameId || !awayTeam || !homeTeam) return null;
  return {
    gameId,
    date: text(row.date, row.gameDate, row.startTime) ?? "unknown",
    awayTeam,
    homeTeam,
    homeScore: num(row.homeScore, 0),
    awayScore: num(row.awayScore, 0),
    marketTotal: row.marketTotal == null ? null : num(row.marketTotal, 0),
    closingTotal: row.closingTotal == null ? null : num(row.closingTotal, 0),
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

function sideScore(row: MlbBacktestFeatureRow, weights: MlbModelWeights) {
  return row.teamEdge * weights.side.team + row.playerEdge * weights.side.player + row.statcastEdge * weights.side.statcast + row.weatherEdge * weights.side.weather + row.pitcherEdge * weights.side.pitcher + row.bullpenEdge * weights.side.bullpen + row.lockEdge * weights.side.lock + row.parkEdge * weights.side.park + row.formEdge * weights.side.form;
}

function totalScore(row: MlbBacktestFeatureRow, weights: MlbModelWeights) {
  return row.totalWeatherEdge * weights.total.weather + row.totalStatcastEdge * weights.total.statcast + row.totalPitchingEdge * weights.total.pitching + row.totalParkEdge * weights.total.park + row.totalBullpenEdge * weights.total.bullpen;
}

function evaluate(rows: MlbBacktestFeatureRow[], weights: MlbModelWeights) {
  let sideHits = 0;
  let totalHits = 0;
  let totalCount = 0;
  for (const row of rows) {
    const actualHomeWin = row.homeScore > row.awayScore;
    const predictedHomeWin = sideScore(row, weights) >= 0;
    if (actualHomeWin === predictedHomeWin) sideHits += 1;
    const totalLine = row.closingTotal ?? row.marketTotal;
    if (typeof totalLine === "number" && totalLine > 0) {
      const actualOver = row.homeScore + row.awayScore > totalLine;
      const predictedOver = totalScore(row, weights) >= 0;
      if (actualOver === predictedOver) totalHits += 1;
      totalCount += 1;
    }
  }
  const sideAccuracy = rows.length ? sideHits / rows.length : 0;
  const totalAccuracy = totalCount ? totalHits / totalCount : null;
  const combinedScore = totalAccuracy === null ? sideAccuracy : sideAccuracy * 0.55 + totalAccuracy * 0.45;
  return { sideAccuracy, totalAccuracy, combinedScore };
}

function candidates() {
  const sideCandidates = [
    DEFAULT_WEIGHTS.side,
    { team: 0.18, player: 0.2, statcast: 0.18, weather: 0.08, pitcher: 0.24, bullpen: 0.07, lock: 0.03, park: 0.01, form: 0.01 },
    { team: 0.15, player: 0.24, statcast: 0.2, weather: 0.1, pitcher: 0.18, bullpen: 0.06, lock: 0.04, park: 0.02, form: 0.01 },
    { team: 0.16, player: 0.18, statcast: 0.16, weather: 0.12, pitcher: 0.22, bullpen: 0.08, lock: 0.05, park: 0.02, form: 0.01 },
    { team: 0.22, player: 0.16, statcast: 0.12, weather: 0.08, pitcher: 0.25, bullpen: 0.1, lock: 0.04, park: 0.02, form: 0.01 }
  ];
  const totalCandidates = [
    DEFAULT_WEIGHTS.total,
    { weather: 0.34, statcast: 0.26, pitching: 0.18, park: 0.14, bullpen: 0.08 },
    { weather: 0.25, statcast: 0.32, pitching: 0.22, park: 0.12, bullpen: 0.09 },
    { weather: 0.28, statcast: 0.22, pitching: 0.25, park: 0.14, bullpen: 0.11 },
    { weather: 0.22, statcast: 0.24, pitching: 0.26, park: 0.16, bullpen: 0.12 }
  ];
  const output: MlbModelWeights[] = [];
  for (const side of sideCandidates) for (const total of totalCandidates) output.push({ side: normalizeWeights(side), total: normalizeWeights(total) });
  return output;
}

export async function fetchMlbBacktestRows(limit = 1000): Promise<MlbBacktestFeatureRow[]> {
  const url = process.env.MLB_BACKTEST_DATA_URL?.trim();
  if (!url) return [];
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return [];
  return rowsFromBody(await response.json()).map(normalizeMlbBacktestRow).filter((row): row is MlbBacktestFeatureRow => Boolean(row)).slice(0, limit);
}

export async function runMlbBacktest(limit = 1000): Promise<MlbBacktestResult> {
  const rows = await fetchMlbBacktestRows(limit);
  if (!rows.length) {
    const result = { ok: false, rows: 0, bestWeights: DEFAULT_WEIGHTS, sideAccuracy: 0, totalAccuracy: null, combinedScore: 0, candidatesTested: 0, generatedAt: new Date().toISOString() };
    await writeHotCache(CACHE_KEY, result, 60 * 60 * 24);
    return result;
  }
  let best: MlbBacktestResult | null = null;
  const allCandidates = candidates();
  for (const candidate of allCandidates) {
    const scored = evaluate(rows, candidate);
    if (!best || scored.combinedScore > best.combinedScore) {
      best = { ok: true, rows: rows.length, bestWeights: candidate, sideAccuracy: round(scored.sideAccuracy), totalAccuracy: scored.totalAccuracy === null ? null : round(scored.totalAccuracy), combinedScore: round(scored.combinedScore), candidatesTested: allCandidates.length, generatedAt: new Date().toISOString() };
    }
  }
  await writeHotCache(CACHE_KEY, best, 60 * 60 * 24);
  return best!;
}

export async function getCachedMlbBacktestWeights() {
  const cached = await readHotCache<MlbBacktestResult>(CACHE_KEY);
  return cached?.bestWeights ?? DEFAULT_WEIGHTS;
}

export function getDefaultMlbWeights() { return DEFAULT_WEIGHTS; }
