import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { getMlbLineupLock, type MlbLineupLock } from "@/services/simulation/mlb-lineup-locks";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

const SNAPSHOT_KEY = "mlb:late-swap:snapshot:v1";
const RESULT_KEY = "mlb:late-swap:last-result:v1";
const TTL_SECONDS = 60 * 60 * 8;

type WatchGame = { id: string; label: string; startTime: string; status: string; leagueKey: "MLB"; leagueLabel: string };
type SwapEvent = {
  gameId: string;
  matchup: string;
  type: "starter-change" | "lineup-change" | "lock-status-change";
  severity: "high" | "medium" | "low";
  detail: string;
};

type Snapshot = Record<string, MlbLineupLock>;

function parseMatchup(label: string) {
  const atSplit = label.split(" @ ");
  if (atSplit.length === 2) return { away: atSplit[0]?.trim() || "Away", home: atSplit[1]?.trim() || "Home" };
  const vsSplit = label.split(" vs ");
  if (vsSplit.length === 2) return { away: vsSplit[0]?.trim() || "Away", home: vsSplit[1]?.trim() || "Home" };
  return { away: "Away", home: "Home" };
}

function signature(players: string[]) {
  return [...players].map((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, "")).sort().join("|");
}

function compareLock(game: WatchGame, previous: MlbLineupLock | undefined, current: MlbLineupLock): SwapEvent[] {
  if (!previous) return [];
  const events: SwapEvent[] = [];
  const matchup = `${current.awayTeam} @ ${current.homeTeam}`;
  if ((previous.awayStarterName ?? "") !== (current.awayStarterName ?? "") && current.awayStarterName) {
    events.push({ gameId: game.id, matchup, type: "starter-change", severity: "high", detail: `Away starter changed from ${previous.awayStarterName ?? "unknown"} to ${current.awayStarterName}.` });
  }
  if ((previous.homeStarterName ?? "") !== (current.homeStarterName ?? "") && current.homeStarterName) {
    events.push({ gameId: game.id, matchup, type: "starter-change", severity: "high", detail: `Home starter changed from ${previous.homeStarterName ?? "unknown"} to ${current.homeStarterName}.` });
  }
  if (signature(previous.awayLineupPlayers) !== signature(current.awayLineupPlayers) && current.awayLineupPlayers.length) {
    events.push({ gameId: game.id, matchup, type: "lineup-change", severity: "medium", detail: "Away lineup changed after prior snapshot." });
  }
  if (signature(previous.homeLineupPlayers) !== signature(current.homeLineupPlayers) && current.homeLineupPlayers.length) {
    events.push({ gameId: game.id, matchup, type: "lineup-change", severity: "medium", detail: "Home lineup changed after prior snapshot." });
  }
  if (previous.lockScore !== current.lockScore) {
    events.push({ gameId: game.id, matchup, type: "lock-status-change", severity: current.lockScore > previous.lockScore ? "low" : "medium", detail: `Lock score changed from ${previous.lockScore} to ${current.lockScore}.` });
  }
  return events;
}

export async function runMlbLateSwapWatch(games: WatchGame[]) {
  const previous = (await readHotCache<Snapshot>(SNAPSHOT_KEY)) ?? {};
  const current: Snapshot = {};
  const events: SwapEvent[] = [];
  const updatedProjections = [];

  for (const game of games) {
    const matchup = parseMatchup(game.label);
    const lock = await getMlbLineupLock(matchup.away, matchup.home);
    current[game.id] = lock;
    const detected = compareLock(game, previous[game.id], lock);
    events.push(...detected);
    if (detected.length) {
      updatedProjections.push({ gameId: game.id, projection: await buildSimProjection(game) });
    }
  }

  const result = { ok: true, checkedAt: new Date().toISOString(), gamesChecked: games.length, eventCount: events.length, events, updatedProjections };
  await writeHotCache(SNAPSHOT_KEY, current, TTL_SECONDS);
  await writeHotCache(RESULT_KEY, result, TTL_SECONDS);
  return result;
}

export async function getLastMlbLateSwapWatchResult() {
  return readHotCache<typeof runMlbLateSwapWatch extends (...args: any[]) => Promise<infer R> ? R : never>(RESULT_KEY);
}
