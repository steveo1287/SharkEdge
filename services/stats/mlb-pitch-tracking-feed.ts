import { prisma } from "@/lib/db/prisma";

// Per-game pitch tracking: fetches pitcher-level data from the MLB StatsAPI
// live boxscore feed and persists to mlb_pitch_game_log.

const DEFAULT_API_BASE = "https://statsapi.mlb.com";
const FETCH_TIMEOUT_MS = 20_000;

type PitchTypeStats = { count: number; velocitySum: number; velocityCount: number };

type PitcherSummary = {
  pitcherId: string;
  pitcherName: string;
  pitcherTeam: string;
  isStarter: boolean;
  inningsPitched: number;
  pitchCount: number;
  strikes: number;
  balls: number;
  strikeouts: number;
  walks: number;
  hitsAllowed: number;
  runsAllowed: number;
  homeRunsAllowed: number;
  pitchTypes: Record<string, PitchTypeStats>;
  inningByInning: Record<number, { pitches: number; runs: number }>;
};

type BoxPlayer = {
  person?: { id?: number; fullName?: string };
  stats?: {
    pitching?: {
      inningsPitched?: string;
      numberOfPitches?: number;
      strikes?: number;
      balls?: number;
      strikeOuts?: number;
      baseOnBalls?: number;
      hits?: number;
      runs?: number;
      homeRuns?: number;
      outs?: number;
    };
  };
  pitchData?: { pitchType?: string; startSpeed?: number };
  gameStatus?: { isCurrentPitcher?: boolean };
};

type BoxTeam = {
  team?: { abbreviation?: string; name?: string };
  pitchers?: number[];
  players?: Record<string, BoxPlayer>;
};

type LiveFeed = {
  gamePk?: number;
  gameData?: {
    datetime?: { officialDate?: string };
    teams?: {
      away?: { abbreviation?: string };
      home?: { abbreviation?: string };
    };
  };
  liveData?: {
    boxscore?: { teams?: { away?: BoxTeam; home?: BoxTeam } };
    plays?: {
      allPlays?: Array<{
        about?: { inning?: number; halfInning?: string };
        pitchIndex?: number[];
        playEvents?: Array<{
          isPitch?: boolean;
          type?: string;
          pitchData?: { startSpeed?: number; type?: { code?: string; description?: string } };
          details?: { type?: { code?: string; description?: string } };
          count?: { outs?: number; balls?: number; strikes?: number };
          result?: { rbi?: number; awayScore?: number; homeScore?: number };
        }>;
      }>;
    };
  };
};

function apiBase() {
  return (process.env.MLB_STATS_API_BASE_URL?.trim() || DEFAULT_API_BASE).replace(/\/$/, "");
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "SharkEdge/2.0 pitch-tracking" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function parseInnings(value: string | undefined | null): number {
  if (!value) return 0;
  if (!value.includes(".")) return Number(value) || 0;
  const [whole, frac] = value.split(".");
  const outs = Number(frac ?? 0);
  return Number(whole || 0) + (outs === 2 ? 2 / 3 : outs === 1 ? 1 / 3 : 0);
}

function round(v: number, d = 4) {
  return Number.isFinite(v) ? Number(v.toFixed(d)) : null;
}

function summarizePitcher(box: BoxTeam, pitcherIds: number[], teamAbbr: string, isStarter: (id: number) => boolean): PitcherSummary[] {
  const summaries: PitcherSummary[] = [];

  for (const id of pitcherIds) {
    const key = `ID${id}`;
    const player = box.players?.[key];
    if (!player?.stats?.pitching) continue;
    const p = player.stats.pitching;
    summaries.push({
      pitcherId: String(id),
      pitcherName: player.person?.fullName ?? "Unknown",
      pitcherTeam: teamAbbr,
      isStarter: isStarter(id),
      inningsPitched: parseInnings(p.inningsPitched),
      pitchCount: p.numberOfPitches ?? 0,
      strikes: p.strikes ?? 0,
      balls: p.balls ?? 0,
      strikeouts: p.strikeOuts ?? 0,
      walks: p.baseOnBalls ?? 0,
      hitsAllowed: p.hits ?? 0,
      runsAllowed: p.runs ?? 0,
      homeRunsAllowed: p.homeRuns ?? 0,
      pitchTypes: {},
      inningByInning: {},
    });
  }

  return summaries;
}

function enrichFromPlays(summaries: PitcherSummary[], feed: LiveFeed): void {
  const byId = new Map(summaries.map((s) => [s.pitcherId, s]));

  for (const play of feed.liveData?.plays?.allPlays ?? []) {
    const inning = play.about?.inning ?? 0;
    for (const event of play.playEvents ?? []) {
      if (!event.isPitch) continue;
      const pitchCode = event.pitchData?.type?.code ?? event.details?.type?.code;
      const velocity = event.pitchData?.startSpeed ?? null;
      for (const summary of summaries) {
        if (!summary.inningByInning[inning]) summary.inningByInning[inning] = { pitches: 0, runs: 0 };
        if (pitchCode && summary.pitchCount > 0) {
          const entry = summary.pitchTypes[pitchCode] ?? { count: 0, velocitySum: 0, velocityCount: 0 };
          entry.count += 1;
          if (velocity) { entry.velocitySum += velocity; entry.velocityCount += 1; }
          summary.pitchTypes[pitchCode] = entry;
        }
        summary.inningByInning[inning].pitches += 1;
      }
      void byId;
    }
  }
}

function buildPitchTypeJson(types: Record<string, PitchTypeStats>) {
  const out: Record<string, { count: number; avgVelocity: number | null }> = {};
  for (const [code, stats] of Object.entries(types)) {
    out[code] = {
      count: stats.count,
      avgVelocity: stats.velocityCount ? round(stats.velocitySum / stats.velocityCount, 1) : null,
    };
  }
  return out;
}

function toGameId(gamePk: number, pitcherId: string) {
  return `pitch-log:${gamePk}:${pitcherId}`;
}

async function ensureTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS mlb_pitch_game_log (
      id TEXT PRIMARY KEY,
      game_pk INTEGER NOT NULL,
      game_date DATE NOT NULL,
      pitcher_id TEXT NOT NULL,
      pitcher_name TEXT,
      pitcher_team TEXT,
      is_starter BOOLEAN NOT NULL DEFAULT TRUE,
      innings_pitched DOUBLE PRECISION NOT NULL DEFAULT 0,
      pitch_count INTEGER NOT NULL DEFAULT 0,
      strikes INTEGER NOT NULL DEFAULT 0,
      balls INTEGER NOT NULL DEFAULT 0,
      strikeouts INTEGER NOT NULL DEFAULT 0,
      walks INTEGER NOT NULL DEFAULT 0,
      hits_allowed INTEGER NOT NULL DEFAULT 0,
      runs_allowed INTEGER NOT NULL DEFAULT 0,
      home_runs_allowed INTEGER NOT NULL DEFAULT 0,
      pitch_type_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      avg_velocity DOUBLE PRECISION,
      whiff_rate DOUBLE PRECISION,
      chase_rate DOUBLE PRECISION,
      k_rate DOUBLE PRECISION,
      bb_rate DOUBLE PRECISION,
      hard_hit_rate DOUBLE PRECISION,
      inning_by_inning_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      source TEXT NOT NULL DEFAULT 'statsapi_live',
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await prisma.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS mlb_pitch_game_log_game_pitcher_idx
    ON mlb_pitch_game_log (game_pk, pitcher_id)
  `;
  await prisma.$executeRaw`ALTER TABLE mlb_pitch_game_log ADD COLUMN IF NOT EXISTS home_runs_allowed INTEGER NOT NULL DEFAULT 0`;
}

type ScheduleGame = {
  gamePk?: number;
  gameDate?: string;
  status?: { abstractGameState?: string };
};
type ScheduleDate = { date?: string; games?: ScheduleGame[] };
type ScheduleResponse = { dates?: ScheduleDate[] };

async function fetchTodayGamePks(): Promise<number[]> {
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
  const url = `${apiBase()}/api/v1/schedule?sportId=1&startDate=${yesterday}&endDate=${ymd}&hydrate=team`;
  const body = await fetchJson<ScheduleResponse>(url);
  const pks: number[] = [];
  for (const d of body.dates ?? []) {
    for (const g of d.games ?? []) {
      if (g.gamePk && (g.status?.abstractGameState === "Final" || g.status?.abstractGameState === "Live")) {
        pks.push(g.gamePk);
      }
    }
  }
  return pks;
}

async function ingestGame(gamePk: number): Promise<number> {
  const url = `${apiBase()}/api/v1.1/game/${gamePk}/feed/live`;
  const feed = await fetchJson<LiveFeed>(url);
  const boxscore = feed.liveData?.boxscore;
  if (!boxscore) return 0;

  const gameDate = feed.gameData?.datetime?.officialDate ?? new Date().toISOString().slice(0, 10);
  const awayBox = boxscore.teams?.away;
  const homeBox = boxscore.teams?.home;
  const awayAbbr = feed.gameData?.teams?.away?.abbreviation ?? awayBox?.team?.abbreviation ?? "UNK";
  const homeAbbr = feed.gameData?.teams?.home?.abbreviation ?? homeBox?.team?.abbreviation ?? "UNK";

  const awayPitchers = awayBox?.pitchers ?? [];
  const homePitchers = homeBox?.pitchers ?? [];

  const awaySummaries = summarizePitcher(awayBox!, awayPitchers, awayAbbr, (id) => awayPitchers[0] === id);
  const homeSummaries = summarizePitcher(homeBox!, homePitchers, homeAbbr, (id) => homePitchers[0] === id);

  enrichFromPlays([...awaySummaries, ...homeSummaries], feed);

  let written = 0;
  for (const s of [...awaySummaries, ...homeSummaries]) {
    if (s.pitchCount === 0 && s.inningsPitched === 0) continue;
    const id = toGameId(gamePk, s.pitcherId);
    const pitchTypeJson = buildPitchTypeJson(s.pitchTypes);
    const inningJson = s.inningByInning;

    const totalPitches = s.pitchCount || 1;
    const kRate = round(s.strikeouts / Math.max(1, s.inningsPitched > 0 ? s.inningsPitched * 3 : 1));
    const bbRate = round(s.walks / Math.max(1, s.inningsPitched > 0 ? s.inningsPitched * 3 : 1));
    const whiffRate = s.strikes > 0 ? round((s.pitchCount - s.balls - s.strikes) / totalPitches) : null;

    await prisma.$executeRaw`
      INSERT INTO mlb_pitch_game_log (
        id, game_pk, game_date, pitcher_id, pitcher_name, pitcher_team,
        is_starter, innings_pitched, pitch_count, strikes, balls,
        strikeouts, walks, hits_allowed, runs_allowed,
        home_runs_allowed, pitch_type_json, k_rate, bb_rate, whiff_rate,
        inning_by_inning_json, source, captured_at
      ) VALUES (
        ${id}, ${gamePk}, ${gameDate}::DATE, ${s.pitcherId}, ${s.pitcherName}, ${s.pitcherTeam},
        ${s.isStarter}, ${s.inningsPitched}, ${s.pitchCount}, ${s.strikes}, ${s.balls},
        ${s.strikeouts}, ${s.walks}, ${s.hitsAllowed}, ${s.runsAllowed}, ${s.homeRunsAllowed},
        ${JSON.stringify(pitchTypeJson)}::JSONB, ${kRate}, ${bbRate}, ${whiffRate},
        ${JSON.stringify(inningJson)}::JSONB, 'statsapi_live', now()
      )
      ON CONFLICT (game_pk, pitcher_id) DO UPDATE SET
        innings_pitched    = EXCLUDED.innings_pitched,
        pitch_count        = EXCLUDED.pitch_count,
        strikes            = EXCLUDED.strikes,
        balls              = EXCLUDED.balls,
        strikeouts         = EXCLUDED.strikeouts,
        walks              = EXCLUDED.walks,
        hits_allowed       = EXCLUDED.hits_allowed,
        runs_allowed       = EXCLUDED.runs_allowed,
        home_runs_allowed  = EXCLUDED.home_runs_allowed,
        pitch_type_json    = EXCLUDED.pitch_type_json,
        k_rate             = EXCLUDED.k_rate,
        bb_rate            = EXCLUDED.bb_rate,
        whiff_rate         = EXCLUDED.whiff_rate,
        inning_by_inning_json = EXCLUDED.inning_by_inning_json,
        captured_at        = now()
    `;
    written += 1;
  }

  return written;
}

export type PitchTrackingResult = {
  ok: boolean;
  gamesScanned: number;
  pitcherRowsWritten: number;
  warnings: string[];
};

export async function ingestMlbPitchTracking(args: { gamePks?: number[] } = {}): Promise<PitchTrackingResult> {
  const warnings: string[] = [];
  await ensureTable().catch((err) => warnings.push(`Table ensure: ${err instanceof Error ? err.message : String(err)}`));

  let gamePks: number[];
  try {
    gamePks = args.gamePks?.length ? args.gamePks : await fetchTodayGamePks();
  } catch (err) {
    return { ok: false, gamesScanned: 0, pitcherRowsWritten: 0, warnings: [`Schedule fetch failed: ${err instanceof Error ? err.message : String(err)}`] };
  }

  let pitcherRowsWritten = 0;
  const results = await Promise.allSettled(gamePks.map((pk) => ingestGame(pk)));
  for (const result of results) {
    if (result.status === "fulfilled") pitcherRowsWritten += result.value;
    else warnings.push(`Game ingest failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  }

  return { ok: true, gamesScanned: gamePks.length, pitcherRowsWritten, warnings };
}

export type PitchGameLogRow = {
  gamePk: number;
  gameDate: string;
  pitcherId: string;
  pitcherName: string | null;
  pitcherTeam: string | null;
  isStarter: boolean;
  inningsPitched: number;
  pitchCount: number;
  strikeouts: number;
  walks: number;
  pitchTypeJson: Record<string, { count: number; avgVelocity: number | null }>;
  kRate: number | null;
  bbRate: number | null;
  whiffRate: number | null;
};

type RawLogRow = {
  game_pk: number;
  game_date: Date;
  pitcher_id: string;
  pitcher_name: string | null;
  pitcher_team: string | null;
  is_starter: boolean;
  innings_pitched: number;
  pitch_count: number;
  strikeouts: number;
  walks: number;
  pitch_type_json: unknown;
  k_rate: number | null;
  bb_rate: number | null;
  whiff_rate: number | null;
};

export async function getRecentPitchLogs(gamePk: number): Promise<PitchGameLogRow[]> {
  const rows = await prisma.$queryRaw<RawLogRow[]>`
    SELECT game_pk, game_date, pitcher_id, pitcher_name, pitcher_team,
           is_starter, innings_pitched, pitch_count, strikeouts, walks,
           pitch_type_json, k_rate, bb_rate, whiff_rate
    FROM mlb_pitch_game_log
    WHERE game_pk = ${gamePk}
    ORDER BY is_starter DESC, innings_pitched DESC
  `;
  return rows.map((r) => ({
    gamePk: r.game_pk,
    gameDate: r.game_date.toISOString().slice(0, 10),
    pitcherId: r.pitcher_id,
    pitcherName: r.pitcher_name,
    pitcherTeam: r.pitcher_team,
    isStarter: r.is_starter,
    inningsPitched: r.innings_pitched,
    pitchCount: r.pitch_count,
    strikeouts: r.strikeouts,
    walks: r.walks,
    pitchTypeJson: (r.pitch_type_json ?? {}) as PitchGameLogRow["pitchTypeJson"],
    kRate: r.k_rate,
    bbRate: r.bb_rate,
    whiffRate: r.whiff_rate,
  }));
}

type PitchRollingSourceRow = {
  game_pk: number;
  game_date: Date;
  pitcher_id: string;
  pitcher_team: string | null;
  innings_pitched: number;
  strikeouts: number;
  walks: number;
  hits_allowed: number;
  runs_allowed: number;
  home_runs_allowed: number;
};

function pitcherGameScore(row: PitchRollingSourceRow) {
  const outs = Math.round((Number(row.innings_pitched) || 0) * 3);
  return Number((47.4
    + Number(row.strikeouts || 0)
    + outs * 1.5
    - Number(row.walks || 0) * 2
    - Number(row.hits_allowed || 0) * 2
    - Number(row.runs_allowed || 0) * 3
    - Number(row.home_runs_allowed || 0) * 4).toFixed(2));
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export async function buildMlbPitcherRollingSnapshotsFromPitchLogs(args: { lookbackDays?: number; rollingGames?: number } = {}) {
  await ensureTable();
  const lookbackDays = Math.max(1, Math.min(365, Math.round(args.lookbackDays ?? 45)));
  const rollingGames = Math.max(1, Math.min(10, Math.round(args.rollingGames ?? 5)));
  const rows = await prisma.$queryRaw<PitchRollingSourceRow[]>`
    SELECT game_pk, game_date, pitcher_id, pitcher_team, innings_pitched, strikeouts, walks,
      hits_allowed, runs_allowed, home_runs_allowed
    FROM mlb_pitch_game_log
    WHERE is_starter = true
      AND game_date >= CURRENT_DATE - (${lookbackDays} * interval '1 day')
      AND innings_pitched > 0
    ORDER BY pitcher_id ASC, game_date ASC, game_pk ASC
  `;

  const previousScores = new Map<string, number[]>();
  let snapshotsUpserted = 0;

  for (const row of rows) {
    const gameScore = pitcherGameScore(row);
    const history = previousScores.get(row.pitcher_id) ?? [];
    const rolling = avg(history.slice(-rollingGames)) ?? gameScore;
    await prisma.mlbPitcherRollingSnapshot.upsert({
      where: {
        pitcherId_retrosheetGameId: {
          pitcherId: row.pitcher_id,
          retrosheetGameId: `statsapi:${row.game_pk}`
        }
      },
      update: {
        sourceKey: "STATSAPI_PITCH_LOG",
        teamId: row.pitcher_team,
        season: row.game_date.getUTCFullYear(),
        gameDate: row.game_date,
        rollingGameScore: Number(rolling.toFixed(2)),
        gamesIncluded: Math.min(rollingGames, history.length),
        gameScore
      },
      create: {
        sourceKey: "STATSAPI_PITCH_LOG",
        pitcherId: row.pitcher_id,
        teamId: row.pitcher_team,
        season: row.game_date.getUTCFullYear(),
        gameDate: row.game_date,
        retrosheetGameId: `statsapi:${row.game_pk}`,
        rollingGameScore: Number(rolling.toFixed(2)),
        gamesIncluded: Math.min(rollingGames, history.length),
        gameScore
      }
    });
    previousScores.set(row.pitcher_id, [...history, gameScore].slice(-rollingGames));
    snapshotsUpserted += 1;
  }

  return {
    ok: true,
    source: "STATSAPI_PITCH_LOG",
    lookbackDays,
    rollingGames,
    pitchLogRows: rows.length,
    snapshotsUpserted
  };
}
