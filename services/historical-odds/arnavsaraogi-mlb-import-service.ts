import { readFile } from "node:fs/promises";
import path from "node:path";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { americanToDecimal, americanToImpliedProbability } from "@/lib/utils/odds";
import { invalidateTrendCache } from "@/services/trends/cache";

type ArnavMlbImportArgs = {
  path: string;
  dryRun?: boolean;
};

type ArnavMlbImportResult = {
  ok: true;
  path: string;
  dryRun: boolean;
  importedRows: number;
  eventCount: number;
  marketCount: number;
  snapshotCount: number;
  skippedRows: number;
  warnings: string[];
  sourceKey: "arnavsaraogi_mlb_scraper";
};

type ArnavLine = {
  homeOdds?: number | string | null;
  awayOdds?: number | string | null;
  homeSpread?: number | string | null;
  awaySpread?: number | string | null;
  overOdds?: number | string | null;
  underOdds?: number | string | null;
  total?: number | string | null;
};

type ArnavBook = {
  sportsbook?: string | null;
  openingLine?: ArnavLine | null;
  currentLine?: ArnavLine | null;
};

type ArnavGame = {
  gameId?: string | null;
  date?: string | null;
  startTime?: string | null;
  commence_time?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  moneyline?: ArnavBook[] | null;
  spreads?: ArnavBook[] | null;
  totals?: ArnavBook[] | null;
  books?: ArnavBook[] | null;
  sportsbooks?: ArnavBook[] | null;
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

const SOURCE_KEY = "arnavsaraogi_mlb_scraper" as const;
const LEAGUE_KEY = "MLB";
const SPORT_KEY = "baseball";

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

function parseDateTime(game: ArnavGame) {
  const candidates = [game.commence_time, game.startTime, game.date];
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  return new Date();
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

async function loadRowsFromFile(filePath: string): Promise<ArnavGame[]> {
  const raw = (await readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".json") {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as ArnavGame[];
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (Array.isArray(record.games)) return record.games as ArnavGame[];
      if (Array.isArray(record.data)) return record.data as ArnavGame[];
      const merged = Object.values(record).flatMap((v) => (Array.isArray(v) ? v : []));
      return merged as ArnavGame[];
    }
    throw new Error("Arnav JSON import must be an array or object containing games arrays.");
  }

  if (extension === ".csv") {
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) return [];
    const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
    return lines.slice(1).map((line) => {
      const values = splitCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] ?? "";
      });
      return row as unknown as ArnavGame;
    });
  }

  throw new Error("Unsupported Arnav import format. Use .json or .csv.");
}

function isHistoricalMarketRow(market: HistoricalMarketCandidate): market is HistoricalMarketRow {
  return typeof market.price === "number";
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
    select: { line: true, oddsAmerican: true }
  });
  const opening = snapshots[0] ?? null;
  const latest = snapshots.at(-1) ?? null;
  if (!opening || !latest) return;
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
}

async function ensureLeagueProfile(tx: Prisma.TransactionClient) {
  const sport = await tx.sport.upsert({
    where: { key: SPORT_KEY },
    update: { name: "Baseball", code: "BASEBALL", category: "team" },
    create: { key: SPORT_KEY, name: "Baseball", code: "BASEBALL", category: "team" }
  });

  const league = await tx.league.upsert({
    where: { key: LEAGUE_KEY },
    update: { name: "Major League Baseball", sport: "BASEBALL", sportId: sport.id },
    create: { key: LEAGUE_KEY, name: "Major League Baseball", sport: "BASEBALL", sportId: sport.id }
  });

  return { sport, league };
}

async function ensureTeam(tx: Prisma.TransactionClient, leagueId: string, name: string) {
  const normalized = normalizeToken(name);
  const alias = await tx.teamAlias.findFirst({
    where: { normalizedAlias: normalized },
    include: { team: true }
  });
  if (alias?.team) return alias.team;

  const existing = await tx.team.findFirst({
    where: {
      leagueId,
      OR: [{ name: { equals: name, mode: "insensitive" } }, { abbreviation: deriveAbbreviation(name) }]
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
        externalIds: { source: SOURCE_KEY }
      }
    }));

  await tx.teamAlias.upsert({
    where: {
      source_normalizedAlias: { source: SOURCE_KEY, normalizedAlias: normalized }
    },
    update: { alias: name, teamId: team.id },
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
  args: { leagueId: string; sportId: string; teamId: string; name: string }
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

async function ensureSportsbook(tx: Prisma.TransactionClient, bookmakerName: string) {
  const key = normalizeToken(bookmakerName) || SOURCE_KEY;
  return tx.sportsbook.upsert({
    where: { key },
    update: { name: bookmakerName, region: "US", isActive: true },
    create: { key, name: bookmakerName, region: "US", isActive: true }
  });
}

function collectBooks(game: ArnavGame) {
  const books: ArnavBook[] = [];
  const merged = [...(game.books ?? []), ...(game.sportsbooks ?? [])];
  if (merged.length) books.push(...merged);

  for (const [bookRows, marketType] of [
    [game.moneyline ?? [], "moneyline"] as const,
    [game.spreads ?? [], "spreads"] as const,
    [game.totals ?? [], "totals"] as const
  ]) {
    for (const book of bookRows) {
      const sportsbook = (book.sportsbook ?? "Sportsbook Review").trim();
      const existing = books.find((b) => normalizeToken(b.sportsbook) === normalizeToken(sportsbook));
      if (existing) {
        if (marketType === "moneyline" && !existing.openingLine) existing.openingLine = book.openingLine;
        if (marketType === "moneyline" && !existing.currentLine) existing.currentLine = book.currentLine;
        existing.openingLine = { ...(existing.openingLine ?? {}), ...(book.openingLine ?? {}) };
        existing.currentLine = { ...(existing.currentLine ?? {}), ...(book.currentLine ?? {}) };
      } else {
        books.push({ sportsbook, openingLine: book.openingLine ?? null, currentLine: book.currentLine ?? null });
      }
    }
  }

  return books;
}

function toMarkets(args: {
  book: ArnavBook;
  homeTeamName: string;
  awayTeamName: string;
  homeCompetitorId: string;
  awayCompetitorId: string;
  isOpening: boolean;
}): HistoricalMarketRow[] {
  const line = args.isOpening ? args.book.openingLine : args.book.currentLine;
  if (!line) return [];
  const rows: HistoricalMarketCandidate[] = [
    {
      marketType: "moneyline",
      selection: args.awayTeamName,
      side: "AWAY",
      line: null,
      price: toNumber(line.awayOdds),
      selectionCompetitorId: args.awayCompetitorId
    },
    {
      marketType: "moneyline",
      selection: args.homeTeamName,
      side: "HOME",
      line: null,
      price: toNumber(line.homeOdds),
      selectionCompetitorId: args.homeCompetitorId
    },
    {
      marketType: "spread",
      selection: args.awayTeamName,
      side: "AWAY",
      line: toNumber(line.awaySpread),
      price: toNumber(line.awayOdds),
      selectionCompetitorId: args.awayCompetitorId
    },
    {
      marketType: "spread",
      selection: args.homeTeamName,
      side: "HOME",
      line: toNumber(line.homeSpread),
      price: toNumber(line.homeOdds),
      selectionCompetitorId: args.homeCompetitorId
    },
    {
      marketType: "total",
      selection: "Over",
      side: "OVER",
      line: toNumber(line.total),
      price: toNumber(line.overOdds),
      selectionCompetitorId: null
    },
    {
      marketType: "total",
      selection: "Under",
      side: "UNDER",
      line: toNumber(line.total),
      price: toNumber(line.underOdds),
      selectionCompetitorId: null
    }
  ];
  return rows.filter(isHistoricalMarketRow);
}

export async function importArnavSaraogiMlbHistoricalOdds(
  args: ArnavMlbImportArgs
): Promise<ArnavMlbImportResult> {
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
      const homeTeamName = (row.homeTeam ?? row.home_team ?? "").trim();
      const awayTeamName = (row.awayTeam ?? row.away_team ?? "").trim();
      if (!homeTeamName || !awayTeamName) {
        skippedRows += 1;
        warnings.push("Skipped Arnav row because teams were missing.");
        continue;
      }

      const startAt = parseDateTime(row);
      const openingCapturedAt = new Date(startAt.getTime() - 12 * 60 * 60 * 1000);
      const currentCapturedAt = new Date(startAt.getTime() - 30 * 60 * 1000);
      const gameKey = row.gameId?.trim() || `${normalizeToken(awayTeamName)}:${normalizeToken(homeTeamName)}:${startAt.toISOString().slice(0, 10)}`;

      await prisma.$transaction(async (tx) => {
        const { sport, league } = await ensureLeagueProfile(tx);
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

        const eventExternalId = `${SOURCE_KEY}:${gameKey}`;
        const event = await tx.event.upsert({
          where: { externalEventId: eventExternalId },
          update: {
            leagueId: league.id,
            sportId: sport.id,
            providerKey: SOURCE_KEY,
            name: `${awayTeam.name} at ${homeTeam.name}`,
            startTime: startAt,
            metadataJson: { sourceType: "HARVESTED_HISTORICAL" },
            syncState: "FRESH",
            lastSyncedAt: currentCapturedAt
          },
          create: {
            externalEventId: eventExternalId,
            leagueId: league.id,
            sportId: sport.id,
            providerKey: SOURCE_KEY,
            name: `${awayTeam.name} at ${homeTeam.name}`,
            slug: normalizeToken(eventExternalId),
            startTime: startAt,
            status: "SCHEDULED",
            resultState: "PENDING",
            eventType: "TEAM_HEAD_TO_HEAD",
            metadataJson: { sourceType: "HARVESTED_HISTORICAL" },
            syncState: "FRESH",
            lastSyncedAt: currentCapturedAt
          }
        });

        await tx.eventParticipant.upsert({
          where: { eventId_competitorId: { eventId: event.id, competitorId: awayCompetitor.id } },
          update: { role: "AWAY", sortOrder: 0, isHome: false },
          create: { eventId: event.id, competitorId: awayCompetitor.id, role: "AWAY", sortOrder: 0, isHome: false }
        });
        await tx.eventParticipant.upsert({
          where: { eventId_competitorId: { eventId: event.id, competitorId: homeCompetitor.id } },
          update: { role: "HOME", sortOrder: 1, isHome: true },
          create: { eventId: event.id, competitorId: homeCompetitor.id, role: "HOME", sortOrder: 1, isHome: true }
        });

        if (!seenEvents.has(event.id)) {
          seenEvents.add(event.id);
          eventCount += 1;
        }

        const books = collectBooks(row);
        for (const book of books) {
          const bookmakerName = (book.sportsbook ?? "Sportsbook Review").trim() || "Sportsbook Review";
          const sportsbook = await ensureSportsbook(tx, bookmakerName);
          const openingMarkets = toMarkets({
            book,
            homeTeamName: homeTeam.name,
            awayTeamName: awayTeam.name,
            homeCompetitorId: homeCompetitor.id,
            awayCompetitorId: awayCompetitor.id,
            isOpening: true
          });
          const currentMarkets = toMarkets({
            book,
            homeTeamName: homeTeam.name,
            awayTeamName: awayTeam.name,
            homeCompetitorId: homeCompetitor.id,
            awayCompetitorId: awayCompetitor.id,
            isOpening: false
          });

          for (const market of [...openingMarkets, ...currentMarkets]) {
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
                updatedAt: currentCapturedAt
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
                updatedAt: currentCapturedAt
              } as Prisma.EventMarketUncheckedCreateInput
            });

            const snapshotPairs = [
              { at: openingCapturedAt, source: "opening" as const, set: openingMarkets },
              { at: currentCapturedAt, source: "current" as const, set: currentMarkets }
            ];
            for (const snap of snapshotPairs) {
              const selected = snap.set.find(
                (candidate) =>
                  candidate.marketType === market.marketType &&
                  candidate.selection === market.selection &&
                  candidate.side === market.side &&
                  (candidate.line ?? null) === (market.line ?? null)
              );
              if (!selected) continue;
              const existingSnapshot = await tx.eventMarketSnapshot.findFirst({
                where: { eventMarketId, capturedAt: snap.at },
                select: { id: true }
              });
              if (!existingSnapshot) {
                await tx.eventMarketSnapshot.create({
                  data: {
                    eventMarketId,
                    capturedAt: snap.at,
                    line: selected.line,
                    oddsAmerican: selected.price,
                    impliedProbability: americanToImpliedProbability(selected.price) ?? 0
                  }
                });
                snapshotCount += 1;
              }
            }

            await refreshMarketAnchors(tx, eventMarketId);
            marketCount += 1;
          }
        }
      });
    } catch (error) {
      skippedRows += 1;
      warnings.push(
        `Skipped Arnav row: ${error instanceof Error ? error.message : "unknown import error"}`
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

