import { readFile } from "node:fs/promises";
import path from "node:path";

import { Prisma, SportCode } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { americanToDecimal, americanToImpliedProbability } from "@/lib/utils/odds";
import { invalidateTrendCache } from "@/services/trends/cache";

type SupportedLeagueKey = "NBA" | "MLB" | "NFL" | "NHL";

type SportsbookReviewImportArgs = {
  path: string;
  dryRun?: boolean;
  league?: SupportedLeagueKey | "ALL";
};

type SportsbookReviewImportResult = {
  ok: true;
  path: string;
  dryRun: boolean;
  importedRows: number;
  eventCount: number;
  marketCount: number;
  snapshotCount: number;
  skippedRows: number;
  warnings: string[];
  sourceKey: "sportsbookreview_historical";
};

type SportsbookReviewRow = {
  league?: string | null;
  sport?: string | null;
  date?: string | null;
  commence_time?: string | null;
  start_time?: string | null;
  game_time?: string | null;
  event_id?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  sportsbook?: string | null;
  bookmaker?: string | null;
  book?: string | null;
  home_ml?: number | string | null;
  away_ml?: number | string | null;
  home_spread?: number | string | null;
  away_spread?: number | string | null;
  home_spread_odds?: number | string | null;
  away_spread_odds?: number | string | null;
  total?: number | string | null;
  over_odds?: number | string | null;
  under_odds?: number | string | null;
};

type HistoricalMarketCandidate = {
  marketType: "moneyline" | "spread" | "total";
  selection: string;
  side: string;
  line: number | null;
  price: number | null;
  selectionCompetitorId: string | null;
};

type HistoricalMarketRow = Omit<HistoricalMarketCandidate, "price"> & {
  price: number;
};

const SOURCE_KEY = "sportsbookreview_historical" as const;

const LEAGUE_CONFIG: Record<
  SupportedLeagueKey,
  {
    leagueName: string;
    sportCode: SportCode;
    sportKey: string;
    sportName: string;
  }
> = {
  NBA: {
    leagueName: "NBA",
    sportCode: "BASKETBALL",
    sportKey: "basketball",
    sportName: "Basketball"
  },
  MLB: {
    leagueName: "Major League Baseball",
    sportCode: "BASEBALL",
    sportKey: "baseball",
    sportName: "Baseball"
  },
  NFL: {
    leagueName: "National Football League",
    sportCode: "FOOTBALL",
    sportKey: "football",
    sportName: "Football"
  },
  NHL: {
    leagueName: "National Hockey League",
    sportCode: "HOCKEY",
    sportKey: "hockey",
    sportName: "Hockey"
  }
};

function normalizeToken(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

function deriveAbbreviation(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts
      .slice(0, 3)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function splitCsvLine(value: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (char === '"') {
      if (inQuotes && value[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

async function loadRowsFromFile(filePath: string) {
  const raw = (await readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".json") {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as SportsbookReviewRow[];
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { rows?: unknown[] }).rows)
    ) {
      return (parsed as { rows: SportsbookReviewRow[] }).rows;
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { items?: unknown[] }).items)
    ) {
      return (parsed as { items: SportsbookReviewRow[] }).items;
    }

    if (parsed && typeof parsed === "object") {
      return Object.values(parsed as Record<string, unknown>).flatMap((value) =>
        Array.isArray(value) ? (value as SportsbookReviewRow[]) : []
      );
    }

    throw new Error("JSON import must be an array or an object containing arrays.");
  }

  if (extension === ".csv") {
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      return [];
    }

    const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase());
    return lines.slice(1).map((line) => {
      const values = splitCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return row as SportsbookReviewRow;
    });
  }

  throw new Error("Unsupported historical import format. Use .json or .csv exports.");
}

function resolveLeagueKey(row: SportsbookReviewRow, fallback?: SupportedLeagueKey | "ALL") {
  if (fallback && fallback !== "ALL") {
    return fallback;
  }

  const normalized = normalizeToken(row.league ?? row.sport);
  if (normalized === "nba" || normalized === "basketball_nba") return "NBA";
  if (normalized === "mlb" || normalized === "baseball_mlb") return "MLB";
  if (normalized === "nfl" || normalized === "americanfootball_nfl") return "NFL";
  if (normalized === "nhl" || normalized === "icehockey_nhl") return "NHL";
  return null;
}

function parseDateTime(row: SportsbookReviewRow) {
  const candidates = [row.commence_time, row.start_time, row.game_time, row.date];
  for (const candidate of candidates) {
    if (!candidate?.trim()) {
      continue;
    }

    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) {
      return new Date(parsed);
    }
  }

  return new Date();
}

function isHistoricalMarketRow(market: HistoricalMarketCandidate): market is HistoricalMarketRow {
  return typeof market.price === "number";
}

async function ensureLeagueProfile(
  tx: Prisma.TransactionClient,
  leagueKey: SupportedLeagueKey
) {
  const config = LEAGUE_CONFIG[leagueKey];
  const sport = await tx.sport.upsert({
    where: { key: config.sportKey },
    update: {
      name: config.sportName,
      code: config.sportCode,
      category: "team"
    },
    create: {
      key: config.sportKey,
      name: config.sportName,
      code: config.sportCode,
      category: "team"
    }
  });

  const league = await tx.league.upsert({
    where: { key: leagueKey },
    update: {
      name: config.leagueName,
      sport: config.sportCode,
      sportId: sport.id
    },
    create: {
      key: leagueKey,
      name: config.leagueName,
      sport: config.sportCode,
      sportId: sport.id
    }
  });

  return { sport, league };
}

async function ensureTeam(tx: Prisma.TransactionClient, leagueId: string, name: string) {
  const normalized = normalizeToken(name);
  const alias = await tx.teamAlias.findFirst({
    where: { normalizedAlias: normalized },
    include: { team: true }
  });
  if (alias?.team) {
    return alias.team;
  }

  const existing = await tx.team.findFirst({
    where: {
      leagueId,
      OR: [
        { name: { equals: name, mode: "insensitive" } },
        { abbreviation: deriveAbbreviation(name) }
      ]
    }
  });

  const team =
    existing ??
    (await tx.team.create({
      data: {
        leagueId,
        key: `${leagueId}:${normalized}`,
        name,
        abbreviation: deriveAbbreviation(name),
        externalIds: {
          source: SOURCE_KEY
        }
      }
    }));

  await tx.teamAlias.upsert({
    where: {
      source_normalizedAlias: {
        source: SOURCE_KEY,
        normalizedAlias: normalized
      }
    },
    update: {
      alias: name,
      teamId: team.id
    },
    create: {
      teamId: team.id,
      source: SOURCE_KEY,
      alias: name,
      normalizedAlias: normalized
    }
  });

  return team;
}

async function ensureCompetitor(
  tx: Prisma.TransactionClient,
  args: {
    leagueId: string;
    sportId: string;
    teamId: string;
    name: string;
  }
) {
  const key = `team:${args.teamId}`;
  return tx.competitor.upsert({
    where: { key },
    update: {
      name: args.name,
      shortName: args.name,
      abbreviation: deriveAbbreviation(args.name),
      teamId: args.teamId,
      leagueId: args.leagueId,
      sportId: args.sportId,
      type: "TEAM"
    },
    create: {
      key,
      name: args.name,
      shortName: args.name,
      abbreviation: deriveAbbreviation(args.name),
      teamId: args.teamId,
      leagueId: args.leagueId,
      sportId: args.sportId,
      type: "TEAM",
      externalIds: Prisma.JsonNull,
      metadataJson: Prisma.JsonNull
    }
  });
}

async function ensureSportsbook(
  tx: Prisma.TransactionClient,
  bookmakerName: string
) {
  const key = normalizeToken(bookmakerName) || SOURCE_KEY;
  return tx.sportsbook.upsert({
    where: { key },
    update: {
      name: bookmakerName,
      region: "US",
      isActive: true
    },
    create: {
      key,
      name: bookmakerName,
      region: "US",
      isActive: true
    }
  });
}

function buildEventMarketId(args: {
  eventId: string;
  sportsbookId: string;
  marketType: "moneyline" | "spread" | "total";
  selection: string;
  side: string;
  line: number | null;
}) {
  const lineKey =
    typeof args.line === "number" && Number.isFinite(args.line)
      ? args.line.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")
      : "none";

  return [
    SOURCE_KEY,
    args.eventId,
    args.sportsbookId,
    args.marketType,
    normalizeToken(args.selection),
    normalizeToken(args.side),
    lineKey
  ].join(":");
}

async function refreshMarketAnchors(tx: Prisma.TransactionClient, eventMarketId: string) {
  const snapshots = await tx.eventMarketSnapshot.findMany({
    where: { eventMarketId },
    orderBy: { capturedAt: "asc" },
    select: {
      line: true,
      oddsAmerican: true
    }
  });

  const opening = snapshots[0] ?? null;
  const latest = snapshots.at(-1) ?? null;
  if (!opening || !latest) {
    return false;
  }

  await tx.eventMarket.update({
    where: { id: eventMarketId },
    data: {
      openingLine: opening.line,
      currentLine: latest.line,
      closingLine: latest.line,
      openingOdds: opening.oddsAmerican,
      currentOdds: latest.oddsAmerican,
      closingOdds: latest.oddsAmerican
    }
  });

  return true;
}

export async function importSportsbookReviewHistoricalOdds(
  args: SportsbookReviewImportArgs
): Promise<SportsbookReviewImportResult> {
  const rows = await loadRowsFromFile(args.path);
  const warnings: string[] = [];
  let eventCount = 0;
  let marketCount = 0;
  let snapshotCount = 0;
  let skippedRows = 0;
  const seenEvents = new Set<string>();

  if (args.dryRun) {
    return {
      ok: true,
      path: args.path,
      dryRun: true,
      importedRows: rows.length,
      eventCount,
      marketCount,
      snapshotCount,
      skippedRows,
      warnings,
      sourceKey: SOURCE_KEY
    };
  }

  for (const row of rows) {
    try {
      const leagueKey = resolveLeagueKey(row, args.league);
      const homeTeamName = row.home_team?.trim();
      const awayTeamName = row.away_team?.trim();
      const bookmakerName =
        row.sportsbook?.trim() ||
        row.bookmaker?.trim() ||
        row.book?.trim() ||
        "Sportsbook Review";

      if (!leagueKey || !homeTeamName || !awayTeamName) {
        skippedRows += 1;
        warnings.push("Skipped a SportsbookReview row because league or teams were missing.");
        continue;
      }

      const capturedAt = parseDateTime(row);

      await prisma.$transaction(async (tx) => {
        const { sport, league } = await ensureLeagueProfile(tx, leagueKey);
        const homeTeam = await ensureTeam(tx, league.id, homeTeamName);
        const awayTeam = await ensureTeam(tx, league.id, awayTeamName);
        const homeCompetitor = await ensureCompetitor(tx, {
          leagueId: league.id,
          sportId: sport.id,
          teamId: homeTeam.id,
          name: homeTeam.name
        });
        const awayCompetitor = await ensureCompetitor(tx, {
          leagueId: league.id,
          sportId: sport.id,
          teamId: awayTeam.id,
          name: awayTeam.name
        });
        const eventExternalId =
          row.event_id?.trim() ||
          `${SOURCE_KEY}:${leagueKey}:${normalizeToken(awayTeam.name)}:${normalizeToken(homeTeam.name)}:${capturedAt.toISOString().slice(0, 10)}`;
        const event = await tx.event.upsert({
          where: {
            externalEventId: eventExternalId
          },
          update: {
            leagueId: league.id,
            sportId: sport.id,
            providerKey: SOURCE_KEY,
            name: `${awayTeam.name} at ${homeTeam.name}`,
            startTime: capturedAt,
            metadataJson: {
              sourceType: "HARVESTED_HISTORICAL"
            },
            syncState: "FRESH",
            lastSyncedAt: capturedAt
          },
          create: {
            externalEventId: eventExternalId,
            leagueId: league.id,
            sportId: sport.id,
            providerKey: SOURCE_KEY,
            name: `${awayTeam.name} at ${homeTeam.name}`,
            slug: normalizeToken(eventExternalId),
            startTime: capturedAt,
            status: "SCHEDULED",
            resultState: "PENDING",
            eventType: "TEAM_HEAD_TO_HEAD",
            metadataJson: {
              sourceType: "HARVESTED_HISTORICAL"
            },
            syncState: "FRESH",
            lastSyncedAt: capturedAt
          }
        });

        await tx.eventParticipant.upsert({
          where: {
            eventId_competitorId: {
              eventId: event.id,
              competitorId: awayCompetitor.id
            }
          },
          update: {
            role: "AWAY",
            sortOrder: 0,
            isHome: false
          },
          create: {
            eventId: event.id,
            competitorId: awayCompetitor.id,
            role: "AWAY",
            sortOrder: 0,
            isHome: false
          }
        });

        await tx.eventParticipant.upsert({
          where: {
            eventId_competitorId: {
              eventId: event.id,
              competitorId: homeCompetitor.id
            }
          },
          update: {
            role: "HOME",
            sortOrder: 1,
            isHome: true
          },
          create: {
            eventId: event.id,
            competitorId: homeCompetitor.id,
            role: "HOME",
            sortOrder: 1,
            isHome: true
          }
        });

        if (!seenEvents.has(event.id)) {
          seenEvents.add(event.id);
          eventCount += 1;
        }

        const sportsbook = await ensureSportsbook(tx, bookmakerName);
        const marketRows: HistoricalMarketCandidate[] = [
          {
            marketType: "moneyline" as const,
            selection: awayTeam.name,
            side: "AWAY",
            line: null,
            price: toNumber(row.away_ml),
            selectionCompetitorId: awayCompetitor.id
          },
          {
            marketType: "moneyline" as const,
            selection: homeTeam.name,
            side: "HOME",
            line: null,
            price: toNumber(row.home_ml),
            selectionCompetitorId: homeCompetitor.id
          },
          {
            marketType: "spread" as const,
            selection: awayTeam.name,
            side: "AWAY",
            line: toNumber(row.away_spread),
            price: toNumber(row.away_spread_odds),
            selectionCompetitorId: awayCompetitor.id
          },
          {
            marketType: "spread" as const,
            selection: homeTeam.name,
            side: "HOME",
            line: toNumber(row.home_spread),
            price: toNumber(row.home_spread_odds),
            selectionCompetitorId: homeCompetitor.id
          },
          {
            marketType: "total" as const,
            selection: "Over",
            side: "OVER",
            line: toNumber(row.total),
            price: toNumber(row.over_odds),
            selectionCompetitorId: null
          },
          {
            marketType: "total" as const,
            selection: "Under",
            side: "UNDER",
            line: toNumber(row.total),
            price: toNumber(row.under_odds),
            selectionCompetitorId: null
          }
        ];

        for (const market of marketRows.filter(isHistoricalMarketRow)) {
          const eventMarketId = buildEventMarketId({
            eventId: event.id,
            sportsbookId: sportsbook.id,
            marketType: market.marketType,
            selection: market.selection,
            side: market.side,
            line: market.line
          });

          await tx.eventMarket.upsert({
            where: { id: eventMarketId },
            update: {
              eventId: event.id,
              sportsbookId: sportsbook.id,
              marketType: market.marketType,
              marketLabel: `${market.selection} ${market.marketType}`,
              period: "full_game",
              selection: market.selection,
              side: market.side,
              line: market.line,
              oddsAmerican: market.price,
              oddsDecimal: americanToDecimal(market.price),
              impliedProbability: americanToImpliedProbability(market.price),
              sourceKey: SOURCE_KEY,
              selectionCompetitorId: market.selectionCompetitorId,
              updatedAt: capturedAt
            } as Prisma.EventMarketUncheckedUpdateInput,
            create: {
              id: eventMarketId,
              eventId: event.id,
              sportsbookId: sportsbook.id,
              marketType: market.marketType,
              marketLabel: `${market.selection} ${market.marketType}`,
              period: "full_game",
              selection: market.selection,
              side: market.side,
              line: market.line,
              oddsAmerican: market.price,
              oddsDecimal: americanToDecimal(market.price),
              impliedProbability: americanToImpliedProbability(market.price),
              openingLine: market.line,
              currentLine: market.line,
              closingLine: market.line,
              openingOdds: market.price,
              currentOdds: market.price,
              closingOdds: market.price,
              isLive: false,
              sourceKey: SOURCE_KEY,
              selectionCompetitorId: market.selectionCompetitorId,
              updatedAt: capturedAt
            } as Prisma.EventMarketUncheckedCreateInput
          });

          const existingSnapshot = await tx.eventMarketSnapshot.findFirst({
            where: {
              eventMarketId,
              capturedAt
            },
            select: {
              id: true
            }
          });

          if (!existingSnapshot) {
            await tx.eventMarketSnapshot.create({
              data: {
                eventMarketId,
                capturedAt,
                line: market.line,
                oddsAmerican: market.price,
                impliedProbability: americanToImpliedProbability(market.price) ?? 0
              }
            });
            snapshotCount += 1;
          }

          await refreshMarketAnchors(tx, eventMarketId);
          marketCount += 1;
        }
      });
    } catch (error) {
      skippedRows += 1;
      warnings.push(
        `Skipped a SportsbookReview row: ${
          error instanceof Error ? error.message : "unknown import error"
        }`
      );
    }
  }

  await invalidateTrendCache();

  return {
    ok: true,
    path: args.path,
    dryRun: false,
    importedRows: rows.length,
    eventCount,
    marketCount,
    snapshotCount,
    skippedRows,
    warnings,
    sourceKey: SOURCE_KEY
  };
}
