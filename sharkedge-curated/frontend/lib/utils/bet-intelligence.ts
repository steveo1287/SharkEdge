import type { BetIntent, BetSlipEntry } from "@/lib/types/bet-intelligence";
import type {
  BetSignalView,
  BoardMarketView,
  GameCardView,
  PropCardView,
  EdgeBand
} from "@/lib/types/domain";
import type { LedgerMarketType, SupportedLeagueKey } from "@/lib/types/ledger";
import {
  americanToDecimal,
  americanToImplied as americanToImpliedProbability,
  calculateEV,
  kellySize,
  stripVig
} from "@/lib/odds/index";
import { LEAGUE_SPORT_MAP } from "@/lib/utils/ledger";

function toUrlSafeBase64(value: string) {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  const base64 = window.btoa(unescape(encodeURIComponent(value)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromUrlSafeBase64(value: string) {
  if (typeof window === "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return decodeURIComponent(escape(window.atob(padded)));
}

export function encodeBetIntent(intent: BetIntent) {
  return toUrlSafeBase64(JSON.stringify(intent));
}

export function decodeBetIntent(value: string | null | undefined): BetIntent | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(fromUrlSafeBase64(value)) as BetIntent;
  } catch {
    return null;
  }
}

export function createBetSlipEntry(intent: BetIntent): BetSlipEntry {
  return {
    id: [
      intent.league,
      intent.betType,
      intent.eventLabel,
      ...intent.legs.map((leg) => `${leg.marketType}:${leg.selection}:${leg.oddsAmerican}`)
    ]
      .join("|")
      .toLowerCase()
      .replace(/[^a-z0-9|:+.-]+/g, "-"),
    createdAt: new Date().toISOString(),
    intent
  };
}

export function mergeBetSlipEntries(
  current: BetSlipEntry[],
  nextIntent: BetIntent
): BetSlipEntry[] {
  const nextEntry = createBetSlipEntry(nextIntent);
  const existing = current.find((entry) => entry.id === nextEntry.id);

  if (existing) {
    return current.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry));
  }

  return [nextEntry, ...current];
}

export function buildParlayIntent(entries: BetSlipEntry[]): BetIntent | null {
  if (entries.length < 2) {
    return null;
  }

  const first = entries[0];
  const sameLeague = entries.every(
    (entry) =>
      entry.intent.league === first.intent.league && entry.intent.sport === first.intent.sport
  );

  if (!sameLeague) {
    return null;
  }

  const sourceLabels = Array.from(
    new Set(entries.map((entry) => entry.intent.context?.sourceLabel).filter(Boolean))
  );

  return {
    betType: "PARLAY",
    sport: first.intent.sport,
    league: first.intent.league,
    eventLabel:
      entries.length === 2
        ? entries.map((entry) => entry.intent.eventLabel).join(" + ")
        : `${entries.length}-leg SharkEdge slip`,
    source: "MANUAL",
    isLive: entries.some((entry) => entry.intent.isLive),
    tags: ["bet-slip", "parlay", ...sourceLabels.map((label) => String(label).toLowerCase())],
    notes: `Built from ${entries.length} saved bet-slip entries.`,
    context: {
      sourcePage: "top_plays",
      sourceLabel: "Bet Slip Builder",
      sourcePath: "/bets",
      eventLabel: `${entries.length}-leg SharkEdge slip`,
      supportStatus: null,
      supportNote: "Parlay assembled from saved bet-slip entries.",
      capturedAt: new Date().toISOString()
    },
    legs: entries.flatMap((entry) =>
      entry.intent.legs.map((leg) => ({
        ...leg,
        notes: leg.notes ?? entry.intent.notes
      }))
    )
  };
}

export function getConfidenceTierFromEdge(edgeScore: number | null | undefined): "A" | "B" | "C" {
  if (typeof edgeScore !== "number") {
    return "C";
  }

  if (edgeScore >= 75) {
    return "A";
  }

  if (edgeScore >= 55) {
    return "B";
  }

  return "C";
}

export function getConfidenceTierLabel(tier: "A" | "B" | "C") {
  if (tier === "A") {
    return "High confidence";
  }

  if (tier === "B") {
    return "Moderate confidence";
  }

  return "Watchlist";
}

export function getEdgeToneFromBand(label: EdgeBand) {
  if (label === "Elite") {
    return "success" as const;
  }

  if (label === "Strong") {
    return "brand" as const;
  }

  if (label === "Watchlist") {
    return "premium" as const;
  }

  return "muted" as const;
}

export function calculateMarketExpectedValuePct(
  bestOddsAmerican: number | null | undefined,
  consensusOddsAmerican: number | null | undefined
) {
  if (
    typeof bestOddsAmerican !== "number" ||
    typeof consensusOddsAmerican !== "number" ||
    bestOddsAmerican === 0 ||
    consensusOddsAmerican === 0
  ) {
    return null;
  }

  const fairProbability = americanToImpliedProbability(consensusOddsAmerican);
  if (typeof fairProbability !== "number") {
    return null;
  }

  const ev = calculateEV({
    offeredOddsAmerican: bestOddsAmerican,
    modelProbability: fairProbability
  });

  return typeof ev === "number" ? Number(ev.toFixed(2)) : null;
}

export function calculateKellyFractionPct(
  oddsAmerican: number | null | undefined,
  winProbability: number | null | undefined
) {
  if (
    typeof oddsAmerican !== "number" ||
    typeof winProbability !== "number" ||
    oddsAmerican === 0 ||
    winProbability <= 0 ||
    winProbability >= 1
  ) {
    return null;
  }

  const decimalOdds = americanToDecimal(oddsAmerican);
  if (typeof decimalOdds !== "number") {
    return null;
  }
  const b = decimalOdds - 1;
  if (b <= 0) {
    return null;
  }

  const q = 1 - winProbability;
  const fraction = (b * winProbability - q) / b;

  if (!Number.isFinite(fraction) || fraction <= 0) {
    return 0;
  }

  return Number((fraction * 100).toFixed(2));
}

export function buildWagerMathView(args: {
  offeredOddsAmerican: number | null | undefined;
  oppositeOddsAmerican?: number | null | undefined;
  consensusOddsAmerican?: number | null | undefined;
  modelProbability?: number | null | undefined;
}) {
  const impliedProbabilityPct =
    typeof args.offeredOddsAmerican === "number"
      ? Number(((americanToImpliedProbability(args.offeredOddsAmerican) ?? 0) * 100).toFixed(2))
      : null;
  const stripped =
    typeof args.offeredOddsAmerican === "number" &&
    typeof args.oppositeOddsAmerican === "number"
      ? stripVig(
          [
            americanToImpliedProbability(args.offeredOddsAmerican),
            americanToImpliedProbability(args.oppositeOddsAmerican)
          ].filter((value): value is number => typeof value === "number")
        )
      : [];
  const noVigProbabilityPct =
    stripped.length >= 2 ? Number((stripped[0] * 100).toFixed(2)) : null;
  const fairProbabilityProxyPct =
    typeof args.modelProbability === "number"
      ? Number((args.modelProbability * 100).toFixed(2))
      : typeof args.consensusOddsAmerican === "number"
        ? Number(((americanToImpliedProbability(args.consensusOddsAmerican) ?? 0) * 100).toFixed(2))
        : null;
  const expectedValuePct =
    typeof args.modelProbability === "number" && typeof args.offeredOddsAmerican === "number"
      ? calculateEV({
          offeredOddsAmerican: args.offeredOddsAmerican,
          modelProbability: args.modelProbability
        })
      : null;
  const kellyFractionPct =
    typeof args.modelProbability === "number" && typeof args.offeredOddsAmerican === "number"
      ? kellySize({
          offeredOddsAmerican: args.offeredOddsAmerican,
          modelProbability: args.modelProbability
        })
      : null;

  return {
    impliedProbabilityPct,
    fairProbabilityProxyPct,
    noVigProbabilityPct,
    expectedValuePct:
      typeof expectedValuePct === "number" ? Number(expectedValuePct.toFixed(2)) : null,
    kellyFractionPct:
      typeof kellyFractionPct === "number" ? Number(kellyFractionPct.toFixed(2)) : null
  };
}

function parseLineFromLabel(value: string) {
  const match = value.match(/(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function getBoardSelection(
  game: GameCardView,
  marketType: "spread" | "moneyline" | "total",
  market: BoardMarketView
) {
  if (marketType === "moneyline") {
    return {
      selection: market.label,
      side: null,
      line: null
    };
  }

  if (marketType === "total") {
    return {
      selection: market.label,
      side: market.label.startsWith("O ") ? "Over" : market.label.startsWith("U ") ? "Under" : null,
      line: parseLineFromLabel(market.lineLabel)
    };
  }

  return {
    selection: market.label,
    side: market.label,
    line: parseLineFromLabel(market.lineLabel)
  };
}

export function buildBoardBetIntent(
  game: GameCardView,
  marketType: "spread" | "moneyline" | "total",
  sourcePath: string
): BetIntent {
  const market = game[marketType];
  const marketSelection = getBoardSelection(game, marketType, market);
  const eventLabel = `${game.awayTeam.name} @ ${game.homeTeam.name}`;

  return {
    betType: "STRAIGHT",
    sport: LEAGUE_SPORT_MAP[game.leagueKey as SupportedLeagueKey],
    league: game.leagueKey as SupportedLeagueKey,
    eventLabel,
    externalEventId: game.id,
    matchupHref: game.detailHref ?? `/game/${game.id}`,
    sportsbookName: market.bestBook,
    source: "MANUAL",
    isLive: game.status === "LIVE",
    tags: ["board", marketType],
    notes: `Added from board: ${eventLabel}`,
    context: {
      sourcePage: "board",
      sourceLabel: "Odds Board",
      sourcePath,
      sourceItemId: `${game.id}:${marketType}`,
      eventLabel,
      matchupHref: game.detailHref ?? `/game/${game.id}`,
      externalEventId: game.id,
      sportsbookName: market.bestBook,
      supportStatus: "LIVE",
      marketDeltaAmerican: null,
      expectedValuePct: null,
      edgeScore: game.edgeScore.score,
      edgeLabel: game.edgeScore.label,
      confidenceTier: getConfidenceTierFromEdge(game.edgeScore.score),
      capturedAt: new Date().toISOString()
    },
    legs: [
      {
        externalEventId: game.id,
        sourceItemId: `${game.id}:${marketType}`,
        sportsbookName: market.bestBook,
        marketType,
        marketLabel:
          marketType === "spread" ? "Spread" : marketType === "moneyline" ? "Moneyline" : "Total",
        selection: marketSelection.selection,
        side: marketSelection.side,
        line: marketSelection.line,
        oddsAmerican: market.bestOdds,
        context: {
          sourcePage: "board",
          sourceLabel: "Odds Board",
          sourcePath,
          sourceItemId: `${game.id}:${marketType}`,
          eventLabel,
          matchupHref: game.detailHref ?? `/game/${game.id}`,
          externalEventId: game.id,
          sportsbookName: market.bestBook,
          supportStatus: "LIVE",
          edgeScore: game.edgeScore.score,
          edgeLabel: game.edgeScore.label,
          confidenceTier: getConfidenceTierFromEdge(game.edgeScore.score),
          capturedAt: new Date().toISOString()
        }
      }
    ]
  };
}

export function buildPropBetIntent(
  prop: PropCardView,
  sourcePage: "props" | "matchup" | "top_plays",
  sourcePath: string
): BetIntent {
  const confidenceTier = getConfidenceTierFromEdge(prop.edgeScore.score);
  const eventLabel = prop.gameLabel ?? `${prop.team.name} vs ${prop.opponent.name}`;

  return {
    betType: "STRAIGHT",
    sport: LEAGUE_SPORT_MAP[prop.leagueKey as SupportedLeagueKey],
    league: prop.leagueKey as SupportedLeagueKey,
    eventLabel,
    externalEventId: prop.gameId,
    matchupHref: prop.gameHref ?? `/game/${prop.gameId}`,
    sportsbookKey: prop.sportsbook.key,
    sportsbookName: prop.bestAvailableSportsbookName ?? prop.sportsbook.name,
    source: "MANUAL",
    isLive: false,
    tags: [sourcePage, "props", prop.marketType],
    notes: `Added from ${sourcePage === "top_plays" ? "Top Plays" : "Props"}: ${eventLabel}`,
    context: {
      sourcePage,
      sourceLabel:
        sourcePage === "matchup"
          ? "Matchup Props"
          : sourcePage === "top_plays"
            ? "Top Plays"
            : "Props Explorer",
      sourcePath,
      sourceItemId: prop.id,
      eventLabel,
      matchupHref: prop.gameHref ?? `/game/${prop.gameId}`,
      externalEventId: prop.gameId,
      sportsbookKey: prop.sportsbook.key,
      sportsbookName: prop.bestAvailableSportsbookName ?? prop.sportsbook.name,
      supportStatus: prop.supportStatus ?? null,
      supportNote: prop.supportNote ?? null,
      marketDeltaAmerican: prop.marketDeltaAmerican ?? null,
      expectedValuePct: prop.expectedValuePct ?? null,
      edgeScore: prop.edgeScore.score,
      edgeLabel: prop.edgeScore.label,
      confidenceTier,
      valueFlag: prop.valueFlag ?? null,
      capturedAt: new Date().toISOString()
    },
    legs: [
      {
        externalEventId: prop.gameId,
        sourceItemId: prop.id,
        sportsbookKey: prop.sportsbook.key,
        sportsbookName: prop.bestAvailableSportsbookName ?? prop.sportsbook.name,
        marketType: prop.marketType,
        marketLabel: prop.marketType.replace(/_/g, " "),
        selection: `${prop.player.name} ${prop.side} ${prop.line}`,
        side: prop.side,
        line: prop.line,
        oddsAmerican: prop.bestAvailableOddsAmerican ?? prop.oddsAmerican,
        context: {
          sourcePage,
          sourceLabel:
            sourcePage === "matchup"
              ? "Matchup Props"
              : sourcePage === "top_plays"
                ? "Top Plays"
                : "Props Explorer",
          sourcePath,
          sourceItemId: prop.id,
          eventLabel,
          matchupHref: prop.gameHref ?? `/game/${prop.gameId}`,
          externalEventId: prop.gameId,
          sportsbookKey: prop.sportsbook.key,
          sportsbookName: prop.bestAvailableSportsbookName ?? prop.sportsbook.name,
          supportStatus: prop.supportStatus ?? null,
          supportNote: prop.supportNote ?? null,
          marketDeltaAmerican: prop.marketDeltaAmerican ?? null,
          expectedValuePct: prop.expectedValuePct ?? null,
          edgeScore: prop.edgeScore.score,
          edgeLabel: prop.edgeScore.label,
          confidenceTier,
          valueFlag: prop.valueFlag ?? null,
          capturedAt: new Date().toISOString()
        }
      }
    ]
  };
}

export function buildSignalBetIntent(
  signal: BetSignalView,
  league: SupportedLeagueKey,
  sourcePath: string
): BetIntent {
  return {
    betType: "STRAIGHT",
    sport: LEAGUE_SPORT_MAP[league],
    league,
    eventLabel: signal.eventLabel,
    externalEventId: signal.externalEventId,
    matchupHref: signal.matchupHref ?? null,
    sportsbookKey: signal.sportsbookKey ?? null,
    sportsbookName: signal.sportsbookName ?? null,
    source: "MANUAL",
    isLive: false,
    tags: ["matchup", signal.marketType],
    notes: `Added from matchup detail: ${signal.eventLabel}`,
    context: {
      sourcePage: "matchup",
      sourceLabel: "Matchup Detail",
      sourcePath,
      sourceItemId: signal.id,
      eventLabel: signal.eventLabel,
      matchupHref: signal.matchupHref ?? null,
      externalEventId: signal.externalEventId ?? null,
      sportsbookKey: signal.sportsbookKey ?? null,
      sportsbookName: signal.sportsbookName ?? null,
      supportStatus: signal.supportStatus,
      supportNote: signal.supportNote ?? null,
      marketDeltaAmerican: signal.marketDeltaAmerican ?? null,
      expectedValuePct: signal.expectedValuePct ?? null,
      edgeScore: signal.edgeScore.score,
      edgeLabel: signal.edgeScore.label,
      confidenceTier: signal.confidenceTier,
      valueFlag: signal.valueFlag ?? null,
      capturedAt: new Date().toISOString()
    },
    legs: [
      {
        externalEventId: signal.externalEventId ?? null,
        sourceItemId: signal.id,
        sportsbookKey: signal.sportsbookKey ?? null,
        sportsbookName: signal.sportsbookName ?? null,
        marketType: signal.marketType as LedgerMarketType,
        marketLabel: signal.marketLabel,
        selection: signal.selection,
        side: signal.side ?? null,
        line: signal.line ?? null,
        oddsAmerican: signal.oddsAmerican,
        context: {
          sourcePage: "matchup",
          sourceLabel: "Matchup Detail",
          sourcePath,
          sourceItemId: signal.id,
          eventLabel: signal.eventLabel,
          matchupHref: signal.matchupHref ?? null,
          externalEventId: signal.externalEventId ?? null,
          sportsbookKey: signal.sportsbookKey ?? null,
          sportsbookName: signal.sportsbookName ?? null,
          supportStatus: signal.supportStatus,
          supportNote: signal.supportNote ?? null,
          marketDeltaAmerican: signal.marketDeltaAmerican ?? null,
          expectedValuePct: signal.expectedValuePct ?? null,
          edgeScore: signal.edgeScore.score,
          edgeLabel: signal.edgeScore.label,
          confidenceTier: signal.confidenceTier,
          valueFlag: signal.valueFlag ?? null,
          capturedAt: new Date().toISOString()
        }
      }
    ]
  };
}
