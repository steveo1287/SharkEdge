import type { PropCardView, PropMarketType, ReasonAttributionView } from "@/lib/types/domain";
import type { NbaFullStatProjectionView } from "@/services/simulation/nba-full-stat-projection-view";

const MARKET_TO_STAT: Partial<Record<PropMarketType | string, string>> = {
  player_points: "player_points",
  player_rebounds: "player_rebounds",
  player_assists: "player_assists",
  player_threes: "player_threes",
  player_steals: "player_steals",
  player_blocks: "player_blocks",
  player_turnovers: "player_turnovers",
  player_pra: "player_pra",
  player_pr: "player_pr",
  player_pa: "player_pa",
  player_ra: "player_ra"
};

type GateContext = {
  blocked: boolean;
  reasons: string[];
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function statKeyForMarket(marketType: PropMarketType | string) {
  return MARKET_TO_STAT[marketType] ?? null;
}

function buildPlayerStatIndex(view: NbaFullStatProjectionView | null) {
  const index = new Map<string, NonNullable<NbaFullStatProjectionView>["players"][number]>();
  for (const player of view?.players ?? []) {
    index.set(player.playerId, player);
  }
  return index;
}

function gateContextForProp(
  prop: PropCardView,
  playerIndex: Map<string, NonNullable<NbaFullStatProjectionView>["players"][number]>
): GateContext {
  if (prop.leagueKey !== "NBA") return { blocked: false, reasons: [] };
  const player = playerIndex.get(prop.player.id);
  if (!player) return { blocked: false, reasons: [] };

  const statKey = statKeyForMarket(prop.marketType);
  const stat = statKey ? player.stats.find((candidate) => candidate.statKey === statKey) : null;
  const minutes = player.minutes;
  const lineupTruth = player.lineupTruth;
  const reasons = unique([
    ...(stat?.blockers ?? []),
    ...(stat?.noBet ? ["projection marked no-bet"] : []),
    ...(minutes?.blockers ?? []),
    ...(lineupTruth?.blockers ?? []),
    ...(lineupTruth && lineupTruth.status !== "GREEN" ? [`lineup truth ${lineupTruth.status ?? "MISSING"}`] : []),
    ...(lineupTruth && lineupTruth.injuryReportFresh !== true ? ["stale or missing injury report"] : []),
    ...(lineupTruth && lineupTruth.minutesTrusted !== true ? ["minutes not trusted by lineup truth"] : []),
    ...((minutes?.confidence ?? 1) < 0.5 ? ["minutes confidence below 50%"] : []),
    ...((minutes?.injuryAdjustment ?? 1) < 0.9 ? ["injury adjustment degraded minutes"] : []),
    ...((minutes?.rotationStability ?? 1) < 0.45 ? ["rotation stability below 45%"] : []),
    ...((minutes?.minutesVolatility ?? 0) > 0.65 ? ["minutes volatility above 65%"] : [])
  ]);

  return {
    blocked: reasons.length > 0,
    reasons
  };
}

function safetyReason(reasons: string[]) {
  const text = reasons.slice(0, 3).join("; ");
  return `NBA safety gate forced PASS/WATCH: ${text || "projection quality blocker"}.`;
}

function buildSafetyReasonView(reasons: string[]): ReasonAttributionView {
  return {
    category: "pass",
    label: "NBA safety gate",
    detail: safetyReason(reasons),
    tone: "danger"
  };
}

export function applyNbaPropSafetyGate(args: {
  props: PropCardView[];
  fullStatProjectionView: NbaFullStatProjectionView | null;
}) {
  const playerIndex = buildPlayerStatIndex(args.fullStatProjectionView);
  let gatedCount = 0;
  const reasonCounts = new Map<string, number>();

  const props = args.props.map((prop) => {
    const context = gateContextForProp(prop, playerIndex);
    if (!context.blocked) return prop;
    gatedCount += 1;
    for (const reason of context.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }

    const reasonText = safetyReason(context.reasons);
    return {
      ...prop,
      expectedValuePct: typeof prop.expectedValuePct === "number" ? Math.min(prop.expectedValuePct, 0) : 0,
      valueFlag: "NONE" as const,
      supportNote: prop.supportNote ? `${reasonText} ${prop.supportNote}` : reasonText,
      confidenceBand: "pass" as const,
      confidenceScore: typeof prop.confidenceScore === "number" ? Math.min(prop.confidenceScore, 35) : 35,
      hidden: prop.hidden ?? false,
      edgeScore: {
        score: Math.min(prop.edgeScore.score, 45),
        label: "Pass" as const
      },
      evProfile: prop.evProfile
        ? {
            ...prop.evProfile,
            edgePct: Math.min(prop.evProfile.edgePct, 0),
            evPerUnit: prop.evProfile.evPerUnit === null ? null : Math.min(prop.evProfile.evPerUnit, 0),
            rankScore: Math.min(prop.evProfile.rankScore, 25),
            kellyFraction: 0
          }
        : prop.evProfile,
      analyticsSummary: prop.analyticsSummary
        ? {
            ...prop.analyticsSummary,
            tags: unique([...prop.analyticsSummary.tags, "NBA_SAFETY_GATE", "PASS_ONLY"]),
            reason: `${reasonText} ${prop.analyticsSummary.reason}`
          }
        : {
            tags: ["NBA_SAFETY_GATE", "PASS_ONLY"],
            reason: reasonText,
            sampleSize: null,
            bookCount: prop.sportsbookCount ?? 1
          },
      reasons: [buildSafetyReasonView(context.reasons), ...(prop.reasons ?? [])]
    } satisfies PropCardView;
  });

  return {
    props,
    summary: {
      gatedCount,
      reasonCounts: [...reasonCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    }
  };
}
