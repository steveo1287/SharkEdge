import type { LeagueKey } from "@/lib/types/domain";

import type {
  MatchupBoxscoreRow,
  MatchupDetailPayload,
  MatchupMetricView,
  MatchupParticipantPanel,
  MatchupStatsProvider
} from "./provider-types";

type EspnLeaguePath =
  | "basketball/nba"
  | "basketball/mens-college-basketball"
  | "baseball/mlb"
  | "hockey/nhl"
  | "football/nfl"
  | "football/college-football";
type JsonRecord = Record<string, any>;
type MlbTeamDirectoryEntry = {
  id: number;
  name: string;
  abbreviation?: string;
  teamName?: string;
};

const mlbTeamDirectoryCache = new Map<number, MlbTeamDirectoryEntry[]>();

const ESPN_LEAGUE_PATHS: Partial<Record<LeagueKey, EspnLeaguePath>> = {
  NBA: "basketball/nba",
  NCAAB: "basketball/mens-college-basketball",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
  NFL: "football/nfl",
  NCAAF: "football/college-football"
};

const SEASON_STAT_BLUEPRINTS: Partial<
  Record<LeagueKey, Array<{ label: string; terms: string[] }>>
> = {
  NBA: [
    { label: "PPG", terms: ["avgPoints", "points per game"] },
    { label: "FG%", terms: ["field goal percentage", "fg percentage", "fieldgoalpct"] },
    { label: "3P%", terms: ["three point field goal percentage", "3 point percentage", "threepointfieldgoalpct"] },
    { label: "FT%", terms: ["free throw percentage", "freethrowpct"] },
    { label: "APG", terms: ["avgAssists", "assists per game"] },
    { label: "RPG", terms: ["avgRebounds", "rebounds per game"] },
    { label: "TO/G", terms: ["avgTurnovers", "turnovers per game"] }
  ],
  NCAAB: [
    { label: "PPG", terms: ["avgPoints", "points per game"] },
    { label: "FG%", terms: ["field goal percentage", "fg percentage", "fieldgoalpct"] },
    { label: "3P%", terms: ["three point field goal percentage", "3 point percentage", "threepointfieldgoalpct"] },
    { label: "FT%", terms: ["free throw percentage", "freethrowpct"] },
    { label: "APG", terms: ["avgAssists", "assists per game"] },
    { label: "RPG", terms: ["avgRebounds", "rebounds per game"] },
    { label: "TO/G", terms: ["avgTurnovers", "turnovers per game"] }
  ],
  MLB: [
    { label: "Runs/G", terms: ["runs per game", "avgRuns"] },
    { label: "OBP", terms: ["on base percentage", "obp"] },
    { label: "SLG", terms: ["slugging percentage", "slg"] },
    { label: "AVG", terms: ["batting average", "avg"] },
    { label: "HR", terms: ["home runs"] },
    { label: "ERA", terms: ["earned run average", "era"] },
    { label: "WHIP", terms: ["whip"] }
  ],
  NHL: [
    { label: "Goals/G", terms: ["goals per game"] },
    { label: "Shots/G", terms: ["shots per game"] },
    { label: "PP%", terms: ["power play percentage", "power play %"] },
    { label: "PK%", terms: ["penalty kill percentage", "penalty kill %"] },
    { label: "Faceoff%", terms: ["faceoff win percentage", "faceoff percentage"] },
    { label: "Save %", terms: ["save percentage", "save %"] }
  ],
  NFL: [
    { label: "Pts/G", terms: ["points per game"] },
    { label: "Yds/G", terms: ["yards per game"] },
    { label: "Pass Yds", terms: ["passing yards per game"] },
    { label: "Rush Yds", terms: ["rushing yards per game"] },
    { label: "3D %", terms: ["third down conversion percentage"] },
    { label: "RZ TD%", terms: ["red zone touchdown percentage", "redzoneefficiency"] },
    { label: "TO Diff", terms: ["turnover differential"] }
  ],
  NCAAF: [
    { label: "Pts/G", terms: ["points per game"] },
    { label: "Yds/G", terms: ["yards per game"] },
    { label: "Pass Yds", terms: ["passing yards per game"] },
    { label: "Rush Yds", terms: ["rushing yards per game"] },
    { label: "3D %", terms: ["third down conversion percentage"] },
    { label: "RZ TD%", terms: ["red zone touchdown percentage", "redzoneefficiency"] },
    { label: "TO Diff", terms: ["turnover differential"] }
  ]
};

const LIVE_TEAM_STAT_BLUEPRINTS: Partial<
  Record<LeagueKey, Array<{ label: string; terms: string[] }>>
> = {
  NBA: [
    { label: "PTS", terms: ["points", "pts"] },
    { label: "FG%", terms: ["fieldgoalpct", "field goal %", "fg%"] },
    { label: "3P%", terms: ["threepointfieldgoalpct", "three point %", "3p%"] },
    { label: "REB", terms: ["totalrebounds", "rebounds", "reb"] },
    { label: "AST", terms: ["assists", "ast"] }
  ],
  NCAAB: [
    { label: "PTS", terms: ["points", "pts"] },
    { label: "FG%", terms: ["fieldgoalpct", "field goal %", "fg%"] },
    { label: "3P%", terms: ["threepointfieldgoalpct", "three point %", "3p%"] },
    { label: "REB", terms: ["totalrebounds", "rebounds", "reb"] },
    { label: "AST", terms: ["assists", "ast"] }
  ],
  MLB: [
    { label: "R", terms: ["runs", "r"] },
    { label: "H", terms: ["hits", "h"] },
    { label: "E", terms: ["errors", "e"] },
    { label: "LOB", terms: ["leftonbase", "lob"] }
  ],
  NHL: [
    { label: "Shots", terms: ["shotstotal", "shots"] },
    { label: "Hits", terms: ["hits", "ht"] },
    { label: "Blocks", terms: ["blockedshots", "bs"] },
    { label: "PP%", terms: ["powerplaypct", "power play percentage"] },
    { label: "FO%", terms: ["faceoffpct", "faceoff percentage"] }
  ],
  NFL: [
    { label: "Yards", terms: ["totalyards", "total yards"] },
    { label: "Pass", terms: ["netpassingyards", "passing"] },
    { label: "Rush", terms: ["rushingyards", "rushing"] },
    { label: "3D", terms: ["thirddowneff", "3rd down efficiency"] },
    { label: "TO", terms: ["turnovers", "turnover"] }
  ],
  NCAAF: [
    { label: "Yards", terms: ["totalyards", "total yards"] },
    { label: "Pass", terms: ["netpassingyards", "passing"] },
    { label: "Rush", terms: ["rushingyards", "rushing"] },
    { label: "3D", terms: ["thirddowneff", "3rd down efficiency"] },
    { label: "TO", terms: ["turnovers", "turnover"] }
  ]
};

const FULL_BOX_SCORE_BLUEPRINTS: Partial<
  Record<LeagueKey, Array<{ label: string; terms: string[] }>>
> = {
  NBA: [
    { label: "PTS", terms: ["points", "pts"] },
    { label: "FG", terms: ["fieldgoalsmadefieldgoalsattempted", "fg"] },
    { label: "3PT", terms: ["threepointfieldgoalsmadethreepointfieldgoalsattempted", "3pt"] },
    { label: "FT", terms: ["freethrowsmadefreethrowsattempted", "ft"] },
    { label: "REB", terms: ["totalrebounds", "rebounds", "reb"] },
    { label: "AST", terms: ["assists", "ast"] },
    { label: "TO", terms: ["turnovers", "to"] },
    { label: "STL", terms: ["steals", "stl"] },
    { label: "BLK", terms: ["blocks", "blk"] }
  ],
  NCAAB: [
    { label: "PTS", terms: ["points", "pts"] },
    { label: "FG", terms: ["fieldgoalsmadefieldgoalsattempted", "fg"] },
    { label: "3PT", terms: ["threepointfieldgoalsmadethreepointfieldgoalsattempted", "3pt"] },
    { label: "FT", terms: ["freethrowsmadefreethrowsattempted", "ft"] },
    { label: "REB", terms: ["totalrebounds", "rebounds", "reb"] },
    { label: "AST", terms: ["assists", "ast"] },
    { label: "TO", terms: ["turnovers", "to"] },
    { label: "STL", terms: ["steals", "stl"] },
    { label: "BLK", terms: ["blocks", "blk"] }
  ],
  MLB: [
    { label: "R", terms: ["runs", "r"] },
    { label: "H", terms: ["hits", "h"] },
    { label: "E", terms: ["errors", "e"] },
    { label: "LOB", terms: ["leftonbase", "lob"] },
    { label: "AVG", terms: ["avg", "battingaverage"] },
    { label: "OBP", terms: ["obp", "onbasepercentage"] },
    { label: "SLG", terms: ["slg", "sluggingpercentage"] }
  ],
  NHL: [
    { label: "G", terms: ["goals", "g"] },
    { label: "Shots", terms: ["shotstotal", "shots"] },
    { label: "Hits", terms: ["hits", "ht"] },
    { label: "Blocks", terms: ["blockedshots", "bs"] },
    { label: "FO%", terms: ["faceoffpct", "faceoffpercentage"] },
    { label: "PP", terms: ["powerplays", "powerplay"] },
    { label: "PIM", terms: ["penaltyminutes", "pim"] }
  ],
  NFL: [
    { label: "Yards", terms: ["totalyards", "total yards"] },
    { label: "Pass", terms: ["netpassingyards", "passing"] },
    { label: "Rush", terms: ["rushingyards", "rushing"] },
    { label: "1st Downs", terms: ["firstdowns", "first downs"] },
    { label: "3D", terms: ["thirddowneff", "3rd down efficiency"] },
    { label: "4D", terms: ["fourthdowneff", "4th down efficiency"] },
    { label: "TO", terms: ["turnovers", "turnover"] },
    { label: "TOP", terms: ["timeofpossession", "possession"] }
  ],
  NCAAF: [
    { label: "Yards", terms: ["totalyards", "total yards"] },
    { label: "Pass", terms: ["netpassingyards", "passing"] },
    { label: "Rush", terms: ["rushingyards", "rushing"] },
    { label: "1st Downs", terms: ["firstdowns", "first downs"] },
    { label: "3D", terms: ["thirddowneff", "3rd down efficiency"] },
    { label: "4D", terms: ["fourthdowneff", "4th down efficiency"] },
    { label: "TO", terms: ["turnovers", "turnover"] },
    { label: "TOP", terms: ["timeofpossession", "possession"] }
  ]
};

const SPORT_BOXSCORE_LIMITS: Partial<Record<LeagueKey, number>> = {
  NBA: 12,
  NCAAB: 12,
  MLB: 12,
  NHL: 12,
  NFL: 14,
  NCAAF: 14
};

async function fetchEspnJson<T>(path: string) {
  const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 SharkEdge/1.5"
    },
    next: {
      revalidate: 120
    }
  });

  if (!response.ok) {
    throw new Error(`ESPN stats request failed for ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchJson<T>(url: string, revalidate = 300) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 SharkEdge/1.5"
    },
    next: {
      revalidate
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }

  return (await response.json()) as T;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeStatKey(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function uniqueMetrics(metrics: MatchupMetricView[]) {
  const seen = new Set<string>();
  return metrics.filter((metric) => {
    const key = normalizeStatKey(metric.label);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mergeMetrics(primary: MatchupMetricView[], secondary: MatchupMetricView[]) {
  return uniqueMetrics([...primary, ...secondary]);
}

function takeMetrics(metrics: MatchupMetricView[], limit: number) {
  return uniqueMetrics(metrics).slice(0, limit);
}

function deriveSeasonYear(startTime: string | null | undefined) {
  const parsed = startTime ? new Date(startTime) : new Date();
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  return month < 2 ? year - 1 : year;
}

function deriveNhlSeasonKey(startTime: string | null | undefined) {
  const parsed = startTime ? new Date(startTime) : new Date();
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}${startYear + 1}`;
}

async function getMlbTeamDirectory(season: number) {
  const cached = mlbTeamDirectoryCache.get(season);
  if (cached) {
    return cached;
  }

  const payload = await fetchJson<{ teams?: MlbTeamDirectoryEntry[] }>(
    `https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${season}`,
    3600
  );
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  mlbTeamDirectoryCache.set(season, teams);
  return teams;
}

async function resolveMlbTeamId(teamName: string, abbreviation: string | null, season: number) {
  const teams = await getMlbTeamDirectory(season);
  const normalizedName = normalizeStatKey(teamName);
  const normalizedAbbreviation = normalizeStatKey(abbreviation);

  const exact =
    teams.find((team) => normalizeStatKey(team.name) === normalizedName) ??
    teams.find((team) => normalizeStatKey(team.teamName) === normalizedName) ??
    teams.find((team) => normalizedAbbreviation && normalizeStatKey(team.abbreviation) === normalizedAbbreviation) ??
    null;

  return exact?.id ?? null;
}

function formatThreeDecimal(value: unknown) {
  const raw = readString(value);
  if (!raw) {
    return null;
  }

  return raw.startsWith(".") ? raw : raw;
}

function formatDisplayName(parts: Array<string | null>) {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" ").trim() || "Player";
}

function buildMlbLeaderValue(entry: JsonRecord | null, suffix: string) {
  const name = readString(entry?.person?.fullName);
  const value = readString(entry?.value);
  if (!name || !value) {
    return null;
  }

  return `${name} ${value}${suffix}`;
}

async function fetchMlbEnrichment(args: {
  teamName: string;
  abbreviation: string | null;
  startTime: string;
}) {
  const season = deriveSeasonYear(args.startTime);
  const teamId = await resolveMlbTeamId(args.teamName, args.abbreviation, season);
  if (!teamId) {
    return null;
  }

  const [statsPayload, leadersPayload] = await Promise.all([
    fetchJson<JsonRecord>(
      `https://statsapi.mlb.com/api/v1/teams/stats?stats=season&group=hitting,pitching,fielding&teamIds=${teamId}&season=${season}`,
      1800
    ),
    fetchJson<JsonRecord>(
      `https://statsapi.mlb.com/api/v1/teams/${teamId}/leaders?leaderCategories=homeRuns,runsBattedIn,battingAverage,earnedRunAverage,strikeOuts,wins&season=${season}`,
      1800
    )
  ]);

  const statSplits = Array.isArray(statsPayload.stats)
    ? statsPayload.stats.flatMap((entry: JsonRecord) => (Array.isArray(entry.splits) ? entry.splits : []))
    : [];
  const hitting = statSplits.find((entry: JsonRecord) => normalizeStatKey(entry?.group?.displayName) === "hitting") ?? null;
  const pitching = statSplits.find((entry: JsonRecord) => normalizeStatKey(entry?.group?.displayName) === "pitching") ?? null;
  const gamesPlayed = readNumber(hitting?.stat?.gamesPlayed) ?? readNumber(pitching?.stat?.gamesPlayed) ?? null;
  const runs = readNumber(hitting?.stat?.runs) ?? null;

  const stats: MatchupMetricView[] = [
    gamesPlayed && runs !== null
      ? {
          label: "Runs/G",
          value: (runs / gamesPlayed).toFixed(1),
          note: "MLB StatsAPI season team scoring rate"
        }
      : null,
    formatThreeDecimal(hitting?.stat?.avg)
      ? { label: "AVG", value: String(formatThreeDecimal(hitting?.stat?.avg)) }
      : null,
    readNumber(hitting?.stat?.homeRuns) !== null
      ? { label: "HR", value: String(readNumber(hitting?.stat?.homeRuns)) }
      : null,
    readNumber(hitting?.stat?.stolenBases) !== null
      ? { label: "SB", value: String(readNumber(hitting?.stat?.stolenBases)) }
      : null,
    formatThreeDecimal(pitching?.stat?.era)
      ? { label: "ERA", value: String(formatThreeDecimal(pitching?.stat?.era)) }
      : null,
    formatThreeDecimal(pitching?.stat?.whip)
      ? { label: "WHIP", value: String(formatThreeDecimal(pitching?.stat?.whip)) }
      : null
  ].filter(Boolean) as MatchupMetricView[];

  const leadersByCategory = new Map<string, JsonRecord>(
    (Array.isArray(leadersPayload.teamLeaders) ? leadersPayload.teamLeaders : []).map((entry: JsonRecord) => [
      normalizeStatKey(entry.leaderCategory),
      Array.isArray(entry.leaders) ? entry.leaders[0] : null
    ])
  );

  const leaders: MatchupMetricView[] = [
    buildMlbLeaderValue(leadersByCategory.get("homeruns") ?? null, " HR"),
    buildMlbLeaderValue(leadersByCategory.get("runsbattedin") ?? null, " RBI"),
    buildMlbLeaderValue(leadersByCategory.get("battingaverage") ?? null, " AVG"),
    buildMlbLeaderValue(leadersByCategory.get("strikeouts") ?? null, " K"),
    buildMlbLeaderValue(leadersByCategory.get("earnedrunaverage") ?? null, " ERA"),
    buildMlbLeaderValue(leadersByCategory.get("wins") ?? null, " W")
  ]
    .filter(Boolean)
    .slice(0, 4)
    .map((value, index) => ({
      label: index < 3 ? "Season leader" : "Pitching leader",
      value: value as string
    }));

  return {
    stats,
    leaders
  };
}

async function fetchNhlEnrichment(args: {
  abbreviation: string | null;
  startTime: string;
}) {
  const triCode = readString(args.abbreviation)?.toUpperCase();
  if (!triCode) {
    return null;
  }

  const seasonKey = deriveNhlSeasonKey(args.startTime);
  const payload = await fetchJson<JsonRecord>(
    `https://api-web.nhle.com/v1/club-stats/${triCode}/${seasonKey}/2`,
    1800
  );

  const skaters = Array.isArray(payload.skaters) ? payload.skaters : [];
  const goalies = Array.isArray(payload.goalies) ? payload.goalies : [];

  const topSkater = [...skaters].sort(
    (left: JsonRecord, right: JsonRecord) =>
      (readNumber(right.points) ?? 0) - (readNumber(left.points) ?? 0) ||
      (readNumber(right.goals) ?? 0) - (readNumber(left.goals) ?? 0)
  )[0];
  const topGoalie = [...goalies].sort(
    (left: JsonRecord, right: JsonRecord) =>
      (readNumber(right.savePctg) ?? 0) - (readNumber(left.savePctg) ?? 0)
  )[0];

  const aggregateGames = skaters.length ? readNumber(skaters[0]?.gamesPlayed) : null;
  const totalGoals = skaters.reduce((total: number, skater: JsonRecord) => total + (readNumber(skater.goals) ?? 0), 0);
  const totalShots = skaters.reduce((total: number, skater: JsonRecord) => total + (readNumber(skater.shots) ?? 0), 0);

  const stats: MatchupMetricView[] = [
    aggregateGames !== null
      ? { label: "Goals/G", value: (totalGoals / aggregateGames).toFixed(1), note: "NHL API club skater totals" }
      : null,
    aggregateGames !== null
      ? { label: "Shots/G", value: (totalShots / aggregateGames).toFixed(1) }
      : null,
    topGoalie && readNumber(topGoalie.savePctg) !== null
      ? { label: "Save %", value: String((readNumber(topGoalie.savePctg) ?? 0).toFixed(3)) }
      : null,
    topGoalie && readNumber(topGoalie.goalsAgainstAvg) !== null
      ? { label: "GA/G", value: String((readNumber(topGoalie.goalsAgainstAvg) ?? 0).toFixed(2)) }
      : null
  ].filter(Boolean) as MatchupMetricView[];

  const leaders: MatchupMetricView[] = [
    topSkater
      ? {
          label: "Season skater",
          value: `${formatDisplayName([readString(topSkater.firstName?.default), readString(topSkater.lastName?.default)])} ${(readNumber(topSkater.points) ?? 0)} PTS | ${(readNumber(topSkater.goals) ?? 0)} G`
        }
      : null,
    topGoalie
      ? {
          label: "Season goalie",
          value: `${formatDisplayName([readString(topGoalie.firstName?.default), readString(topGoalie.lastName?.default)])} ${(readNumber(topGoalie.savePctg) ?? 0).toFixed(3)} SV%`
        }
      : null
  ].filter(Boolean) as MatchupMetricView[];

  return {
    stats,
    leaders
  };
}

function mapStatus(state: string | null | undefined) {
  const normalized = (state ?? "").toLowerCase();

  if (normalized === "in") {
    return "LIVE" as const;
  }

  if (normalized === "post") {
    return "FINAL" as const;
  }

  if (
    normalized === "postponed" ||
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "delayed"
  ) {
    return "POSTPONED" as const;
  }

  return "PREGAME" as const;
}

function formatScoreboard(competition: JsonRecord | null) {
  const competitors = Array.isArray(competition?.competitors)
    ? competition.competitors
    : [];
  const home = competitors.find(
    (entry: JsonRecord) => String(entry.homeAway ?? "").toLowerCase() === "home"
  );
  const away = competitors.find(
    (entry: JsonRecord) => String(entry.homeAway ?? "").toLowerCase() === "away"
  );
  const homeScore = readString(home?.score?.displayValue ?? home?.score);
  const awayScore = readString(away?.score?.displayValue ?? away?.score);

  if (!home || !away || !homeScore || !awayScore) {
    return null;
  }

  return `${readString(away.team?.abbreviation ?? away.team?.shortDisplayName ?? away.team?.displayName) ?? "AWAY"} ${awayScore} - ${readString(home.team?.abbreviation ?? home.team?.shortDisplayName ?? home.team?.displayName) ?? "HOME"} ${homeScore}`;
}

function extractStandingsMap(payload: JsonRecord) {
  const map = new Map<string, string>();
  const groups = Array.isArray(payload.standings?.groups)
    ? payload.standings.groups
    : [];

  for (const group of groups) {
    const entries = Array.isArray(group?.standings?.entries)
      ? group.standings.entries
      : [];
    for (const entry of entries) {
      const teamId = readString(entry?.id) ?? readString(entry?.team?.id);
      if (!teamId) {
        continue;
      }

      const wins = entry?.stats?.find?.((stat: JsonRecord) => stat.name === "wins")
        ?.displayValue;
      const losses = entry?.stats?.find?.(
        (stat: JsonRecord) => stat.name === "losses"
      )?.displayValue;
      const streak = entry?.stats?.find?.(
        (stat: JsonRecord) => stat.name === "streak"
      )?.displayValue;
      const gamesBehind = entry?.stats?.find?.(
        (stat: JsonRecord) => stat.name === "gamesBehind"
      )?.displayValue;

      const parts = [
        wins && losses ? `${wins}-${losses}` : null,
        streak ? `STRK ${streak}` : null,
        gamesBehind && gamesBehind !== "-" ? `GB ${gamesBehind}` : null,
        readString(group?.divisionHeader ?? group?.conferenceHeader ?? group?.header)
      ].filter(Boolean);

      map.set(teamId, parts.join(" | "));
    }
  }

  return map;
}

function flattenCategoryStats(payload: JsonRecord) {
  const categories = Array.isArray(payload?.results?.stats?.categories)
    ? payload.results.stats.categories
    : Array.isArray(payload?.stats?.categories)
      ? payload.stats.categories
      : [];

  return categories.flatMap((category: JsonRecord) =>
    (Array.isArray(category.stats) ? category.stats : []).map((stat: JsonRecord) => ({
      name: readString(stat.name)?.toLowerCase() ?? "",
      displayName: readString(stat.displayName)?.toLowerCase() ?? "",
      description: readString(stat.description)?.toLowerCase() ?? "",
      value:
        readString(stat.displayValue) ??
        readString(stat.perGameDisplayValue) ??
        (readNumber(stat.value)?.toFixed(1) ?? null)
    }))
  );
}

function extractSeasonStats(
  leagueKey: LeagueKey,
  payload: JsonRecord
): MatchupMetricView[] {
  const stats = flattenCategoryStats(payload);
  const blueprints = SEASON_STAT_BLUEPRINTS[leagueKey] ?? [];

  return blueprints
    .map((blueprint) => {
      const match = stats.find(
        (stat: {
          name: string;
          displayName: string;
          description: string;
          value: string | null;
        }) =>
        blueprint.terms.some((term) => {
          const normalizedTerm = term.toLowerCase();
          return (
            stat.name.includes(normalizedTerm) ||
            stat.displayName.includes(normalizedTerm) ||
            stat.description.includes(normalizedTerm)
          );
        })
      );

      if (!match?.value) {
        return null;
      }

      return {
        label: blueprint.label,
        value: match.value
      } satisfies MatchupMetricView;
    })
    .filter(Boolean)
    .slice(0, 6) as MatchupMetricView[];
}

function extractRecentResults(teamId: string, payload: JsonRecord) {
  const events = Array.isArray(payload.events) ? payload.events : [];

  return events
    .map((event: JsonRecord) => {
      const competition = Array.isArray(event.competitions)
        ? event.competitions[0]
        : null;
      const competitors = Array.isArray(competition?.competitors)
        ? competition.competitors
        : [];
      const team = competitors.find(
        (entry: JsonRecord) => String(entry.team?.id ?? entry.id) === teamId
      );
      const opponent = competitors.find(
        (entry: JsonRecord) => String(entry.team?.id ?? entry.id) !== teamId
      );
      const completed = Boolean(
        competition?.status?.type?.completed ?? event.status?.type?.completed ?? false
      );
      if (!team || !opponent || !completed) {
        return null;
      }

      const teamScore = readNumber(team.score?.value ?? team.score);
      const opponentScore = readNumber(opponent.score?.value ?? opponent.score);
      if (teamScore === null || opponentScore === null) {
        return null;
      }

      const margin = teamScore - opponentScore;
      const eventDate =
        readString(event.date) ??
        readString(competition?.date) ??
        null;
      const sortTimestamp = eventDate ? Date.parse(eventDate) : Number.NaN;

      return {
        id:
          readString(event.id) ??
          readString(competition?.id) ??
          `${teamId}-${readString(event.date) ?? "recent"}`,
        label: `${readString(team.homeAway)?.toLowerCase() === "home" ? "vs" : "at"} ${readString(opponent.team?.displayName ?? opponent.team?.shortDisplayName ?? opponent.team?.name) ?? "Opponent"}`,
        result: `${margin >= 0 ? "W" : "L"} ${teamScore}-${opponentScore}`,
        note: eventDate?.slice(0, 10) ?? "Recent final",
        sortTimestamp
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime =
        typeof left?.sortTimestamp === "number" && Number.isFinite(left.sortTimestamp)
          ? left.sortTimestamp
          : -Infinity;
      const rightTime =
        typeof right?.sortTimestamp === "number" && Number.isFinite(right.sortTimestamp)
          ? right.sortTimestamp
          : -Infinity;

      return rightTime - leftTime;
    })
    .slice(0, 5) as MatchupParticipantPanel["recentResults"];
}

function extractLiveTeamStats(
  leagueKey: LeagueKey,
  competition: JsonRecord | null,
  teamId: string,
  payload: JsonRecord
) {
  const blueprints = LIVE_TEAM_STAT_BLUEPRINTS[leagueKey] ?? [];
  const competitors = Array.isArray(competition?.competitors)
    ? competition.competitors
    : [];
  const competitor = competitors.find(
    (entry: JsonRecord) => String(entry.team?.id ?? entry.id) === teamId
  );
  const competitorStats = Array.isArray(competitor?.statistics)
    ? competitor.statistics
    : [];
  const boxscoreTeams = Array.isArray(payload.boxscore?.teams) ? payload.boxscore.teams : [];
  const teamBox = boxscoreTeams.find(
    (entry: JsonRecord) => String(entry.team?.id ?? "") === teamId
  );
  const boxscoreStats = Array.isArray(teamBox?.statistics) ? teamBox.statistics : [];

  return blueprints
    .map((blueprint) => {
      const match = [...competitorStats, ...boxscoreStats].find((stat: JsonRecord) => {
        const fields = [
          normalizeStatKey(stat.name),
          normalizeStatKey(stat.label),
          normalizeStatKey(stat.abbreviation),
          normalizeStatKey(stat.displayName)
        ];

        return blueprint.terms.some((term) => {
          const normalizedTerm = normalizeStatKey(term);
          return fields.some((field) => field.includes(normalizedTerm));
        });
      });
      const value = readString(match?.displayValue ?? match?.value);
      if (!value) {
        return null;
      }

      return {
        label: blueprint.label,
        value
      } satisfies MatchupMetricView;
    })
    .filter(Boolean) as MatchupMetricView[];
}

function extractDetailedBoxscoreTeamStats(
  leagueKey: LeagueKey,
  competition: JsonRecord | null,
  teamId: string,
  payload: JsonRecord
) {
  const blueprints = FULL_BOX_SCORE_BLUEPRINTS[leagueKey] ?? LIVE_TEAM_STAT_BLUEPRINTS[leagueKey] ?? [];
  const competitors = Array.isArray(competition?.competitors)
    ? competition.competitors
    : [];
  const competitor = competitors.find(
    (entry: JsonRecord) => String(entry.team?.id ?? entry.id) === teamId
  );
  const competitorStats = Array.isArray(competitor?.statistics)
    ? competitor.statistics
    : [];
  const boxscoreTeams = Array.isArray(payload.boxscore?.teams) ? payload.boxscore.teams : [];
  const teamBox = boxscoreTeams.find(
    (entry: JsonRecord) => String(entry.team?.id ?? "") === teamId
  );
  const boxscoreStats = Array.isArray(teamBox?.statistics) ? teamBox.statistics : [];

  return blueprints
    .map((blueprint) => {
      const match = [...boxscoreStats, ...competitorStats].find((stat: JsonRecord) => {
        const fields = [
          normalizeStatKey(stat.name),
          normalizeStatKey(stat.label),
          normalizeStatKey(stat.abbreviation),
          normalizeStatKey(stat.displayName)
        ];

        return blueprint.terms.some((term) => {
          const normalizedTerm = normalizeStatKey(term);
          return fields.some((field) => field.includes(normalizedTerm));
        });
      });
      const value = readString(match?.displayValue ?? match?.value);
      if (!value) {
        return null;
      }

      return {
        label: blueprint.label,
        value
      } satisfies MatchupMetricView;
    })
    .filter(Boolean) as MatchupMetricView[];
}

function findStatIndex(keys: unknown[], terms: string[]) {
  const normalizedTerms = terms.map(normalizeStatKey);

  return keys.findIndex((key) => {
    const normalizedKey = normalizeStatKey(key);
    return normalizedTerms.some((term) => normalizedKey.includes(term));
  });
}

function extractBasketballPlayerSpotlights(teamId: string, payload: JsonRecord) {
  const boxscorePlayers = Array.isArray(payload.boxscore?.players)
    ? payload.boxscore.players
    : [];
  const teamBox = boxscorePlayers.find(
    (entry: JsonRecord) => String(entry.team?.id ?? "") === teamId
  );
  const statBlock = Array.isArray(teamBox?.statistics) ? teamBox.statistics[0] : null;
  const keys = Array.isArray(statBlock?.keys) ? statBlock.keys : [];
  const athletes = Array.isArray(statBlock?.athletes) ? statBlock.athletes : [];

  const pointsIndex = findStatIndex(keys, ["points", "pts"]);
  const reboundsIndex = findStatIndex(keys, ["rebounds", "reb"]);
  const assistsIndex = findStatIndex(keys, ["assists", "ast"]);
  const minutesIndex = findStatIndex(keys, ["minutes", "min"]);
  const fgIndex = findStatIndex(keys, ["fieldgoalsmadefieldgoalsattempted", "fg"]);
  const threePointIndex = findStatIndex(keys, ["threepointfieldgoalsmadethreepointfieldgoalsattempted", "3pt"]);

  return athletes
    .map((athleteEntry: JsonRecord) => {
      const stats = Array.isArray(athleteEntry.stats) ? athleteEntry.stats : [];
      const points = pointsIndex >= 0 ? readNumber(stats[pointsIndex]) ?? 0 : 0;
      const rebounds =
        reboundsIndex >= 0 ? readNumber(stats[reboundsIndex]) ?? 0 : 0;
      const assists =
        assistsIndex >= 0 ? readNumber(stats[assistsIndex]) ?? 0 : 0;
      const minutes = minutesIndex >= 0 ? readString(stats[minutesIndex]) : null;
      const fg = fgIndex >= 0 ? readString(stats[fgIndex]) : null;
      const threePoint = threePointIndex >= 0 ? readString(stats[threePointIndex]) : null;

      const parts = [
        `${points} PTS`,
        `${rebounds} REB`,
        `${assists} AST`,
        fg ? `FG ${fg}` : null,
        threePoint ? `3PT ${threePoint}` : null,
        minutes ? `${minutes} MIN` : null
      ].filter(Boolean);

      return {
        name: readString(athleteEntry.athlete?.displayName) ?? "Player",
        line: parts.join(" | "),
        score: points + rebounds * 0.7 + assists * 0.7
      } as {
        name: string;
        line: string;
        score: number;
      };
    })
    .sort(
      (
        left: {
          name: string;
          line: string;
          score: number;
        },
        right: {
          name: string;
          line: string;
          score: number;
        }
      ) => right.score - left.score
    )
    .slice(0, 3)
    .map((entry: { name: string; line: string }) => ({
      label: entry.name,
      value: entry.line
    }));
}

function extractBasketballBoxscoreRows(teamId: string, payload: JsonRecord) {
  const boxscorePlayers = Array.isArray(payload.boxscore?.players)
    ? payload.boxscore.players
    : [];
  const teamBox = boxscorePlayers.find(
    (entry: JsonRecord) => String(entry.team?.id ?? "") === teamId
  );
  const statBlock = Array.isArray(teamBox?.statistics) ? teamBox.statistics[0] : null;
  const keys = Array.isArray(statBlock?.keys) ? statBlock.keys : [];
  const athletes = Array.isArray(statBlock?.athletes) ? statBlock.athletes : [];

  return athletes
    .map((athleteEntry: JsonRecord) =>
      buildAthleteBoxscoreRow({
        athleteEntry,
        keys,
        idPrefix: `${teamId}-basketball`,
        items: [
          { label: "MIN", terms: ["minutes", "min"] },
          { label: "PTS", terms: ["points", "pts"] },
          { label: "REB", terms: ["rebounds", "reb"] },
          { label: "AST", terms: ["assists", "ast"] },
          { label: "FG", terms: ["fieldgoalsmadefieldgoalsattempted", "fg"] },
          { label: "3PT", terms: ["threepointfieldgoalsmadethreepointfieldgoalsattempted", "3pt"] },
          { label: "FT", terms: ["freethrowsmadefreethrowsattempted", "ft"] },
          { label: "STL", terms: ["steals", "stl"] },
          { label: "BLK", terms: ["blocks", "blk"] },
          { label: "TO", terms: ["turnovers", "to"] }
        ]
      })
    )
    .filter(Boolean) as MatchupBoxscoreRow[];
}

function buildAthleteLine(args: {
  athleteEntry: JsonRecord;
  keys: unknown[];
  items: Array<{ label: string; terms: string[] }>;
}) {
  const stats = Array.isArray(args.athleteEntry.stats) ? args.athleteEntry.stats : [];
  const parts = args.items
    .map((item) => {
      const index = findStatIndex(args.keys, item.terms);
      const value = index >= 0 ? readString(stats[index]) : null;
      return value ? `${value} ${item.label}` : null;
    })
    .filter(Boolean);

  if (!parts.length) {
    return null;
  }

  return {
    label: readString(args.athleteEntry.athlete?.displayName) ?? "Player",
    value: parts.join(" | ")
  } satisfies MatchupMetricView;
}

function buildAthleteBoxscoreRow(args: {
  athleteEntry: JsonRecord;
  keys: unknown[];
  items: Array<{ label: string; terms: string[] }>;
  idPrefix: string;
}) {
  const stats = Array.isArray(args.athleteEntry.stats) ? args.athleteEntry.stats : [];
  const metrics = args.items
    .map((item) => {
      const index = findStatIndex(args.keys, item.terms);
      const value = index >= 0 ? readString(stats[index]) : null;
      if (!value) {
        return null;
      }

      return {
        label: item.label,
        value
      } satisfies MatchupMetricView;
    })
    .filter(Boolean) as MatchupMetricView[];

  if (!metrics.length) {
    return null;
  }

  const athleteId =
    readString(args.athleteEntry.athlete?.id) ??
    readString(args.athleteEntry.athlete?.uid) ??
    readString(args.athleteEntry.athlete?.guid) ??
    readString(args.athleteEntry.athlete?.displayName) ??
    `${args.idPrefix}-athlete`;

  return {
    id: `${args.idPrefix}-${normalizeStatKey(athleteId)}`,
    playerName: readString(args.athleteEntry.athlete?.displayName) ?? "Player",
    position:
      readString(args.athleteEntry.athlete?.position?.abbreviation) ??
      readString(args.athleteEntry.athlete?.position?.displayName) ??
      null,
    metrics
  } satisfies MatchupBoxscoreRow;
}

function extractMlbPlayerSpotlights(teamId: string, payload: JsonRecord) {
  const teamBox = (Array.isArray(payload.boxscore?.players) ? payload.boxscore.players : []).find(
    (entry: JsonRecord) => String(entry.team?.id ?? "") === teamId
  );
  const blocks = Array.isArray(teamBox?.statistics) ? teamBox.statistics : [];
  const batting = blocks.find((block: JsonRecord) => normalizeStatKey(block.type) === "batting");
  const pitching = blocks.find((block: JsonRecord) => normalizeStatKey(block.type) === "pitching");

  const hitters = Array.isArray(batting?.athletes)
    ? batting.athletes
        .map((entry: JsonRecord) => ({
          entry,
          runsBattedIn:
            (findStatIndex(batting.keys ?? [], ["rbis", "rbi"]) >= 0
              ? readNumber(entry.stats?.[findStatIndex(batting.keys ?? [], ["rbis", "rbi"])])
              : null) ?? 0,
          hits:
            (findStatIndex(batting.keys ?? [], ["hits"]) >= 0
              ? readNumber(entry.stats?.[findStatIndex(batting.keys ?? [], ["hits"])])
              : null) ?? 0
        }))
        .sort(
          (
            left: { entry: JsonRecord; runsBattedIn: number; hits: number },
            right: { entry: JsonRecord; runsBattedIn: number; hits: number }
          ) => right.runsBattedIn - left.runsBattedIn || right.hits - left.hits
        )
        .slice(0, 2)
    : [];
  const pitchers = Array.isArray(pitching?.athletes)
    ? pitching.athletes
        .map((entry: JsonRecord) => ({
          entry,
          strikeouts:
            (findStatIndex(pitching.keys ?? [], ["strikeouts", "k"]) >= 0
              ? readNumber(entry.stats?.[findStatIndex(pitching.keys ?? [], ["strikeouts", "k"])])
              : null) ?? 0
        }))
        .sort(
          (
            left: { entry: JsonRecord; strikeouts: number },
            right: { entry: JsonRecord; strikeouts: number }
          ) => right.strikeouts - left.strikeouts
        )
        .slice(0, 2)
    : [];

  return [
    ...hitters.map((hitter: { entry: JsonRecord; runsBattedIn: number; hits: number }) =>
      buildAthleteLine({
          athleteEntry: hitter.entry,
          keys: batting?.keys ?? [],
          items: [
            { label: "H", terms: ["hits"] },
            { label: "RBI", terms: ["rbis", "rbi"] },
            { label: "R", terms: ["runs"] },
            { label: "HR", terms: ["homeruns", "hr"] },
            { label: "AVG", terms: ["avg", "battingaverage"] }
          ]
        })
    ),
    ...pitchers.map((pitcher: { entry: JsonRecord; strikeouts: number }) =>
      buildAthleteLine({
          athleteEntry: pitcher.entry,
          keys: pitching?.keys ?? [],
          items: [
            { label: "IP", terms: ["fullinningspartinnings", "inningspitched", "ip"] },
            { label: "K", terms: ["strikeouts", "k"] },
            { label: "ER", terms: ["earnedruns", "er"] },
            { label: "BB", terms: ["walks", "bb"] },
            { label: "H", terms: ["hits", "h"] }
          ]
        })
    )
  ].filter(Boolean) as MatchupMetricView[];
}

function extractMlbBoxscoreRows(teamId: string, payload: JsonRecord) {
  const teamBox = (Array.isArray(payload.boxscore?.players) ? payload.boxscore.players : []).find(
    (entry: JsonRecord) => String(entry.team?.id ?? "") === teamId
  );
  const blocks = Array.isArray(teamBox?.statistics) ? teamBox.statistics : [];
  const batting = blocks.find((block: JsonRecord) => normalizeStatKey(block.type) === "batting");
  const pitching = blocks.find((block: JsonRecord) => normalizeStatKey(block.type) === "pitching");

  const battingRows = (Array.isArray(batting?.athletes) ? batting.athletes : [])
    .map((athleteEntry: JsonRecord) =>
      buildAthleteBoxscoreRow({
        athleteEntry,
        keys: batting?.keys ?? [],
        idPrefix: `${teamId}-mlb-bat`,
        items: [
          { label: "AB", terms: ["atbats", "ab"] },
          { label: "R", terms: ["runs", "r"] },
          { label: "H", terms: ["hits", "h"] },
          { label: "RBI", terms: ["rbis", "rbi"] },
          { label: "HR", terms: ["homeruns", "hr"] },
          { label: "BB", terms: ["walks", "bb"] },
          { label: "SO", terms: ["strikeouts", "so", "k"] },
          { label: "AVG", terms: ["avg", "battingaverage"] }
        ]
      })
    )
    .filter(Boolean) as MatchupBoxscoreRow[];

  const pitchingRows = (Array.isArray(pitching?.athletes) ? pitching.athletes : [])
    .map((athleteEntry: JsonRecord) =>
      buildAthleteBoxscoreRow({
        athleteEntry,
        keys: pitching?.keys ?? [],
        idPrefix: `${teamId}-mlb-pit`,
        items: [
          { label: "IP", terms: ["fullinningspartinnings", "inningspitched", "ip"] },
          { label: "H", terms: ["hits", "h"] },
          { label: "ER", terms: ["earnedruns", "er"] },
          { label: "BB", terms: ["walks", "bb"] },
          { label: "SO", terms: ["strikeouts", "k"] },
          { label: "HR", terms: ["homeruns", "hr"] },
          { label: "PC", terms: ["pitchesstrikes", "pitchcount", "pc"] }
        ]
      })
    )
    .filter(Boolean) as MatchupBoxscoreRow[];

  return [...battingRows, ...pitchingRows];
}

function extractHockeyPlayerSpotlights(teamId: string, payload: JsonRecord) {
  const teamBox = (Array.isArray(payload.boxscore?.players) ? payload.boxscore.players : []).find(
    (entry: JsonRecord) => String(entry.team?.id ?? "") === teamId
  );
  const blocks = Array.isArray(teamBox?.statistics) ? teamBox.statistics : [];
  const skaters =
    blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "skaters") ??
    blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "forwards");
  const goalies = blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "goalies");

  const topSkaters = Array.isArray(skaters?.athletes)
    ? skaters.athletes
        .map((entry: JsonRecord) => ({
          entry,
          goals:
            (findStatIndex(skaters.keys ?? [], ["goals", "g"]) >= 0
              ? readNumber(entry.stats?.[findStatIndex(skaters.keys ?? [], ["goals", "g"])])
              : null) ?? 0,
          assists:
            (findStatIndex(skaters.keys ?? [], ["assists", "a"]) >= 0
              ? readNumber(entry.stats?.[findStatIndex(skaters.keys ?? [], ["assists", "a"])])
              : null) ?? 0,
          shots:
            (findStatIndex(skaters.keys ?? [], ["shotstotal", "s"]) >= 0
              ? readNumber(entry.stats?.[findStatIndex(skaters.keys ?? [], ["shotstotal", "s"])])
              : null) ?? 0
        }))
        .sort(
          (
            left: { entry: JsonRecord; goals: number; assists: number; shots: number },
            right: { entry: JsonRecord; goals: number; assists: number; shots: number }
          ) =>
            right.goals + right.assists - (left.goals + left.assists) || right.shots - left.shots
        )
        .slice(0, 2)
    : [];
  const topGoalie = Array.isArray(goalies?.athletes) ? goalies.athletes[0] : null;

  return [
    ...topSkaters.map((topSkater: { entry: JsonRecord; goals: number; assists: number; shots: number }) =>
      buildAthleteLine({
          athleteEntry: topSkater.entry,
          keys: skaters?.keys ?? [],
          items: [
            { label: "G", terms: ["goals", "g"] },
            { label: "A", terms: ["assists", "a"] },
            { label: "S", terms: ["shotstotal", "s"] }
          ]
        })
    ),
    topGoalie
      ? buildAthleteLine({
          athleteEntry: topGoalie,
          keys: goalies?.keys ?? [],
          items: [
            { label: "SV", terms: ["saves", "sv"] },
            { label: "SV%", terms: ["savepct", "sv%"] },
            { label: "GA", terms: ["goalsagainst", "ga"] },
            { label: "SA", terms: ["shotsagainst", "sa"] }
          ]
        })
      : null
  ].filter(Boolean) as MatchupMetricView[];
}

function extractHockeyBoxscoreRows(teamId: string, payload: JsonRecord) {
  const teamBox = (Array.isArray(payload.boxscore?.players) ? payload.boxscore.players : []).find(
    (entry: JsonRecord) => String(entry.team?.id ?? "") === teamId
  );
  const blocks = Array.isArray(teamBox?.statistics) ? teamBox.statistics : [];
  const skaters =
    blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "skaters") ??
    blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "forwards");
  const goalies = blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "goalies");

  const skaterRows = (Array.isArray(skaters?.athletes) ? skaters.athletes : [])
    .map((athleteEntry: JsonRecord) =>
      buildAthleteBoxscoreRow({
        athleteEntry,
        keys: skaters?.keys ?? [],
        idPrefix: `${teamId}-nhl-skater`,
        items: [
          { label: "TOI", terms: ["timeonice", "toi"] },
          { label: "G", terms: ["goals", "g"] },
          { label: "A", terms: ["assists", "a"] },
          { label: "PTS", terms: ["points", "pts"] },
          { label: "S", terms: ["shotstotal", "s"] },
          { label: "+/-", terms: ["plusminus"] },
          { label: "HIT", terms: ["hits", "ht"] },
          { label: "BLK", terms: ["blockedshots", "bs"] }
        ]
      })
    )
    .filter(Boolean) as MatchupBoxscoreRow[];

  const goalieRows = (Array.isArray(goalies?.athletes) ? goalies.athletes : [])
    .map((athleteEntry: JsonRecord) =>
      buildAthleteBoxscoreRow({
        athleteEntry,
        keys: goalies?.keys ?? [],
        idPrefix: `${teamId}-nhl-goalie`,
        items: [
          { label: "TOI", terms: ["timeonice", "toi"] },
          { label: "SV", terms: ["saves", "sv"] },
          { label: "SV%", terms: ["savepct", "sv%"] },
          { label: "GA", terms: ["goalsagainst", "ga"] },
          { label: "SA", terms: ["shotsagainst", "sa"] }
        ]
      })
    )
    .filter(Boolean) as MatchupBoxscoreRow[];

  return [...skaterRows, ...goalieRows];
}

function extractFootballPlayerSpotlights(teamId: string, payload: JsonRecord) {
  const teamBox = (Array.isArray(payload.boxscore?.players) ? payload.boxscore.players : []).find(
    (entry: JsonRecord) => String(entry.team?.id ?? "") === teamId
  );
  const blocks = Array.isArray(teamBox?.statistics) ? teamBox.statistics : [];
  const passing = blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "passing");
  const rushing = blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "rushing");
  const receiving = blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "receiving");

  const topPasser = Array.isArray(passing?.athletes) ? passing.athletes[0] : null;
  const topRusher = Array.isArray(rushing?.athletes) ? rushing.athletes[0] : null;
  const topReceiver = Array.isArray(receiving?.athletes) ? receiving.athletes[0] : null;
  const defensive =
    blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "defensive") ??
    blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "defense");
  const topDefender = Array.isArray(defensive?.athletes) ? defensive.athletes[0] : null;

  const kicking = blocks.find((block: JsonRecord) => normalizeStatKey(block.name) === "kicking");
  const topKicker = Array.isArray(kicking?.athletes) ? kicking.athletes[0] : null;

  return [
    topPasser
      ? buildAthleteLine({
          athleteEntry: topPasser,
          keys: passing?.keys ?? [],
          items: [
            { label: "CMP", terms: ["completions", "cmp"] },
            { label: "ATT", terms: ["attempts", "att"] },
            { label: "YDS", terms: ["passingyards", "yds"] },
            { label: "TD", terms: ["passingtouchdowns", "td"] },
            { label: "INT", terms: ["interceptions", "int"] }
          ]
        })
      : null,
    topRusher
      ? buildAthleteLine({
          athleteEntry: topRusher,
          keys: rushing?.keys ?? [],
          items: [
            { label: "CAR", terms: ["rushingattempts", "car"] },
            { label: "YDS", terms: ["rushingyards", "yds"] },
            { label: "TD", terms: ["rushingtouchdowns", "td"] }
          ]
        })
      : null,
    topReceiver
      ? buildAthleteLine({
          athleteEntry: topReceiver,
          keys: receiving?.keys ?? [],
          items: [
            { label: "REC", terms: ["receptions", "rec"] },
            { label: "YDS", terms: ["receivingyards", "yds"] },
            { label: "TD", terms: ["receivingtouchdowns", "td"] }
          ]
        })
      : null,
    topDefender
      ? buildAthleteLine({
          athleteEntry: topDefender,
          keys: defensive?.keys ?? [],
          items: [
            { label: "TCK", terms: ["totaltackles", "tackles"] },
            { label: "SACK", terms: ["sacks", "sack"] },
            { label: "TFL", terms: ["tacklesforloss", "tfl"] }
          ]
        })
      : null,
    topKicker
      ? buildAthleteLine({
          athleteEntry: topKicker,
          keys: kicking?.keys ?? [],
          items: [
            { label: "FG", terms: ["fieldgoalsmadefieldgoalsattempted", "fg"] },
            { label: "XP", terms: ["extrapointsmadeextrapointsattempted", "xp"] },
            { label: "PTS", terms: ["points", "pts"] }
          ]
        })
      : null
  ].filter(Boolean) as MatchupMetricView[];
}

function extractFootballBoxscoreRows(teamId: string, payload: JsonRecord) {
  const teamBox = (Array.isArray(payload.boxscore?.players) ? payload.boxscore.players : []).find(
    (entry: JsonRecord) => String(entry.team?.id ?? "") === teamId
  );
  const blocks = Array.isArray(teamBox?.statistics) ? teamBox.statistics : [];

  return blocks.flatMap((block: JsonRecord) => {
    const blockName = normalizeStatKey(block.name);
    const athletes = Array.isArray(block.athletes) ? block.athletes : [];
    const items =
      blockName === "passing"
        ? [
            { label: "CMP", terms: ["completions", "cmp"] },
            { label: "ATT", terms: ["attempts", "att"] },
            { label: "YDS", terms: ["passingyards", "yds"] },
            { label: "TD", terms: ["passingtouchdowns", "td"] },
            { label: "INT", terms: ["interceptions", "int"] }
          ]
        : blockName === "rushing"
          ? [
              { label: "CAR", terms: ["rushingattempts", "car"] },
              { label: "YDS", terms: ["rushingyards", "yds"] },
              { label: "AVG", terms: ["yardsperrushattempt", "avg"] },
              { label: "TD", terms: ["rushingtouchdowns", "td"] }
            ]
          : blockName === "receiving"
            ? [
                { label: "REC", terms: ["receptions", "rec"] },
                { label: "YDS", terms: ["receivingyards", "yds"] },
                { label: "AVG", terms: ["yardsperreception", "avg"] },
                { label: "TD", terms: ["receivingtouchdowns", "td"] }
              ]
            : blockName === "defensive" || blockName === "defense"
              ? [
                  { label: "TCK", terms: ["totaltackles", "tackles"] },
                  { label: "SACK", terms: ["sacks", "sack"] },
                  { label: "TFL", terms: ["tacklesforloss", "tfl"] },
                  { label: "FF", terms: ["forcedfumbles", "ff"] }
                ]
              : blockName === "kicking"
                ? [
                    { label: "FG", terms: ["fieldgoalsmadefieldgoalsattempted", "fg"] },
                    { label: "XP", terms: ["extrapointsmadeextrapointsattempted", "xp"] },
                    { label: "PTS", terms: ["points", "pts"] }
                  ]
                : [];

    if (!items.length || !athletes.length) {
      return [];
    }

    return athletes
      .map((athleteEntry: JsonRecord) =>
        buildAthleteBoxscoreRow({
          athleteEntry,
          keys: block.keys ?? [],
          idPrefix: `${teamId}-football-${blockName}`,
          items
        })
      )
      .filter(Boolean) as MatchupBoxscoreRow[];
  });
}

function extractFullPlayerBoxscoreRows(
  leagueKey: LeagueKey,
  teamId: string,
  payload: JsonRecord
) {
  if (leagueKey === "NBA" || leagueKey === "NCAAB") {
    return extractBasketballBoxscoreRows(teamId, payload);
  }

  if (leagueKey === "MLB") {
    return extractMlbBoxscoreRows(teamId, payload);
  }

  if (leagueKey === "NHL") {
    return extractHockeyBoxscoreRows(teamId, payload);
  }

  if (leagueKey === "NFL" || leagueKey === "NCAAF") {
    return extractFootballBoxscoreRows(teamId, payload);
  }

  return [];
}

function extractLiveBoxscoreDetails(
  leagueKey: LeagueKey,
  competition: JsonRecord | null,
  teamId: string,
  payload: JsonRecord
) {
  const teamStrip = extractDetailedBoxscoreTeamStats(leagueKey, competition, teamId, payload);
  const playerSpotlights =
    leagueKey === "NBA" || leagueKey === "NCAAB"
      ? extractBasketballPlayerSpotlights(teamId, payload)
      : leagueKey === "MLB"
        ? extractMlbPlayerSpotlights(teamId, payload)
        : leagueKey === "NHL"
          ? extractHockeyPlayerSpotlights(teamId, payload)
          : leagueKey === "NFL" || leagueKey === "NCAAF"
            ? extractFootballPlayerSpotlights(teamId, payload)
            : [];

  return takeMetrics(
    [...teamStrip, ...playerSpotlights],
    SPORT_BOXSCORE_LIMITS[leagueKey] ?? 6
  );
}

function extractCompetitorLeaders(competition: JsonRecord | null, teamId: string) {
  const competitors = Array.isArray(competition?.competitors)
    ? competition.competitors
    : [];
  const competitor = competitors.find(
    (entry: JsonRecord) => String(entry.team?.id ?? entry.id) === teamId
  );
  const leaders = Array.isArray(competitor?.leaders) ? competitor.leaders : [];

  return leaders.slice(0, 3).map((leader: JsonRecord) => {
    const top = Array.isArray(leader.leaders) ? leader.leaders[0] : null;

    return {
      label:
        readString(leader.displayName ?? leader.abbreviation ?? leader.name) ??
        "Leader",
      value: `${readString(top?.athlete?.displayName ?? top?.athlete?.shortName) ?? "Leader"} ${readString(top?.displayValue) ?? ""}`.trim()
    } satisfies MatchupMetricView;
  });
}

function extractOddsSummary(payload: JsonRecord) {
  const pick = Array.isArray(payload.pickcenter) ? payload.pickcenter[0] : null;
  const odds = Array.isArray(payload.odds) ? payload.odds[0] : null;

  const spreadCandidate = readString(pick?.details ?? odds?.details);
  const normalizedSpread =
    spreadCandidate && (() => {
      const match = spreadCandidate.match(/([+-]?\d+(?:\.\d+)?)/);
      if (!match) {
        return null;
      }

      const line = Number(match[1]);
      if (!Number.isFinite(line) || Math.abs(line) > 25) {
        return null;
      }

      return spreadCandidate;
    })();

  const awayMoneyline =
    readString(pick?.awayTeamOdds?.moneyLine ?? odds?.awayTeamOdds?.moneyLine) ??
    null;
  const homeMoneyline =
    readString(pick?.homeTeamOdds?.moneyLine ?? odds?.homeTeamOdds?.moneyLine) ??
    null;

  return {
    bestSpread: normalizedSpread,
    bestMoneyline:
      awayMoneyline || homeMoneyline
        ? `Away ${awayMoneyline ?? "--"} | Home ${homeMoneyline ?? "--"}`
        : null,
    bestTotal: readString(pick?.overUnder ?? odds?.overUnder),
    sourceLabel: readString(pick?.provider?.name ?? odds?.provider?.name)
  };
}

function mapParticipantPanel(args: {
  leagueKey: LeagueKey;
  competition: JsonRecord | null;
  competitor: JsonRecord;
  teamStats: MatchupMetricView[];
  statSourceNote?: string | null;
  recentResults: MatchupParticipantPanel["recentResults"];
  boxscoreRows: MatchupBoxscoreRow[];
  standingsMap: Map<string, string>;
  boxscore: MatchupMetricView[];
  leaderFallback: MatchupMetricView[];
}) {
  const team = args.competitor.team ?? {};
  const teamId =
    readString(team.id) ??
    readString(args.competitor.id) ??
    `${readString(team.displayName) ?? "team"}-panel`;
  const competitionLeaders = extractCompetitorLeaders(args.competition, teamId);
  const homeAway = String(args.competitor.homeAway ?? "").toLowerCase();
  const recordSummary =
    readString(args.competitor.records?.[0]?.summary) ??
    args.standingsMap.get(teamId) ??
    null;

  return {
    id: teamId,
    name:
      readString(team.displayName ?? team.shortDisplayName ?? team.name) ?? "Team",
    abbreviation: readString(team.abbreviation),
    role:
      homeAway === "home"
        ? "HOME"
        : homeAway === "away"
          ? "AWAY"
          : "UNKNOWN",
    record: recordSummary,
    score: readString(args.competitor.score?.displayValue ?? args.competitor.score),
    isWinner:
      typeof args.competitor.winner === "boolean" ? args.competitor.winner : null,
    subtitle: readString(team.location),
    stats: args.teamStats,
    leaders: competitionLeaders.length ? competitionLeaders : args.leaderFallback,
    boxscore: args.boxscore,
    boxscoreRows: args.boxscoreRows,
    recentResults: args.recentResults,
    notes: [
      args.teamStats.length
        ? args.statSourceNote ?? "Season profile is coming from ESPN team statistics."
        : "Season team stat coverage was not available from ESPN for this event."
    ]
  } satisfies MatchupParticipantPanel;
}

function buildTrendCards(participants: MatchupParticipantPanel[]) {
  return participants.slice(0, 2).flatMap((participant) => {
    if (!participant.recentResults.length) {
      return [];
    }

    const wins = participant.recentResults.filter((result) =>
      result.result.startsWith("W")
    ).length;

    return [
      {
        id: `${participant.id}-form`,
        title: `${participant.abbreviation ?? participant.name} recent form`,
        value: `${wins}-${participant.recentResults.length - wins}`,
        note: "Computed from the latest completed games returned by the ESPN team schedule feed.",
        tone:
          wins >= Math.ceil(participant.recentResults.length / 2)
            ? "success"
            : "muted"
      } satisfies MatchupDetailPayload["trendCards"][number]
    ];
  });
}

export const espnMatchupStatsProvider: MatchupStatsProvider = {
  key: "espn-stats",
  label: "ESPN summary + team stats",
  kind: "LIVE",
  supportsLeague(leagueKey) {
    return Boolean(ESPN_LEAGUE_PATHS[leagueKey]);
  },
  async fetchMatchupDetail({ leagueKey, eventId }) {
    const leaguePath = ESPN_LEAGUE_PATHS[leagueKey];
    if (!leaguePath) {
      return null;
    }

    const summary = await fetchEspnJson<JsonRecord>(
      `${leaguePath}/summary?event=${eventId}`
    );
    const competition =
      (Array.isArray(summary.header?.competitions)
        ? summary.header.competitions[0]
        : null) ??
      (Array.isArray(summary.competitions) ? summary.competitions[0] : null);
    const competitors = Array.isArray(competition?.competitors)
      ? competition.competitors
      : [];

    if (competitors.length < 2) {
      return null;
    }

    const standingsMap = extractStandingsMap(summary);
    const teamIds = competitors
      .map((competitor: JsonRecord) => readString(competitor.team?.id ?? competitor.id))
      .filter(Boolean) as string[];

    const statPayloads = await Promise.allSettled(
      teamIds.map((teamId) =>
        fetchEspnJson<JsonRecord>(`${leaguePath}/teams/${teamId}/statistics`)
      )
    );
    const schedulePayloads = await Promise.allSettled(
      teamIds.map((teamId) =>
        fetchEspnJson<JsonRecord>(`${leaguePath}/teams/${teamId}/schedule`)
      )
    );
    const enrichmentPayloads = await Promise.allSettled(
      competitors.map((competitor: JsonRecord) => {
        const team = competitor.team ?? {};
        const name =
          readString(team.displayName ?? team.shortDisplayName ?? team.name) ?? "Team";
        const abbreviation = readString(team.abbreviation);
        const startTime =
          readString(summary.header?.competitions?.[0]?.date ?? competition?.date) ??
          new Date().toISOString();

        if (leagueKey === "MLB") {
          return fetchMlbEnrichment({
            teamName: name,
            abbreviation,
            startTime
          });
        }

        if (leagueKey === "NHL") {
          return fetchNhlEnrichment({
            abbreviation,
            startTime
          });
        }

        return Promise.resolve(null);
      })
    );

    const participantPanels: MatchupParticipantPanel[] = competitors.map(
      (competitor: JsonRecord, index: number) => {
        const teamId = teamIds[index] ?? "";
        const espnTeamStats =
          statPayloads[index]?.status === "fulfilled"
            ? extractSeasonStats(leagueKey, statPayloads[index].value)
            : [];
        const enrichment =
          enrichmentPayloads[index]?.status === "fulfilled"
            ? enrichmentPayloads[index].value
            : null;
        const teamStats = mergeMetrics(
          enrichment?.stats ?? [],
          espnTeamStats
        );
        const recentResults =
          schedulePayloads[index]?.status === "fulfilled"
            ? extractRecentResults(teamId, schedulePayloads[index].value)
            : [];
        const boxscore = extractLiveBoxscoreDetails(leagueKey, competition, teamId, summary);
        const boxscoreRows = extractFullPlayerBoxscoreRows(leagueKey, teamId, summary);
        const leaderFallback = mergeMetrics(
          boxscore,
          enrichment?.leaders ?? []
        );

        return mapParticipantPanel({
          leagueKey,
          competition,
          competitor,
          teamStats,
          statSourceNote:
            leagueKey === "MLB"
              ? "Season profile is blended from MLB StatsAPI and ESPN summary context."
              : leagueKey === "NHL"
                ? "Season profile is blended from the NHL API and ESPN summary context."
                : "Season profile is coming from ESPN team statistics.",
          recentResults,
          boxscoreRows,
          standingsMap,
          boxscore,
          leaderFallback
        });
      }
    );

    const away =
      participantPanels.find(
        (participant: MatchupParticipantPanel) => participant.role === "AWAY"
      ) ??
      participantPanels[0];
    const home =
      participantPanels.find(
        (participant: MatchupParticipantPanel) => participant.role === "HOME"
      ) ??
      participantPanels[1] ??
      participantPanels[0];
    const oddsSummary = extractOddsSummary(summary);

    return {
      leagueKey,
      externalEventId: eventId,
      label: `${away.name} @ ${home.name}`,
      eventType: "TEAM_HEAD_TO_HEAD",
      status: mapStatus(
        readString(
          summary.header?.competitions?.[0]?.status?.type?.state ??
            competition?.status?.type?.state
        )
      ),
      stateDetail:
        readString(
          summary.header?.competitions?.[0]?.status?.type?.detail ??
            competition?.status?.type?.detail
        ) ??
        readString(
          summary.header?.competitions?.[0]?.status?.type?.shortDetail ??
            competition?.status?.type?.shortDetail
        ),
      scoreboard: formatScoreboard(competition),
      venue: readString(competition?.venue?.fullName),
      startTime:
        readString(summary.header?.competitions?.[0]?.date ?? competition?.date) ??
        new Date().toISOString(),
      supportStatus: "LIVE",
      supportNote:
        leagueKey === "MLB"
          ? "Live matchup detail is wired through ESPN summary plus MLB StatsAPI season enrichment."
          : leagueKey === "NHL"
            ? "Live matchup detail is wired through ESPN summary plus NHL API season enrichment."
            : "Live matchup detail is wired through ESPN summary, schedule, and team statistics endpoints.",
      liveScoreProvider: "ESPN scoreboard",
      statsProvider:
        leagueKey === "MLB"
          ? "ESPN summary + MLB StatsAPI"
          : leagueKey === "NHL"
            ? "ESPN summary + NHL API"
            : "ESPN summary + team stats",
      currentOddsProvider:
        oddsSummary.bestSpread || oddsSummary.bestMoneyline || oddsSummary.bestTotal
          ? "ESPN summary odds"
          : null,
      historicalOddsProvider: "OddsHarvester historical ingestion",
      lastUpdatedAt: readString(summary.meta?.lastUpdatedAt),
      participants: participantPanels,
      oddsSummary,
      marketRanges: [
        {
          label: "Broadcast",
          value: Array.isArray(competition?.broadcasts)
            ? competition.broadcasts
                .map((broadcast: JsonRecord) =>
                  readString(broadcast?.media?.shortName ?? broadcast?.names?.[0])
                )
                .filter(Boolean)
                .join(", ") || "Not listed"
            : "Not listed"
        },
        {
          label: "Standings",
          value: participantPanels
            .map(
              (participant) =>
                `${participant.abbreviation ?? participant.name}: ${participant.record ?? "No standings context"}`
            )
            .join(" | ")
        }
      ],
      trendCards: buildTrendCards(participantPanels),
      propsSupport: {
        status: leagueKey === "NBA" || leagueKey === "NCAAB" ? "LIVE" : "PARTIAL",
        note:
          leagueKey === "NBA" || leagueKey === "NCAAB"
            ? "Live basketball player props are wired from the current odds backend for this matchup."
            : "Current props coverage for this league is still adapter-limited even though matchup detail is live.",
        supportedMarkets:
          leagueKey === "NBA" || leagueKey === "NCAAB"
            ? [
                "player_points",
                "player_rebounds",
                "player_assists",
                "player_threes"
              ]
            : []
      },
      notes: [
        "Standings context is parsed from the ESPN summary payload when available.",
        "Recent form is derived from the latest completed games returned by the ESPN team schedule endpoint.",
        leagueKey === "MLB"
          ? "Season team and leader enrichment is layered from the public MLB StatsAPI."
          : leagueKey === "NHL"
            ? "Season leader enrichment is layered from the public NHL API."
            : "Live stat strips and player spotlights are pulled from the ESPN event summary box score."
      ]
    } satisfies MatchupDetailPayload;
  }
};
