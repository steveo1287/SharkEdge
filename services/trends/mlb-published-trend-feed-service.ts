import type { PublishedMlbTrendCard, PublishedMlbTrendFeed } from "@/lib/types/mlb-trend-feed";

import {
  getMlbTrendDefinitions
} from "./mlb-trend-definition-service";
import {
  DefaultMlbTrendEvaluatorService,
  type MlbTrendEvaluatorService
} from "./mlb-trend-evaluator-service";
import {
  DefaultMlbTrendActiveMatchService,
  type MlbTrendActiveMatchService
} from "./mlb-trend-active-match-service";
import {
  loadNormalizedMlbBoardTrendRows,
  loadNormalizedMlbHistoricalTrendRows
} from "./mlb-trends-data-adapters";

export interface PublishedMlbTrendFeedService {
  getPublishedTrendFeed(): Promise<PublishedMlbTrendFeed>;
}

function confidenceRank(value: PublishedMlbTrendCard["confidenceLabel"]) {
  if (value === "HIGH") return 2;
  if (value === "MEDIUM") return 1;
  return 0;
}

function stabilityRank(value: PublishedMlbTrendCard["stabilityLabel"]) {
  if (value === "STRONG") return 2;
  if (value === "STEADY") return 1;
  return 0;
}

function numeric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}

function buildFeedWarnings(args: {
  historicalWarnings: string[];
  boardWarnings: string[];
  cards: PublishedMlbTrendCard[];
}) {
  const warnings = [...args.historicalWarnings, ...args.boardWarnings];

  if (!args.cards.length) {
    warnings.push("No MLB trend cards are publishable yet from the current historical coverage.");
    return Array.from(new Set(warnings));
  }

  const allMissingSample = args.cards.every((card) => card.sampleSize === 0);
  if (allMissingSample) {
    warnings.push(
      "Historical MLB closing market archive is not populated yet. Active board matches are available, but published records and ROI remain limited."
    );
  }

  const anyNullRoi = args.cards.some((card) => card.roi === null);
  if (anyNullRoi) {
    warnings.push("ROI stays null whenever usable historical closing prices are too thin for honest grading.");
  }

  return Array.from(new Set(warnings));
}

export class DefaultPublishedMlbTrendFeedService implements PublishedMlbTrendFeedService {
  constructor(
    private readonly evaluator: MlbTrendEvaluatorService = new DefaultMlbTrendEvaluatorService(),
    private readonly activeMatches: MlbTrendActiveMatchService = new DefaultMlbTrendActiveMatchService()
  ) {}

  async getPublishedTrendFeed(): Promise<PublishedMlbTrendFeed> {
    const [historical, board] = await Promise.all([
      loadNormalizedMlbHistoricalTrendRows(),
      loadNormalizedMlbBoardTrendRows()
    ]);
    const definitions = getMlbTrendDefinitions();

    const cards = definitions
      .map((definition) => {
        const summary = this.evaluator.evaluateTrend(definition, historical.rows);
        const todayMatches = this.activeMatches.findMatches(definition, board.rows);

        return {
          id: definition.id,
          family: definition.family,
          title: definition.title,
          description: definition.description,
          subject: definition.subject ? { ...definition.subject } : undefined,
          betSide: definition.betSide,
          whyThisMatters: definition.whyThisMatters,
          cautionNote: definition.cautionNote,
          wins: summary.wins,
          losses: summary.losses,
          pushes: summary.pushes,
          sampleSize: summary.sampleSize,
          record: summary.record,
          hitRate: summary.hitRate,
          roi: summary.roi,
          confidenceLabel: summary.confidenceLabel,
          stabilityLabel: summary.stabilityLabel,
          signalScore: summary.signalScore,
          stabilityScore: summary.stabilityScore,
          fragilityScore: summary.fragilityScore,
          overfitRisk: summary.overfitRisk,
          seasonConcentration: summary.seasonConcentration,
          neighborBandScore: summary.neighborBandScore,
          neighborBandCount: summary.neighborBandCount,
          holdoutScore: summary.holdoutScore,
          holdoutSeasons: summary.holdoutSeasons,
          holdoutPassRate: summary.holdoutPassRate,
          warnings: summary.warnings,
          todayMatches
        } satisfies PublishedMlbTrendCard;
      })
      .sort((left, right) => {
        const signalDelta = numeric(right.signalScore) - numeric(left.signalScore);
        if (signalDelta !== 0) return signalDelta;

        const robustnessDelta = numeric(right.neighborBandScore) - numeric(left.neighborBandScore);
        if (robustnessDelta !== 0) return robustnessDelta;

        const holdoutDelta = numeric(right.holdoutScore) - numeric(left.holdoutScore);
        if (holdoutDelta !== 0) return holdoutDelta;

        const fragilityDelta = numeric(left.fragilityScore) - numeric(right.fragilityScore);
        if (fragilityDelta !== 0) return fragilityDelta;

        const overfitDelta = numeric(left.overfitRisk) - numeric(right.overfitRisk);
        if (overfitDelta !== 0) return overfitDelta;

        const confidenceDelta = confidenceRank(right.confidenceLabel) - confidenceRank(left.confidenceLabel);
        if (confidenceDelta !== 0) return confidenceDelta;

        const stabilityDelta = stabilityRank(right.stabilityLabel) - stabilityRank(left.stabilityLabel);
        if (stabilityDelta !== 0) return stabilityDelta;

        if (right.sampleSize !== left.sampleSize) {
          return right.sampleSize - left.sampleSize;
        }

        const rightHitRate = right.hitRate ?? -1;
        const leftHitRate = left.hitRate ?? -1;
        if (rightHitRate !== leftHitRate) {
          return rightHitRate - leftHitRate;
        }

        return right.todayMatches.length - left.todayMatches.length;
      });

    return {
      generatedAt: new Date().toISOString(),
      cards,
      warnings: buildFeedWarnings({
        historicalWarnings: historical.warnings,
        boardWarnings: board.warnings,
        cards
      })
    };
  }
}
