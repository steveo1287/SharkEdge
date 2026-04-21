import type { SupportedLeagueKey } from "@/lib/types/ledger";

import { fetchSportsDataverseScoreboard } from "./sportsdataverse-client";
import { normalizeEspnEvent } from "./espn-provider";
import type { EventProvider, ProviderEvent } from "./provider-types";

const SUPPORTED_LEAGUES: SupportedLeagueKey[] = [
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF"
];

type ScoreboardPayload = {
  events?: Array<Record<string, unknown>>;
};

export const sportsdataverseEventProvider: EventProvider = {
  key: "sportsdataverse",
  label: "SportsDataverse scoreboard",
  kind: "LIVE",
  supportsLeague(leagueKey) {
    return SUPPORTED_LEAGUES.includes(leagueKey);
  },
  async fetchScoreboard(leagueKey) {
    const payload = (await fetchSportsDataverseScoreboard(
      leagueKey
    )) as ScoreboardPayload | null;
    const events = Array.isArray(payload?.events) ? payload.events : [];

    return events
      .map((event) => normalizeEspnEvent(leagueKey, event))
      .filter((event): event is ProviderEvent => Boolean(event?.externalEventId))
      .map((event) => ({
        ...event,
        providerKey: "sportsdataverse",
        metadataJson: {
          ...(event.metadataJson ?? {}),
          sourceLibrary: "sportsdataverse-js"
        }
      }));
  }
};
