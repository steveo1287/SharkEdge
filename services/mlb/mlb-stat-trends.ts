type TeamNode = { score?: number; team?: { id?: number; name?: string; abbreviation?: string; teamName?: string }; probablePitcher?: { id?: number; fullName?: string } };
type ScheduleGame = { gamePk: number; gameDate: string; venue?: { name?: string }; status?: { abstractGameState?: string; detailedState?: string; statusCode?: string }; teams?: { away?: TeamNode; home?: TeamNode } };
type SchedulePayload = { dates?: Array<{ games?: ScheduleGame[] }> };
type PitcherPayload = { people?: Array<{ fullName?: string; stats?: Array<{ type?: { displayName?: string }; splits?: Array<{ date?: string; stat?: Record<string, string | number | undefined> }> }> }> };

export type MlbTrendGrade = "A" | "B" | "Watch" | "Pass";
export type MlbTrendCategory = "Recent Form" | "Starter Edge" | "Run Environment";
export type MlbStatReceipt = { label: string; value: string; note: string; tone: "good" | "warn" | "neutral" };
export type MlbTrendTeamSnapshot = { teamId: number; name: string; abbreviation: string; sample: number; wins: number; losses: number; winPct: number; runsForPerGame: number; runsAllowedPerGame: number; runDiffPerGame: number; avgTotal: number; lastFive: string };
export type MlbTrendPitcherSnapshot = { playerId: number | null; name: string; era: number | null; whip: number | null; innings: number | null; strikeouts: number | null; walks: number | null; kbb: number | null; last3Era: number | null; last3Innings: number | null; sample: number };
export type MlbTrendGame = { gamePk: number; matchup: string; startTime: string; venue: string; status: string; away: MlbTrendTeamSnapshot; home: MlbTrendTeamSnapshot; awayPitcher: MlbTrendPitcherSnapshot; homePitcher: MlbTrendPitcherSnapshot };
export type MlbStatTrend = { id: string; gamePk: number; category: MlbTrendCategory; grade: MlbTrendGrade; confidence: number; market: "moneyline" | "total" | "watch"; team?: string; side?: "away" | "home" | "over" | "under"; matchup: string; startTime: string; venue: string; title: string; angle: string; receipts: MlbStatReceipt[]; warnings: string[]; source: string; actionHref: string };
export type MlbStatTrendsPayload = { ok: boolean; generatedAt: string; date: string; sourceNote: string; stats: { games: number; trends: number; aGrades: number; bOrBetter: number; missingProbablePitchers: number }; games: MlbTrendGame[]; trends: MlbStatTrend[]; blockers: string[] };

const SOURCE_NOTE = "MLB stat-backed trends use official schedule, recent final scores, probable pitchers, and pitcher stat logs. Market price, weather, umpire, and confirmed lineups remain separate gates.";
const SPORT_ID = "1";
const SAMPLE = 12;

function ymd(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(date: Date, days: number) { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + days); return copy; }
function clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)); }
function round(value: number, digits = 1) { return Number(value.toFixed(digits)); }
function num(value: unknown) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string") { const parsed = Number(value.replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) ? parsed : null; } return null; }
function innings(value: unknown) { if (typeof value !== "string" && typeof value !== "number") return null; const [wholeRaw, frac] = String(value).split("."); const whole = Number(wholeRaw); if (!Number.isFinite(whole)) return null; return whole + (frac === "1" ? 1 / 3 : frac === "2" ? 2 / 3 : 0); }
function signed(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(1)}`; }
function grade(confidence: number): MlbTrendGrade { if (confidence >= 0.7) return "A"; if (confidence >= 0.62) return "B"; if (confidence >= 0.55) return "Watch"; return "Pass"; }
function receipt(label: string, value: string, note: string, tone: MlbStatReceipt["tone"] = "neutral"): MlbStatReceipt { return { label, value, note, tone }; }

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(`MLB request failed ${response.status}: ${url.pathname}`);
  return response.json() as Promise<T>;
}

function finalGame(game: ScheduleGame) {
  const state = `${game.status?.abstractGameState ?? ""} ${game.status?.detailedState ?? ""} ${game.status?.statusCode ?? ""}`.toLowerCase();
  return state.includes("final") || state.includes("completed game") || game.status?.statusCode === "F";
}

function teamInfo(node: TeamNode | undefined) {
  return { id: node?.team?.id ?? 0, name: node?.team?.name ?? "Unknown", abbreviation: node?.team?.abbreviation ?? node?.team?.teamName ?? "MLB" };
}

function scoreFor(game: ScheduleGame, teamId: number) {
  const side = game.teams?.away?.team?.id === teamId ? "away" : game.teams?.home?.team?.id === teamId ? "home" : null;
  if (!side) return null;
  const other = side === "away" ? "home" : "away";
  const scored = game.teams?.[side]?.score;
  const allowed = game.teams?.[other]?.score;
  if (typeof scored !== "number" || typeof allowed !== "number") return null;
  return { scored, allowed, won: scored > allowed };
}

async function schedule(date: string) {
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", SPORT_ID);
  url.searchParams.set("date", date);
  url.searchParams.set("hydrate", "probablePitcher,team");
  const payload = await fetchJson<SchedulePayload>(url);
  return (payload.dates ?? []).flatMap((day) => day.games ?? []);
}

function emptyTeam(teamId: number, name: string, abbreviation: string): MlbTrendTeamSnapshot {
  return { teamId, name, abbreviation, sample: 0, wins: 0, losses: 0, winPct: 0.5, runsForPerGame: 0, runsAllowedPerGame: 0, runDiffPerGame: 0, avgTotal: 0, lastFive: "-----" };
}

async function recentTeam(teamId: number, name: string, abbreviation: string, date: string): Promise<MlbTrendTeamSnapshot> {
  const target = new Date(`${date}T00:00:00Z`);
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", SPORT_ID);
  url.searchParams.set("teamId", String(teamId));
  url.searchParams.set("startDate", ymd(addDays(target, -34)));
  url.searchParams.set("endDate", ymd(addDays(target, -1)));
  const payload = await fetchJson<SchedulePayload>(url);
  const rows = (payload.dates ?? [])
    .flatMap((day) => day.games ?? [])
    .filter(finalGame)
    .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
    .slice(0, SAMPLE)
    .map((game) => scoreFor(game, teamId))
    .filter((row): row is { scored: number; allowed: number; won: boolean } => Boolean(row));
  const wins = rows.filter((row) => row.won).length;
  const scored = rows.reduce((sum, row) => sum + row.scored, 0);
  const allowed = rows.reduce((sum, row) => sum + row.allowed, 0);
  const total = rows.reduce((sum, row) => sum + row.scored + row.allowed, 0);
  return { teamId, name, abbreviation, sample: rows.length, wins, losses: Math.max(0, rows.length - wins), winPct: rows.length ? wins / rows.length : 0.5, runsForPerGame: rows.length ? round(scored / rows.length, 2) : 0, runsAllowedPerGame: rows.length ? round(allowed / rows.length, 2) : 0, runDiffPerGame: rows.length ? round((scored - allowed) / rows.length, 2) : 0, avgTotal: rows.length ? round(total / rows.length, 2) : 0, lastFive: rows.slice(0, 5).map((row) => row.won ? "W" : "L").join("") || "-----" };
}

function emptyPitcher(playerId: number | null, name: string): MlbTrendPitcherSnapshot {
  return { playerId, name, era: null, whip: null, innings: null, strikeouts: null, walks: null, kbb: null, last3Era: null, last3Innings: null, sample: 0 };
}

async function pitcher(playerId: number | undefined, name: string | undefined, season: string): Promise<MlbTrendPitcherSnapshot> {
  if (!playerId) return emptyPitcher(null, name ?? "TBD");
  const url = new URL(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats`);
  url.searchParams.set("stats", "season,gameLog");
  url.searchParams.set("group", "pitching");
  url.searchParams.set("season", season);
  const payload = await fetchJson<PitcherPayload>(url);
  const person = payload.people?.[0];
  const blocks = person?.stats ?? [];
  const seasonBlock = blocks.find((block) => block.type?.displayName?.toLowerCase() === "season") ?? blocks[0];
  const gameLog = blocks.find((block) => block.type?.displayName?.toLowerCase().includes("gamelog"))?.splits ?? [];
  const stat = seasonBlock?.splits?.[0]?.stat ?? {};
  const last3 = gameLog.slice().sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()).slice(0, 3);
  const last3Er = last3.reduce((sum, split) => sum + (num(split.stat?.earnedRuns) ?? 0), 0);
  const last3Ip = last3.reduce((sum, split) => sum + (innings(split.stat?.inningsPitched) ?? 0), 0);
  const strikeouts = num(stat.strikeOuts ?? stat.strikeouts);
  const walks = num(stat.baseOnBalls ?? stat.walks);
  return { playerId, name: person?.fullName ?? name ?? "TBD", era: num(stat.era), whip: num(stat.whip), innings: innings(stat.inningsPitched), strikeouts, walks, kbb: strikeouts != null && walks != null ? round(strikeouts / Math.max(1, walks), 2) : null, last3Era: last3Ip ? round((last3Er * 9) / last3Ip, 2) : null, last3Innings: last3Ip ? round(last3Ip, 1) : null, sample: gameLog.length };
}

function teamPower(team: MlbTrendTeamSnapshot) { return team.winPct * 34 + team.runDiffPerGame * 7 + (team.runsForPerGame - 4.4) * 4 - (team.runsAllowedPerGame - 4.4) * 2 + (team.sample < 6 ? -4 : 0); }
function pitcherPower(row: MlbTrendPitcherSnapshot) { if (!row.playerId || row.era == null || row.whip == null) return null; return (4.25 - row.era) * 7 + (1.3 - row.whip) * 18 + ((row.kbb ?? 2.2) - 2.2) * 4 + (row.last3Era == null ? 0 : (4.25 - row.last3Era) * 3) + (row.innings != null && row.innings >= 25 ? 2 : -2); }

function formTrend(game: MlbTrendGame): MlbStatTrend | null {
  const diff = teamPower(game.home) - teamPower(game.away);
  if (Math.abs(diff) < 5) return null;
  const side = diff > 0 ? "home" : "away";
  const team = side === "home" ? game.home : game.away;
  const opp = side === "home" ? game.away : game.home;
  const confidence = clamp(0.54 + Math.abs(diff) / 70, 0.54, 0.74);
  return { id: `mlb-${game.gamePk}-recent-form-${side}`, gamePk: game.gamePk, category: "Recent Form", grade: grade(confidence), confidence: round(confidence, 3), market: "moneyline", team: team.name, side, matchup: game.matchup, startTime: game.startTime, venue: game.venue, title: `${team.abbreviation} recent-form edge`, angle: `${team.name} has the cleaner recent run profile in ${game.matchup}. Keep it gated until market price and lineup truth are attached.`, receipts: [receipt("Last 12 record", `${team.wins}-${team.losses}`, `${team.name} last ${team.sample} finals: ${team.lastFive}.`, team.winPct >= 0.58 ? "good" : "neutral"), receipt("Run diff/game", signed(team.runDiffPerGame), `${opp.name}: ${signed(opp.runDiffPerGame)} over its last ${opp.sample}.`, team.runDiffPerGame > opp.runDiffPerGame ? "good" : "neutral"), receipt("Runs/game", team.runsForPerGame.toFixed(1), `${opp.name} allows ${opp.runsAllowedPerGame.toFixed(1)} per game in the same window.`)], warnings: team.sample < 8 || opp.sample < 8 ? ["Small recent sample; keep as Watch until both teams clear 8+ finals."] : [], source: "MLB Stats API recent final scores", actionHref: `/sim/mlb/${game.gamePk}` };
}

function starterTrend(game: MlbTrendGame): MlbStatTrend | null {
  const away = pitcherPower(game.awayPitcher);
  const home = pitcherPower(game.homePitcher);
  if (away == null || home == null) return null;
  const diff = home - away;
  if (Math.abs(diff) < 7) return null;
  const side = diff > 0 ? "home" : "away";
  const p = side === "home" ? game.homePitcher : game.awayPitcher;
  const o = side === "home" ? game.awayPitcher : game.homePitcher;
  const team = side === "home" ? game.home : game.away;
  const confidence = clamp(0.56 + Math.abs(diff) / 80, 0.56, 0.76);
  return { id: `mlb-${game.gamePk}-starter-edge-${side}`, gamePk: game.gamePk, category: "Starter Edge", grade: grade(confidence), confidence: round(confidence, 3), market: "moneyline", team: team.name, side, matchup: game.matchup, startTime: game.startTime, venue: game.venue, title: `${team.abbreviation} starter edge: ${p.name}`, angle: `${p.name} owns the stronger starter profile versus ${o.name}. Downgrade immediately if the probable changes.`, receipts: [receipt("ERA / WHIP", `${p.era?.toFixed(2) ?? "--"} / ${p.whip?.toFixed(2) ?? "--"}`, `${o.name}: ${o.era?.toFixed(2) ?? "--"} / ${o.whip?.toFixed(2) ?? "--"}.`, "good"), receipt("K/BB", p.kbb == null ? "--" : p.kbb.toFixed(2), `${o.name}: ${o.kbb == null ? "--" : o.kbb.toFixed(2)}.`), receipt("Last 3 ERA", p.last3Era == null ? "--" : p.last3Era.toFixed(2), `${round(p.last3Innings ?? 0, 1)} IP sample.`, p.last3Era != null && p.last3Era <= 3.75 ? "good" : "neutral")], warnings: ["Confirm starter status near lineup lock."], source: "MLB Stats API probable pitcher and pitcher stat logs", actionHref: `/sim/mlb/${game.gamePk}` };
}

function totalTrend(game: MlbTrendGame): MlbStatTrend | null {
  const runEnv = ((game.away.runsForPerGame + game.home.runsAllowedPerGame) + (game.home.runsForPerGame + game.away.runsAllowedPerGame)) / 2;
  const pitcherAdj = [game.awayPitcher, game.homePitcher].reduce((sum, p) => p.era == null ? sum : p.era >= 4.75 ? sum + 0.45 : p.era <= 3.25 ? sum - 0.35 : sum, 0);
  const lean = runEnv + pitcherAdj;
  const side = lean >= 8.9 ? "over" : lean <= 7.4 ? "under" : null;
  if (!side) return null;
  const confidence = clamp(side === "over" ? 0.55 + (lean - 8.9) / 8 : 0.55 + (7.4 - lean) / 7, 0.55, 0.71);
  return { id: `mlb-${game.gamePk}-run-environment-${side}`, gamePk: game.gamePk, category: "Run Environment", grade: grade(confidence), confidence: round(confidence, 3), market: "total", side, matchup: game.matchup, startTime: game.startTime, venue: game.venue, title: `${game.away.abbreviation}/${game.home.abbreviation} ${side.toUpperCase()} pressure`, angle: `Recent scoring profile points ${side.toUpperCase()} for ${game.matchup}. Require sportsbook total/price before action.`, receipts: [receipt("Projected run env", lean.toFixed(1), "Recent offense/allowed runs blended with starter ERA pressure.", side === "over" ? "good" : "warn"), receipt("Away recent total", game.away.avgTotal.toFixed(1), `${game.away.name} games over last ${game.away.sample} finals.`), receipt("Home recent total", game.home.avgTotal.toFixed(1), `${game.home.name} games over last ${game.home.sample} finals.`)], warnings: ["Weather, umpire, lineup, and market total are not included yet."], source: "MLB Stats API final scores and probable pitcher season stats", actionHref: `/sim/mlb/${game.gamePk}` };
}

async function hydrate(game: ScheduleGame, date: string, season: string, caches: { teams: Map<number, Promise<MlbTrendTeamSnapshot>>; pitchers: Map<number, Promise<MlbTrendPitcherSnapshot>> }): Promise<MlbTrendGame | null> {
  const awayInfo = teamInfo(game.teams?.away);
  const homeInfo = teamInfo(game.teams?.home);
  if (!awayInfo.id || !homeInfo.id) return null;
  const awayTeam = caches.teams.get(awayInfo.id) ?? recentTeam(awayInfo.id, awayInfo.name, awayInfo.abbreviation, date).catch(() => emptyTeam(awayInfo.id, awayInfo.name, awayInfo.abbreviation));
  const homeTeam = caches.teams.get(homeInfo.id) ?? recentTeam(homeInfo.id, homeInfo.name, homeInfo.abbreviation, date).catch(() => emptyTeam(homeInfo.id, homeInfo.name, homeInfo.abbreviation));
  caches.teams.set(awayInfo.id, awayTeam); caches.teams.set(homeInfo.id, homeTeam);
  const awayPitcherId = game.teams?.away?.probablePitcher?.id;
  const homePitcherId = game.teams?.home?.probablePitcher?.id;
  const awayPitcher = awayPitcherId ? caches.pitchers.get(awayPitcherId) ?? pitcher(awayPitcherId, game.teams?.away?.probablePitcher?.fullName, season).catch(() => emptyPitcher(awayPitcherId, game.teams?.away?.probablePitcher?.fullName ?? "TBD")) : Promise.resolve(emptyPitcher(null, game.teams?.away?.probablePitcher?.fullName ?? "TBD"));
  const homePitcher = homePitcherId ? caches.pitchers.get(homePitcherId) ?? pitcher(homePitcherId, game.teams?.home?.probablePitcher?.fullName, season).catch(() => emptyPitcher(homePitcherId, game.teams?.home?.probablePitcher?.fullName ?? "TBD")) : Promise.resolve(emptyPitcher(null, game.teams?.home?.probablePitcher?.fullName ?? "TBD"));
  if (awayPitcherId) caches.pitchers.set(awayPitcherId, awayPitcher); if (homePitcherId) caches.pitchers.set(homePitcherId, homePitcher);
  const [away, home, awayPitcherSnapshot, homePitcherSnapshot] = await Promise.all([awayTeam, homeTeam, awayPitcher, homePitcher]);
  return { gamePk: game.gamePk, matchup: `${away.name} @ ${home.name}`, startTime: game.gameDate, venue: game.venue?.name ?? "TBD", status: game.status?.detailedState ?? game.status?.abstractGameState ?? "unknown", away, home, awayPitcher: awayPitcherSnapshot, homePitcher: homePitcherSnapshot };
}

export async function buildMlbStatBackedTrends(args: { date?: string } = {}): Promise<MlbStatTrendsPayload> {
  const date = args.date ?? ymd(new Date());
  try {
    const slate = await schedule(date);
    const caches = { teams: new Map<number, Promise<MlbTrendTeamSnapshot>>(), pitchers: new Map<number, Promise<MlbTrendPitcherSnapshot>>() };
    const games = (await Promise.all(slate.map((game) => hydrate(game, date, date.slice(0, 4), caches)))).filter((game): game is MlbTrendGame => Boolean(game));
    const trends = games.flatMap((game) => [starterTrend(game), formTrend(game), totalTrend(game)]).filter((trend): trend is MlbStatTrend => Boolean(trend)).sort((a, b) => ({ A: 4, B: 3, Watch: 2, Pass: 1 }[b.grade] - { A: 4, B: 3, Watch: 2, Pass: 1 }[a.grade]) || b.confidence - a.confidence);
    const missingProbablePitchers = games.reduce((sum, game) => sum + (game.awayPitcher.playerId ? 0 : 1) + (game.homePitcher.playerId ? 0 : 1), 0);
    const blockers = [!slate.length ? "No MLB games returned for this date." : null, slate.length && !trends.length ? "No stat edge cleared the minimum threshold. Page will still show game snapshots." : null, missingProbablePitchers ? `${missingProbablePitchers} probable pitcher slots are still TBD or unavailable.` : null].filter((x): x is string => Boolean(x));
    return { ok: true, generatedAt: new Date().toISOString(), date, sourceNote: SOURCE_NOTE, stats: { games: games.length, trends: trends.length, aGrades: trends.filter((trend) => trend.grade === "A").length, bOrBetter: trends.filter((trend) => trend.grade === "A" || trend.grade === "B").length, missingProbablePitchers }, games, trends, blockers };
  } catch (error) {
    return { ok: false, generatedAt: new Date().toISOString(), date, sourceNote: "MLB stat-backed trend generation failed.", stats: { games: 0, trends: 0, aGrades: 0, bOrBetter: 0, missingProbablePitchers: 0 }, games: [], trends: [], blockers: [error instanceof Error ? error.message : "Unknown MLB trends error."] };
  }
}
