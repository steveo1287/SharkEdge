import type { SupportedLeagueKey } from "@/lib/types/ledger";

type SportsDataverseLeagueModule = {
  getScoreboard?: (...args: unknown[]) => Promise<unknown>;
  getSummary?: (eventId: string | number) => Promise<unknown>;
  getPlayByPlay?: (eventId: string | number) => Promise<unknown>;
  getBoxScore?: (eventId: string | number) => Promise<unknown>;
};

type SportsDataverseRoot = {
  nba?: SportsDataverseLeagueModule;
  mbb?: SportsDataverseLeagueModule;
  mlb?: SportsDataverseLeagueModule;
  nhl?: SportsDataverseLeagueModule;
  nfl?: SportsDataverseLeagueModule;
  cfb?: SportsDataverseLeagueModule;
};

const SPORTS_DATAVERSE_MODULE_BY_LEAGUE: Partial<
  Record<SupportedLeagueKey, keyof SportsDataverseRoot>
> = {
  NBA: "nba",
  NCAAB: "mbb",
  MLB: "mlb",
  NHL: "nhl",
  NFL: "nfl",
  NCAAF: "cfb"
};

let sportsDataverseRootPromise: Promise<SportsDataverseRoot | null> | null = null;

function toDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeEventId(eventId: string | number) {
  const raw = String(eventId);
  const normalized = raw.includes("__") ? raw.split("__").at(-1) ?? raw : raw;
  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) ? asNumber : normalized;
}

async function loadSportsDataverseRoot() {
  if (!sportsDataverseRootPromise) {
    sportsDataverseRootPromise = import("sportsdataverse")
      .then((module) => ((module as { default?: unknown }).default ?? module) as SportsDataverseRoot)
      .catch(() => null);
  }

  return sportsDataverseRootPromise;
}

async function getLeagueModule(leagueKey: SupportedLeagueKey) {
  const root = await loadSportsDataverseRoot();
  if (!root) {
    return null;
  }

  const moduleKey = SPORTS_DATAVERSE_MODULE_BY_LEAGUE[leagueKey];
  return moduleKey ? root[moduleKey] ?? null : null;
}

function getScoreboardArgs(leagueKey: SupportedLeagueKey, date: Date, limit: number) {
  const year = date.getUTCFullYear();
  const month = toDatePart(date.getUTCMonth() + 1);
  const day = toDatePart(date.getUTCDate());

  if (leagueKey === "NCAAF") {
    // cfb signature: getScoreboard(year, month, day, group, seasontype, limit)
    return [year, month, day, undefined, undefined, limit];
  }

  return [year, month, day, limit];
}

export async function fetchSportsDataverseScoreboard(
  leagueKey: SupportedLeagueKey,
  options?: { date?: Date; limit?: number }
) {
  const leagueModule = await getLeagueModule(leagueKey);
  if (!leagueModule?.getScoreboard) {
    return null;
  }

  const date = options?.date ?? new Date();
  const limit = options?.limit ?? 100;
  return leagueModule.getScoreboard(...getScoreboardArgs(leagueKey, date, limit));
}

export async function fetchSportsDataverseSummary(
  leagueKey: SupportedLeagueKey,
  eventId: string | number
) {
  const leagueModule = await getLeagueModule(leagueKey);
  if (!leagueModule?.getSummary) {
    return null;
  }

  return leagueModule.getSummary(normalizeEventId(eventId));
}

export async function fetchSportsDataversePlayByPlay(
  leagueKey: SupportedLeagueKey,
  eventId: string | number
) {
  const leagueModule = await getLeagueModule(leagueKey);
  if (!leagueModule?.getPlayByPlay) {
    return null;
  }

  return leagueModule.getPlayByPlay(normalizeEventId(eventId));
}

export async function fetchSportsDataverseBoxScore(
  leagueKey: SupportedLeagueKey,
  eventId: string | number
) {
  const leagueModule = await getLeagueModule(leagueKey);
  if (!leagueModule?.getBoxScore) {
    return null;
  }

  return leagueModule.getBoxScore(normalizeEventId(eventId));
}
