import type { LeagueKey } from "@/lib/types/domain";

import type {
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
    { label: "APG", terms: ["avgAssists", "assists per game"] },
    { label: "RPG", terms: ["avgRebounds", "rebounds per game"] },
    { label: "SPG", terms: ["avgSteals", "steals per game"] },
    { label: "BPG", terms: ["avgBlocks", "blocks per game"] },
    { label: "TO/G", terms: ["avgTurnovers", "turnovers per game"] }
  ],
  NCAAB: [
    { label: "PPG", terms: ["avgPoints", "points per game"] },
    { label: "APG", terms: ["avgAssists", "assists per game"] },
    { label: "RPG", terms: ["avgRebounds", "rebounds per game"] },
    { label: "SPG", terms: ["avgSteals", "steals per game"] },
    { label: "BPG", terms: ["avgBlocks", "blocks per game"] },
    { label: "TO/G", terms: ["avgTurnovers", "turnovers per game"] }
  ],
  MLB: [
    { label: "Runs/G", terms: ["runs per game", "avgRuns"] },
    { label: "AVG", terms: ["batting average", "avg"] },
    { label: "HR", terms: ["home runs"] },
    { label: "SB", terms: ["stolen bases"] },
    { label: "ERA", terms: ["earned run average", "era"] },
    { label: "WHIP", terms: ["whip"] }
  ],
  NHL: [
    { label: "Goals/G", terms: ["goals per game"] },
    { label: "Shots/G", terms: ["shots per game"] },
    { label: "PP%", terms: ["power play percentage", "power play %"] },
    { label: "PK%", terms: ["penalty kill percentage", "penalty kill %"] },
    { label: "GA/G", terms: ["goals against average"] },
    { label: "Save %", terms: ["save percentage", "save %"] }
  ],
  NFL: [
    { label: "Pts/G", terms: ["points per game"] },
    { label: "Yds/G", terms: ["yards per game"] },
    { label: "Pass Yds", terms: ["passing yards per game"] },
    { label: "Rush Yds", terms: ["rushing yards per game"] },
    { label: "3D %", terms: ["third down conversion percentage"] },
    { label: "TO Diff", terms: ["turnover differential"] }
  ],
  NCAAF: [
    { label: "Pts/G", terms: ["points per game"] },
    { label: "Yds/G", terms: ["yards per game"] },
    { label: "Pass Yds", terms: ["passing yards per game"] },
    { label: "Rush Yds", terms: ["rushing yards per game"] },
    { label: "3D %", terms: ["third down conversion percentage"] },
    { label: "TO Diff", terms: ["turnover differential"] }
  ]
};

const LIVE_TEAM_STAT_BLUEPRINTS: Partial<
  Record<LeagueKey, Array<{ label: string; terms: string[] }>>
> = {
  NBA: [
    { label: "FG%", terms: ["fieldgoalpct", "field goal %", "fg%"] },
    { label: "3P%", terms: ["threepointfieldgoalpct", "three point %", "3p%"] },
    { label: "REB", terms: ["totalrebounds", "rebounds", "reb"] },
    { label: "AST", terms: ["assists", "ast"] }
  ],
  NCAAB: [
    { label: "FG%", terms: ["fieldgoalpct", "field goal %", "fg%"] },
    { label: "3P%", terms: ["threepointfieldgoalpct", "three point %", "3p%"] },
    { label: "REB", terms: ["totalrebounds", "rebounds", "reb"] },
    { label: "AST", terms: ["assists", "ast"] }
  ],
  MLB: [
    { label: "R", terms: ["runs", "r"] },
    { label: "H", terms: ["hits", "h"] },
    { label: "E", terms: ["errors", "e"] },
    { label: "AVG", terms: ["avg", "batting average"] }
  ],
  NHL: [
    { label: "Shots", terms: ["shotstotal", "shots"] },
    { label: "Hits", terms: ["hits", "ht"] },
    { label: "Blocks", terms: ["blockedshots", "bs"] },
    { label: "PP%", terms: ["powerplaypct", "power play percentage"] }
  ],
  NFL: [
    { label: "Yards", terms: ["totalyards", "total yards"] },
    { label: "Pass", terms: ["netpassingyards", "passing"] },
    { label: "Rush", terms: ["rushingyards", "rushing"] },
    { label: "3D", terms: ["thirddowneff", "3rd down efficiency"] }
  ],
  NCAAF: [
    { label: "Yards", terms: ["totalyards", "total yards"] },
    { label: "Pass", terms: ["netpassingyards", "passing"] },
    { label: "Rush", terms: ["rushingyards", "rushing"] },
    { label: "3D", terms: ["thirddowneff", "3rd down efficiency"] }
  ]
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
    .filter(Boolean) as MatchupMetricView[];
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

      return {
        id:
          readString(event.id) ??
          readString(competition?.id) ??
          `${teamId}-${readString(event.date) ?? "recent"}`,
        label: `${readString(team.homeAway)?.toLowerCase() === "home" ? "vs" : "at"} ${readString(opponent.team?.displayName ?? opponent.team?.shortDisplayName ?? opponent.team?.name) ?? "Opponent"}`,
        result: `${margin >= 0 ? "W" : "L"} ${teamScore}-${opponentScore}`,
        note: readString(event.date)?.slice(0, 10) ?? "Recent final"
      };
    })
    .filter(Boolean)
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

  const pointsIndex = keys.findIndex((key: string) => key === "points");
  const reboundsIndex = keys.findIndex((key: string) => key === "rebounds");
  const assistsIndex = keys.findIndex((key: string) => key === "assists");

  return athletes
    .map((athleteEntry: JsonRecord) => {
      const stats = Array.isArray(athleteEntry.stats) ? athleteEntry.stats : [];
      const points = pointsIndex >= 0 ? readNumber(stats[pointsIndex]) ?? 0 : 0;
      const rebounds =
        reboundsIndex >= 0 ? readNumber(stats[reboundsIndex]) ?? 0 : 0;
      const assists =
        assistsIndex >= 0 ? readNumber(stats[assistsIndex]) ?? 0 : 0;

      return {
        name: readString(athleteEntry.athlete?.displayName) ?? "Player",
        line: `${points} PTS | ${rebounds} REB | ${assists} AST`,
        score: points
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

function extractMlbPlayerSpotlights(teamId: string, payload: JsonRecord) {
  const teamBox = (Array.isArray(payload.boxscore?.players) ? payload.boxscore.players : []).find(
    (entry: JsonRecord) => String(entry.team?.id ?? "") === teamId
  );
  const blocks = Array.isArray(teamBox?.statistics) ? teamBox.statistics : [];
  const batting = blocks.find((block: JsonRecord) => normalizeStatKey(block.type) === "batting");
  const pitching = blocks.find((block: JsonRecord) => normalizeStatKey(block.type) === "pitching");

  const hitter = Array.isArray(batting?.athletes)
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
        )[0]
    : null;
  const pitcher = Array.isArray(pitching?.athletes)
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
        )[0]
    : null;

  return [
    hitter
      ? buildAthleteLine({
          athleteEntry: hitter.entry,
          keys: batting?.keys ?? [],
          items: [
            { label: "H", terms: ["hits"] },
            { label: "RBI", terms: ["rbis", "rbi"] },
            { label: "R", terms: ["runs"] },
            { label: "HR", terms: ["homeruns", "hr"] }
          ]
        })
      : null,
    pitcher
      ? buildAthleteLine({
          athleteEntry: pitcher.entry,
          keys: pitching?.keys ?? [],
          items: [
            { label: "IP", terms: ["fullinningspartinnings", "inningspitched", "ip"] },
            { label: "K", terms: ["strikeouts", "k"] },
            { label: "ER", terms: ["earnedruns", "er"] },
            { label: "BB", terms: ["walks", "bb"] }
          ]
        })
      : null
  ].filter(Boolean) as MatchupMetricView[];
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

  const topSkater = Array.isArray(skaters?.athletes)
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
        )[0]
    : null;
  const topGoalie = Array.isArray(goalies?.athletes) ? goalies.athletes[0] : null;

  return [
    topSkater
      ? buildAthleteLine({
          athleteEntry: topSkater.entry,
          keys: skaters?.keys ?? [],
          items: [
            { label: "G", terms: ["goals", "g"] },
            { label: "A", terms: ["assists", "a"] },
            { label: "S", terms: ["shotstotal", "s"] }
          ]
        })
      : null,
    topGoalie
      ? buildAthleteLine({
          athleteEntry: topGoalie,
          keys: goalies?.keys ?? [],
          items: [
            { label: "SV", terms: ["saves", "sv"] },
            { label: "SV%", terms: ["savepct", "sv%"] },
            { label: "GA", terms: ["goalsagainst", "ga"] }
          ]
        })
      : null
  ].filter(Boolean) as MatchupMetricView[];
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

  return [
    topPasser
      ? buildAthleteLine({
          athleteEntry: topPasser,
          keys: passing?.keys ?? [],
          items: [
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
            { label: "YDS", terms: ["rushingyards", "yds"] },
            { label: "CAR", terms: ["rushingattempts", "car"] },
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
      : null
  ].filter(Boolean) as MatchupMetricView[];
}

function extractLiveBoxscoreDetails(
  leagueKey: LeagueKey,
  competition: JsonRecord | null,
  teamId: string,
  payload: JsonRecord
) {
  const teamStrip = extractLiveTeamStats(leagueKey, competition, teamId, payload);
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

  return [...teamStrip, ...playerSpotlights].slice(0, 5);
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

  const awayMoneyline =
    readString(pick?.awayTeamOdds?.moneyLine ?? odds?.awayTeamOdds?.moneyLine) ??
    null;
  const homeMoneyline =
    readString(pick?.homeTeamOdds?.moneyLine ?? odds?.homeTeamOdds?.moneyLine) ??
    null;

  return {
    bestSpread: readString(pick?.details ?? odds?.details),
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
  recentResults: MatchupParticipantPanel["recentResults"];
  standingsMap: Map<string, string>;
  boxscore: MatchupMetricView[];
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
    leaders: competitionLeaders.length ? competitionLeaders : args.boxscore,
    boxscore: args.boxscore,
    recentResults: args.recentResults,
    notes: [
      args.teamStats.length
        ? "Season profile is coming from ESPN team statistics."
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

    const participantPanels: MatchupParticipantPanel[] = competitors.map(
      (competitor: JsonRecord, index: number) => {
        const teamId = teamIds[index] ?? "";
        const teamStats =
          statPayloads[index]?.status === "fulfilled"
            ? extractSeasonStats(leagueKey, statPayloads[index].value)
            : [];
        const recentResults =
          schedulePayloads[index]?.status === "fulfilled"
            ? extractRecentResults(teamId, schedulePayloads[index].value)
            : [];

        return mapParticipantPanel({
          leagueKey,
          competition,
          competitor,
          teamStats,
          recentResults,
          standingsMap,
          boxscore: extractLiveBoxscoreDetails(leagueKey, competition, teamId, summary)
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
        "Live matchup detail is wired through ESPN summary, schedule, and team statistics endpoints.",
      liveScoreProvider: "ESPN scoreboard",
      statsProvider: "ESPN summary + team stats",
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
        "Live stat strips and player spotlights are pulled from the ESPN event summary box score."
      ]
    } satisfies MatchupDetailPayload;
  }
};
