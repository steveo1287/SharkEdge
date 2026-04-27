import { prisma } from "@/lib/db/prisma";

export type LiveNbaInjuryStatus = "ACTIVE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT";

export type LiveNbaLineupPlayer = {
  playerId?: string | null;
  playerName: string;
  teamAbbreviation: string;
  position?: string | null;
  starter?: boolean | null;
  injuryStatus?: LiveNbaInjuryStatus | null;
  projectedMinutes?: number | null;
  seasonMinutes?: number | null;
  usageRate?: number | null;
  rolePriority?: number | null;
  source: string;
  updatedAt: string;
};

export type LiveNbaTeamLineup = {
  teamAbbreviation: string;
  gameId?: string | null;
  players: LiveNbaLineupPlayer[];
  source: string;
  updatedAt: string;
};

export type LiveNbaIngestionResult = {
  ok: boolean;
  source: string;
  teams: number;
  players: number;
  injuries: number;
  warnings: string[];
};

function normalizeStatus(value: string | null | undefined): LiveNbaInjuryStatus {
  const raw = String(value ?? "ACTIVE").toUpperCase();
  if (raw.includes("OUT")) return "OUT";
  if (raw.includes("DOUBT")) return "DOUBTFUL";
  if (raw.includes("QUESTION") || raw === "Q") return "QUESTIONABLE";
  return "ACTIVE";
}

function normalizeMinutes(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.min(48, num)) : null;
}

export function normalizeLiveLineupPayload(payload: unknown, source = "manual"): LiveNbaTeamLineup[] {
  if (!payload || typeof payload !== "object") return [];
  const raw: any = payload;
  const teams = Array.isArray(raw.teams) ? raw.teams : Array.isArray(raw) ? raw : [];

  return teams.map((team: any) => {
    const teamAbbreviation = String(team.teamAbbreviation ?? team.team ?? team.abbreviation ?? "").toUpperCase();
    const players = Array.isArray(team.players) ? team.players : [];
    const updatedAt = String(team.updatedAt ?? new Date().toISOString());

    return {
      teamAbbreviation,
      gameId: team.gameId ?? null,
      source,
      updatedAt,
      players: players.map((player: any) => ({
        playerId: player.playerId ?? player.id ?? null,
        playerName: String(player.playerName ?? player.name ?? "Unknown Player"),
        teamAbbreviation,
        position: player.position ?? null,
        starter: typeof player.starter === "boolean" ? player.starter : null,
        injuryStatus: normalizeStatus(player.injuryStatus ?? player.status),
        projectedMinutes: normalizeMinutes(player.projectedMinutes ?? player.minutes),
        seasonMinutes: normalizeMinutes(player.seasonMinutes),
        usageRate: typeof player.usageRate === "number" ? player.usageRate : null,
        rolePriority: typeof player.rolePriority === "number" ? player.rolePriority : null,
        source,
        updatedAt
      }))
    };
  }).filter((team) => team.teamAbbreviation && team.players.length);
}

export async function ingestLiveNbaLineups(payload: unknown, source = "manual"): Promise<LiveNbaIngestionResult> {
  const teams = normalizeLiveLineupPayload(payload, source);
  const warnings: string[] = [];
  let players = 0;
  let injuries = 0;

  for (const team of teams) {
    for (const player of team.players) {
      players++;
      if (player.injuryStatus && player.injuryStatus !== "ACTIVE") injuries++;

      try {
        const dbPlayer = player.playerId
          ? await prisma.player.findFirst({ where: { id: player.playerId } })
          : await prisma.player.findFirst({
              where: {
                name: player.playerName,
                team: { abbreviation: team.teamAbbreviation }
              }
            });

        if (!dbPlayer) {
          warnings.push(`Unmatched NBA player: ${player.playerName} (${team.teamAbbreviation})`);
          continue;
        }

        await prisma.player.update({
          where: { id: dbPlayer.id },
          data: {
            status: player.injuryStatus ?? "ACTIVE",
            updatedAt: new Date(player.updatedAt)
          }
        });
      } catch (error) {
        warnings.push(`Failed to upsert live lineup row for ${player.playerName}`);
      }
    }
  }

  return {
    ok: true,
    source,
    teams: teams.length,
    players,
    injuries,
    warnings: warnings.slice(0, 25)
  };
}

export async function fetchConfiguredNbaLineupPayload(): Promise<unknown | null> {
  const url = process.env.NBA_LINEUP_INJURY_FEED_URL;
  if (!url) return null;

  const response = await fetch(url, {
    headers: process.env.NBA_LINEUP_INJURY_FEED_TOKEN
      ? { Authorization: `Bearer ${process.env.NBA_LINEUP_INJURY_FEED_TOKEN}` }
      : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`NBA lineup feed failed: ${response.status}`);
  }

  return response.json();
}

export async function runLiveNbaLineupIngestion(): Promise<LiveNbaIngestionResult> {
  const payload = await fetchConfiguredNbaLineupPayload();
  if (!payload) {
    return {
      ok: true,
      source: "none",
      teams: 0,
      players: 0,
      injuries: 0,
      warnings: ["NBA_LINEUP_INJURY_FEED_URL is not configured; ingestion skipped"]
    };
  }

  return ingestLiveNbaLineups(payload, "configured-feed");
}
