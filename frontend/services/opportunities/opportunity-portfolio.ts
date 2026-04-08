import { prisma, hasUsableServerDatabaseUrl } from "@/lib/db/prisma";
import type {
  OpportunityBankrollSettings,
  OpportunityExposureDiagnostic,
  OpportunitySizingReasonCode,
  OpportunityView,
  PositionSizeRecommendation,
  PositionSizingGuidance
} from "@/lib/types/opportunity";
import {
  buildDefaultBankrollSettings,
  DEFAULT_USER_ID,
  getCurrentUserBankrollSettings
} from "@/services/account/user-service";
import {
  createOpportunityExecutionResolver,
  getOpportunityExecutionResolver,
  type OpportunityExecutionResolver
} from "@/services/opportunities/opportunity-execution";

type PortfolioPosition = {
  id: string;
  eventId: string | null;
  league: string;
  marketType: string;
  selection: string;
  riskAmount: number;
};

export type OpportunityPortfolioAllocator = {
  bankrollSettings: OpportunityBankrollSettings;
  apply: (opportunities: OpportunityView[]) => OpportunityView[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function inferMarketFamily(marketType: string) {
  const normalized = normalizeLabel(marketType);
  if (normalized.startsWith("player ")) {
    return "player_prop";
  }

  if (normalized.includes("total")) {
    return "total";
  }

  if (normalized.includes("moneyline")) {
    return "moneyline";
  }

  if (normalized.includes("spread") || normalized.includes("side")) {
    return "side";
  }

  return normalized;
}

function inferDirection(label: string) {
  const normalized = normalizeLabel(label);
  if (/\bover\b/.test(normalized)) {
    return "over";
  }

  if (/\bunder\b/.test(normalized)) {
    return "under";
  }

  if (/\b\+\d/.test(normalized)) {
    return "plus";
  }

  if (/\b-\d/.test(normalized)) {
    return "minus";
  }

  return normalized.split(" ").slice(0, 3).join("_");
}

function getRecommendation(bankrollPct: number): PositionSizeRecommendation {
  if (bankrollPct <= 0) {
    return "NO_BET";
  }

  if (bankrollPct < 0.25) {
    return "MICRO";
  }

  if (bankrollPct < 0.8) {
    return "SMALL";
  }

  if (bankrollPct < 1.6) {
    return "STANDARD";
  }

  return "AGGRESSIVE";
}

function getLabel(recommendation: PositionSizeRecommendation) {
  switch (recommendation) {
    case "AGGRESSIVE":
      return "Aggressive";
    case "STANDARD":
      return "Standard";
    case "SMALL":
      return "Small";
    case "MICRO":
      return "Micro";
    case "NO_BET":
      return "No bet";
  }
}

function getPortfolioRiskMessages(reasonCodes: OpportunitySizingReasonCode[]) {
  const messages = reasonCodes.map((code) => {
    switch (code) {
      case "CORRELATED_WITH_OPEN_EXPOSURE":
        return "Existing exposure already overlaps this risk cluster.";
      case "PORTFOLIO_BANKROLL_CAP":
        return "Portfolio bankroll cap is limiting the stake.";
      case "PORTFOLIO_EVENT_CAP":
        return "Same-event exposure cap is limiting the stake.";
      case "PORTFOLIO_MARKET_CAP":
        return "Same-market exposure cap is limiting the stake.";
      case "BETTER_CAPITAL_USE_EXISTS":
        return "Better capital use is live elsewhere on the board.";
      default:
        return null;
    }
  });

  return messages.filter((message) => message !== null) as string[];
}

function normalizePortfolioInclusion(
  reasonCodes: OpportunitySizingReasonCode[],
  includeInPortfolio: boolean
) {
  const filtered: OpportunitySizingReasonCode[] = reasonCodes.filter(
    (code) => code !== "PORTFOLIO_INCLUDED" && code !== "PORTFOLIO_EXCLUDED"
  );
  filtered.push(includeInPortfolio ? "PORTFOLIO_INCLUDED" : "PORTFOLIO_EXCLUDED");
  return Array.from(new Set(filtered));
}

function updateSizing(
  sizing: PositionSizingGuidance,
  updates: Partial<PositionSizingGuidance>
): PositionSizingGuidance {
  const next: PositionSizingGuidance = {
    ...sizing,
    ...updates
  };

  const bankrollPct =
    next.bankroll > 0
      ? round((next.recommendedStake / next.bankroll) * 100, 4)
      : 0;
  const recommendation = getRecommendation(bankrollPct);

  return {
    ...next,
    bankrollPct,
    recommendation,
    label: getLabel(recommendation),
    units:
      next.unitSize > 0 && next.recommendedStake > 0
        ? round(next.recommendedStake / next.unitSize, 2)
        : 0
  };
}

function buildExposureDiagnostics(args: {
  opportunity: OpportunityView;
  openPositions: PortfolioPosition[];
  bankrollSettings: OpportunityBankrollSettings;
}) {
  const marketFamily = inferMarketFamily(args.opportunity.marketType);
  const direction = inferDirection(args.opportunity.selectionLabel);
  const sameEvent = args.openPositions.filter(
    (position) => position.eventId && position.eventId === args.opportunity.eventId
  );
  const sameMarket = sameEvent.filter(
    (position) => inferMarketFamily(position.marketType) === marketFamily
  );
  const sameDirection = sameEvent.filter(
    (position) => inferDirection(position.selection) === direction
  );
  const sameLeague = args.openPositions.filter(
    (position) => normalizeLabel(position.league) === normalizeLabel(args.opportunity.league)
  );
  const totalOpenRisk = args.openPositions.reduce(
    (sum, position) => sum + position.riskAmount,
    0
  );
  const sameEventRisk = sameEvent.reduce((sum, position) => sum + position.riskAmount, 0);
  const sameMarketRisk = sameMarket.reduce((sum, position) => sum + position.riskAmount, 0);
  const sameDirectionRisk = sameDirection.reduce(
    (sum, position) => sum + position.riskAmount,
    0
  );
  const sameLeagueRisk = sameLeague.reduce((sum, position) => sum + position.riskAmount, 0);
  const bankroll = args.bankrollSettings.bankroll;

  const diagnostics: OpportunityExposureDiagnostic[] = [];
  if (totalOpenRisk > 0) {
    diagnostics.push({
      category: "PORTFOLIO",
      label: "Open risk",
      currentStake: round(totalOpenRisk),
      currentBankrollPct: round((totalOpenRisk / bankroll) * 100, 3),
      capBankrollPct: round(args.bankrollSettings.maxOpenExposurePct * 100, 3),
      penaltyFactor: clamp(
        1 - totalOpenRisk / Math.max(1, bankroll * args.bankrollSettings.maxOpenExposurePct) * 0.35,
        0.4,
        1
      ),
      note: "Current open risk already consumes part of the bankroll budget.",
      relatedIds: args.openPositions.map((position) => position.id)
    });
  }

  if (sameEventRisk > 0) {
    diagnostics.push({
      category: "EVENT",
      label: args.opportunity.eventLabel,
      currentStake: round(sameEventRisk),
      currentBankrollPct: round((sameEventRisk / bankroll) * 100, 3),
      capBankrollPct: round(args.bankrollSettings.maxEventExposurePct * 100, 3),
      penaltyFactor: clamp(
        1 - sameEventRisk / Math.max(1, bankroll * args.bankrollSettings.maxEventExposurePct) * 0.55,
        0.25,
        1
      ),
      note: "Same-game exposure stacks fragile outcomes fast.",
      relatedIds: sameEvent.map((position) => position.id)
    });
  }

  if (sameMarketRisk > 0) {
    diagnostics.push({
      category: "MARKET",
      label: `${args.opportunity.eventLabel} ${marketFamily}`,
      currentStake: round(sameMarketRisk),
      currentBankrollPct: round((sameMarketRisk / bankroll) * 100, 3),
      capBankrollPct: round(args.bankrollSettings.maxMarketExposurePct * 100, 3),
      penaltyFactor: clamp(
        1 - sameMarketRisk / Math.max(1, bankroll * args.bankrollSettings.maxMarketExposurePct) * 0.45,
        0.3,
        1
      ),
      note: "Multiple bets on the same market family are highly correlated.",
      relatedIds: sameMarket.map((position) => position.id)
    });
  }

  if (sameDirectionRisk > 0) {
    diagnostics.push({
      category: "DIRECTION",
      label: `${args.opportunity.eventLabel} ${direction}`,
      currentStake: round(sameDirectionRisk),
      currentBankrollPct: round((sameDirectionRisk / bankroll) * 100, 3),
      capBankrollPct: null,
      penaltyFactor: clamp(
        1 - sameDirectionRisk / Math.max(1, bankroll * args.bankrollSettings.maxEventExposurePct) * 0.22,
        0.5,
        1
      ),
      note: "Stacking one direction in the same game concentrates variance.",
      relatedIds: sameDirection.map((position) => position.id)
    });
  }

  if (sameLeagueRisk > bankroll * args.bankrollSettings.maxOpenExposurePct * 0.6) {
    diagnostics.push({
      category: "LEAGUE",
      label: args.opportunity.league,
      currentStake: round(sameLeagueRisk),
      currentBankrollPct: round((sameLeagueRisk / bankroll) * 100, 3),
      capBankrollPct: null,
      penaltyFactor: 0.88,
      note: "League exposure is starting to dominate the current card.",
      relatedIds: sameLeague.map((position) => position.id)
    });
  }

  const allowedBankrollStake = Math.max(
    0,
    bankroll * args.bankrollSettings.maxOpenExposurePct - totalOpenRisk
  );
  const allowedEventStake = Math.max(
    0,
    bankroll * args.bankrollSettings.maxEventExposurePct - sameEventRisk
  );
  const allowedMarketStake = Math.max(
    0,
    bankroll * args.bankrollSettings.maxMarketExposurePct - sameMarketRisk
  );
  const correlationPenalty = diagnostics.length
    ? diagnostics.reduce((min, diagnostic) => Math.min(min, diagnostic.penaltyFactor), 1)
    : 1;

  return {
    diagnostics,
    correlationPenalty,
    allowedBankrollStake,
    allowedEventStake,
    allowedMarketStake
  };
}

function isActionable(opportunity: OpportunityView) {
  return opportunity.actionState === "BET_NOW" && opportunity.sizing.adjustedStake > 0;
}

function getBasePriority(opportunity: OpportunityView) {
  const existingPriority = opportunity.sizing.capitalPriorityScore ?? 0;
  return Math.round(
    clamp(
      existingPriority +
        (opportunity.marketMicrostructure.status === "APPLIED"
          ? opportunity.marketMicrostructure.urgencyScore * 0.08
          : 0) +
        (opportunity.executionContext?.executionScore ?? 60) * 0.06,
      0,
      100
    )
  );
}

function applyBaseExposureAdjustments(args: {
  opportunity: OpportunityView;
  openPositions: PortfolioPosition[];
  bankrollSettings: OpportunityBankrollSettings;
  executionResolver?: OpportunityExecutionResolver | null;
}) {
  const executionContext = args.executionResolver?.resolve(args.opportunity) ?? null;
  const exposure = buildExposureDiagnostics({
    opportunity: args.opportunity,
    openPositions: args.openPositions,
    bankrollSettings: args.bankrollSettings
  });
  const current = args.opportunity.sizing;
  let recommendedStake = current.recommendedStake;
  let reasonCodes = [...current.reasonCodes];

  if (!isActionable(args.opportunity)) {
    recommendedStake = 0;
  } else {
    recommendedStake = Math.min(
      current.adjustedStake * exposure.correlationPenalty,
      exposure.allowedBankrollStake,
      exposure.allowedEventStake,
      exposure.allowedMarketStake
    );

    if (recommendedStake < current.adjustedStake) {
      reasonCodes.push("CORRELATED_WITH_OPEN_EXPOSURE");
    }

    if (recommendedStake <= 0 && exposure.allowedBankrollStake <= 0) {
      reasonCodes.push("PORTFOLIO_BANKROLL_CAP");
    }

    if (recommendedStake <= 0 && exposure.allowedEventStake <= 0) {
      reasonCodes.push("PORTFOLIO_EVENT_CAP");
    }

    if (recommendedStake <= 0 && exposure.allowedMarketStake <= 0) {
      reasonCodes.push("PORTFOLIO_MARKET_CAP");
    }
  }

  const updatedSizing = updateSizing(current, {
    exposureAdjustedStake: round(Math.max(0, recommendedStake)),
    competitionAdjustedStake: round(Math.max(0, recommendedStake)),
    recommendedStake: round(Math.max(0, recommendedStake)),
    exposureAdjustment:
      current.adjustedStake > 0
        ? round(Math.max(0, recommendedStake) / current.adjustedStake, 4)
        : 1,
    correlationPenalty: round(exposure.correlationPenalty, 4),
    exposureDiagnostics: exposure.diagnostics,
    availableBankroll: round(exposure.allowedBankrollStake),
    includeInPortfolio: isActionable(args.opportunity) && recommendedStake > 0,
    reasonCodes: normalizePortfolioInclusion(
      Array.from(new Set(reasonCodes)),
      isActionable(args.opportunity) && recommendedStake > 0
    ),
    riskFlags: Array.from(
      new Set([
        ...current.riskFlags,
        ...getPortfolioRiskMessages(reasonCodes)
      ])
    )
  });

  return {
    opportunity: {
      ...args.opportunity,
      sizing: updatedSizing,
      executionContext
    },
    priorityScore: getBasePriority({
      ...args.opportunity,
      sizing: updatedSizing,
      executionContext
    } as OpportunityView)
  };
}

function clonePosition(opportunity: OpportunityView): PortfolioPosition {
  return {
    id: opportunity.id,
    eventId: opportunity.eventId,
    league: opportunity.league,
    marketType: opportunity.marketType,
    selection: opportunity.selectionLabel,
    riskAmount: opportunity.sizing.recommendedStake
  };
}

export function createOpportunityPortfolioAllocator(args?: {
  bankrollSettings?: OpportunityBankrollSettings | null;
  openPositions?: PortfolioPosition[];
  executionResolver?: OpportunityExecutionResolver | null;
}): OpportunityPortfolioAllocator {
  const bankrollSettings = args?.bankrollSettings ?? buildDefaultBankrollSettings();
  const openPositions = args?.openPositions ?? [];
  const executionResolver = args?.executionResolver ?? createOpportunityExecutionResolver();

  return {
    bankrollSettings,
    apply(opportunities) {
      const preliminaries = opportunities.map((opportunity) =>
        applyBaseExposureAdjustments({
          opportunity,
          openPositions,
          bankrollSettings,
          executionResolver
        })
      );

      const sorted = [...preliminaries].sort((left, right) => right.priorityScore - left.priorityScore);
      let remainingBudget = Math.max(
        0,
        bankrollSettings.bankroll * bankrollSettings.maxOpenExposurePct -
          openPositions.reduce((sum, position) => sum + position.riskAmount, 0)
      );
      const simulatedOpenPositions = [...openPositions];
      const finalById = new Map<string, OpportunityView>();

      for (let index = 0; index < sorted.length; index += 1) {
        const { opportunity, priorityScore } = sorted[index];
        const topPriority = sorted[0]?.priorityScore ?? priorityScore;
        const sameEventAllocated = simulatedOpenPositions.some(
          (position) =>
            position.eventId &&
            position.eventId === opportunity.eventId &&
            position.id !== opportunity.id
        );

        let competitionPenalty = 1;
        if (!isActionable(opportunity)) {
          competitionPenalty = 0;
        } else {
          const priorityGap = topPriority - priorityScore;
          competitionPenalty = clamp(1 - priorityGap / 120, 0.55, 1);
          if (sameEventAllocated) {
            competitionPenalty = Math.min(competitionPenalty, 0.68);
          }
          if (index >= 3) {
            competitionPenalty = Math.min(competitionPenalty, 0.82);
          }
        }

        let recommendedStake = round(
          Math.max(0, opportunity.sizing.exposureAdjustedStake * competitionPenalty)
        );
        const reasonCodes = [...opportunity.sizing.reasonCodes];

        if (competitionPenalty < 1 && isActionable(opportunity)) {
          reasonCodes.push("BETTER_CAPITAL_USE_EXISTS");
        }

        if (recommendedStake > remainingBudget) {
          recommendedStake = round(Math.max(0, remainingBudget));
          if (recommendedStake < opportunity.sizing.exposureAdjustedStake) {
            reasonCodes.push("PORTFOLIO_BANKROLL_CAP");
          }
        }

        const minStake = Math.max(bankrollSettings.unitSize * 0.1, bankrollSettings.bankroll * 0.001);
        if (!isActionable(opportunity) || recommendedStake < minStake) {
          recommendedStake = 0;
        }

        const includeInPortfolio = recommendedStake > 0;
        const normalizedReasonCodes = normalizePortfolioInclusion(
          Array.from(new Set(reasonCodes)),
          includeInPortfolio
        );

        const updatedSizing = updateSizing(opportunity.sizing, {
          competitionPenalty: round(competitionPenalty, 4),
          competitionAdjustedStake: round(
            Math.max(0, opportunity.sizing.exposureAdjustedStake * competitionPenalty)
          ),
          recommendedStake,
          includeInPortfolio,
          capitalPriorityScore: priorityScore,
          availableBankroll: round(remainingBudget),
          reasonCodes: normalizedReasonCodes,
          riskFlags: Array.from(
            new Set([
              ...opportunity.sizing.riskFlags,
              ...getPortfolioRiskMessages(normalizedReasonCodes),
              ...(competitionPenalty < 1 && isActionable(opportunity)
                ? ["Better capital use is live elsewhere on the board."]
                : [])
            ])
          )
        });

        const updatedOpportunity = {
          ...opportunity,
          sizing: updatedSizing
        };
        finalById.set(updatedOpportunity.id, updatedOpportunity);

        if (recommendedStake > 0) {
          remainingBudget = Math.max(0, remainingBudget - recommendedStake);
          simulatedOpenPositions.push(clonePosition(updatedOpportunity));
        }
      }

      return opportunities.map((opportunity) => finalById.get(opportunity.id) ?? opportunity);
    }
  };
}

export async function getOpportunityPortfolioAllocator(): Promise<OpportunityPortfolioAllocator> {
  let bankrollSettings = buildDefaultBankrollSettings();
  let openPositions: PortfolioPosition[] = [];

  if (hasUsableServerDatabaseUrl()) {
    try {
      const [settings, bets] = await Promise.all([
        getCurrentUserBankrollSettings(),
        prisma.bet.findMany({
          where: {
            userId: DEFAULT_USER_ID,
            archivedAt: null,
            result: "OPEN"
          },
          select: {
            id: true,
            eventId: true,
            league: true,
            marketType: true,
            selection: true,
            riskAmount: true
          }
        })
      ]);

      bankrollSettings = settings;
      openPositions = bets.map((bet) => ({
        id: bet.id,
        eventId: bet.eventId,
        league: bet.league,
        marketType: bet.marketType,
        selection: bet.selection,
        riskAmount: bet.riskAmount
      }));
    } catch {
      bankrollSettings = buildDefaultBankrollSettings();
      openPositions = [];
    }
  }

  const openRisk = openPositions.reduce((sum, position) => sum + position.riskAmount, 0);
  bankrollSettings = {
    ...bankrollSettings,
    availableBankroll: round(
      Math.max(
        0,
        bankrollSettings.bankroll * bankrollSettings.maxOpenExposurePct - openRisk
      )
    )
  };

  const executionResolver = await getOpportunityExecutionResolver().catch(() =>
    createOpportunityExecutionResolver()
  );

  return createOpportunityPortfolioAllocator({
    bankrollSettings,
    openPositions,
    executionResolver
  });
}
