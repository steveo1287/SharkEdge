import { prisma } from "@/lib/db/prisma";

// Captures closing moneyline and total lines for MLB games from the EventMarket
// table into mlb_market_open_close. Runs as a cron just before first pitch
// and again shortly after game start to lock closing prices.

type ClosingCaptureResult = {
  eventsScanned: number;
  marketsScanned: number;
  closingRowsUpserted: number;
  openRowsUpserted: number;
  skipped: number;
  warnings: string[];
};

type EventRow = {
  id: string;
  startTime: Date;
  league: { key: string };
  participants: Array<{
    isHome: boolean;
    competitor: { name: string; externalIds: unknown };
  }>;
};

type MarketRow = {
  id: string;
  eventId: string;
  marketType: string;
  selection: string | null;
  oddsAmerican: number;
  currentOdds: number | null;
  currentLine: number | null;
  line: number | null;
  closingOdds: number | null;
  closingLine: number | null;
  openingOdds: number | null;
  openingLine: number | null;
  sportsbook: { name: string } | null;
  updatedAt: Date;
};

type GamePkRow = { game_pk: number };

function impliedFromAmerican(odds: number): number {
  if (!Number.isFinite(odds)) return 0.5;
  if (odds > 0) return 100 / (odds + 100);
  const abs = Math.abs(odds);
  return abs / (abs + 100);
}

function americanFromImplied(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  if (p >= 0.5) return -Math.round((p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

function noVigLine(homeOdds: number, awayOdds: number): { homeNoVig: number; awayNoVig: number } {
  const homeImplied = impliedFromAmerican(homeOdds);
  const awayImplied = impliedFromAmerican(awayOdds);
  const total = homeImplied + awayImplied || 1;
  return {
    homeNoVig: Number((homeImplied / total).toFixed(4)),
    awayNoVig: Number((awayImplied / total).toFixed(4)),
  };
}

function marketId(gamePk: number, marketType: string, side: string, sbName: string) {
  return `mlb-cl:${gamePk}:${marketType}:${side}:${sbName.toLowerCase().replace(/\s+/g, "-")}`;
}

async function resolveGamePk(eventId: string, awayName: string, homeName: string): Promise<number | null> {
  const today = new Date().toISOString().slice(0, 10);
  // Use last 2 words of team name to handle multi-word names (Red Sox, Blue Jays, White Sox)
  const nameKey = (name: string) => name.trim().split(/\s+/).slice(-2).join(" ");
  const awayPat = `%${nameKey(awayName)}%`;
  const homePat = `%${nameKey(homeName)}%`;

  // Match by date + both team names
  const byBoth = await prisma.$queryRaw<GamePkRow[]>`
    SELECT game_pk FROM mlb_games
    WHERE official_date = ${today}::DATE
      AND lower(away_team_name) LIKE lower(${awayPat})
      AND lower(home_team_name) LIKE lower(${homePat})
    ORDER BY game_pk
    LIMIT 1
  `.catch(() => [] as GamePkRow[]);
  if (byBoth[0]?.game_pk) return byBoth[0].game_pk;

  // Looser fallback: match either team
  const byEither = await prisma.$queryRaw<GamePkRow[]>`
    SELECT game_pk FROM mlb_games
    WHERE official_date = ${today}::DATE
      AND (
        lower(away_team_name) LIKE lower(${awayPat})
        OR lower(home_team_name) LIKE lower(${homePat})
      )
    ORDER BY game_pk
    LIMIT 1
  `.catch(() => [] as GamePkRow[]);
  return byEither[0]?.game_pk ?? null;
}

async function ensureWarehouseTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS mlb_market_open_close (
      id TEXT PRIMARY KEY,
      game_pk INTEGER,
      event_id TEXT,
      market_type TEXT NOT NULL,
      side TEXT NOT NULL,
      selection TEXT,
      sportsbook_name TEXT,
      open_price DOUBLE PRECISION,
      close_price DOUBLE PRECISION,
      current_price DOUBLE PRECISION,
      open_point DOUBLE PRECISION,
      close_point DOUBLE PRECISION,
      current_point DOUBLE PRECISION,
      no_vig_probability DOUBLE PRECISION,
      first_seen_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ,
      source TEXT NOT NULL DEFAULT 'event_market_closing_capture',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS mlb_market_open_close_game_idx
    ON mlb_market_open_close (game_pk, market_type, side)
    WHERE game_pk IS NOT NULL
  `;
}

export async function captureMlbClosingLines(args: {
  windowBeforeMinutes?: number;
  windowAfterMinutes?: number;
  force?: boolean;
} = {}): Promise<ClosingCaptureResult> {
  const windowBefore = args.windowBeforeMinutes ?? 60;
  const windowAfter = args.windowAfterMinutes ?? 120;
  const force = args.force ?? false;
  const warnings: string[] = [];

  await ensureWarehouseTable().catch((err) => warnings.push(`Table ensure: ${err instanceof Error ? err.message : String(err)}`));

  const now = new Date();
  const startMin = new Date(now.getTime() - windowAfter * 60 * 1000);
  const startMax = new Date(now.getTime() + windowBefore * 60 * 1000);

  const events = await prisma.event.findMany({
    where: {
      startTime: { gte: startMin, lte: startMax },
      league: { key: "MLB" },
      status: { in: ["SCHEDULED", "LIVE", "FINAL"] },
    },
    include: {
      league: { select: { key: true } },
      participants: {
        include: { competitor: { select: { name: true, externalIds: true } } },
      },
    },
    orderBy: { startTime: "asc" },
  }) as EventRow[];

  let marketsScanned = 0;
  let closingRowsUpserted = 0;
  let openRowsUpserted = 0;
  let skipped = 0;

  for (const event of events) {
    const home = event.participants.find((p) => p.isHome)?.competitor;
    const away = event.participants.find((p) => !p.isHome)?.competitor;
    const homeName = home?.name ?? "UNK";
    const awayName = away?.name ?? "UNK";

    const gamePk = await resolveGamePk(event.id, awayName, homeName).catch(() => null);

    const markets = await prisma.eventMarket.findMany({
      where: {
        eventId: event.id,
        marketType: { in: ["moneyline", "spread", "total"] },
      },
      include: { sportsbook: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }) as MarketRow[];

    marketsScanned += markets.length;

    // Group moneyline markets by sportsbook to compute no-vig
    const mlBySb = new Map<string, { home: MarketRow | null; away: MarketRow | null }>();
    for (const m of markets) {
      if (m.marketType !== "moneyline") continue;
      const sb = m.sportsbook?.name ?? "consensus";
      const entry = mlBySb.get(sb) ?? { home: null, away: null };
      const sel = (m.selection ?? "").toLowerCase();
      if (sel === "home" || sel === homeName.toLowerCase()) entry.home = m;
      else if (sel === "away" || sel === awayName.toLowerCase()) entry.away = m;
      mlBySb.set(sb, entry);
    }

    for (const [sbName, pair] of mlBySb.entries()) {
      if (!pair.home && !pair.away) continue;

      const homeOdds = pair.home ? (pair.home.currentOdds ?? pair.home.oddsAmerican) : null;
      const awayOdds = pair.away ? (pair.away.currentOdds ?? pair.away.oddsAmerican) : null;
      const { homeNoVig, awayNoVig } = homeOdds && awayOdds
        ? noVigLine(homeOdds, awayOdds)
        : { homeNoVig: null as unknown as number, awayNoVig: null as unknown as number };

      for (const [side, m, noVigProb] of [
        ["home", pair.home, homeNoVig] as const,
        ["away", pair.away, awayNoVig] as const,
      ]) {
        if (!m) continue;
        const currentOdds = m.currentOdds ?? m.oddsAmerican;
        const closeOdds = m.closingOdds ?? currentOdds;
        const openOdds = m.openingOdds ?? currentOdds;

        if (!force && m.closingOdds !== null) { skipped += 1; continue; }

        const id = marketId(gamePk ?? 0, "moneyline", side, sbName);
        await prisma.$executeRaw`
          INSERT INTO mlb_market_open_close (
            id, game_pk, event_id, market_type, side, selection, sportsbook_name,
            open_price, close_price, current_price,
            no_vig_probability,
            first_seen_at, last_seen_at, source, updated_at
          ) VALUES (
            ${id}, ${gamePk ?? null}, ${event.id}, 'moneyline', ${side},
            ${m.selection}, ${sbName},
            ${openOdds}, ${closeOdds}, ${currentOdds},
            ${typeof noVigProb === "number" ? noVigProb : null},
            ${event.startTime}, now(), 'event_market_closing_capture', now()
          )
          ON CONFLICT (id) DO UPDATE SET
            close_price         = EXCLUDED.close_price,
            current_price       = EXCLUDED.current_price,
            no_vig_probability  = EXCLUDED.no_vig_probability,
            last_seen_at        = now(),
            updated_at          = now()
        `;
        closingRowsUpserted += 1;
      }
    }

    // Capture totals
    for (const m of markets.filter((mk) => mk.marketType === "total")) {
      const sbName = m.sportsbook?.name ?? "consensus";
      const currentLine = m.currentLine ?? m.line;
      const closeLine = m.closingLine ?? currentLine;
      const openLine = m.openingLine ?? currentLine;
      const sel = m.selection ?? "over";

      if (!currentLine) continue;
      if (!force && m.closingLine !== null) { skipped += 1; continue; }

      const id = marketId(gamePk ?? 0, "total", sel, sbName);
      await prisma.$executeRaw`
        INSERT INTO mlb_market_open_close (
          id, game_pk, event_id, market_type, side, selection, sportsbook_name,
          open_point, close_point, current_point,
          first_seen_at, last_seen_at, source, updated_at
        ) VALUES (
          ${id}, ${gamePk ?? null}, ${event.id}, 'total', ${sel},
          ${m.selection}, ${sbName},
          ${openLine}, ${closeLine}, ${currentLine},
          ${event.startTime}, now(), 'event_market_closing_capture', now()
        )
        ON CONFLICT (id) DO UPDATE SET
          close_point  = EXCLUDED.close_point,
          current_point = EXCLUDED.current_point,
          last_seen_at = now(),
          updated_at   = now()
      `;
      openRowsUpserted += 1;
    }
  }

  return {
    eventsScanned: events.length,
    marketsScanned,
    closingRowsUpserted,
    openRowsUpserted,
    skipped,
    warnings,
  };
}

type ClosingLineRow = {
  game_pk: number | null;
  event_id: string | null;
  market_type: string;
  side: string;
  sportsbook_name: string | null;
  open_price: number | null;
  close_price: number | null;
  no_vig_probability: number | null;
  close_point: number | null;
  open_point: number | null;
  updated_at: Date;
};

export async function getMlbClosingLines(gamePk: number): Promise<ClosingLineRow[]> {
  return prisma.$queryRaw<ClosingLineRow[]>`
    SELECT game_pk, event_id, market_type, side, sportsbook_name,
           open_price, close_price, no_vig_probability,
           close_point, open_point, updated_at
    FROM mlb_market_open_close
    WHERE game_pk = ${gamePk}
    ORDER BY market_type, side, updated_at DESC
  `;
}

export async function getConsensusNoVigProbability(gamePk: number): Promise<{ homeNoVig: number | null; awayNoVig: number | null }> {
  const rows = await getMlbClosingLines(gamePk);
  const ml = rows.filter((r) => r.market_type === "moneyline");
  const homeRows = ml.filter((r) => r.side === "home" && r.no_vig_probability !== null);
  const awayRows = ml.filter((r) => r.side === "away" && r.no_vig_probability !== null);
  const avg = (arr: ClosingLineRow[]) =>
    arr.length ? arr.reduce((sum, r) => sum + (r.no_vig_probability ?? 0), 0) / arr.length : null;
  return { homeNoVig: avg(homeRows), awayNoVig: avg(awayRows) };
}
