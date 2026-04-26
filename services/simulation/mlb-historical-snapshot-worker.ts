import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

const SNAPSHOT_KEY = "mlb:historical:snapshots:v1";
const TTL_SECONDS = 60 * 60 * 24 * 45;

type SnapshotRow = {
  gameId: string;
  snapshotAt: string;
  date: string;
  awayTeam: string;
  homeTeam: string;
  homeScore: number;
  awayScore: number;
  marketTotal: number | null;
  closingTotal: number | null;
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
  source: string;
};

function parseMatchup(label: string) {
  const atSplit = label.split(" @ ");
  if (atSplit.length === 2) return { away: atSplit[0]?.trim() || "Away", home: atSplit[1]?.trim() || "Home" };
  const vsSplit = label.split(" vs ");
  if (vsSplit.length === 2) return { away: vsSplit[0]?.trim() || "Away", home: vsSplit[1]?.trim() || "Home" };
  return { away: "Away", home: "Home" };
}

function factor(projection: any, label: string) {
  const found = projection?.mlbIntel?.factors?.find((item: any) => item.label === label);
  return typeof found?.value === "number" ? found.value : 0;
}

function upsert(rows: SnapshotRow[], row: SnapshotRow) {
  const key = `${row.gameId}:${row.snapshotAt.slice(0, 13)}`;
  const filtered = rows.filter((existing) => `${existing.gameId}:${existing.snapshotAt.slice(0, 13)}` !== key);
  return [...filtered, row].slice(-5000);
}

export async function captureMlbHistoricalSnapshots() {
  const sections = await buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {} });
  const games = sections.flatMap((section) => section.leagueKey === "MLB" ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })) : []);
  const existing = (await readHotCache<SnapshotRow[]>(SNAPSHOT_KEY)) ?? [];
  let rows = existing;
  const captured: SnapshotRow[] = [];

  for (const game of games) {
    const projection = await buildSimProjection(game as any);
    const matchup = parseMatchup(game.label);
    const snapshotAt = new Date().toISOString();
    const row: SnapshotRow = {
      gameId: game.id,
      snapshotAt,
      date: game.startTime,
      awayTeam: projection.matchup?.away ?? matchup.away,
      homeTeam: projection.matchup?.home ?? matchup.home,
      homeScore: 0,
      awayScore: 0,
      marketTotal: projection.mlbIntel?.projectedTotal ?? null,
      closingTotal: projection.mlbIntel?.projectedTotal ?? null,
      teamEdge: factor(projection, "Team offense") + factor(projection, "Team power"),
      playerEdge: factor(projection, "Player offense"),
      statcastEdge: factor(projection, "Statcast") || 0,
      weatherEdge: factor(projection, "Weather + history") || factor(projection, "Park/weather"),
      pitcherEdge: factor(projection, "Starting pitching") + factor(projection, "Player pitching"),
      bullpenEdge: factor(projection, "Bullpen"),
      lockEdge: factor(projection, "Lineup lock"),
      parkEdge: factor(projection, "Park/weather"),
      formEdge: factor(projection, "Form"),
      totalWeatherEdge: factor(projection, "Weather + history") || factor(projection, "Park/weather"),
      totalStatcastEdge: factor(projection, "Statcast") || 0,
      totalPitchingEdge: factor(projection, "Starting pitching") + factor(projection, "Player pitching"),
      totalParkEdge: factor(projection, "Park/weather"),
      totalBullpenEdge: factor(projection, "Bullpen fatigue"),
      source: projection.mlbIntel?.dataSource ?? "unknown"
    };
    rows = upsert(rows, row);
    captured.push(row);
  }

  await writeHotCache(SNAPSHOT_KEY, rows, TTL_SECONDS);
  return { ok: true, captured: captured.length, totalSnapshots: rows.length, snapshots: captured };
}

export async function readMlbHistoricalSnapshots(limit = 1000) {
  const rows = (await readHotCache<SnapshotRow[]>(SNAPSHOT_KEY)) ?? [];
  return rows.slice(-limit);
}
