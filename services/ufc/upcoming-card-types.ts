export type UfcSourceConfidence = "OFFICIAL_CONFIRMED" | "OFFICIAL_PARTIAL" | "CROSS_CHECKED" | "EARLY_REPORTED" | "MANUAL_REVIEW";

export type UfcUpcomingSourceFight = {
  sourceName: "ufcstats" | "ufc.com" | "espn" | "tapology" | "manual";
  sourceUrl?: string | null;
  sourceEventId?: string | null;
  sourceFightId?: string | null;
  fighterAName: string;
  fighterBName: string;
  weightClass?: string | null;
  scheduledRounds?: 3 | 5 | null;
  boutOrder?: number | null;
  cardSection?: string | null;
  sourceStatus?: UfcSourceConfidence;
  confidence?: UfcSourceConfidence;
  isMainEvent?: boolean;
  isTitleFight?: boolean;
  isCatchweight?: boolean;
  payload?: Record<string, unknown>;
};

export type UfcUpcomingSourceEvent = {
  sourceName: "ufcstats" | "ufc.com" | "espn" | "tapology" | "manual";
  sourceUrl?: string | null;
  sourceEventId: string;
  eventName: string;
  eventDate: string;
  location?: string | null;
  venue?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  broadcastInfo?: string | null;
  earlyPrelimsTime?: string | null;
  prelimsTime?: string | null;
  mainCardTime?: string | null;
  sourceStatus?: UfcSourceConfidence;
  sourceUrls?: Record<string, string>;
  payload?: Record<string, unknown>;
  fights: UfcUpcomingSourceFight[];
};

export type UfcUpcomingProviderResult = {
  provider: UfcUpcomingSourceEvent["sourceName"];
  fetchedAt: string;
  events: UfcUpcomingSourceEvent[];
  warnings: string[];
  errors: string[];
};

export type UfcUpcomingIngestionSummary = {
  ok: boolean;
  providerCount: number;
  eventCount: number;
  fightCount: number;
  sourceAuditCount: number;
  warnings: string[];
  errors: string[];
};

export function normalizeName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function slug(value: string) {
  return normalizeName(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function parseIsoOrOriginal(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function scheduledRounds(value: unknown): 3 | 5 {
  return value === 5 || value === "5" ? 5 : 3;
}
