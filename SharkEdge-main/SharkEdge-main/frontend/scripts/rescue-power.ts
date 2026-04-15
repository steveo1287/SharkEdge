import { loadEnvConfig } from "@next/env";
import { spawn } from "node:child_process";
import path from "node:path";

import type { LeagueKey } from "@/lib/types/domain";
import { getCurrentOddsBackendBaseUrl } from "@/services/current-odds/backend-url";
import { getLiveOddsReadinessReport } from "@/services/current-odds/provider-readiness-service";
import { getBooleanArg, getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";

loadEnvConfig(process.cwd());

const DEFAULT_LEAGUES: LeagueKey[] = ["NBA", "MLB"];
const ALLOWED_LEAGUES = new Set<LeagueKey>(["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"]);
const LEAGUE_TO_SPORT_KEY: Partial<Record<LeagueKey, string>> = {
  NBA: "basketball_nba",
  NCAAB: "basketball_ncaab",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
  NFL: "americanfootball_nfl",
  NCAAF: "americanfootball_ncaaf"
};

type JsonResult<T> =
  | { ok: true; url: string; status: number; payload: T }
  | { ok: false; url: string; status: number | null; reason: string };

type IngestStatusPayload = {
  configured?: boolean;
  provider?: string;
  updated_at?: string | null;
  sport_count?: number;
  game_count?: number;
  sports?: Array<{ key?: string; game_count?: number }>;
};

type BookFeedPayload = {
  configured?: boolean;
  provider?: string;
  sportsbookKey?: string;
  sourceMode?: string | null;
  sourceProvider?: string | null;
  generatedAt?: string | null;
  events?: unknown[];
  errors?: string[];
};

type BoardPayload = {
  configured?: boolean;
  provider?: string | null;
  provider_mode?: string | null;
  generated_at?: string | null;
  errors?: string[];
  sports?: Array<{ key?: string; games?: unknown[] }>;
};

function parseLeagues(raw: string | undefined): LeagueKey[] {
  if (!raw) {
    return DEFAULT_LEAGUES;
  }

  const parsed = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is LeagueKey => ALLOWED_LEAGUES.has(value as LeagueKey));

  return parsed.length ? parsed : DEFAULT_LEAGUES;
}

function buildUrl(baseUrl: string, pathName: string, params?: Record<string, string | undefined>) {
  const url = new URL(pathName, `${baseUrl.replace(/\/$/, "")}/`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<JsonResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {})
      },
      signal: AbortSignal.timeout(20_000)
    });

    const body = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        url,
        status: response.status,
        reason: body || `Request failed with ${response.status}.`
      };
    }

    return {
      ok: true,
      url,
      status: response.status,
      payload: JSON.parse(body) as T
    };
  } catch (error) {
    return {
      ok: false,
      url,
      status: null,
      reason: error instanceof Error ? error.message : "Request failed."
    };
  }
}

function getApiKey(args: Map<string, string | boolean>) {
  return (
    getStringArg(args, "apiKey") ??
    process.env.INTERNAL_API_KEY?.trim() ??
    process.env.SHARKEDGE_API_KEY?.trim() ??
    ""
  );
}

async function triggerBackendRefresh(baseUrl: string, source: string, force: boolean, apiKey: string) {
  const url = buildUrl(baseUrl, "/api/ingest/odds/refresh", {
    source,
    force: force ? "true" : "false"
  });

  if (!apiKey) {
    return {
      attempted: false,
      ok: false,
      url,
      reason: "No API key available for /api/ingest/odds/refresh. Set INTERNAL_API_KEY or pass --apiKey=."
    } as const;
  }

  const result = await fetchJson<Record<string, unknown>>(url, {
    method: "POST",
    headers: {
      "x-api-key": apiKey
    }
  });

  if (!result.ok) {
    return {
      attempted: true,
      ok: false,
      url,
      reason: result.reason
    } as const;
  }

  return {
    attempted: true,
    ok: true,
    url,
    payload: result.payload
  } as const;
}

async function runLocalScrape(args: {
  leagues: LeagueKey[];
  pythonBin: string;
}) {
  const scriptPath = path.resolve(process.cwd(), "../backend/live_odds_scraper.py");
  const backendCwd = path.resolve(process.cwd(), "../backend");
  const sportFilters = args.leagues
    .map((league) => {
      switch (league) {
        case "NBA":
          return "basketball:NBA";
        case "MLB":
          return "baseball:MLB";
        case "NCAAB":
          return "basketball:NCAAB";
        case "NHL":
          return "hockey:NHL";
        case "NFL":
          return "american-football:NFL";
        case "NCAAF":
          return "american-football:NCAAF";
        default:
          return null;
      }
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .join(",");

  const sportsToScrape = Array.from(
    new Set(
      args.leagues
        .map((league) => {
          switch (league) {
            case "NBA":
            case "NCAAB":
              return "basketball";
            case "MLB":
              return "baseball";
            case "NHL":
              return "hockey";
            case "NFL":
            case "NCAAF":
              return "american-football";
            default:
              return null;
          }
        })
        .filter((value): value is NonNullable<typeof value> => value !== null)
    )
  );

  logStep("rescue:local-scrape:start", {
    scriptPath,
    sportFilters,
    sportsToScrape
  });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(args.pythonBin, [scriptPath], {
      cwd: backendCwd,
      env: {
        ...process.env,
        RUN_ONCE: "true",
        SPORTS_TO_SCRAPE: sportsToScrape.join(","),
        ...(sportFilters ? { SPORTS_FILTERS: sportFilters } : {})
      },
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Local scrape worker exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

function buildRequestedLeagueCounts(payload: IngestStatusPayload, leagues: LeagueKey[]) {
  const counts = new Map<string, number>();
  for (const sport of payload.sports ?? []) {
    if (sport.key) {
      counts.set(sport.key, Number(sport.game_count ?? 0));
    }
  }

  return leagues.map((league) => ({
    league,
    sportKey: LEAGUE_TO_SPORT_KEY[league] ?? league,
    gameCount: Number(counts.get(LEAGUE_TO_SPORT_KEY[league] ?? league) ?? 0)
  }));
}

async function waitForIngest(args: {
  baseUrl: string;
  leagues: LeagueKey[];
  timeoutSeconds: number;
  intervalSeconds: number;
}) {
  const url = buildUrl(args.baseUrl, "/api/ingest/odds/status");
  const deadline = Date.now() + args.timeoutSeconds * 1000;
  let lastResult: JsonResult<IngestStatusPayload> | null = null;

  do {
    lastResult = await fetchJson<IngestStatusPayload>(url);
    if (lastResult.ok) {
      const counts = buildRequestedLeagueCounts(lastResult.payload, args.leagues);
      const ready = counts.some((entry) => entry.gameCount > 0);
      if (ready) {
        return { result: lastResult, counts, timedOut: false };
      }
    }

    if (Date.now() >= deadline) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, args.intervalSeconds * 1000));
  } while (Date.now() < deadline);

  const fallbackCounts =
    lastResult && lastResult.ok ? buildRequestedLeagueCounts(lastResult.payload, args.leagues) : [];

  return {
    result: lastResult,
    counts: fallbackCounts,
    timedOut: true
  };
}

function countBoardGames(payload: BoardPayload, league: LeagueKey) {
  const sportKey = LEAGUE_TO_SPORT_KEY[league] ?? league;
  return payload.sports?.find((sport) => sport.key === sportKey)?.games?.length ?? 0;
}

async function checkBoard(baseUrl: string, league: LeagueKey) {
  const url = buildUrl(baseUrl, "/api/odds/board", { league });
  const result = await fetchJson<BoardPayload>(url);
  if (!result.ok) {
    return {
      ok: false,
      league,
      url,
      reason: result.reason,
      gameCount: 0,
      configured: false,
      provider: null
    } as const;
  }

  return {
    ok: true,
    league,
    url,
    configured: Boolean(result.payload.configured),
    provider: result.payload.provider ?? result.payload.provider_mode ?? null,
    generatedAt: result.payload.generated_at ?? null,
    gameCount: countBoardGames(result.payload, league),
    errors: result.payload.errors ?? []
  } as const;
}

async function checkBookFeed(baseUrl: string, provider: "draftkings" | "fanduel", leagues: LeagueKey[]) {
  const url = buildUrl(baseUrl, `/api/book-feeds/${provider}`, {
    leagues: leagues.join(",")
  });
  const result = await fetchJson<BookFeedPayload>(url);

  if (!result.ok) {
    return {
      ok: false,
      provider,
      url,
      reason: result.reason,
      eventCount: 0
    } as const;
  }

  return {
    ok: true,
    provider,
    url,
    configured: Boolean(result.payload.configured),
    sourceMode: result.payload.sourceMode ?? null,
    sourceProvider: result.payload.sourceProvider ?? null,
    generatedAt: result.payload.generatedAt ?? null,
    eventCount: result.payload.events?.length ?? 0,
    errors: result.payload.errors ?? []
  } as const;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const leagues = parseLeagues(getStringArg(args, "leagues"));
  const backendUrl = getStringArg(args, "backendUrl") ?? getCurrentOddsBackendBaseUrl();
  const refreshSource = getStringArg(args, "refresh") ?? "auto";
  const forceRefresh = args.has("force") ? getBooleanArg(args, "force") : true;
  const strict = args.has("strict") ? getBooleanArg(args, "strict") : true;
  const scrapeLocal = getBooleanArg(args, "scrape");
  const includeReadiness = args.has("readiness") ? getBooleanArg(args, "readiness") : true;
  const timeoutSeconds = getNumberArg(args, "timeoutSeconds", 75);
  const intervalSeconds = getNumberArg(args, "intervalSeconds", 5);
  const apiKey = getApiKey(args);
  const pythonBin = process.env.PYTHON_BIN?.trim() || "python";

  logStep("rescue:power:start", {
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
    refreshSource.toLowerCase() === "skip"
      ? { attempted: false, ok: true, reason: "skipped" }
      : await triggerBackendRefresh(backendUrl, refreshSource, forceRefresh, apiKey);

  const ingest = await waitForIngest({
    baseUrl: backendUrl,
    leagues,
    timeoutSeconds,
    intervalSeconds
  });

  const [draftKings, fanDuel, boardChecks, readiness] = await Promise.all([
    checkBookFeed(backendUrl, "draftkings", leagues),
    checkBookFeed(backendUrl, "fanduel", leagues),
    Promise.all(leagues.map((league) => checkBoard(backendUrl, league))),
    includeReadiness ? getLiveOddsReadinessReport({ leagues }) : Promise.resolve(null)
  ]);

  const failures: string[] = [];

  if (!refreshResult.ok) {
    failures.push(`Refresh failed: ${refreshResult.reason}`);
  }

  if (!ingest.result?.ok) {
    failures.push(`Ingest status failed: ${ingest.result?.reason ?? "unknown error"}`);
  } else if (!ingest.counts.some((entry) => entry.gameCount > 0)) {
    failures.push(`Ingest returned zero requested league games for ${leagues.join(", ")}.`);
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

  for (const board of boardChecks) {
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
          configured: Boolean(ingest.result.payload.configured),
          provider: ingest.result.payload.provider ?? null,
          updatedAt: ingest.result.payload.updated_at ?? null,
          sportCount: ingest.result.payload.sport_count ?? 0,
          gameCount: ingest.result.payload.game_count ?? 0,
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
    boards: boardChecks,
    readiness: readiness
      ? {
          overallState: readiness.overallState,
          selectedBoardProvider: readiness.selectedBoardProvider,
          warnings: readiness.warnings,
          notes: readiness.notes
        }
      : null,
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
