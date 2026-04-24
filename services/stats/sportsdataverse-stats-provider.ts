import type { LeagueKey } from "@/lib/types/domain";

import {
  fetchSportsDataverseBoxScore,
  fetchSportsDataversePlayByPlay,
  fetchSportsDataverseSummary
} from "@/services/events/sportsdataverse-client";

import { espnMatchupStatsProvider } from "./espn-stats-provider";
import type { MatchupDetailPayload, MatchupStatsProvider } from "./provider-types";

const SUPPORTED_LEAGUES: LeagueKey[] = [
  "NBA",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF"
];

type JsonRecord = Record<string, unknown>;

function countPlayByPlayRows(payload: unknown) {
  const candidate = payload as JsonRecord | null | undefined;

  const directArrayKeys = ["plays", "items", "drives", "events"];
  for (const key of directArrayKeys) {
    const value = candidate?.[key];
    if (Array.isArray(value)) {
      return value.length;
    }
  }

  const nested = (candidate?.gamepackageJSON ?? candidate?.gamepackageJson) as
    | JsonRecord
    | undefined;
  if (nested) {
    for (const key of directArrayKeys) {
      const value = nested[key];
      if (Array.isArray(value)) {
        return value.length;
      }
    }
  }

  return 0;
}

function readSummaryTimestamp(payload: unknown) {
  const candidate = payload as JsonRecord | null | undefined;
  const topLevel = candidate?.lastUpdatedAt;
  if (typeof topLevel === "string" && topLevel.trim()) {
    return topLevel;
  }

  const header = candidate?.header as JsonRecord | undefined;
  const competitions = header?.competitions;
  const headerCompetition =
    Array.isArray(competitions) && competitions.length > 0
      ? (competitions[0] as JsonRecord | undefined)
      : null;
  const date = headerCompetition?.date;
  return typeof date === "string" && date.trim() ? date : null;
}

export const sportsdataverseMatchupStatsProvider: MatchupStatsProvider = {
  key: "sportsdataverse-stats",
  label: "SportsDataverse summary + play-by-play",
  kind: "LIVE",
  supportsLeague(leagueKey) {
    return SUPPORTED_LEAGUES.includes(leagueKey);
  },
  async fetchMatchupDetail({ leagueKey, eventId }) {
    const base = await espnMatchupStatsProvider.fetchMatchupDetail({ leagueKey, eventId });
    if (!base) {
      return null;
    }

    const [summary, playByPlay, boxScore] = await Promise.all([
      fetchSportsDataverseSummary(leagueKey, eventId),
      fetchSportsDataversePlayByPlay(leagueKey, eventId),
      fetchSportsDataverseBoxScore(leagueKey, eventId)
    ]);

    const playCount = countPlayByPlayRows(playByPlay);
    const notes = [...base.notes];

    if (summary) {
      notes.push(
        "SportsDataverse summary endpoint is wired as an additional matchup verification source."
      );
    }
    if (playCount > 0) {
      notes.push(`SportsDataverse play-by-play feed returned ${playCount} rows for this event.`);
    }
    if (boxScore) {
      notes.push(
        "SportsDataverse box score endpoint is wired for additional player/team stat enrichment."
      );
    }

    return {
      ...base,
      liveScoreProvider: "SportsDataverse scoreboard + ESPN fallback",
      statsProvider: `${base.statsProvider ?? "ESPN summary"} + SportsDataverse`,
      lastUpdatedAt: readSummaryTimestamp(summary) ?? base.lastUpdatedAt,
      notes: Array.from(new Set(notes))
    } satisfies MatchupDetailPayload;
  }
};
