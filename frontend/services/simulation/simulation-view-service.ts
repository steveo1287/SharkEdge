import {
  buildEventProjectionFromHistory,
  buildPlayerPropProjectionsForEvent
} from "@/services/modeling/model-engine";

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
  playerProjectionCount: number;
  topPlayerEdges: SimulationPlayerEdge[];
  topPlayerProjections: Awaited<ReturnType<typeof buildPlayerPropProjectionsForEvent>>;
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

function getProbabilityMap(
  projection: unknown,
  key: "hitProbOver" | "hitProbUnder"
): Record<string, number> | null {
  if (!projection || typeof projection !== "object") {
    return null;
  }

  const record = projection as Record<string, unknown>;
  const raw = record[key];
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return raw as Record<string, number>;
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

export async function buildEventSimulationView(eventId: string): Promise<EventSimulationView | null> {
  const [eventProjection, playerProjections] = await Promise.all([
    buildEventProjectionFromHistory(eventId),
    buildPlayerPropProjectionsForEvent(eventId)
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
      typeof getRecord(metadata.ratingsPrior).source === "string" ? `Ratings prior ${String(getRecord(metadata.ratingsPrior).source).toLowerCase()}` : null
    ].filter((value): value is string => value !== null)
  };

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

      const overMap = getProbabilityMap(projection, "hitProbOver");
      const underMap = getProbabilityMap(projection, "hitProbUnder");
      const overProbability = overMap ? overMap[String(marketLine)] ?? null : null;
      const underProbability = underMap ? underMap[String(marketLine)] ?? null : null;

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

  return {
    eventProjection,
    eventBetComparisons,
    projectionSummary,
    simulationDrivers,
    playerProjectionCount: playerProjections.length,
    topPlayerEdges,
    topPlayerProjections: playerProjections
  };
}
