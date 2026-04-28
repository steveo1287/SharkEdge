import { prisma } from "@/lib/db/prisma";
import type { PlayerStatus, Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type EspnTeam = {
  id?: string;
  displayName?: string;
  shortDisplayName?: string;
  name?: string;
  abbreviation?: string;
};

type EspnAthlete = {
  id?: string;
  displayName?: string;
  fullName?: string;
  shortName?: string;
  position?: { abbreviation?: string; name?: string };
};

type EspnScoreboardCompetitor = {
  homeAway?: string;
  team?: EspnTeam;
};

type EspnScoreboardResponse = {
  events?: Array<{
    id?: string;
    date?: string;
    competitions?: Array<{
      competitors?: EspnScoreboardCompetitor[];
    }>;
  }>;
};

type EspnSummaryResponse = JsonRecord & {
  injuries?: Array<{
    team?: EspnTeam;
    injuries?: EspnInjuryEntry[];
  }>;
};

type EspnInjuryEntry = JsonRecord & {
  athlete?: EspnAthlete;
  status?: string;
  type?: string | { description?: string; abbreviation?: string; name?: string };
  details?: string;
  detail?: string;
  description?: string;
  shortComment?: string;
  longComment?: string;
  date?: string;
};

type InjuryCandidate = {
  teamEspnId?: string | null;
  athlete: EspnAthlete;
  statusText: string;
  description: string | null;
  reportedAt: Date;
  raw: JsonRecord;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "_");
}

function parseDate(value: unknown) {
  if (typeof value !== "string") return new Date();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function textFromUnknown(value: unknown) {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  if (!record) return null;
  return readString(record.description) ?? readString(record.abbreviation) ?? readString(record.name);
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "SharkEdge/2.0 nba-availability-ingest" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function mapEspnStatus(statusText: string): PlayerStatus {
  const text = statusText.toLowerCase();
  if (/(out|inactive|suspended|injured reserve|not expected|will not play)/.test(text)) return "OUT";
  if (/doubtful/.test(text)) return "DOUBTFUL";
  if (/(questionable|game[ -]?time|uncertain|day[ -]?to[ -]?day)/.test(text)) return "QUESTIONABLE";
  if (/(probable|available|active|will play|expected to play)/.test(text)) return "ACTIVE";
  return "QUESTIONABLE";
}

function getInjuryDescription(entry: EspnInjuryEntry) {
  return (
    readString(entry.details) ??
    readString(entry.detail) ??
    readString(entry.shortComment) ??
    readString(entry.longComment) ??
    readString(entry.description) ??
    textFromUnknown(entry.type) ??
    readString(entry.status)
  );
}

function getStatusText(entry: EspnInjuryEntry) {
  return [
    readString(entry.status),
    textFromUnknown(entry.type),
    readString(entry.details),
    readString(entry.shortComment),
    readString(entry.description)
  ].filter(Boolean).join(" ") || "questionable";
}

function extractExplicitInjuries(summary: EspnSummaryResponse): InjuryCandidate[] {
  const candidates: InjuryCandidate[] = [];

  for (const block of summary.injuries ?? []) {
    const teamEspnId = readString(block.team?.id);
    for (const entry of block.injuries ?? []) {
      if (!entry.athlete?.id && !entry.athlete?.displayName && !entry.athlete?.fullName) continue;
      candidates.push({
        teamEspnId,
        athlete: entry.athlete,
        statusText: getStatusText(entry),
        description: getInjuryDescription(entry),
        reportedAt: parseDate(entry.date),
        raw: entry
      });
    }
  }

  return candidates;
}

function maybeInjuryEntry(value: unknown, parentTeamEspnId?: string | null): InjuryCandidate | null {
  const record = asRecord(value);
  if (!record) return null;

  const athlete = asRecord(record.athlete) as EspnAthlete | null;
  if (!athlete || (!athlete.id && !athlete.displayName && !athlete.fullName)) return null;

  const hasInjurySignal = Boolean(
    record.status || record.type || record.details || record.detail || record.shortComment || record.longComment || record.description
  );
  if (!hasInjurySignal) return null;

  return {
    teamEspnId: parentTeamEspnId,
    athlete,
    statusText: getStatusText(record as EspnInjuryEntry),
    description: getInjuryDescription(record as EspnInjuryEntry),
    reportedAt: parseDate(record.date),
    raw: record
  };
}

function collectFallbackInjuries(value: unknown, parentTeamEspnId?: string | null, depth = 0): InjuryCandidate[] {
  if (depth > 6) return [];
  const record = asRecord(value);
  if (!record) {
    if (Array.isArray(value)) {
      return value.flatMap((item) => collectFallbackInjuries(item, parentTeamEspnId, depth + 1));
    }
    return [];
  }

  const localTeam = asRecord(record.team) as EspnTeam | null;
  const localTeamEspnId = readString(localTeam?.id) ?? parentTeamEspnId ?? null;
  const direct = maybeInjuryEntry(record, localTeamEspnId);
  const children = Object.entries(record)
    .filter(([key]) => key !== "athlete")
    .flatMap(([, child]) => collectFallbackInjuries(child, localTeamEspnId, depth + 1));
  return direct ? [direct, ...children] : children;
}

function dedupeCandidates(candidates: InjuryCandidate[]) {
  const seen = new Set<string>();
  const deduped: InjuryCandidate[] = [];
  for (const candidate of candidates) {
    const athleteKey = candidate.athlete.id ?? candidate.athlete.displayName ?? candidate.athlete.fullName ?? "unknown";
    const key = `${candidate.teamEspnId ?? "none"}:${athleteKey}:${normalizeToken(candidate.statusText)}:${normalizeToken(candidate.description ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

async function findOrCreateTeam(args: {
  leagueId: string;
  team: EspnTeam;
}) {
  const espnId = readString(args.team.id);
  const name = readString(args.team.displayName) ?? readString(args.team.shortDisplayName) ?? readString(args.team.name) ?? `NBA Team ${espnId ?? "unknown"}`;
  const abbreviation = readString(args.team.abbreviation) ?? name.slice(0, 3).toUpperCase();
  const key = espnId ? `${args.leagueId}:espn:${espnId}` : `${args.leagueId}:team:${normalizeToken(name)}`;

  const existing = await prisma.team.findFirst({
    where: {
      leagueId: args.leagueId,
      OR: [
        ...(espnId ? [{ externalIds: { path: ["espn"], equals: espnId } }] : []),
        { name: { equals: name, mode: "insensitive" } }
      ]
    }
  });

  if (existing) {
    return prisma.team.update({
      where: { id: existing.id },
      data: {
        abbreviation,
        externalIds: toJson({ ...((existing.externalIds as JsonRecord | null) ?? {}), ...(espnId ? { espn: espnId } : {}) })
      },
      select: { id: true }
    });
  }

  return prisma.team.create({
    data: {
      leagueId: args.leagueId,
      key,
      name,
      abbreviation,
      externalIds: toJson(espnId ? { espn: espnId } : {})
    },
    select: { id: true }
  });
}

async function findOrCreatePlayer(args: {
  leagueId: string;
  teamId: string;
  athlete: EspnAthlete;
}) {
  const espnId = readString(args.athlete.id);
  const name = readString(args.athlete.displayName) ?? readString(args.athlete.fullName) ?? readString(args.athlete.shortName) ?? `NBA Player ${espnId ?? "unknown"}`;
  const nameParts = name.split(/\s+/).filter(Boolean);
  const key = espnId ? `${args.leagueId}:espn:${espnId}` : `${args.leagueId}:player:${normalizeToken(name)}`;

  const existing = await prisma.player.findFirst({
    where: {
      leagueId: args.leagueId,
      OR: [
        ...(espnId ? [{ externalIds: { path: ["espn"], equals: espnId } }] : []),
        { teamId: args.teamId, name: { equals: name, mode: "insensitive" } }
      ]
    }
  });

  if (existing) {
    return prisma.player.update({
      where: { id: existing.id },
      data: {
        teamId: args.teamId,
        position: readString(args.athlete.position?.abbreviation) ?? existing.position,
        externalIds: toJson({ ...((existing.externalIds as JsonRecord | null) ?? {}), ...(espnId ? { espn: espnId } : {}) })
      },
      select: { id: true }
    });
  }

  return prisma.player.create({
    data: {
      leagueId: args.leagueId,
      teamId: args.teamId,
      key,
      name,
      firstName: nameParts[0] ?? null,
      lastName: nameParts.length > 1 ? nameParts.slice(1).join(" ") : null,
      position: readString(args.athlete.position?.abbreviation) ?? readString(args.athlete.position?.name) ?? "UNK",
      externalIds: toJson(espnId ? { espn: espnId } : {})
    },
    select: { id: true }
  });
}

export async function ingestNbaAvailability(args: { lookaheadDays?: number } = {}) {
  const league = await prisma.league.findUnique({ where: { key: "NBA" } });
  if (!league) {
    return { attemptedEvents: 0, eventsWithAvailability: 0, injuriesWritten: 0, playersUpdated: 0, skipped: 0 };
  }

  const lookaheadDays = Math.max(1, Math.min(7, args.lookaheadDays ?? 3));
  const dates = Array.from({ length: lookaheadDays + 1 }, (_, offset) => {
    const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  });

  let attemptedEvents = 0;
  let eventsWithAvailability = 0;
  let injuriesWritten = 0;
  let playersUpdated = 0;
  let skipped = 0;

  for (const dateStr of dates) {
    let scoreboard: EspnScoreboardResponse;
    try {
      scoreboard = await fetchJson<EspnScoreboardResponse>(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`
      );
    } catch (error) {
      console.error(`[nba-availability] scoreboard failed for ${dateStr}:`, error);
      continue;
    }

    for (const event of scoreboard.events ?? []) {
      const eventId = readString(event.id);
      if (!eventId) continue;
      attemptedEvents += 1;

      const teamByEspnId = new Map<string, { id: string }>();
      for (const competitor of event.competitions?.[0]?.competitors ?? []) {
        const espnTeamId = readString(competitor.team?.id);
        if (!espnTeamId || !competitor.team) continue;
        const team = await findOrCreateTeam({ leagueId: league.id, team: competitor.team });
        teamByEspnId.set(espnTeamId, team);
      }

      let summary: EspnSummaryResponse;
      try {
        summary = await fetchJson<EspnSummaryResponse>(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`
        );
      } catch (error) {
        console.error(`[nba-availability] summary failed for event ${eventId}:`, error);
        continue;
      }

      const candidates = dedupeCandidates([
        ...extractExplicitInjuries(summary),
        ...collectFallbackInjuries(summary)
      ]);

      if (candidates.length > 0) {
        eventsWithAvailability += 1;
      }

      for (const candidate of candidates) {
        const teamId = candidate.teamEspnId ? teamByEspnId.get(candidate.teamEspnId)?.id : null;
        if (!teamId) {
          skipped += 1;
          continue;
        }
        const player = await findOrCreatePlayer({
          leagueId: league.id,
          teamId,
          athlete: candidate.athlete
        });
        const status = mapEspnStatus(candidate.statusText);

        await prisma.injury.deleteMany({
          where: {
            playerId: player.id,
            source: "espn_summary_availability",
            reportedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        });

        await prisma.injury.create({
          data: {
            leagueId: league.id,
            teamId,
            playerId: player.id,
            status,
            source: "espn_summary_availability",
            description: candidate.description ?? candidate.statusText,
            reportedAt: candidate.reportedAt,
            metadataJson: toJson({
              espnEventId: eventId,
              espnTeamId: candidate.teamEspnId,
              espnAthleteId: candidate.athlete.id ?? null,
              rawStatusText: candidate.statusText,
              raw: candidate.raw
            })
          }
        });
        injuriesWritten += 1;

        await prisma.player.update({
          where: { id: player.id },
          data: { status }
        });
        playersUpdated += 1;
      }
    }
  }

  return {
    attemptedEvents,
    eventsWithAvailability,
    injuriesWritten,
    playersUpdated,
    skipped
  };
}
