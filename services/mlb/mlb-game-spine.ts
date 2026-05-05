import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type TeamNode = { score?: number; team?: { id?: number; name?: string; abbreviation?: string; teamName?: string }; probablePitcher?: { id?: number; fullName?: string } };
type MlbGame = { gamePk: number; gameGuid?: string; gameDate: string; officialDate?: string; gameType?: string; season?: string; venue?: { id?: number; name?: string }; status?: { abstractGameState?: string; detailedState?: string; statusCode?: string }; teams?: { away?: TeamNode; home?: TeamNode } };
type MlbSchedule = { dates?: Array<{ games?: MlbGame[] }> };

type SpineRow = { game_pk: number | bigint; game_date: Date | string; detailed_state: string | null; away_team_name: string | null; home_team_name: string | null; away_score: number | null; home_score: number | null; away_pitcher: string | null; home_pitcher: string | null; updated_at: Date | string };

export type MlbSpineRun = { ok: boolean; generatedAt: string; sourceNote: string; stats: { providerGames: number; teamsUpserted: number; gamesUpserted: number; resultsUpserted: number; probablePitchersUpserted: number }; samples: Array<{ gamePk: number; eventLabel: string; gameDate: string; status: string; score: string | null }>; error?: string };
export type MlbSpineHealth = { generatedAt: string; sourceNote: string; stats: { games: number; teams: number; results: number; probablePitchers: number; todayGames: number; latestUpdatedAt: string | null }; latestGames: Array<{ gamePk: number; eventLabel: string; gameDate: string; status: string; score: string | null; probablePitchers: string; updatedAt: string }>; blockers: string[] };

function iso(value: unknown) { if (!value) return null; const d = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
function n(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function eventLabel(game: MlbGame) { return `${game.teams?.away?.team?.name ?? "Away"} @ ${game.teams?.home?.team?.name ?? "Home"}`; }
function scoreLabel(game: MlbGame) { const a = game.teams?.away?.score; const h = game.teams?.home?.score; return typeof a === "number" && typeof h === "number" ? `${a}-${h}` : null; }
function statusLabel(game: MlbGame) { return game.status?.detailedState ?? game.status?.abstractGameState ?? "unknown"; }
function finalStatus(game: MlbGame) { return String(game.status?.abstractGameState ?? game.status?.detailedState ?? "").toLowerCase().includes("final"); }

export async function ensureMlbSpineTables() {
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS mlb_teams (team_id INTEGER PRIMARY KEY, name TEXT NOT NULL, abbreviation TEXT, team_name TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS mlb_games (game_pk INTEGER PRIMARY KEY, game_guid TEXT, game_date TIMESTAMPTZ NOT NULL, official_date DATE, game_type TEXT, season TEXT, venue_id INTEGER, venue_name TEXT, status TEXT, status_code TEXT, abstract_state TEXT, detailed_state TEXT, away_team_id INTEGER REFERENCES mlb_teams(team_id), home_team_id INTEGER REFERENCES mlb_teams(team_id), away_team_name TEXT, home_team_name TEXT, source TEXT NOT NULL DEFAULT 'mlb-stats-api', raw_json JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS mlb_game_results (game_pk INTEGER PRIMARY KEY REFERENCES mlb_games(game_pk) ON DELETE CASCADE, away_score INTEGER, home_score INTEGER, winning_team_id INTEGER, losing_team_id INTEGER, is_final BOOLEAN NOT NULL DEFAULT false, result_label TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS mlb_probable_pitchers (id TEXT PRIMARY KEY, game_pk INTEGER NOT NULL REFERENCES mlb_games(game_pk) ON DELETE CASCADE, side TEXT NOT NULL, player_id INTEGER, full_name TEXT, team_id INTEGER, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS mlb_games_game_date_idx ON mlb_games (game_date)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS mlb_probable_pitchers_game_idx ON mlb_probable_pitchers (game_pk)`;
}

async function fetchMlbSchedule(daysBack = 1, daysForward = 2) {
  const start = new Date(); start.setUTCDate(start.getUTCDate() - daysBack);
  const end = new Date(); end.setUTCDate(end.getUTCDate() + daysForward);
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1"); url.searchParams.set("startDate", ymd(start)); url.searchParams.set("endDate", ymd(end)); url.searchParams.set("hydrate", "probablePitcher,team");
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(`MLB schedule request failed with status ${response.status}.`);
  const payload = await response.json() as MlbSchedule;
  return (payload.dates ?? []).flatMap((date) => date.games ?? []);
}

async function upsertTeam(node: TeamNode | undefined) {
  const team = node?.team; if (!team?.id) return 0;
  await prisma.$executeRaw`INSERT INTO mlb_teams (team_id, name, abbreviation, team_name, updated_at) VALUES (${team.id}, ${team.name ?? "Unknown"}, ${team.abbreviation ?? null}, ${team.teamName ?? null}, now()) ON CONFLICT (team_id) DO UPDATE SET name = EXCLUDED.name, abbreviation = EXCLUDED.abbreviation, team_name = EXCLUDED.team_name, updated_at = now()`;
  return 1;
}

async function upsertGame(game: MlbGame) {
  await prisma.$executeRaw`INSERT INTO mlb_games (game_pk, game_guid, game_date, official_date, game_type, season, venue_id, venue_name, status, status_code, abstract_state, detailed_state, away_team_id, home_team_id, away_team_name, home_team_name, raw_json, updated_at) VALUES (${game.gamePk}, ${game.gameGuid ?? null}, ${new Date(game.gameDate)}, ${game.officialDate ? new Date(`${game.officialDate}T00:00:00Z`) : null}, ${game.gameType ?? null}, ${game.season ?? null}, ${game.venue?.id ?? null}, ${game.venue?.name ?? null}, ${game.status?.abstractGameState ?? null}, ${game.status?.statusCode ?? null}, ${game.status?.abstractGameState ?? null}, ${game.status?.detailedState ?? null}, ${game.teams?.away?.team?.id ?? null}, ${game.teams?.home?.team?.id ?? null}, ${game.teams?.away?.team?.name ?? null}, ${game.teams?.home?.team?.name ?? null}, ${game as unknown as object}, now()) ON CONFLICT (game_pk) DO UPDATE SET game_date = EXCLUDED.game_date, official_date = EXCLUDED.official_date, venue_name = EXCLUDED.venue_name, status = EXCLUDED.status, status_code = EXCLUDED.status_code, abstract_state = EXCLUDED.abstract_state, detailed_state = EXCLUDED.detailed_state, away_team_id = EXCLUDED.away_team_id, home_team_id = EXCLUDED.home_team_id, away_team_name = EXCLUDED.away_team_name, home_team_name = EXCLUDED.home_team_name, raw_json = EXCLUDED.raw_json, updated_at = now()`;
  return 1;
}

async function upsertResult(game: MlbGame) {
  const a = typeof game.teams?.away?.score === "number" ? game.teams.away.score : null; const h = typeof game.teams?.home?.score === "number" ? game.teams.home.score : null;
  const awayId = game.teams?.away?.team?.id ?? null; const homeId = game.teams?.home?.team?.id ?? null;
  const win = a != null && h != null && a !== h ? (a > h ? awayId : homeId) : null; const loss = a != null && h != null && a !== h ? (a > h ? homeId : awayId) : null;
  const result = a != null && h != null ? `${game.teams?.away?.team?.name ?? "Away"} ${a}, ${game.teams?.home?.team?.name ?? "Home"} ${h}` : null;
  await prisma.$executeRaw`INSERT INTO mlb_game_results (game_pk, away_score, home_score, winning_team_id, losing_team_id, is_final, result_label, updated_at) VALUES (${game.gamePk}, ${a}, ${h}, ${win}, ${loss}, ${finalStatus(game)}, ${result}, now()) ON CONFLICT (game_pk) DO UPDATE SET away_score = EXCLUDED.away_score, home_score = EXCLUDED.home_score, winning_team_id = EXCLUDED.winning_team_id, losing_team_id = EXCLUDED.losing_team_id, is_final = EXCLUDED.is_final, result_label = EXCLUDED.result_label, updated_at = now()`;
  return 1;
}

async function upsertPitcher(game: MlbGame, side: "away" | "home") {
  const node = game.teams?.[side]; const pitcher = node?.probablePitcher; if (!pitcher?.id && !pitcher?.fullName) return 0;
  await prisma.$executeRaw`INSERT INTO mlb_probable_pitchers (id, game_pk, side, player_id, full_name, team_id, updated_at) VALUES (${`${game.gamePk}:${side}`}, ${game.gamePk}, ${side}, ${pitcher?.id ?? null}, ${pitcher?.fullName ?? null}, ${node?.team?.id ?? null}, now()) ON CONFLICT (id) DO UPDATE SET player_id = EXCLUDED.player_id, full_name = EXCLUDED.full_name, team_id = EXCLUDED.team_id, updated_at = now()`;
  return 1;
}

export async function runMlbGameSpineIngestion(): Promise<MlbSpineRun> {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, generatedAt: new Date().toISOString(), sourceNote: "DATABASE_URL unavailable.", stats: { providerGames: 0, teamsUpserted: 0, gamesUpserted: 0, resultsUpserted: 0, probablePitchersUpserted: 0 }, samples: [], error: "DATABASE_URL unavailable." };
  try {
    await ensureMlbSpineTables();
    const games = await fetchMlbSchedule();
    let teamsUpserted = 0, gamesUpserted = 0, resultsUpserted = 0, probablePitchersUpserted = 0;
    for (const game of games) { teamsUpserted += await upsertTeam(game.teams?.away); teamsUpserted += await upsertTeam(game.teams?.home); gamesUpserted += await upsertGame(game); resultsUpserted += await upsertResult(game); probablePitchersUpserted += await upsertPitcher(game, "away"); probablePitchersUpserted += await upsertPitcher(game, "home"); }
    return { ok: true, generatedAt: new Date().toISOString(), sourceNote: "MLB game spine ingested official schedule, teams, results, and probable pitchers.", stats: { providerGames: games.length, teamsUpserted, gamesUpserted, resultsUpserted, probablePitchersUpserted }, samples: games.slice(0, 8).map((game) => ({ gamePk: game.gamePk, eventLabel: eventLabel(game), gameDate: game.gameDate, status: statusLabel(game), score: scoreLabel(game) })) };
  } catch (error) {
    return { ok: false, generatedAt: new Date().toISOString(), sourceNote: "MLB game spine ingestion failed.", stats: { providerGames: 0, teamsUpserted: 0, gamesUpserted: 0, resultsUpserted: 0, probablePitchersUpserted: 0 }, samples: [], error: error instanceof Error ? error.message : "Unknown MLB spine error." };
  }
}

export async function buildMlbGameSpineHealth(): Promise<MlbSpineHealth> {
  if (!hasUsableServerDatabaseUrl()) return { generatedAt: new Date().toISOString(), sourceNote: "DATABASE_URL unavailable.", stats: { games: 0, teams: 0, results: 0, probablePitchers: 0, todayGames: 0, latestUpdatedAt: null }, latestGames: [], blockers: ["DATABASE_URL unavailable."] };
  try {
    await ensureMlbSpineTables();
    const [counts, latest] = await Promise.all([
      prisma.$queryRaw<Array<{ games: number | bigint; teams: number | bigint; results: number | bigint; probable_pitchers: number | bigint; today_games: number | bigint; latest_updated_at: Date | string | null }>>`SELECT (SELECT COUNT(*) FROM mlb_games) AS games, (SELECT COUNT(*) FROM mlb_teams) AS teams, (SELECT COUNT(*) FROM mlb_game_results) AS results, (SELECT COUNT(*) FROM mlb_probable_pitchers) AS probable_pitchers, (SELECT COUNT(*) FROM mlb_games WHERE official_date = CURRENT_DATE) AS today_games, (SELECT MAX(updated_at) FROM mlb_games) AS latest_updated_at`,
      prisma.$queryRaw<SpineRow[]>`SELECT g.game_pk, g.game_date, g.detailed_state, g.away_team_name, g.home_team_name, r.away_score, r.home_score, away_pp.full_name AS away_pitcher, home_pp.full_name AS home_pitcher, g.updated_at FROM mlb_games g LEFT JOIN mlb_game_results r ON r.game_pk = g.game_pk LEFT JOIN mlb_probable_pitchers away_pp ON away_pp.game_pk = g.game_pk AND away_pp.side = 'away' LEFT JOIN mlb_probable_pitchers home_pp ON home_pp.game_pk = g.game_pk AND home_pp.side = 'home' ORDER BY g.game_date DESC LIMIT 12`
    ]);
    const c = counts[0]; const blockers: string[] = [];
    if (!n(c?.games)) blockers.push("No MLB games stored yet."); if (!n(c?.today_games)) blockers.push("No MLB games stored for today."); if (!n(c?.probable_pitchers)) blockers.push("No probable pitchers stored yet.");
    return { generatedAt: new Date().toISOString(), sourceNote: "MLB spine stores official game IDs, teams, status, results, and probable pitchers for trend attachment.", stats: { games: n(c?.games), teams: n(c?.teams), results: n(c?.results), probablePitchers: n(c?.probable_pitchers), todayGames: n(c?.today_games), latestUpdatedAt: iso(c?.latest_updated_at) }, latestGames: latest.map((row) => ({ gamePk: Number(row.game_pk), eventLabel: `${row.away_team_name ?? "Away"} @ ${row.home_team_name ?? "Home"}`, gameDate: iso(row.game_date) ?? String(row.game_date), status: row.detailed_state ?? "unknown", score: row.away_score != null && row.home_score != null ? `${row.away_score}-${row.home_score}` : null, probablePitchers: `${row.away_pitcher ?? "TBD"} vs ${row.home_pitcher ?? "TBD"}`, updatedAt: iso(row.updated_at) ?? String(row.updated_at) })), blockers };
  } catch (error) {
    return { generatedAt: new Date().toISOString(), sourceNote: "MLB spine health failed.", stats: { games: 0, teams: 0, results: 0, probablePitchers: 0, todayGames: 0, latestUpdatedAt: null }, latestGames: [], blockers: [error instanceof Error ? error.message : "Unknown MLB spine health error."] };
  }
}
