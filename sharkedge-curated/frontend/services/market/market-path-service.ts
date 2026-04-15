import { groupSnapshotsBySportsbook, type NormalizedOddsSnapshot } from "@/lib/market/odds-snapshot";
import type {
  MarketPathBookDebugView,
  MarketPathBookRole,
  MarketPathExecutionHint,
  MarketPathRegime,
  MarketPathSynchronizationState,
  MarketPathView,
  MarketType
} from "@/lib/types/domain";

type BuildMarketPathArgs = {
  marketLabel: string;
  marketType: MarketType;
  sideSnapshots: NormalizedOddsSnapshot[];
  offeredSportsbookKey?: string | null;
  sportsbookNamesByKey?: Record<string, string>;
};

type BookPathState = {
  sportsbookKey: string;
  sportsbookName: string;
  snapshots: NormalizedOddsSnapshot[];
  open: NormalizedOddsSnapshot | null;
  current: NormalizedOddsSnapshot | null;
  previous: NormalizedOddsSnapshot | null;
  lastMoveAt: string | null;
  moveCount: number;
  comparableLine: number | null;
  betterGap: number;
  worseGap: number;
  role: MarketPathBookRole;
  notes: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number | null | undefined, digits = 2) {
  return typeof value === "number" ? Number(value.toFixed(digits)) : null;
}

function median(values: number[]) {
  if (!values.length) {
    return null;
  }

  const ordered = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) {
    return ordered[midpoint];
  }

  return (ordered[midpoint - 1] + ordered[midpoint]) / 2;
}

function maxNullable(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => typeof value === "number");
  return filtered.length ? Math.max(...filtered) : null;
}

function normalizeMarketFamily(marketType: MarketType) {
  if (marketType === "spread") {
    return "spread";
  }

  if (marketType === "moneyline") {
    return "moneyline";
  }

  if (marketType === "total" || marketType === "team_total") {
    return "total";
  }

  if (marketType.startsWith("player_")) {
    return "prop";
  }

  return "specialty";
}

function getLineThreshold(marketType: MarketType) {
  const family = normalizeMarketFamily(marketType);

  if (family === "moneyline") {
    return null;
  }

  if (family === "prop" || family === "specialty") {
    return 0.5;
  }

  return 0.25;
}

function getPriceThreshold(marketType: MarketType) {
  const family = normalizeMarketFamily(marketType);

  if (family === "moneyline") {
    return 14;
  }

  if (family === "prop" || family === "specialty") {
    return 18;
  }

  return 12;
}

function isOverSelection(snapshot: NormalizedOddsSnapshot) {
  const side = snapshot.side.toLowerCase();
  return side.includes("over") || side === "o";
}

function isUnderSelection(snapshot: NormalizedOddsSnapshot) {
  const side = snapshot.side.toLowerCase();
  return side.includes("under") || side === "u";
}

function toComparableLine(snapshot: NormalizedOddsSnapshot | null) {
  if (!snapshot || typeof snapshot.line !== "number") {
    return null;
  }

  const family = normalizeMarketFamily(snapshot.marketType as MarketType);
  if (family !== "total" && family !== "prop") {
    return snapshot.line;
  }

  if (isOverSelection(snapshot)) {
    return snapshot.line * -1;
  }

  if (isUnderSelection(snapshot)) {
    return snapshot.line;
  }

  return snapshot.line;
}

function compressSnapshots(snapshots: NormalizedOddsSnapshot[]) {
  return snapshots.reduce<NormalizedOddsSnapshot[]>((accumulator, snapshot) => {
    const previous = accumulator[accumulator.length - 1];
    if (
      previous &&
      previous.oddsAmerican === snapshot.oddsAmerican &&
      previous.line === snapshot.line
    ) {
      return accumulator;
    }

    accumulator.push(snapshot);
    return accumulator;
  }, []);
}

function buildBookStates(args: BuildMarketPathArgs) {
  const grouped = groupSnapshotsBySportsbook(args.sideSnapshots);

  return Array.from(grouped.entries()).map(([sportsbookKey, snapshots]) => {
    const ordered = [...snapshots].sort((left, right) =>
      left.capturedAt.localeCompare(right.capturedAt)
    );
    const distinct = compressSnapshots(ordered);
    const current = distinct[distinct.length - 1] ?? null;
    const previous = distinct.length > 1 ? distinct[distinct.length - 2] ?? null : null;
    const open = distinct[0] ?? null;
    const lastMoveAt =
      distinct.length > 1
        ? distinct[distinct.length - 1]?.capturedAt ?? null
        : current?.capturedAt ?? null;

    return {
      sportsbookKey,
      sportsbookName:
        args.sportsbookNamesByKey?.[sportsbookKey] ??
        current?.sourceName ??
        sportsbookKey,
      snapshots: distinct,
      open,
      current,
      previous,
      lastMoveAt,
      moveCount: Math.max(0, distinct.length - 1),
      comparableLine: toComparableLine(current),
      betterGap: 0,
      worseGap: 0,
      role: "UNCLASSIFIED" as MarketPathBookRole,
      notes: [] as string[]
    } satisfies BookPathState;
  });
}

function getConsensusCluster(
  bookStates: BookPathState[],
  marketType: MarketType
) {
  const lineThreshold = getLineThreshold(marketType);
  const priceThreshold = getPriceThreshold(marketType);
  const comparableLines = bookStates
    .map((state) => state.comparableLine)
    .filter((value): value is number => typeof value === "number");
  const consensusComparableLine = median(comparableLines);
  const consensusOdds = median(
    bookStates
      .map((state) => state.current?.oddsAmerican ?? null)
      .filter((value): value is number => typeof value === "number")
  );

  const cluster = new Set(
    bookStates
      .filter((state) => {
        const currentOdds = state.current?.oddsAmerican ?? null;
        const lineMatches =
          lineThreshold === null ||
          consensusComparableLine === null ||
          state.comparableLine === null ||
          Math.abs(state.comparableLine - consensusComparableLine) <= lineThreshold;
        const oddsMatch =
          consensusOdds === null ||
          currentOdds === null ||
          Math.abs(currentOdds - consensusOdds) <= priceThreshold;

        return lineMatches && oddsMatch;
      })
      .map((state) => state.sportsbookKey)
  );

  return {
    lineThreshold,
    priceThreshold,
    consensusComparableLine,
    consensusOdds,
    cluster
  };
}

function getTimeWindowMs(bookStates: BookPathState[]) {
  const withHistory = bookStates.filter((state) => state.moveCount > 0).length;
  return withHistory >= 2 ? 120_000 : 300_000;
}

function buildBetterGap(args: {
  state: BookPathState;
  consensusComparableLine: number | null;
  consensusOdds: number | null;
  lineThreshold: number | null;
  priceThreshold: number;
}) {
  const lineGap =
    args.lineThreshold !== null &&
    args.consensusComparableLine !== null &&
    args.state.comparableLine !== null
      ? (args.state.comparableLine - args.consensusComparableLine) / args.lineThreshold
      : 0;
  const currentOdds = args.state.current?.oddsAmerican ?? null;
  const priceGap =
    args.consensusOdds !== null && currentOdds !== null
      ? (currentOdds - args.consensusOdds) / args.priceThreshold
      : 0;

  return round(lineGap + priceGap, 3) ?? 0;
}

function getMoveSpanMinutes(bookStates: BookPathState[]) {
  const timestamps = bookStates
    .map((state) => state.lastMoveAt)
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));

  if (timestamps.length < 2) {
    return null;
  }

  return (Math.max(...timestamps) - Math.min(...timestamps)) / 60_000;
}

function determineSynchronizationState(args: {
  confirmationCount: number;
  laggingCount: number;
  outlierCount: number;
}): MarketPathSynchronizationState {
  if (args.confirmationCount >= 4 && args.laggingCount === 0) {
    return "BROAD_CONFIRMATION";
  }

  if (args.confirmationCount >= 2) {
    return "PARTIAL_CONFIRMATION";
  }

  if (args.outlierCount > 0 || args.laggingCount > 0) {
    return "FRAGMENTED";
  }

  return "NO_PATH";
}

function determineExecutionHint(args: {
  staleCopyConfidence: number;
  staleCopySuppressed: boolean;
  offeredIsLagging: boolean;
  offeredIsLeader: boolean;
  regime: MarketPathRegime;
}): MarketPathExecutionHint {
  if (args.staleCopySuppressed) {
    return "SUPPRESS";
  }

  if (args.offeredIsLagging && args.staleCopyConfidence >= 70) {
    return "HIT_NOW";
  }

  if (args.regime === "LEADER_CONFIRMED" || args.regime === "BROAD_REPRICE") {
    return args.offeredIsLeader ? "WAIT_FOR_COPY" : "WATCH";
  }

  if (args.staleCopyConfidence >= 50) {
    return "WATCH";
  }

  return "SUPPRESS";
}

export function getMarketPathBookDebug(
  marketPath: MarketPathView | null | undefined,
  sportsbookKey: string | null | undefined
) {
  if (!marketPath || !sportsbookKey) {
    return null;
  }

  return (
    marketPath.debug.find((row) => row.sportsbookKey === sportsbookKey) ?? null
  );
}

export function getMarketPathRole(
  marketPath: MarketPathView | null | undefined,
  sportsbookKey: string | null | undefined
) {
  return getMarketPathBookDebug(marketPath, sportsbookKey)?.role ?? "UNCLASSIFIED";
}

export function buildMarketPath(args: BuildMarketPathArgs): MarketPathView {
  const bookStates = buildBookStates(args);
  if (bookStates.length < 2) {
    return {
      regime: "NO_SIGNAL",
      leaderCandidates: [],
      confirmerBooks: [],
      followerBooks: [],
      laggingBooks: [],
      outlierBooks: [],
      confirmationCount: 0,
      confirmationQuality: 0,
      leaderFollowerConfidence: 0,
      synchronizationState: "NO_PATH",
      repriceSpread: null,
      staleCopyConfidence: 0,
      staleCopyReasons: ["Need at least two books to infer a live market path."],
      staleCopySuppressed: true,
      executionHint: "SUPPRESS",
      moveCoherenceScore: 0,
      notes: ["Market path is unavailable because the comparison set is too shallow."],
      debug: bookStates.map((state) => ({
        sportsbookKey: state.sportsbookKey,
        sportsbookName: state.sportsbookName,
        role: "UNCLASSIFIED",
        lastMoveAt: state.lastMoveAt,
        moveCount: state.moveCount,
        currentOddsAmerican: state.current?.oddsAmerican ?? null,
        currentLine: state.current?.line ?? null,
        betterThanConsensus: false,
        notes: ["Insufficient book depth for role assignment."]
      }))
    };
  }

  const consensus = getConsensusCluster(bookStates, args.marketType);
  const timeWindowMs = getTimeWindowMs(bookStates);
  const moveSpanMinutes = getMoveSpanMinutes(bookStates);

  const statesWithGaps = bookStates.map((state) => {
    const betterGap = buildBetterGap({
      state,
      consensusComparableLine: consensus.consensusComparableLine,
      consensusOdds: consensus.consensusOdds,
      lineThreshold: consensus.lineThreshold,
      priceThreshold: consensus.priceThreshold
    });

    return {
      ...state,
      betterGap,
      worseGap: round(betterGap * -1, 3) ?? 0
    };
  });

  const confirmingStates = statesWithGaps.filter(
    (state) => consensus.cluster.has(state.sportsbookKey) && state.betterGap <= 0.95
  );
  const laggingStates = statesWithGaps.filter(
    (state) =>
      !consensus.cluster.has(state.sportsbookKey) &&
      state.betterGap >= 1 &&
      confirmingStates.length >= 2
  );
  const outlierStates = statesWithGaps.filter(
    (state) =>
      !confirmingStates.some((entry) => entry.sportsbookKey === state.sportsbookKey) &&
      !laggingStates.some((entry) => entry.sportsbookKey === state.sportsbookKey)
  );

  const leaderTimestamp = confirmingStates
    .map((state) => state.lastMoveAt)
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)[0] ?? null;

  const leaderCandidates = leaderTimestamp === null
    ? []
    : confirmingStates.filter((state) => {
        const timestamp = state.lastMoveAt ? Date.parse(state.lastMoveAt) : NaN;
        return Number.isFinite(timestamp) && timestamp <= leaderTimestamp + timeWindowMs;
      });
  const followerStates = confirmingStates.filter(
    (state) =>
      !leaderCandidates.some((leader) => leader.sportsbookKey === state.sportsbookKey)
  );

  const confirmationQuality = Math.round(
    clamp(
      20 +
        (confirmingStates.length / Math.max(1, statesWithGaps.length)) * 45 +
        Math.min(20, leaderCandidates.length * 6) -
        (outlierStates.length / Math.max(1, statesWithGaps.length)) * 18,
      0,
      100
    )
  );
  const moveCoherenceScore = Math.round(
    clamp(
      18 +
        confirmationQuality * 0.55 +
        Math.min(12, Math.max(0, 10 - (moveSpanMinutes ?? 0))) -
        outlierStates.length * 8 -
        (laggingStates.length > 2 ? 6 : 0),
      0,
      100
    )
  );
  const leaderFollowerConfidence = Math.round(
    clamp(
      15 +
        confirmationQuality * 0.5 +
        leaderCandidates.length * 8 -
        (bookStates.filter((state) => state.moveCount === 0).length / bookStates.length) * 10 -
        outlierStates.length * 6,
      0,
      100
    )
  );

  const staleFeed =
    statesWithGaps.filter((state) => state.current?.isStale).length >=
    Math.ceil(statesWithGaps.length / 2);
  const staleCopySuppressed =
    confirmingStates.length < 2 ||
    staleFeed ||
    moveCoherenceScore < 45 ||
    (normalizeMarketFamily(args.marketType) === "prop" && confirmingStates.length < 3);
  const offeredIsLagging = Boolean(
    args.offeredSportsbookKey &&
      laggingStates.some((state) => state.sportsbookKey === args.offeredSportsbookKey)
  );
  const offeredIsLeader = Boolean(
    args.offeredSportsbookKey &&
      leaderCandidates.some((state) => state.sportsbookKey === args.offeredSportsbookKey)
  );
  const staleCopyConfidence = Math.round(
    clamp(
      (laggingStates.length ? 30 : 0) +
        confirmationQuality * 0.32 +
        moveCoherenceScore * 0.22 +
        (offeredIsLagging ? 14 : 0) -
        (staleFeed ? 18 : 0) -
        (outlierStates.length ? 10 : 0) -
        (staleCopySuppressed ? 22 : 0),
      0,
      100
    )
  );

  const regime: MarketPathRegime =
    laggingStates.length > 0 && staleCopyConfidence >= 64 && !staleCopySuppressed
      ? "STALE_COPY"
      : leaderCandidates.length > 0 && confirmingStates.length >= 4 && outlierStates.length === 0
        ? "BROAD_REPRICE"
        : leaderCandidates.length > 0 && confirmingStates.length >= 2
          ? "LEADER_CONFIRMED"
          : outlierStates.length > 0 || moveCoherenceScore < 45
            ? "FRAGMENTED"
            : "NO_SIGNAL";

  const repriceSpread = maxNullable(
    laggingStates.map((state) => {
      if (consensus.consensusComparableLine !== null && state.comparableLine !== null) {
        return Number((state.comparableLine - consensus.consensusComparableLine).toFixed(2));
      }

      if (consensus.consensusOdds !== null && state.current?.oddsAmerican !== null) {
        return Number((state.current.oddsAmerican - consensus.consensusOdds).toFixed(0));
      }

      return null;
    })
  );
  const synchronizationState = determineSynchronizationState({
    confirmationCount: confirmingStates.length,
    laggingCount: laggingStates.length,
    outlierCount: outlierStates.length
  });
  const staleCopyReasons = [
    laggingStates.length ? "A lagging book is still hanging a better number than the confirmed path." : null,
    confirmingStates.length >= 2 ? `${confirmingStates.length} books already confirmed the reprice.` : null,
    staleFeed ? "Feed freshness is too weak to trust a stale-copy read cleanly." : null,
    staleCopySuppressed ? "Stale-copy was suppressed because confirmation or freshness stayed below the trust gate." : null
  ].filter((value): value is string => Boolean(value));
  const executionHint = determineExecutionHint({
    staleCopyConfidence,
    staleCopySuppressed,
    offeredIsLagging,
    offeredIsLeader,
    regime
  });

  const stateByKey = new Map(statesWithGaps.map((state) => [state.sportsbookKey, state] as const));
  for (const state of statesWithGaps) {
    if (leaderCandidates.some((leader) => leader.sportsbookKey === state.sportsbookKey)) {
      state.role = "LEADER";
      state.notes.push("Moved early inside the confirmed path window.");
      continue;
    }

    if (followerStates.some((entry) => entry.sportsbookKey === state.sportsbookKey)) {
      state.role = "FOLLOWER";
      state.notes.push("Repriced after the leader window but landed inside consensus.");
      continue;
    }

    if (laggingStates.some((entry) => entry.sportsbookKey === state.sportsbookKey)) {
      state.role = "LAGGER";
      state.notes.push("Still showing a better price than the confirmed market path.");
      continue;
    }

    if (outlierStates.some((entry) => entry.sportsbookKey === state.sportsbookKey)) {
      state.role = "OUTLIER";
      state.notes.push("Outside the confirmed cluster without a clean stale-copy read.");
      continue;
    }

    if (confirmingStates.some((entry) => entry.sportsbookKey === state.sportsbookKey)) {
      state.role = "CONFIRMER";
      state.notes.push("Part of the current consensus cluster.");
      continue;
    }
  }

  const notes = [
    leaderCandidates.length
      ? `Leaders: ${leaderCandidates.map((state) => state.sportsbookName).join(", ")}`
      : "No clean leader window could be separated from the current path.",
    confirmingStates.length
      ? `${confirmingStates.length} books sit inside the current confirmation cluster.`
      : "Confirmation stayed too shallow to trust the move.",
    laggingStates.length
      ? `Lagging books: ${laggingStates.map((state) => state.sportsbookName).join(", ")}`
      : "No actionable lagging book is hanging away from the current consensus.",
    moveSpanMinutes !== null
      ? `Tracked repricing spanned about ${moveSpanMinutes.toFixed(1)} minutes across the board.`
      : "Snapshot history is too thin to estimate a repricing span."
  ];

  return {
    regime,
    leaderCandidates: leaderCandidates.map((state) => state.sportsbookKey),
    confirmerBooks: confirmingStates.map((state) => state.sportsbookKey),
    followerBooks: followerStates.map((state) => state.sportsbookKey),
    laggingBooks: laggingStates.map((state) => state.sportsbookKey),
    outlierBooks: outlierStates.map((state) => state.sportsbookKey),
    confirmationCount: confirmingStates.length,
    confirmationQuality,
    leaderFollowerConfidence,
    synchronizationState,
    repriceSpread: round(repriceSpread),
    staleCopyConfidence,
    staleCopyReasons,
    staleCopySuppressed,
    executionHint,
    moveCoherenceScore,
    notes,
    debug: Array.from(stateByKey.values()).map((state) => ({
      sportsbookKey: state.sportsbookKey,
      sportsbookName: state.sportsbookName,
      role: state.role,
      lastMoveAt: state.lastMoveAt,
      moveCount: state.moveCount,
      currentOddsAmerican: state.current?.oddsAmerican ?? null,
      currentLine: state.current?.line ?? null,
      betterThanConsensus: state.betterGap >= 1,
      notes: state.notes
    }))
  };
}
