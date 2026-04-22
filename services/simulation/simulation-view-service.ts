import {
  buildEventProjectionFromHistory,
  buildPlayerPropProjectionsForEvent
} from "@/services/modeling/model-engine";
import { buildMlbBookMarketState } from "@/services/market-intelligence/mlb-book-market-state";
import { sharpenMlbExecution } from "@/services/market-intelligence/mlb-execution-sharpener";
import { buildGameSimVerdict, type GameSimVerdict } from "@/services/simulation/sim-verdict-engine";
import { setSimVerdict } from "@/services/simulation/sim-verdict-cache";
import type { ContextualGameSimulationSummary } from "@/services/simulation/contextual-game-sim";

type SimulationComparison = {
  marketType: "total" | "spread_home";
  projected: number;
  marketLine: number;
  delta: number;
};

type SimulationPlayerEdge = {
  playerId: string;
  playerName: string;
  statKey: string;
  projectedMean: number;
  projectedMedian: number;
  marketLine: number;
  contextualEdgeScore: number;
  suggestedSide: "OVER" | "UNDER" | "NONE";
  overProbability: number | null;
  underProbability: number | null;
  drivers: string[];
};

type SimulationBookSelection = {
  bookKey: string;
  bookName: string;
  line: number;
  oddsAmerican: number | null;
  deltaFromConsensus: number | null;
  freshnessMinutes: number;
  isOutlier: boolean;
  isStale: boolean;
  executionScore: number;
  executionReasons: string[];
  triggerCodes: string[];
};

type SimulationBookGameMarket = {
  marketType: "total" | "spread_home";
  label: string;
  consensusLine: number | null;
  simSide: "OVER" | "UNDER" | "HOME" | "AWAY" | "NONE";
  bestBook: SimulationBookSelection | null;
  bestBookCallout: string | null;
  executionTriggers: string[];
  staleOpportunityScore: number;
  books: SimulationBookSelection[];
};

type SimulationBookPlayerMarket = {
  key: string;
  playerId: string;
  playerName: string | null;
  statKey: string;
  label: string;
  consensusLine: number | null;
  simSide: "OVER" | "UNDER" | "NONE";
  bestBook: SimulationBookSelection | null;
  bestBookCallout: string | null;
  executionTriggers: string[];
  staleOpportunityScore: number;
  books: SimulationBookSelection[];
};

export type EventSimulationView = {
  eventProjection: Awaited<ReturnType<typeof buildEventProjectionFromHistory>>;
  eventBetComparisons: SimulationComparison[];
  projectionSummary: {
    projectedHomeScore: number;
    projectedAwayScore: number;
    projectedTotal: number;
    projectedSpreadHome: number;
    winProbHome: number;
    winProbAway: number;
    headline: string;
    leanSummary: string;
  } | null;
  simulationDrivers: {
    gameDrivers: string[];
    weatherNote: string | null;
    homeStyleNotes: string[];
    awayStyleNotes: string[];
    coachSignals: string[];
    intangibleSignals: string[];
    sourceSummary: string[];
  };
  mlbSourceNativeContext: {
    sourceCoverageScore: number;
    sourceSummary: string[];
    matchupFlags: string[];
    venue: {
      venueName: string | null;
      stationCode: string | null;
      roofType: string | null;
      altitudeFeet: number | null;
      windSensitivity: string | null;
      parkFactor: number | null;
      baselineRunFactor: number | null;
      notes: string[];
    };
    home: {
      abbreviation: string;
      starterName: string | null;
      starterConfidence: number | null;
      lineupStrength: number | null;
      lineupCertainty: string | null;
      bullpenFreshness: number | null;
      topBats: string[];
      notes: string[];
    };
    away: {
      abbreviation: string;
      starterName: string | null;
      starterConfidence: number | null;
      lineupStrength: number | null;
      lineupCertainty: string | null;
      bullpenFreshness: number | null;
      topBats: string[];
      notes: string[];
    };
  } | null;
  playerProjectionCount: number;
  bookMarketState: {
    summary: {
      booksInMesh: string[];
      gameMarketCount: number;
      playerMarketCount: number;
      outlierBookCount: number;
      staleBookCount: number;
    };
    gameMarkets: SimulationBookGameMarket[];
    playerMarkets: SimulationBookPlayerMarket[];
  } | null;
  topPlayerEdges: SimulationPlayerEdge[];
  topPlayerProjections: Awaited<ReturnType<typeof buildPlayerPropProjectionsForEvent>>;
  gameSimVerdict: GameSimVerdict | null;
};

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function formatPercent(value: number) {
  return `${round(value * 100, 1)}%`;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractSimSummary(sim: Record<string, unknown>): ContextualGameSimulationSummary | null {
  if (
    typeof sim.projectedHomeScore !== "number" ||
    typeof sim.projectedAwayScore !== "number" ||
    typeof sim.projectedTotal !== "number" ||
    typeof sim.projectedSpreadHome !== "number" ||
    typeof sim.winProbHome !== "number" ||
    typeof sim.winProbAway !== "number"
  ) {
    return null;
  }
  const dist = getRecord(sim.distribution);
  const prior = getRecord(sim.ratingsPrior);
  return {
    engine: typeof sim.engine === "string" ? sim.engine : "contextual-game-sim",
    projectedHomeScore: sim.projectedHomeScore,
    projectedAwayScore: sim.projectedAwayScore,
    projectedTotal: sim.projectedTotal,
    projectedSpreadHome: sim.projectedSpreadHome,
    winProbHome: sim.winProbHome,
    winProbAway: sim.winProbAway,
    distribution: {
      totalStdDev: typeof dist.totalStdDev === "number" ? dist.totalStdDev : 0,
      homeScoreStdDev: typeof dist.homeScoreStdDev === "number" ? dist.homeScoreStdDev : 0,
      awayScoreStdDev: typeof dist.awayScoreStdDev === "number" ? dist.awayScoreStdDev : 0,
      p10Total: typeof dist.p10Total === "number" ? dist.p10Total : sim.projectedTotal - 10,
      p50Total: typeof dist.p50Total === "number" ? dist.p50Total : sim.projectedTotal,
      p90Total: typeof dist.p90Total === "number" ? dist.p90Total : sim.projectedTotal + 10,
    },
    drivers: Array.isArray(sim.drivers)
      ? (sim.drivers as unknown[]).filter((d): d is string => typeof d === "string")
      : [],
    ratingsPrior: {
      source: (typeof prior.source === "string" ? prior.source : "baseline") as ContextualGameSimulationSummary["ratingsPrior"]["source"],
      blendWeight: typeof prior.blendWeight === "number" ? prior.blendWeight : 0.5,
      deltaOverall: typeof prior.deltaOverall === "number" ? prior.deltaOverall : 0,
      confidence: typeof prior.confidence === "number" ? prior.confidence : 0.5,
    }
  };
}

function buildHeadline(eventProjection: NonNullable<Awaited<ReturnType<typeof buildEventProjectionFromHistory>>>) {
  const metadata = getRecord(eventProjection.metadata);
  const homeTeam = getRecord(metadata.homeTeam);
  const awayTeam = getRecord(metadata.awayTeam);

  const homeName = typeof homeTeam.abbreviation === "string"
    ? homeTeam.abbreviation
    : typeof homeTeam.name === "string"
      ? homeTeam.name
      : "Home";
  const awayName = typeof awayTeam.abbreviation === "string"
    ? awayTeam.abbreviation
    : typeof awayTeam.name === "string"
      ? awayTeam.name
      : "Away";

  const projectedHomeScore = round(eventProjection.projectedHomeScore, 1);
  const projectedAwayScore = round(eventProjection.projectedAwayScore, 1);
  const projectedTotal = round(eventProjection.projectedTotal, 1);
  const projectedSpreadHome = round(eventProjection.projectedSpreadHome, 1);

  const sideLeader = projectedSpreadHome > 0.4
    ? `${homeName} by ${Math.abs(projectedSpreadHome).toFixed(1)}`
    : projectedSpreadHome < -0.4
      ? `${awayName} by ${Math.abs(projectedSpreadHome).toFixed(1)}`
      : "Side is close to neutral";

  return {
    projectedHomeScore,
    projectedAwayScore,
    projectedTotal,
    projectedSpreadHome,
    winProbHome: round(eventProjection.winProbHome, 3),
    winProbAway: round(eventProjection.winProbAway, 3),
    headline: `${awayName} ${projectedAwayScore} · ${homeName} ${projectedHomeScore}`,
    leanSummary: `${sideLeader} · total ${projectedTotal} · home win ${formatPercent(eventProjection.winProbHome)}`
  };
}


function mapBookSelection(book: {
  bookKey: string;
  bookName: string;
  line: number | null;
  oddsAmerican: number | null;
  deltaFromConsensus: number | null;
  freshnessMinutes: number;
  isOutlier: boolean;
  isStale: boolean;
}): SimulationBookSelection | null {
  if (typeof book.line !== "number" || !Number.isFinite(book.line)) {
    return null;
  }

  return {
    bookKey: book.bookKey,
    bookName: book.bookName,
    line: round(book.line, 2),
    oddsAmerican: typeof book.oddsAmerican === "number" ? book.oddsAmerican : null,
    deltaFromConsensus: typeof book.deltaFromConsensus === "number" ? round(book.deltaFromConsensus, 2) : null,
    freshnessMinutes: book.freshnessMinutes,
    isOutlier: book.isOutlier,
    isStale: book.isStale,
    executionScore: 0,
    executionReasons: [],
    triggerCodes: [],
  };
}

function chooseBestBook(
  books: SimulationBookSelection[],
  preference: "LOW_LINE" | "HIGH_LINE"
): SimulationBookSelection | null {
  if (!books.length) {
    return null;
  }

  const sorted = [...books].sort((left, right) => {
    if (left.line !== right.line) {
      return preference === "LOW_LINE" ? left.line - right.line : right.line - left.line;
    }
    const leftOdds = left.oddsAmerican ?? -110;
    const rightOdds = right.oddsAmerican ?? -110;
    return rightOdds - leftOdds;
  });

  return sorted[0] ?? null;
}

export async function buildEventSimulationView(eventId: string): Promise<EventSimulationView | null> {
  const [eventProjection, playerProjections, mlbBookMarketStateRaw] = await Promise.all([
    buildEventProjectionFromHistory(eventId),
    buildPlayerPropProjectionsForEvent(eventId),
    buildMlbBookMarketState(eventId)
  ]);

  if (!eventProjection) {
    return null;
  }

  const metadata = getRecord(eventProjection.metadata);
  const marketAnchor = getRecord(metadata.marketAnchor);
  const simulation = getRecord(metadata.simulation);
  const weather = getRecord(metadata.weather);
  const styleProfiles = getRecord(metadata.styleProfiles);
  const coachProfiles = getRecord(metadata.coachProfiles);
  const intangibles = getRecord(metadata.intangibles);

  const mlbSourceNative = getRecord(metadata.mlbSourceNativeContext);

  const mlbSourceNativeContext =
    Object.keys(mlbSourceNative).length > 0
      ? {
          sourceCoverageScore:
            typeof mlbSourceNative.sourceCoverageScore === "number" ? mlbSourceNative.sourceCoverageScore : 0,
          sourceSummary: Array.isArray(mlbSourceNative.sourceSummary)
            ? (mlbSourceNative.sourceSummary as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 4)
            : [],
          matchupFlags: Array.isArray(mlbSourceNative.matchupFlags)
            ? (mlbSourceNative.matchupFlags as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 5)
            : [],
          venue: {
            venueName: typeof getRecord(mlbSourceNative.venue).venueName === "string" ? String(getRecord(mlbSourceNative.venue).venueName) : null,
            stationCode: typeof getRecord(mlbSourceNative.venue).stationCode === "string" ? String(getRecord(mlbSourceNative.venue).stationCode) : null,
            roofType: typeof getRecord(mlbSourceNative.venue).roofType === "string" ? String(getRecord(mlbSourceNative.venue).roofType) : null,
            altitudeFeet: typeof getRecord(mlbSourceNative.venue).altitudeFeet === "number" ? Number(getRecord(mlbSourceNative.venue).altitudeFeet) : null,
            windSensitivity: typeof getRecord(mlbSourceNative.venue).windSensitivity === "string" ? String(getRecord(mlbSourceNative.venue).windSensitivity) : null,
            parkFactor: typeof getRecord(mlbSourceNative.venue).parkFactor === "number" ? Number(getRecord(mlbSourceNative.venue).parkFactor) : null,
            baselineRunFactor: typeof getRecord(mlbSourceNative.venue).baselineRunFactor === "number" ? Number(getRecord(mlbSourceNative.venue).baselineRunFactor) : null,
            notes: Array.isArray(getRecord(mlbSourceNative.venue).notes)
              ? (getRecord(mlbSourceNative.venue).notes as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 3)
              : []
          },
          home: {
            abbreviation: typeof getRecord(mlbSourceNative.home).abbreviation === "string" ? String(getRecord(mlbSourceNative.home).abbreviation) : "HOME",
            starterName: typeof getRecord(mlbSourceNative.home).starterName === "string" ? String(getRecord(mlbSourceNative.home).starterName) : null,
            starterConfidence: typeof getRecord(mlbSourceNative.home).starterConfidence === "number" ? Number(getRecord(mlbSourceNative.home).starterConfidence) : null,
            lineupStrength: typeof getRecord(mlbSourceNative.home).lineupStrength === "number" ? Number(getRecord(mlbSourceNative.home).lineupStrength) : null,
            lineupContactScore: typeof getRecord(mlbSourceNative.home).lineupContactScore === "number" ? Number(getRecord(mlbSourceNative.home).lineupContactScore) : null,
            lineupCertainty: typeof getRecord(mlbSourceNative.home).lineupCertainty === "string" ? String(getRecord(mlbSourceNative.home).lineupCertainty) : null,
            bullpenFreshness: typeof getRecord(mlbSourceNative.home).bullpenFreshness === "number" ? Number(getRecord(mlbSourceNative.home).bullpenFreshness) : null,
            bullpenRisk: typeof getRecord(mlbSourceNative.home).bullpenRisk === "string" ? String(getRecord(mlbSourceNative.home).bullpenRisk) : null,
            topBats: Array.isArray(getRecord(mlbSourceNative.home).topBats)
              ? (getRecord(mlbSourceNative.home).topBats as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 5)
              : [],
            notes: Array.isArray(getRecord(mlbSourceNative.home).notes)
              ? (getRecord(mlbSourceNative.home).notes as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 3)
              : []
          },
          away: {
            abbreviation: typeof getRecord(mlbSourceNative.away).abbreviation === "string" ? String(getRecord(mlbSourceNative.away).abbreviation) : "AWAY",
            starterName: typeof getRecord(mlbSourceNative.away).starterName === "string" ? String(getRecord(mlbSourceNative.away).starterName) : null,
            starterConfidence: typeof getRecord(mlbSourceNative.away).starterConfidence === "number" ? Number(getRecord(mlbSourceNative.away).starterConfidence) : null,
            lineupStrength: typeof getRecord(mlbSourceNative.away).lineupStrength === "number" ? Number(getRecord(mlbSourceNative.away).lineupStrength) : null,
            lineupContactScore: typeof getRecord(mlbSourceNative.away).lineupContactScore === "number" ? Number(getRecord(mlbSourceNative.away).lineupContactScore) : null,
            lineupCertainty: typeof getRecord(mlbSourceNative.away).lineupCertainty === "string" ? String(getRecord(mlbSourceNative.away).lineupCertainty) : null,
            bullpenFreshness: typeof getRecord(mlbSourceNative.away).bullpenFreshness === "number" ? Number(getRecord(mlbSourceNative.away).bullpenFreshness) : null,
            bullpenRisk: typeof getRecord(mlbSourceNative.away).bullpenRisk === "string" ? String(getRecord(mlbSourceNative.away).bullpenRisk) : null,
            topBats: Array.isArray(getRecord(mlbSourceNative.away).topBats)
              ? (getRecord(mlbSourceNative.away).topBats as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 5)
              : [],
            notes: Array.isArray(getRecord(mlbSourceNative.away).notes)
              ? (getRecord(mlbSourceNative.away).notes as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 3)
              : []
          }
        }
      : null;

  const projectionSummary = buildHeadline(eventProjection);

  const eventBetComparisons: SimulationComparison[] = [
    typeof eventProjection.projectedTotal === "number" && typeof marketAnchor.total === "number"
      ? {
          marketType: "total",
          projected: round(eventProjection.projectedTotal, 2),
          marketLine: marketAnchor.total,
          delta: round(eventProjection.projectedTotal - marketAnchor.total, 2)
        }
      : null,
    typeof eventProjection.projectedSpreadHome === "number" &&
    typeof marketAnchor.spreadHome === "number"
      ? {
          marketType: "spread_home",
          projected: round(eventProjection.projectedSpreadHome, 2),
          marketLine: marketAnchor.spreadHome,
          delta: round(eventProjection.projectedSpreadHome - marketAnchor.spreadHome, 2)
        }
      : null
  ].filter((value): value is SimulationComparison => value !== null);

  const simulationDrivers = {
    gameDrivers: Array.isArray(simulation.drivers)
      ? simulation.drivers.filter((value): value is string => typeof value === "string").slice(0, 6)
      : [],
    weatherNote: typeof weather.note === "string" && weather.note.trim().length ? weather.note : null,
    homeStyleNotes: Array.isArray(getRecord(styleProfiles.home).notes)
      ? (getRecord(styleProfiles.home).notes as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 3)
      : [],
    awayStyleNotes: Array.isArray(getRecord(styleProfiles.away).notes)
      ? (getRecord(styleProfiles.away).notes as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 3)
      : [],
    coachSignals: [
      ...(
        Array.isArray(getRecord(coachProfiles.home).notes)
          ? (getRecord(coachProfiles.home).notes as unknown[]).filter((value): value is string => typeof value === "string")
          : []
      ),
      ...(
        Array.isArray(getRecord(coachProfiles.away).notes)
          ? (getRecord(coachProfiles.away).notes as unknown[]).filter((value): value is string => typeof value === "string")
          : []
      )
    ].slice(0, 4),
    intangibleSignals: [
      ...(
        Array.isArray(getRecord(intangibles.home).notes)
          ? (getRecord(intangibles.home).notes as unknown[]).filter((value): value is string => typeof value === "string")
          : []
      ),
      ...(
        Array.isArray(getRecord(intangibles.away).notes)
          ? (getRecord(intangibles.away).notes as unknown[]).filter((value): value is string => typeof value === "string")
          : []
      )
    ].slice(0, 4),
    sourceSummary: [
      typeof metadata.modelVersion === "string" ? `Model ${metadata.modelVersion}` : null,
      typeof metadata.league === "string" ? `League ${metadata.league}` : null,
      typeof getRecord(metadata.ratingsPrior).source === "string" ? `Ratings prior ${String(getRecord(metadata.ratingsPrior).source).toLowerCase()}` : null,
      mlbSourceNativeContext ? `MLB source coverage ${mlbSourceNativeContext.sourceCoverageScore}` : null
    ].filter((value): value is string => value !== null)
  };


  const bookMarketState =
    mlbBookMarketStateRaw
      ? (() => {
          const executionContext = mlbSourceNativeContext
            ? {
                venue: {
                  baselineRunFactor: mlbSourceNativeContext.venue.baselineRunFactor,
                  windSensitivity: mlbSourceNativeContext.venue.windSensitivity,
                  roofType: mlbSourceNativeContext.venue.roofType,
                },
                home: {
                  abbreviation: mlbSourceNativeContext.home.abbreviation,
                  lineupCertainty: mlbSourceNativeContext.home.lineupCertainty,
                  lineupStrength: mlbSourceNativeContext.home.lineupStrength,
                  lineupContactScore: mlbSourceNativeContext.home.lineupContactScore,
                  bullpenFreshness: mlbSourceNativeContext.home.bullpenFreshness,
                  bullpenRisk: mlbSourceNativeContext.home.bullpenRisk,
                  starterConfidence: mlbSourceNativeContext.home.starterConfidence,
                },
                away: {
                  abbreviation: mlbSourceNativeContext.away.abbreviation,
                  lineupCertainty: mlbSourceNativeContext.away.lineupCertainty,
                  lineupStrength: mlbSourceNativeContext.away.lineupStrength,
                  lineupContactScore: mlbSourceNativeContext.away.lineupContactScore,
                  bullpenFreshness: mlbSourceNativeContext.away.bullpenFreshness,
                  bullpenRisk: mlbSourceNativeContext.away.bullpenRisk,
                  starterConfidence: mlbSourceNativeContext.away.starterConfidence,
                },
              }
            : null;

          const gameMarkets = mlbBookMarketStateRaw.gameMarkets
            .filter((group) => group.marketKey === "total" || group.marketKey === "spread_home")
            .map((group) => {
              const books = group.books
                .map((book) => mapBookSelection(book))
                .filter((value): value is SimulationBookSelection => value !== null);

              const comparison = eventBetComparisons.find((item) => item.marketType === group.marketKey);
              const simSide =
                group.marketKey === "total"
                  ? comparison
                    ? comparison.projected > comparison.marketLine
                      ? "OVER"
                      : comparison.projected < comparison.marketLine
                        ? "UNDER"
                        : "NONE"
                    : "NONE"
                  : comparison
                    ? comparison.projected > comparison.marketLine
                      ? "HOME"
                      : comparison.projected < comparison.marketLine
                        ? "AWAY"
                        : "NONE"
                    : "NONE";

              const sharpened = sharpenMlbExecution({
                marketKey: group.marketKey,
                label: group.label,
                simSide,
                consensusLine: typeof group.consensusLine === "number" ? round(group.consensusLine, 2) : null,
                books,
                context: executionContext,
              });

              return {
                marketType: group.marketKey as "total" | "spread_home",
                label: group.label,
                consensusLine: typeof group.consensusLine === "number" ? round(group.consensusLine, 2) : null,
                simSide,
                bestBook: sharpened.bestBook,
                bestBookCallout: sharpened.bestBookCallout,
                executionTriggers: sharpened.executionTriggers,
                staleOpportunityScore: sharpened.staleOpportunityScore,
                books: sharpened.books,
              } satisfies SimulationBookGameMarket;
            });

          const playerMarkets = mlbBookMarketStateRaw.playerMarkets
            .map((group) => {
              const books = group.books
                .map((book) => mapBookSelection(book))
                .filter((value): value is SimulationBookSelection => value !== null);

              const projection = playerProjections.find(
                (item) => item.playerId === group.playerId && item.statKey === group.marketKey
              );
              const simSide =
                projection && typeof group.consensusLine === "number"
                  ? projection.meanValue > group.consensusLine
                    ? "OVER"
                    : projection.meanValue < group.consensusLine
                      ? "UNDER"
                      : "NONE"
                  : "NONE";

              const sharpened = sharpenMlbExecution({
                marketKey: group.marketKey,
                label: group.label,
                simSide,
                consensusLine: typeof group.consensusLine === "number" ? round(group.consensusLine, 2) : null,
                books,
                context: executionContext,
              });

              return {
                key: `${group.playerId}:${group.marketKey}`,
                playerId: group.playerId ?? "unknown-player",
                playerName: group.playerName,
                statKey: group.marketKey,
                label: group.label,
                consensusLine: typeof group.consensusLine === "number" ? round(group.consensusLine, 2) : null,
                simSide,
                bestBook: sharpened.bestBook,
                bestBookCallout: sharpened.bestBookCallout,
                executionTriggers: sharpened.executionTriggers,
                staleOpportunityScore: sharpened.staleOpportunityScore,
                books: sharpened.books,
              } satisfies SimulationBookPlayerMarket;
            })
            .sort((left, right) => right.staleOpportunityScore - left.staleOpportunityScore || right.books.length - left.books.length);

          return {
            summary: mlbBookMarketStateRaw.summary,
            gameMarkets,
            playerMarkets,
          };
        })()
      : null;

  const topPlayerEdges = playerProjections
    .map((projection) => {
      const projectionMeta = getRecord(projection.metadata);
      const marketLine =
        typeof projectionMeta.marketLine === "number" ? projectionMeta.marketLine : null;
      const contextualEdgeScore =
        typeof projectionMeta.contextualEdgeScore === "number"
          ? projectionMeta.contextualEdgeScore
          : null;
      const playerName =
        typeof projectionMeta.playerName === "string" ? projectionMeta.playerName : projection.playerId;
      const drivers = Array.isArray(projectionMeta.drivers)
        ? projectionMeta.drivers.filter((value): value is string => typeof value === "string")
        : [];

      if (marketLine === null || contextualEdgeScore === null) {
        return null;
      }

      const overMap =
        "hitProbOver" in projection &&
        projection.hitProbOver &&
        typeof projection.hitProbOver === "object"
          ? (projection.hitProbOver as Record<string, number>)
          : null;
      const underMap =
        "hitProbUnder" in projection &&
        projection.hitProbUnder &&
        typeof projection.hitProbUnder === "object"
          ? (projection.hitProbUnder as Record<string, number>)
          : null;

      const overProbability = overMap?.[String(marketLine)] ?? null;
      const underProbability = underMap?.[String(marketLine)] ?? null;

      return {
        playerId: projection.playerId,
        playerName,
        statKey: projection.statKey,
        projectedMean: round(projection.meanValue, 2),
        projectedMedian: round(projection.medianValue ?? projection.meanValue, 2),
        marketLine,
        contextualEdgeScore,
        suggestedSide:
          projection.meanValue > marketLine ? "OVER" : projection.meanValue < marketLine ? "UNDER" : "NONE",
        overProbability: typeof overProbability === "number" ? round(overProbability, 3) : null,
        underProbability: typeof underProbability === "number" ? round(underProbability, 3) : null,
        drivers: drivers.slice(0, 3)
      } satisfies SimulationPlayerEdge;
    })
    .filter((value): value is SimulationPlayerEdge => value !== null)
    .sort((left, right) => Math.abs(right.contextualEdgeScore) - Math.abs(left.contextualEdgeScore))
    .slice(0, 8);

  const simSummary = extractSimSummary(simulation);
  const homeTeamMeta = getRecord(metadata.homeTeam);
  const awayTeamMeta = getRecord(metadata.awayTeam);
  const homeTeamName = typeof homeTeamMeta.abbreviation === "string"
    ? homeTeamMeta.abbreviation
    : typeof homeTeamMeta.name === "string" ? homeTeamMeta.name : "Home";
  const awayTeamName = typeof awayTeamMeta.abbreviation === "string"
    ? awayTeamMeta.abbreviation
    : typeof awayTeamMeta.name === "string" ? awayTeamMeta.name : "Away";
  const leagueKey = typeof metadata.league === "string" ? metadata.league : "UNKNOWN";

  const gameSimVerdict = simSummary
    ? buildGameSimVerdict({
        sim: simSummary,
        leagueKey,
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        marketTotal: typeof marketAnchor.total === "number" ? marketAnchor.total : null,
        marketSpreadHome: typeof marketAnchor.spreadHome === "number" ? marketAnchor.spreadHome : null,
        homeMoneylineOdds: typeof marketAnchor.homeMoneylineOdds === "number" ? marketAnchor.homeMoneylineOdds : null,
        awayMoneylineOdds: typeof marketAnchor.awayMoneylineOdds === "number" ? marketAnchor.awayMoneylineOdds : null,
        overOdds: typeof marketAnchor.overOdds === "number" ? marketAnchor.overOdds : null,
        underOdds: typeof marketAnchor.underOdds === "number" ? marketAnchor.underOdds : null,
        homeSpreadOdds: typeof marketAnchor.homeSpreadOdds === "number" ? marketAnchor.homeSpreadOdds : null,
        awaySpreadOdds: typeof marketAnchor.awaySpreadOdds === "number" ? marketAnchor.awaySpreadOdds : null,
      })
    : null;

  if (gameSimVerdict) {
    setSimVerdict(eventId, gameSimVerdict);
  }

  return {
    eventProjection,
    eventBetComparisons,
    projectionSummary,
    simulationDrivers,
    mlbSourceNativeContext,
    bookMarketState,
    playerProjectionCount: playerProjections.length,
    topPlayerEdges,
    topPlayerProjections: playerProjections,
    gameSimVerdict,
  };
}
