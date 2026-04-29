import type { z } from "zod";

import { ingestPayloadSchema } from "@/lib/validation/intelligence";
import type { BookFeedProviderKey } from "@/services/current-odds/book-feed-provider-types";

type IngestPayload = z.infer<typeof ingestPayloadSchema>;
type IngestLine = IngestPayload["lines"][number];
type AdvancedMarket = NonNullable<IngestLine["markets"]>[number];

type NormalizeBookFeedArgs = {
  providerKey: BookFeedProviderKey;
  sportsbookKey: string;
  payload: unknown;
  fetchedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function pickNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim().length
          ? Number(value)
          : NaN;
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function normalizeTeamName(value: string | null | undefined) {
  return normalizeToken(value ?? "");
}

function defaultEventKey(args: {
  league: string | null;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
}) {
  return [
    "bookfeed",
    normalizeToken(args.league ?? "unknown"),
    args.commenceTime.slice(0, 16),
    normalizeToken(args.awayTeam),
    normalizeToken(args.homeTeam)
  ].join(":");
}

function mapMarketType(value: string | null | undefined): AdvancedMarket["marketType"] | null {
  const normalized = normalizeToken(value ?? "");
  // "h2h" is the Odds API key for moneyline markets
  if (["moneyline", "ml", "h2h"].includes(normalized)) return "moneyline";
  // "spreads" is the Odds API key for spread markets (plural)
  if (["spread", "spreads", "handicap", "run_line", "runline"].includes(normalized)) return "spread";
  if (["total", "totals", "game_total"].includes(normalized)) return "total";
  if (["team_total", "team_totals", "teamtotal"].includes(normalized)) return "team_total";
  if (["player_pitcher_outs", "pitcher_outs", "pitcherouts", "outs_recorded"].includes(normalized)) {
    return "player_pitcher_outs";
  }
  if (
    [
      "player_pitcher_strikeouts",
      "pitcher_strikeouts",
      "pitcher_strikeout",
      "pitcher_k",
      "pitcher_ks",
      "strikeouts_thrown"
    ].includes(normalized)
  ) {
    return "player_pitcher_strikeouts";
  }
  return null;
}

function mapPeriod(value: unknown) {
  const normalized = normalizeToken(String(value ?? "full_game"));
  if (["0", "game", "full_game", "fullgame"].includes(normalized)) return "full_game";
  if (
    [
      "first_5",
      "first5",
      "f5",
      "first_five",
      "first_five_innings",
      "first_5_innings",
      "1"
    ].includes(normalized)
  ) {
    return "first_5";
  }
  return normalized || "full_game";
}

function mapSide(args: {
  rawSide?: string | null;
  selection?: string | null;
  homeTeam: string;
  awayTeam: string;
}) {
  const normalized = normalizeToken(args.rawSide ?? args.selection ?? "");
  if (["home", normalizeTeamName(args.homeTeam)].includes(normalized)) return "home";
  if (["away", normalizeTeamName(args.awayTeam)].includes(normalized)) return "away";
  if (["over", "o"].includes(normalized)) return "over";
  if (["under", "u"].includes(normalized)) return "under";
  return args.rawSide?.trim() || args.selection?.trim() || null;
}

function inferSelection(args: {
  marketType: AdvancedMarket["marketType"];
  side: string | null;
  selection?: string | null;
  teamName?: string | null;
  playerName?: string | null;
  homeTeam: string;
  awayTeam: string;
}) {
  if (args.marketType === "team_total") {
    return args.teamName ?? (args.side === "home" ? args.homeTeam : args.awayTeam);
  }
  if (
    args.marketType === "player_pitcher_outs" ||
    args.marketType === "player_pitcher_strikeouts"
  ) {
    return args.playerName ?? "Pitcher";
  }
  if (args.selection?.trim()) return args.selection.trim();
  if (args.marketType === "moneyline" || args.marketType === "spread") {
    if (args.side === "home") return args.homeTeam;
    if (args.side === "away") return args.awayTeam;
  }
  if (args.side === "over") return "Over";
  if (args.side === "under") return "Under";
  return "Market";
}

function hydrateLegacyOdds(line: IngestLine) {
  const odds: NonNullable<IngestLine["odds"]> = {
    homeMoneyline: null,
    awayMoneyline: null,
    homeSpread: null,
    homeSpreadOdds: null,
    awaySpreadOdds: null,
    total: null,
    overOdds: null,
    underOdds: null
  };

  for (const market of line.markets ?? []) {
    if (market.period && market.period !== "full_game") {
      continue;
    }

    if (market.marketType === "moneyline") {
      if (market.side === "home") odds.homeMoneyline = market.oddsAmerican ?? null;
      if (market.side === "away") odds.awayMoneyline = market.oddsAmerican ?? null;
    }

    if (market.marketType === "spread") {
      if (market.side === "home") {
        odds.homeSpread = market.line ?? null;
        odds.homeSpreadOdds = market.oddsAmerican ?? null;
      }
      if (market.side === "away") {
        odds.awaySpreadOdds = market.oddsAmerican ?? null;
      }
    }

    if (market.marketType === "total") {
      odds.total = market.line ?? odds.total ?? null;
      if (market.side === "over") odds.overOdds = market.oddsAmerican ?? null;
      if (market.side === "under") odds.underOdds = market.oddsAmerican ?? null;
    }
  }

  return odds;
}

function buildAdvancedMarket(args: {
  marketType: AdvancedMarket["marketType"];
  marketLabel?: string | null;
  period?: unknown;
  selection?: string | null;
  side?: string | null;
  line?: unknown;
  oddsAmerican?: unknown;
  teamName?: string | null;
  teamSide?: string | null;
  playerName?: string | null;
  teamId?: string | null;
  homeTeam: string;
  awayTeam: string;
}): AdvancedMarket | null {
  const side = mapSide({
    rawSide: args.side,
    selection: args.selection,
    homeTeam: args.homeTeam,
    awayTeam: args.awayTeam
  });

  const teamSide =
    args.teamSide === "home" || args.teamSide === "away"
      ? args.teamSide
      : side === "home" || side === "away"
        ? side
        : undefined;

  const market: AdvancedMarket = {
    marketType: args.marketType,
    marketLabel: args.marketLabel ?? undefined,
    period: mapPeriod(args.period),
    selection: inferSelection({
      marketType: args.marketType,
      side,
      selection: args.selection,
      teamName: args.teamName,
      playerName: args.playerName,
      homeTeam: args.homeTeam,
      awayTeam: args.awayTeam
    }),
    side: side ?? "other",
    line: pickNumber(args.line),
    oddsAmerican: pickNumber(args.oddsAmerican),
    teamSide,
    playerName: args.playerName ?? undefined,
    teamId: args.teamId ?? undefined
  };

  return typeof market.oddsAmerican === "number" ? market : null;
}

function normalizeFlatMarketRow(args: {
  market: Record<string, unknown>;
  homeTeam: string;
  awayTeam: string;
}): AdvancedMarket | null {
  const marketType = mapMarketType(
    pickString(
      args.market.marketType,
      args.market.type,
      args.market.key,
      args.market.name,
      args.market.label
    )
  );
  if (!marketType) {
    return null;
  }

  const participantTeam = asRecord(args.market.participantTeam ?? args.market.team);
  const participantPlayer = asRecord(args.market.participantPlayer ?? args.market.player);

  return buildAdvancedMarket({
    marketType,
    marketLabel: pickString(args.market.marketLabel, args.market.label, args.market.name),
    period: args.market.period ?? args.market.periodId ?? args.market.segment,
    selection: pickString(args.market.selection, args.market.outcome),
    side: pickString(args.market.side),
    line: args.market.line ?? args.market.point,
    oddsAmerican: args.market.oddsAmerican ?? args.market.price ?? args.market.odds,
    teamName: pickString(participantTeam?.name),
    teamSide: pickString(participantTeam?.side, args.market.teamSide),
    playerName: pickString(participantPlayer?.name, args.market.playerName),
    teamId: pickString(participantTeam?.key, args.market.teamId),
    homeTeam: args.homeTeam,
    awayTeam: args.awayTeam
  });
}

function normalizeOutcomeMarkets(args: {
  market: Record<string, unknown>;
  homeTeam: string;
  awayTeam: string;
}): AdvancedMarket[] {
  const marketType = mapMarketType(
    pickString(
      args.market.marketType,
      args.market.type,
      args.market.key,
      args.market.name,
      args.market.label
    )
  );
  if (!marketType) {
    return [];
  }

  const participantTeam = asRecord(args.market.participantTeam ?? args.market.team);
  const participantPlayer = asRecord(args.market.participantPlayer ?? args.market.player);
  const outcomes = asArray(
    args.market.outcomes ?? args.market.selections ?? args.market.rows ?? args.market.prices
  );

  return outcomes
    .map((outcomeRaw) => {
      const outcome = asRecord(outcomeRaw);
      if (!outcome) return null;

      return buildAdvancedMarket({
        marketType,
        marketLabel: pickString(args.market.marketLabel, args.market.label, args.market.name),
        period: args.market.period ?? args.market.periodId ?? args.market.segment,
        selection: pickString(outcome.selection, outcome.name, outcome.label),
        side: pickString(outcome.side, outcome.type),
        line: outcome.line ?? outcome.point ?? args.market.line ?? args.market.point,
        oddsAmerican: outcome.oddsAmerican ?? outcome.price ?? outcome.odds,
        teamName: pickString(participantTeam?.name, outcome.teamName),
        teamSide: pickString(participantTeam?.side, outcome.teamSide, args.market.teamSide),
        playerName: pickString(participantPlayer?.name, outcome.playerName, args.market.playerName),
        teamId: pickString(participantTeam?.key, outcome.teamKey, args.market.teamId),
        homeTeam: args.homeTeam,
        awayTeam: args.awayTeam
      });
    })
    .filter((market): market is AdvancedMarket => Boolean(market));
}

function normalizeBookLine(args: {
  sportsbookKey: string;
  lineRaw: unknown;
  fallbackFetchedAt: string;
  homeTeam: string;
  awayTeam: string;
}): IngestLine | null {
  const line = asRecord(args.lineRaw);
  if (!line) return null;

  const rawMarkets = asArray(line.markets ?? line.rows ?? line.offers);
  const markets: AdvancedMarket[] = [];

  for (const marketRaw of rawMarkets) {
    const market = asRecord(marketRaw);
    if (!market) continue;
    const outcomeRows = normalizeOutcomeMarkets({
      market,
      homeTeam: args.homeTeam,
      awayTeam: args.awayTeam
    });
    if (outcomeRows.length) {
      markets.push(...outcomeRows);
      continue;
    }
    const flat = normalizeFlatMarketRow({
      market,
      homeTeam: args.homeTeam,
      awayTeam: args.awayTeam
    });
    if (flat) {
      markets.push(flat);
    }
  }

  if (!markets.length && line.odds && typeof line.odds === "object") {
    const parsed = ingestPayloadSchema.shape.lines.element.safeParse({
      book: pickString(line.book, line.title, line.name, args.sportsbookKey) ?? args.sportsbookKey,
      fetchedAt:
        pickString(line.fetchedAt, line.updatedAt, line.lastUpdate, args.fallbackFetchedAt) ??
        args.fallbackFetchedAt,
      odds: line.odds,
      markets: []
    });
    return parsed.success ? parsed.data : null;
  }

  const deduped = new Map<string, AdvancedMarket>();
  for (const market of markets) {
    if (typeof market.oddsAmerican !== "number") {
      continue;
    }
    const key = [
      market.marketType,
      market.period ?? "full_game",
      market.selection ?? "na",
      market.side ?? "na",
      market.line ?? "na"
    ].join(":");
    deduped.set(key, market);
  }

  const parsedLine = ingestPayloadSchema.shape.lines.element.safeParse({
    book: pickString(line.book, line.title, line.name, args.sportsbookKey) ?? args.sportsbookKey,
    fetchedAt:
      pickString(line.fetchedAt, line.updatedAt, line.lastUpdate, args.fallbackFetchedAt) ??
      args.fallbackFetchedAt,
    odds: hydrateLegacyOdds({
      book: "x",
      fetchedAt: args.fallbackFetchedAt,
      odds: {},
      markets: Array.from(deduped.values())
    } as IngestLine),
    markets: Array.from(deduped.values())
  });

  return parsedLine.success ? parsedLine.data : null;
}

function normalizeEvent(args: {
  providerKey: BookFeedProviderKey;
  sportsbookKey: string;
  eventRaw: unknown;
  payloadRoot: Record<string, unknown> | null;
  fetchedAt: string;
}): IngestPayload | null {
  const event = asRecord(args.eventRaw);
  if (!event) return null;

  const homeTeam = pickString(event.homeTeam, event.home_team, event.home_name, event.home);
  const awayTeam = pickString(event.awayTeam, event.away_team, event.away_name, event.away);
  const commenceTime = pickString(
    event.commenceTime,
    event.commence_time,
    event.startTime,
    event.start_time,
    event.gameDate
  );
  const sport = pickString(
    event.sport,
    event.sportKey,
    event.sport_key,   // Odds API shape: { sport_key: "baseball_mlb" }
    event.league,
    args.payloadRoot?.sport,
    args.payloadRoot?.league
  );
  const league = pickString(event.league, event.leagueKey, args.payloadRoot?.league, sport);

  if (!homeTeam || !awayTeam || !commenceTime || !sport) {
    return null;
  }

  const eventKey =
    pickString(event.eventKey, event.externalEventId, event.event_id, event.id) ??
    defaultEventKey({
      league,
      homeTeam,
      awayTeam,
      commenceTime
    });

  const rawLines = asArray(event.lines ?? event.books ?? event.bookmakers);
  const lines = rawLines
    .map((lineRaw) =>
      normalizeBookLine({
        sportsbookKey: args.sportsbookKey,
        lineRaw,
        fallbackFetchedAt: args.fetchedAt,
        homeTeam,
        awayTeam
      })
    )
    .filter((line): line is IngestLine => Boolean(line));

  if (!lines.length) {
    return null;
  }

  const parsedPayload = ingestPayloadSchema.safeParse({
    sport,
    eventKey,
    homeTeam,
    awayTeam,
    commenceTime,
    source: args.providerKey,
    lines,
    sourceMeta: {
      provider: args.providerKey,
      vendorEventId: pickString(event.event_id, event.id),
      feedLeague: league
    }
  });

  return parsedPayload.success ? parsedPayload.data : null;
}

export function normalizeBookFeedPayload(args: NormalizeBookFeedArgs) {
  const root = asRecord(args.payload);
  const rawEvents = Array.isArray(args.payload)
    ? args.payload
    : asArray(root?.events ?? root?.games ?? root?.data);

  return rawEvents
    .map((eventRaw) =>
      normalizeEvent({
        providerKey: args.providerKey,
        sportsbookKey: args.sportsbookKey,
        eventRaw,
        payloadRoot: root,
        fetchedAt: args.fetchedAt
      })
    )
    .filter((payload): payload is IngestPayload => Boolean(payload));
}
