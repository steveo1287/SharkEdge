import type { LeagueKey } from "@/lib/types/domain";

import type { MatchupDetailPayload, MatchupStatsProvider } from "./provider-types";

const UFC_API_BASE_URL =
  process.env.UFC_STATS_API_BASE_URL?.trim() || "https://ufcapi.aristotle.me";

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractEvents(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object")
    );
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["events", "data", "results"]) {
    if (Array.isArray(record[key])) {
      return (record[key] as unknown[]).filter(
        (item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object")
      );
    }
  }

  return [];
}

function parseFightMetric(label: string, value: unknown) {
  const normalized = readString(value);
  if (!normalized) {
    return null;
  }

  return {
    label,
    value: normalized
  };
}

export const ufcMatchupStatsProvider: MatchupStatsProvider = {
  key: "ufc-stats-provider",
  label: "UFC event + fight data",
  kind: "PARTIAL",
  supportsLeague(leagueKey: LeagueKey) {
    return leagueKey === "UFC";
  },
  async fetchMatchupDetail({ eventId }) {
    const response = await fetch(`${UFC_API_BASE_URL}/api/events?limit=12`, {
      headers: {
        "User-Agent": "Mozilla/5.0 SharkEdge/1.5"
      },
      next: {
        revalidate: 300
      }
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const event = extractEvents(payload).find((entry) => {
      const id = readString(entry.id) ?? readString(entry.slug);
      return id === eventId;
    });

    if (!event) {
      return null;
    }

    const fights = Array.isArray(event.fights)
      ? (event.fights as Array<Record<string, unknown>>)
      : [];
    const mainFight = fights[0] ?? {};
    const fighterA =
      readString(mainFight.fighter1_name) ??
      readString(mainFight.fighter1) ??
      "Fighter A";
    const fighterB =
      readString(mainFight.fighter2_name) ??
      readString(mainFight.fighter2) ??
      "Fighter B";

    return {
      leagueKey: "UFC",
      externalEventId: eventId,
      label: readString(event.name) ?? `${fighterA} vs ${fighterB}`,
      eventType: "COMBAT_HEAD_TO_HEAD",
      status: "PREGAME",
      stateDetail: readString(event.status) ?? "Fight card scheduled",
      scoreboard: null,
      venue: readString(event.location) ?? readString(event.venue),
      startTime: readString(event.date) ?? new Date().toISOString(),
      supportStatus: "PARTIAL",
      supportNote:
        "UFC uses a dedicated MMA source path. Event, fight, and fighter panels are wired, but live board odds and full round tracking are still partial.",
      liveScoreProvider: "UFC stats API scaffold",
      statsProvider: "UFC event + fight data",
      currentOddsProvider: null,
      historicalOddsProvider: null,
      lastUpdatedAt: null,
      participants: [
        {
          id: `${eventId}-a`,
          name: fighterA,
          abbreviation: null,
          role: "COMPETITOR_A",
          record: readString(mainFight.fighter1_record) ?? readString(mainFight.record1),
          score: null,
          isWinner: null,
          subtitle:
            readString(mainFight.fighter1_stance) ??
            readString(mainFight.fighter1_weight_class),
          stats: [
            parseFightMetric("Sig Strikes", mainFight.fighter1_sig_strikes),
            parseFightMetric("Takedowns", mainFight.fighter1_takedowns),
            parseFightMetric("Control", mainFight.fighter1_control_time)
          ].filter(Boolean) as NonNullable<
            MatchupDetailPayload["participants"][number]["stats"]
          >,
          leaders: [],
          boxscore: [],
          recentResults: [],
          notes: [
            "Dedicated UFC event coverage is active, but the live odds/round state layer is still partial."
          ]
        },
        {
          id: `${eventId}-b`,
          name: fighterB,
          abbreviation: null,
          role: "COMPETITOR_B",
          record: readString(mainFight.fighter2_record) ?? readString(mainFight.record2),
          score: null,
          isWinner: null,
          subtitle:
            readString(mainFight.fighter2_stance) ??
            readString(mainFight.fighter2_weight_class),
          stats: [
            parseFightMetric("Sig Strikes", mainFight.fighter2_sig_strikes),
            parseFightMetric("Takedowns", mainFight.fighter2_takedowns),
            parseFightMetric("Control", mainFight.fighter2_control_time)
          ].filter(Boolean) as NonNullable<
            MatchupDetailPayload["participants"][number]["stats"]
          >,
          leaders: [],
          boxscore: [],
          recentResults: [],
          notes: [
            "Dedicated UFC event coverage is active, but the live odds/round state layer is still partial."
          ]
        }
      ],
      oddsSummary: null,
      marketRanges: [
        {
          label: "Card context",
          value: `${fights.length} fight(s) surfaced from the MMA source`
        },
        {
          label: "Main fight method",
          value:
            readString(mainFight.method) ??
            readString(mainFight.result) ??
            "Result data pending"
        }
      ],
      trendCards: [
        {
          id: `${eventId}-card`,
          title: "Card depth",
          value: `${fights.length}`,
          note: "Count of fights currently returned by the MMA source for this card.",
          tone: fights.length >= 10 ? "brand" : "muted"
        }
      ],
      propsSupport: {
        status: "PARTIAL",
        note:
          "Fight props are scaffolded in the model, but a live combat odds adapter is still required before they can render honestly.",
        supportedMarkets: []
      },
      notes: [
        "UFC fighter/event panels are sourced from the dedicated MMA endpoint when it responds.",
        "Round-by-round stats are only shown when the source returns them explicitly.",
        "Current fight odds are not attached until a combat current-odds provider is added."
      ]
    } satisfies MatchupDetailPayload;
  }
};
