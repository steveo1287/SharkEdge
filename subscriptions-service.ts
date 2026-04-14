import type { SupportedLeagueKey, SupportedSportCode } from "@/lib/types/ledger";

export type ProviderParticipant = {
  externalCompetitorId: string | null;
  role: "HOME" | "AWAY" | "COMPETITOR_A" | "COMPETITOR_B" | "UNKNOWN";
  sortOrder: number;
  name: string;
  abbreviation: string | null;
  type: "TEAM" | "ATHLETE" | "FIGHTER" | "OTHER";
  score: string | null;
  record: string | null;
  isWinner: boolean | null;
  metadata: Record<string, unknown>;
};

export type ProviderEvent = {
  externalEventId: string;
  providerKey: string;
  sportCode: SupportedSportCode;
  leagueKey: SupportedLeagueKey;
  name: string;
  startTime: string;
  status: "SCHEDULED" | "LIVE" | "FINAL" | "POSTPONED" | "CANCELED" | "DELAYED";
  resultState: "PENDING" | "OFFICIAL" | "VOID" | "NO_CONTEST";
  eventType: "TEAM_HEAD_TO_HEAD" | "COMBAT_HEAD_TO_HEAD" | "OTHER";
  venue: string | null;
  scoreJson: Record<string, unknown> | null;
  stateJson: Record<string, unknown> | null;
  resultJson: Record<string, unknown> | null;
  metadataJson: Record<string, unknown> | null;
  participants: ProviderParticipant[];
};

export interface EventProvider {
  key: string;
  label: string;
  kind: "LIVE" | "FALLBACK" | "SCAFFOLD";
  supportsLeague(leagueKey: SupportedLeagueKey): boolean;
  fetchScoreboard(leagueKey: SupportedLeagueKey): Promise<ProviderEvent[]>;
}
