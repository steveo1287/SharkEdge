import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_LEAGUES = ['NBA', 'NCAAB', 'MLB', 'NHL', 'NFL', 'NCAAF', 'UFC', 'BOXING'];
const ALLOWED_LEAGUES = new Set(['NBA', 'NCAAB', 'MLB', 'NHL', 'NFL', 'NCAAF', 'UFC', 'BOXING']);
const LEAGUE_TO_SPORT_KEY = {
  NBA: 'basketball_nba',
  NCAAB: 'basketball_ncaab',
  MLB: 'baseball_mlb',
  NHL: 'icehockey_nhl',
  NFL: 'americanfootball_nfl',
  NCAAF: 'americanfootball_ncaaf',
  UFC: 'mma_ufc',
  BOXING: 'boxing'
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (process.env[key]) {
      continue;
    }
    const value = rawValue.replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}

function loadFrontendEnv() {
  const cwd = process.cwd();
  for (const fileName of ['.env.local', '.env']) {
    loadEnvFile(path.join(cwd, fileName));
  }
}

function parseArgs(argv) {
  const args = new Map();
  for (const raw of argv) {
    if (!raw.startsWith('--')) {
      continue;
    }
    const [key, value] = raw.slice(2).split('=', 2);
    args.set(key, value === undefined ? true : value);
  }
  return args;
}

function getStringArg(args, key) {
  const value = args.get(key);
  return typeof value === 'string' ? value : undefined;
}

function getBooleanArg(args, key) {
  const value = args.get(key);
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
  return false;
}

function getNumberArg(args, key, fallback) {
  const value = getStringArg(args, key);
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function logStep(label, details) {
  const suffix = details ? ` ${JSON.stringify(details)}` : '';
  console.info(`[runtime] ${label}${suffix}`);
}

function parseLeagues(raw) {
  if (!raw) {
    return DEFAULT_LEAGUES;
  }
  const parsed = raw
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => ALLOWED_LEAGUES.has(value));
  return parsed.length ? parsed : DEFAULT_LEAGUES;
}

function getBackendBaseUrl() {
  const explicit = process.env.SHARKEDGE_BACKEND_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  return 'http://127.0.0.1:8000';
}

function buildUrl(baseUrl, pathName, params = {}) {
  const url = new URL(pathName, `${baseUrl.replace(/\/$/, '')}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function fetchJson(url, init) {
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {})
      },
      signal: AbortSignal.timeout(20000)
    });
    const body = await response.text();
    if (!response.ok) {
      return { ok: false, url, status: response.status, reason: body || `Request failed with ${response.status}.` };
    }
    return { ok: true, url, status: response.status, payload: body ? JSON.parse(body) : null };
  } catch (error) {
    return { ok: false, url, status: null, reason: error instanceof Error ? error.message : 'Request failed.' };
  }
}

function getApiKey(args) {
  return getStringArg(args, 'apiKey') ?? process.env.INTERNAL_API_KEY?.trim() ?? process.env.SHARKEDGE_API_KEY?.trim() ?? '';
}

async function triggerBackendRefresh(baseUrl, source, force, apiKey) {
  const url = buildUrl(baseUrl, '/api/ingest/odds/refresh', {
    source,
    force: force ? 'true' : 'false'
  });

  if (!apiKey) {
    return {
      attempted: false,
      ok: false,
      url,
      reason: 'No API key available for /api/ingest/odds/refresh. Set INTERNAL_API_KEY or pass --apiKey=.'
    };
  }

  const result = await fetchJson(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey
    }
  });

  if (!result.ok) {
    return {
      attempted: true,
      ok: false,
      url,
      reason: result.reason
    };
  }

  return {
    attempted: true,
    ok: true,
    url,
    payload: result.payload
  };
}

async function runLocalScrape({ leagues, pythonBin }) {
  const scriptPath = path.resolve(process.cwd(), '../backend/live_odds_scraper.py');
  const backendCwd = path.resolve(process.cwd(), '../backend');
  const sportFilters = leagues
    .map((league) => {
      switch (league) {
        case 'NBA':
          return 'basketball:NBA';
        case 'MLB':
          return 'baseball:MLB';
        case 'NCAAB':
          return 'basketball:NCAAB';
        case 'NHL':
          return 'hockey:NHL';
        case 'NFL':
          return 'american-football:NFL';
        case 'NCAAF':
          return 'american-football:NCAAF';
        default:
          return null;
      }
    })
    .filter(Boolean)
    .join(',');

  const sportsToScrape = Array.from(
    new Set(
      leagues
        .map((league) => {
          switch (league) {
            case 'NBA':
            case 'NCAAB':
              return 'basketball';
            case 'MLB':
              return 'baseball';
            case 'NHL':
              return 'hockey';
            case 'NFL':
            case 'NCAAF':
              return 'american-football';
            default:
              return null;
          }
        })
        .filter(Boolean)
    )
  );

  logStep('rescue:local-scrape:start', {
    scriptPath,
    sportFilters,
    sportsToScrape
  });

  await new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath], {
      cwd: backendCwd,
      env: {
        ...process.env,
        RUN_ONCE: 'true',
        SPORTS_TO_SCRAPE: sportsToScrape.join(','),
        ...(sportFilters ? { SPORTS_FILTERS: sportFilters } : {})
      },
      stdio: 'inherit'
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Local scrape worker exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

function buildRequestedLeagueCounts(payload, leagues) {
  const counts = new Map();
  for (const sport of payload?.sports ?? []) {
    if (sport?.key) {
      counts.set(sport.key, Number(sport.game_count ?? 0));
    }
  }

  return leagues.map((league) => ({
    league,
    sportKey: LEAGUE_TO_SPORT_KEY[league] ?? league,
    gameCount: Number(counts.get(LEAGUE_TO_SPORT_KEY[league] ?? league) ?? 0)
  }));
}

async function waitForIngest({ baseUrl, leagues, timeoutSeconds, intervalSeconds }) {
  const url = buildUrl(baseUrl, '/api/ingest/odds/status');
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastResult = null;

  do {
    lastResult = await fetchJson(url);
    if (lastResult.ok) {
      const counts = buildRequestedLeagueCounts(lastResult.payload, leagues);
      if (counts.some((entry) => entry.gameCount > 0)) {
        return { result: lastResult, counts, timedOut: false };
      }
    }

    if (Date.now() >= deadline) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  } while (Date.now() < deadline);

  return {
    result: lastResult,
    counts: lastResult?.ok ? buildRequestedLeagueCounts(lastResult.payload, leagues) : [],
    timedOut: true
  };
}

function countBoardGames(payload, league) {
  const sportKey = LEAGUE_TO_SPORT_KEY[league] ?? league;
  return payload?.sports?.find((sport) => sport?.key === sportKey)?.games?.length ?? 0;
}

async function checkBoard(baseUrl, league) {
  const url = buildUrl(baseUrl, '/api/odds/board', { league });
  const result = await fetchJson(url);
  if (!result.ok) {
    return { ok: false, league, url, reason: result.reason, gameCount: 0, configured: false, provider: null };
  }

  return {
    ok: true,
    league,
    url,
    configured: Boolean(result.payload?.configured),
    provider: result.payload?.provider ?? result.payload?.provider_mode ?? null,
    generatedAt: result.payload?.generated_at ?? null,
    gameCount: countBoardGames(result.payload, league),
    errors: result.payload?.errors ?? []
  };
}

async function checkBookFeed(baseUrl, provider, leagues) {
  const url = buildUrl(baseUrl, `/api/book-feeds/${provider}`, { leagues: leagues.join(',') });
  const result = await fetchJson(url);
  if (!result.ok) {
    return { ok: false, provider, url, reason: result.reason, eventCount: 0 };
  }

  return {
    ok: true,
    provider,
    url,
    configured: Boolean(result.payload?.configured),
    sourceMode: result.payload?.sourceMode ?? null,
    sourceProvider: result.payload?.sourceProvider ?? null,
    generatedAt: result.payload?.generatedAt ?? null,
    eventCount: result.payload?.events?.length ?? 0,
    errors: result.payload?.errors ?? []
  };
}

async function main() {
  loadFrontendEnv();
  const args = parseArgs(process.argv.slice(2));
  const leagues = parseLeagues(getStringArg(args, 'leagues'));
  const backendUrl = getStringArg(args, 'backendUrl') ?? getBackendBaseUrl();
  const refreshSource = getStringArg(args, 'refresh') ?? 'auto';
  const forceRefresh = args.has('force') ? getBooleanArg(args, 'force') : true;
  const strict = args.has('strict') ? getBooleanArg(args, 'strict') : true;
  const scrapeLocal = getBooleanArg(args, 'scrape');
  const timeoutSeconds = getNumberArg(args, 'timeoutSeconds', 75);
  const intervalSeconds = getNumberArg(args, 'intervalSeconds', 5);
  const apiKey = getApiKey(args);
  const pythonBin = process.env.PYTHON_BIN?.trim() || 'python';

  logStep('rescue:power:start', {
    backendUrl,
    leagues,
    refreshSource,
    scrapeLocal,
    timeoutSeconds,
    intervalSeconds
  });

  if (scrapeLocal) {
    await runLocalScrape({ leagues, pythonBin });
  }

  const refreshResult =
    refreshSource.toLowerCase() === 'skip'
      ? { attempted: false, ok: true, reason: 'skipped' }
      : await triggerBackendRefresh(backendUrl, refreshSource, forceRefresh, apiKey);

  const ingest = await waitForIngest({
    baseUrl: backendUrl,
    leagues,
    timeoutSeconds,
    intervalSeconds
  });

  const [draftKings, fanDuel, boards] = await Promise.all([
    checkBookFeed(backendUrl, 'draftkings', leagues),
    checkBookFeed(backendUrl, 'fanduel', leagues),
    Promise.all(leagues.map((league) => checkBoard(backendUrl, league)))
  ]);

  const failures = [];

  if (!refreshResult.ok) {
    failures.push(`Refresh failed: ${refreshResult.reason}`);
  }

  if (!ingest.result?.ok) {
    failures.push(`Ingest status failed: ${ingest.result?.reason ?? 'unknown error'}`);
  } else if (!ingest.counts.some((entry) => entry.gameCount > 0)) {
    failures.push(`Ingest returned zero requested league games for ${leagues.join(', ')}.`);
  }

  for (const feed of [draftKings, fanDuel]) {
    if (!feed.ok) {
      failures.push(`${feed.provider} feed failed: ${feed.reason}`);
      continue;
    }
    if (!feed.configured) {
      failures.push(`${feed.provider} feed is not configured.`);
    }
    if (feed.eventCount <= 0) {
      failures.push(`${feed.provider} feed returned zero events.`);
    }
  }

  for (const board of boards) {
    if (!board.ok) {
      failures.push(`${board.league} board failed: ${board.reason}`);
      continue;
    }
    if (!board.configured) {
      failures.push(`${board.league} board is not configured.`);
    }
    if (board.gameCount <= 0) {
      failures.push(`${board.league} board returned zero games.`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    backendUrl,
    leagues,
    refresh: refreshResult,
    ingest: ingest.result?.ok
      ? {
          configured: Boolean(ingest.result.payload?.configured),
          provider: ingest.result.payload?.provider ?? null,
          updatedAt: ingest.result.payload?.updated_at ?? null,
          sportCount: ingest.result.payload?.sport_count ?? 0,
          gameCount: ingest.result.payload?.game_count ?? 0,
          requestedLeagueCounts: ingest.counts,
          timedOut: ingest.timedOut
        }
      : {
          configured: false,
          provider: null,
          updatedAt: null,
          sportCount: 0,
          gameCount: 0,
          requestedLeagueCounts: ingest.counts,
          timedOut: ingest.timedOut,
          reason: ingest.result?.reason ?? null
        },
    feeds: [draftKings, fanDuel],
    boards,
    failures
  };

  console.log(JSON.stringify(report, null, 2));

  if (strict && failures.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
