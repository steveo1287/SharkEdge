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

function extractBoxscoreLeaders(teamId: string, payload: JsonRecord): MatchupMetricView[] {
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
          competition,
          competitor,
          teamStats,
          recentResults,
          standingsMap,
          boxscore: extractBoxscoreLeaders(teamId, summary)
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
        "Box score leaders are pulled from the ESPN event summary box score."
      ]
    } satisfies MatchupDetailPayload;
  }
};
