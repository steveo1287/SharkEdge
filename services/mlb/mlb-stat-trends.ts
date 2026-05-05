type TeamNode = {
  score?: number;
  team?: {
    id?: number;
    name?: string;
    abbreviation?: string;
    teamName?: string;
  };
  probablePitcher?: {
    id?: number;
    fullName?: string;
  };
};

type MlbScheduleGame = {
  gamePk: number;
  gameDate: string;
  officialDate?: string;
  venue?: { name?: string };
  status?: {
    abstractGameState?: string;
    detailedState?: string;
    statusCode?: string;
  };
  teams?: {
    away?: TeamNode;
    home?: TeamNode;
  };
};

type MlbSchedulePayload = {
  dates?: Array<{
    games?: MlbScheduleGame[];
  }>;
};

type PitcherStatsPayload = {
  people?: Array<{
    id?: number;
    fullName?: string;
    stats?: Array<{
      type?: { displayName?: string };
      group?: { displayName?: string };
      splits?: Array<{
        date?: string;
        stat?: Record<string, string | number | undefined>;
      }>;
    }>;
  }>;
};

export type MlbTrendGrade = "A" | "B" | "Watch" | "Pass";
export type MlbTrendCategory = "Recent Form" | "Starter Edge" | "Run Environment";

export type MlbStatReceipt = {
  label: string;
  value: string;
  note: string;
  tone: "good" | "warn" | "neutral";
};

export type MlbStatTrend = {
  id: string;
  gamePk: number;
  category: MlbTrendCategory;
  grade: MlbTrendGrade;
  confidence: number;
  market: "moneyline" | "total" | "watch";
  team?: string;
  side?: "away" | "home" | "over" | "under";
  matchup: string;
  startTime: string;
  venue: string;
  title: string;
  angle: string;
  receipts: MlbStatReceipt[];
  warnings: string[];
  source: string;
  actionHref: string;
};

export type MlbTrendTeamSnapshot = {
  teamId: number;
  name: string;
  abbreviation: string;
  sample: number;
  wins: number;
  losses: number;
  winPct: number;
  runsForPerGame: number;
  runsAllowedPerGame: number;
  runDiffPerGame: number;
  avgTotal: number;
  lastFive: string;
};

export type MlbTrendPitcherSnapshot = {
  playerId: number | null;
  name: string;
  era: number | null;
  whip: number | null;
  innings: number | null;
  strikeouts: number | null;
  walks: number | null;
  kbb: number | null;
  last3Era: number | null;
  last3Innings: number | null;
  sample: number;
};

export type MlbTrendGame = {
  gamePk: number;
  matchup: string;
  startTime: string;
  venue: string;
  status: string;
  away: MlbTrendTeamSnapshot;
  home: MlbTrendTeamSnapshot;
  awayPitcher: MlbTrendPitcherSnapshot;
  homePitcher: MlbTrendPitcherSnapshot;
};

export type MlbStatTrendsPayload = {
  ok: boolean;
  generatedAt: string;
  date: string;
  sourceNote: string;
  stats: {
    games: number;
    trends: number;
    aGrades: number;
    bOrBetter: number;
    missingProbablePitchers: number;
  };
  games: MlbTrendGame[];
  trends: MlbStatTrend[];
  blockers: string[];
};

const MLB_SPORT_ID = "1";
const DEFAULT_TEAM_SAMPLE = 12;

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseInnings(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value);
  const [wholeRaw, fractionRaw] = raw.split(".");
  const whole = Number(wholeRaw);
  if (!Number.isFinite(whole)) return null;
  const outs = fractionRaw === "1" ? 1 : fractionRaw === "2" ? 2 : 0;
  return whole + outs / 3;
}

function fmtPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function fmtSigned(value: number, digits = 1) {
  const rounded = value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(`MLB request failed ${response.status}: ${url.pathname}`);
  return response.json() as Promise<T>;
}

function gameStatus(game: MlbScheduleGame) {
  return game.status?.detailedState ?? game.status?.abstractGameState ?? "unknown";
}

function isFinal(game: MlbScheduleGame) {
  const state = `${game.status?.abstractGameState ?? ""} ${game.status?.detailedState ?? ""} ${game.status?.statusCode ?? ""}`.toLowerCase();
  return state.includes("final") || state.includes("completed game") || game.status?.statusCode === "F";
}

function teamSide(game: MlbScheduleGame, teamId: number): "away" | "home" | null {
  if (game.teams?.away?.team?.id === teamId) return "away";
  if (game.teams?.home?.team?.id === teamId) return "home";
  return null;
}

function scoreFor(game: MlbScheduleGame, teamId: number) {
  const side = teamSide(game, teamId);
  if (!side) return null;
  const opponentSide = side === "away" ? "home" : "away";
  const scored = game.teams?.[side]?.score;
  const allowed = game.teams?.[opponentSide]?.score;
  if (typeof scored !== "number" || typeof allowed !== "number") return null;
  return { scored, allowed, won: scored > allowed };
}

function teamDisplay(node: TeamNode | undefined) {
  return {
    id: node?.team?.id ?? 0,
    name: node?.team?.name ?? "Unknown",
    abbreviation: node?.team?.abbreviation ?? node?.team?.teamName ?? "MLB"
  };
}

async function fetchScheduleForDate(date: string) {
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", MLB_SPORT_ID);
  url.searchParams.set("date", date);
  url.searchParams.set("hydrate", "probablePitcher,team");
  const payload = await fetchJson<MlbSchedulePayload>(url);
  return (payload.dates ?? []).flatMap((day) => day.games ?? []);
}

async function fetchTeamRecent(teamId: number, teamName: string, abbreviation: string, date: string, sample = DEFAULT_TEAM_SAMPLE): Promise<MlbTrendTeamSnapshot> {
  const target = new Date(`${date}T00:00:00Z`);
  const startDate = ymd(addDays(target, -34));
  const endDate = ymd(addDays(target, -1));
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", MLB_SPORT_ID);
  url.searchParams.set("teamId", String(teamId));
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("hydrate", "team");
  const payload = await fetchJson<MlbSchedulePayload>(url);
  const games = (payload.dates ?? [])
    .flatMap((day) => day.games ?? [])
    .filter((game) => isFinal(game))
    .sort((left, right) => new Date(right.gameDate).getTime() - new Date(left.gameDate).getTime())
    .slice(0, sample);

  const rows = games.map((game) => scoreFor(game, teamId)).filter((row): row is { scored: number; allowed: number; won: boolean } => Boolean(row));
  const wins = rows.filter((row) => row.won).length;
  const losses = Math.max(0, rows.length - wins);
  const scored = rows.reduce((sum, row) => sum + row.scored, 0);
  const allowed = rows.reduce((sum, row) => sum + row.allowed, 0);
  const totals = rows.reduce((sum, row) => sum + row.scored + row.allowed, 0);

  return {
    teamId,
    name: teamName,
    abbreviation,
    sample: rows.length,
    wins,
    losses,
    winPct: rows.length ? wins / rows.length : 0.5,
    runsForPerGame: rows.length ? round(scored / rows.length, 2) : 0,
    runsAllowedPerGame: rows.length ? round(allowed / rows.length, 2) : 0,
    runDiffPerGame: rows.length ? round((scored - allowed) / rows.length, 2) : 0,
    avgTotal: rows.length ? round(totals / rows.length, 2) : 0,
    lastFive: rows.slice(0, 5).map((row) => row.won ? "W" : "L").join("") || "-----"
  };
}

function emptyPitcher(playerId: number | null, name: string): MlbTrendPitcherSnapshot {
  return { playerId, name, era: null, whip: null, innings: null, strikeouts: null, walks: null, kbb: null, last3Era: null, last3Innings: null, sample: 0 };
}

async function fetchPitcher(playerId: number | undefined, name: string | undefined, season: string): Promise<MlbTrendPitcherSnapshot> {
  if (!playerId) return emptyPitcher(null, name ?? "TBD");
  const url = new URL(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats`);
  url.searchParams.set("stats", "season,gameLog");
  url.searchParams.set("group", "pitching");
  url.searchParams.set("season", season);
  const payload = await fetchJson<PitcherStatsPayload>(url);
  const person = payload.people?.[0];
  const stats = person?.stats ?? [];
  const seasonBlock = stats.find((block) => block.type?.displayName?.toLowerCase() === "season") ?? stats[0];
  const gameLogBlock = stats.find((block) => block.type?.displayName?.toLowerCase().includes("gamelog"));
  const seasonStat = seasonBlock?.splits?.[0]?.stat ?? {};
  const gameLog = (gameLogBlock?.splits ?? [])
    .slice()
    .sort((left, right) => new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime());
  const last3 = gameLog.slice(0, 3);
  const last3Er = last3.reduce((sum, split) => sum + (toNumber(split.stat?.earnedRuns) ?? 0), 0);
  const last3Ip = last3.reduce((sum, split) => sum + (parseInnings(split.stat?.inningsPitched) ?? 0), 0);
  const strikeouts = toNumber(seasonStat.strikeOuts ?? seasonStat.strikeouts);
  const walks = toNumber(seasonStat.baseOnBalls ?? seasonStat.walks);

  return {
    playerId,
    name: person?.fullName ?? name ?? "TBD",
    era: toNumber(seasonStat.era),
    whip: toNumber(seasonStat.whip),
    innings: parseInnings(seasonStat.inningsPitched),
    strikeouts,
    walks,
    kbb: strikeouts != null && walks != null ? round(strikeouts / Math.max(1, walks), 2) : null,
    last3Era: last3Ip > 0 ? round((last3Er * 9) / last3Ip, 2) : null,
    last3Innings: last3Ip > 0 ? round(last3Ip, 1) : null,
    sample: gameLog.length
  };
}

function teamPower(team: MlbTrendTeamSnapshot) {
  const samplePenalty = team.sample < 6 ? -4 : 0;
  return team.winPct * 34 + team.runDiffPerGame * 7 + (team.runsForPerGame - 4.4) * 4 - (team.runsAllowedPerGame - 4.4) * 2 + samplePenalty;
}

function pitcherPower(pitcher: MlbTrendPitcherSnapshot) {
  if (!pitcher.playerId || pitcher.era == null || pitcher.whip == null) return null;
  const eraScore = (4.25 - pitcher.era) * 7;
  const whipScore = (1.3 - pitcher.whip) * 18;
  const kbbScore = ((pitcher.kbb ?? 2.2) - 2.2) * 4;
  const recentScore = pitcher.last3Era == null ? 0 : (4.25 - pitcher.last3Era) * 3;
  const inningsScore = pitcher.innings != null && pitcher.innings >= 25 ? 2 : -2;
  return eraScore + whipScore + kbbScore + recentScore + inningsScore;
}

function gradeFromConfidence(confidence: number): MlbTrendGrade {
  if (confidence >= 0.7) return "A";
  if (confidence >= 0.62) return "B";
  if (confidence >= 0.55) return "Watch";
  return "Pass";
}

function receipt(label: string, value: string, note: string, tone: MlbStatReceipt["tone"] = "neutral"): MlbStatReceipt {
  return { label, value, note, tone };
}

function buildFormTrend(game: MlbTrendGame): MlbStatTrend | null {
  const awayScore = teamPower(game.away);
  const homeScore = teamPower(game.home);
  const diff = homeScore - awayScore;
  if (Math.abs(diff) < 5) return null;
  const side = diff > 0 ? "home" : "away";
  const team = side === "home" ? game.home : game.away;
  const opp = side === "home" ? game.away : game.home;
  const confidence = clamp(0.54 + Math.abs(diff) / 70, 0.54, 0.74);
  return {
    id: `mlb-${game.gamePk}-recent-form-${side}`,
    gamePk: game.gamePk,
    category: "Recent Form",
    grade: gradeFromConfidence(confidence),
    confidence: round(confidence, 3),
    market: "moneyline",
    team: team.name,
    side,
    matchup: game.matchup,
    startTime: game.startTime,
    venue: game.venue,
    title: `${team.abbreviation} recent-form edge`,
    angle: `${team.name} is carrying the cleaner recent profile into ${game.matchup}. This is a moneyline/watchlist trend, not a blind pick without price confirmation.`,
    receipts: [
      receipt("Last 12 record", `${team.wins}-${team.losses}`, `${team.name} last ${team.sample} finals: ${team.lastFive}.`, team.winPct >= 0.58 ? "good" : "neutral"),
      receipt("Run diff/game", fmtSigned(team.runDiffPerGame), `${opp.name}: ${fmtSigned(opp.runDiffPerGame)} over its last ${opp.sample}.`, team.runDiffPerGame > opp.runDiffPerGame ? "good" : "neutral"),
      receipt("Runs/game", team.runsForPerGame.toFixed(1), `${opp.name} allows ${opp.runsAllowedPerGame.toFixed(1)} per game in the same window.`, "neutral")
    ],
    warnings: team.sample < 8 || opp.sample < 8 ? ["Small recent sample; keep as Watch until the sample clears 8+ finals."] : [],
    source: "MLB Stats API recent final scores",
    actionHref: `/sim/mlb/${game.gamePk}`
  };
}

function buildStarterTrend(game: MlbTrendGame): MlbStatTrend | null {
  const awayPower = pitcherPower(game.awayPitcher);
  const homePower = pitcherPower(game.homePitcher);
  if (awayPower == null || homePower == null) return null;
  const diff = homePower - awayPower;
  if (Math.abs(diff) < 7) return null;
  const side = diff > 0 ? "home" : "away";
  const pitcher = side === "home" ? game.homePitcher : game.awayPitcher;
  const other = side === "home" ? game.awayPitcher : game.homePitcher;
  const team = side === "home" ? game.home : game.away;
  const confidence = clamp(0.56 + Math.abs(diff) / 80, 0.56, 0.76);
  return {
    id: `mlb-${game.gamePk}-starter-edge-${side}`,
    gamePk: game.gamePk,
    category: "Starter Edge",
    grade: gradeFromConfidence(confidence),
    confidence: round(confidence, 3),
    market: "moneyline",
    team: team.name,
    side,
    matchup: game.matchup,
    startTime: game.startTime,
    venue: game.venue,
    title: `${team.abbreviation} starter edge: ${pitcher.name}`,
    angle: `${pitcher.name} owns the stronger starter profile versus ${other.name}. Treat this as a pitcher-confirmation trend; downgrade if the probable changes.`,
    receipts: [
      receipt("Season ERA / WHIP", `${pitcher.era?.toFixed(2) ?? "--"} / ${pitcher.whip?.toFixed(2) ?? "--"}`, `${other.name}: ${other.era?.toFixed(2) ?? "--"} / ${other.whip?.toFixed(2) ?? "--"}.`, "good"),
      receipt("K/BB", pitcher.kbb == null ? "--" : pitcher.kbb.toFixed(2), `${other.name}: ${other.kbb == null ? "--" : other.kbb.toFixed(2)}.`, (pitcher.kbb ?? 0) > (other.kbb ?? 0) ? "good" : "neutral"),
      receipt("Last 3 ERA", pitcher.last3Era == null ? "--" : pitcher.last3Era.toFixed(2), `${round(pitcher.last3Innings ?? 0, 1)} IP sample.`, pitcher.last3Era != null && pitcher.last3Era <= 3.75 ? "good" : "neutral")
    ],
    warnings: ["Confirm starter status near lineup lock; this card depends on probable-pitcher truth."],
    source: "MLB Stats API probable pitcher and pitcher stat logs",
    actionHref: `/sim/mlb/${game.gamePk}`
  };
}

function buildTotalTrend(game: MlbTrendGame): MlbStatTrend | null {
  const projectedRunEnvironment = ((game.away.runsForPerGame + game.home.runsAllowedPerGame) + (game.home.runsForPerGame + game.away.runsAllowedPerGame)) / 2;
  const pitcherPenalty = [game.awayPitcher, game.homePitcher].reduce((sum, pitcher) => {
    if (pitcher.era == null) return sum;
    if (pitcher.era >= 4.75) return sum + 0.45;
    if (pitcher.era <= 3.25) return sum - 0.35;
    return sum;
  }, 0);
  const totalLean = projectedRunEnvironment + pitcherPenalty;
  const over = totalLean >= 8.9;
  const under = totalLean <= 7.4;
  if (!over && !under) return null;
  const confidence = clamp(over ? 0.55 + (totalLean - 8.9) / 8 : 0.55 + (7.4 - totalLean) / 7, 0.55, 0.71);
  const side = over ? "over" : "under";
  return {
    id: `mlb-${game.gamePk}-run-environment-${side}`,
    gamePk: game.gamePk,
    category: "Run Environment",
    grade: gradeFromConfidence(confidence),
    confidence: round(confidence, 3),
    market: "total",
    side,
    matchup: game.matchup,
    startTime: game.startTime,
    venue: game.venue,
    title: `${game.away.abbreviation}/${game.home.abbreviation} ${side.toUpperCase()} pressure`,
    angle: `Recent scoring profile points ${side.toUpperCase()} for ${game.matchup}. Require sportsbook total/price before turning this into an action card.`,
    receipts: [
      receipt("Projected run env", totalLean.toFixed(1), "Recent offense/allowed runs blended with starter ERA pressure.", over ? "good" : "warn"),
      receipt("Away recent total", game.away.avgTotal.toFixed(1), `${game.away.name} games over last ${game.away.sample} finals.`, "neutral"),
      receipt("Home recent total", game.home.avgTotal.toFixed(1), `${game.home.name} games over last ${game.home.sample} finals.`, "neutral")
    ],
    warnings: ["Weather, umpire, lineup, and market total are not included in this card yet."],
    source: "MLB Stats API final scores and probable pitcher season stats",
    actionHref: `/sim/mlb/${game.gamePk}`
  };
}

export async function buildMlbStatBackedTrends(args: { date?: string } = {}): Promise<MlbStatTrendsPayload> {
  const date = args.date ?? ymd(new Date());
  const season = date.slice(0, 4);
  const blockers: string[] = [];

  try {
    const schedule = await fetchScheduleForDate(date);
    const games: MlbTrendGame[] = [];

    for (const game of schedule) {
      const awayInfo = teamDisplay(game.teams?.away);
      const homeInfo = teamDisplay(game.teams?.home);
      if (!awayInfo.id || !homeInfo.id) continue;
      const [away, home, awayPitcher, homePitcher] = await Promise.all([
        fetchTeamRecent(awayInfo.id, awayInfo.name, awayInfo.abbreviation, date),
        fetchTeamRecent(homeInfo.id, homeInfo.name, homeInfo.abbreviation, date),
        fetchPitcher(game.teams?.away?.probablePitcher?.id, game.teams?.away?.probablePitcher?.fullName, season).catch(() => emptyPitcher(game.teams?.away?.probablePitcher?.id ?? null, game.teams?.away?.probablePitcher?.fullName ?? "TBD")),
        fetchPitcher(game.teams?.home?.probablePitcher?.id, game.teams?.home?.probablePitcher?.fullName, season).catch(() => emptyPitcher(game.teams?.home?.probablePitcher?.id ?? null, game.teams?.home?.probablePitcher?.fullName ?? "TBD"))
      ]);

      games.push({
        gamePk: game.gamePk,
        matchup: `${away.name} @ ${home.name}`,
        startTime: game.gameDate,
        venue: game.venue?.name ?? "TBD",
        status: gameStatus(game),
        away,
        home,
        awayPitcher,
        homePitcher
      });
    }

    const trends = games.flatMap((game) => [buildStarterTrend(game), buildFormTrend(game), buildTotalTrend(game)]).filter((trend): trend is MlbStatTrend => Boolean(trend)).sort((left, right) => {
      const gradeRank: Record<MlbTrendGrade, number> = { A: 4, B: 3, Watch: 2, Pass: 1 };
      return gradeRank[right.grade] - gradeRank[left.grade] || right.confidence - left.confidence;
    });

    const missingProbablePitchers = games.reduce((sum, game) => sum + (game.awayPitcher.playerId ? 0 : 1) + (game.homePitcher.playerId ? 0 : 1), 0);
    if (!schedule.length) blockers.push("No MLB games returned for this date.");
    if (!trends.length && schedule.length) blockers.push("No stat edge cleared the minimum threshold. Page will still show game snapshots.");
    if (missingProbablePitchers) blockers.push(`${missingProbablePitchers} probable pitcher slots are still TBD or unavailable.`);

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      date,
      sourceNote: "MLB stat-backed trends use official schedule, recent final scores, probable pitchers, and pitcher stat logs. Market price, weather, umpire, and confirmed lineups remain separate gates.",
      stats: {
        games: games.length,
        trends: trends.length,
        aGrades: trends.filter((trend) => trend.grade === "A").length,
        bOrBetter: trends.filter((trend) => trend.grade === "A" || trend.grade === "B").length,
        missingProbablePitchers
      },
      games,
      trends,
      blockers
    };
  } catch (error) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      date,
      sourceNote: "MLB stat-backed trend generation failed.",
      stats: { games: 0, trends: 0, aGrades: 0, bOrBetter: 0, missingProbablePitchers: 0 },
      games: [],
      trends: [],
      blockers: [error instanceof Error ? error.message : "Unknown MLB trends error."]
    };
  }
}
