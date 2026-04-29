import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import type { LeagueKey } from "@/lib/types/domain";

import {
  assessTrendQuality,
  buildTrendQualityInputFromSignal,
  mapQualityTierToTrendGrade,
  mergeTrendRisk,
  type TrendOverfitRisk,
  type TrendQualityResult,
  type TrendQualityTier
} from "./trend-quality";

type TrendCategory = "Moneyline" | "Totals" | "Market" | "Risk" | "Schedule" | "Model";
type TrendGrade = "A" | "B" | "C" | "Watch" | "Pass";
type BaseTrendRisk = "low" | "medium" | "high";

type TrendSignalDraft = {
  id: string;
  league: LeagueKey | "ALL";
  gameId?: string;
  matchup?: { away: string; home: string };
  title: string;
  angle: string;
  category: TrendCategory;
  grade: TrendGrade;
  confidence: number;
  hitRate: number | null;
  sample: number | null;
  edge: number | null;
  market: string | null;
  risk: BaseTrendRisk;
  source: "sim-engine" | "market-edge" | "research-pattern";
  actionHref: string;
  notes: string[];
};

export type TrendSignal = TrendSignalDraft & {
  qualityScore: number;
  qualityTier: TrendQualityTier;
  quality: TrendQualityResult["quality"];
  marketQuality: TrendQualityResult["market"];
  lineSensitivity: TrendQualityResult["lineSensitivity"];
  overfitRisk: TrendOverfitRisk;
  warnings: string[];
};

const RESEARCH_PATTERNS: TrendSignalDraft[] = [
  { id: "mlb-bullpen-stress-total", league: "MLB", title: "Bullpen stress total pressure", angle: "Both bullpens carrying fatigue into a projected tight run environment.", category: "Totals", grade: "B", confidence: 0.61, hitRate: 57.9, sample: 219, edge: null, market: "total", risk: "medium", source: "research-pattern", actionHref: "/sim?league=MLB", notes: ["Use only when lineup locks and starting pitchers are confirmed.", "Pairs with weather/park factor and projected total."] },
  { id: "mlb-weather-carry", league: "MLB", title: "Weather carry expansion", angle: "Wind/temperature boosts run environment beyond market total expectation.", category: "Totals", grade: "B", confidence: 0.6, hitRate: 56.8, sample: 310, edge: null, market: "over/under", risk: "medium", source: "research-pattern", actionHref: "/baseball", notes: ["Best at open-air parks.", "Needs sportsbook total to become actionable."] },
  { id: "nba-rest-spot", league: "NBA", title: "Rest advantage pressure", angle: "Rested home team versus opponent in travel/fatigue spot.", category: "Schedule", grade: "B", confidence: 0.58, hitRate: 58.4, sample: 312, edge: null, market: "moneyline/spread", risk: "medium", source: "research-pattern", actionHref: "/sim?league=NBA", notes: ["Use as a model modifier, not a blind pick."] },
  { id: "nhl-road-b2b", league: "NHL", title: "Road back-to-back fade", angle: "Road team on second leg versus rested opponent.", category: "Schedule", grade: "B", confidence: 0.59, hitRate: 59.3, sample: 271, edge: null, market: "moneyline", risk: "medium", source: "research-pattern", actionHref: "/sim?league=NHL", notes: ["Travel distance and goalie confirmation matter."] },
  { id: "nfl-low-total-script", league: "NFL", title: "Low-total favorite grind", angle: "Run-heavy favorite profile in compressed total environment.", category: "Totals", grade: "B", confidence: 0.6, hitRate: 59.8, sample: 124, edge: null, market: "spread/total", risk: "medium", source: "research-pattern", actionHref: "/sim?league=NFL", notes: ["Works best with injury-adjusted offensive line context."] }
];

function pctEdge(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function gradeFrom(confidence: number, edge: number | null, risk: BaseTrendRisk): TrendGrade {
  if (risk === "high" || confidence < 0.54) return "Pass";
  if ((edge ?? 0) >= 0.05 && confidence >= 0.66) return "A";
  if ((edge ?? 0) >= 0.025 || confidence >= 0.6) return "B";
  return "Watch";
}
function riskFrom(volatility: number | null | undefined, noBet: boolean | undefined): BaseTrendRisk {
  if (noBet) return "high";
  if ((volatility ?? 1) >= 1.45) return "high";
  if ((volatility ?? 1) >= 1.15) return "medium";
  return "low";
}
function selected(value?: "ALL" | LeagueKey) { return value ?? "ALL"; }

function applyTrendQuality(signal: TrendSignalDraft): TrendSignal {
  const qualityResult = assessTrendQuality(buildTrendQualityInputFromSignal(signal));
  const qualityGrade = mapQualityTierToTrendGrade(qualityResult.quality.tier);
  const mergedRisk = mergeTrendRisk(signal.risk, qualityResult.quality.overfitRisk);
  const qualityNotes = qualityResult.explanation.map((note) => `Quality: ${note}`);
  const warningNotes = qualityResult.warnings.map((warning) => `Warning: ${warning}`);

  return {
    ...signal,
    grade: qualityGrade,
    confidence: Number(Math.min(signal.confidence, Math.max(qualityResult.quality.confidence, 0.01)).toFixed(3)),
    risk: mergedRisk,
    qualityScore: qualityResult.quality.score,
    qualityTier: qualityResult.quality.tier,
    quality: qualityResult.quality,
    marketQuality: qualityResult.market,
    lineSensitivity: qualityResult.lineSensitivity,
    overfitRisk: qualityResult.quality.overfitRisk,
    warnings: qualityResult.warnings,
    notes: [...signal.notes, ...qualityNotes, ...warningNotes]
  };
}

export async function buildTrendSignals(args: { league?: "ALL" | LeagueKey; includeResearch?: boolean } = {}) {
  const league = selected(args.league);
  const [sections, edgeData] = await Promise.all([
    buildBoardSportSections({ selectedLeague: league, gamesByLeague: {}, maxScoreboardGames: null }),
    buildMlbEdges().catch(() => ({ edges: [] as Awaited<ReturnType<typeof buildMlbEdges>>["edges"] }))
  ]);
  const edgeByGame = new Map((edgeData.edges ?? []).map((edge) => [edge.gameId, edge]));
  const games = sections.flatMap((section) => section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })));
  const liveSignals: TrendSignalDraft[] = [];

  for (const game of games) {
    const projection = await buildSimProjection(game);
    const intel = projection.mlbIntel;
    const edge = edgeByGame.get(game.id);
    const favorite = projection.distribution.homeWinPct >= projection.distribution.awayWinPct ? projection.matchup.home : projection.matchup.away;
    const favoritePct = Math.max(projection.distribution.homeWinPct, projection.distribution.awayWinPct);
    const marketEdge = pctEdge(edge?.signal?.edge);
    const risk = riskFrom(intel?.volatilityIndex, intel?.governor?.noBet);
    const confidence = intel?.governor?.confidence ?? favoritePct;
    const trendGrade = gradeFrom(confidence, marketEdge, risk);
    const actionHref = `/sim/${game.leagueKey.toLowerCase()}/${encodeURIComponent(game.id)}`;

    liveSignals.push({
      id: `${game.leagueKey}-${game.id}-model-lean`,
      league: game.leagueKey,
      gameId: game.id,
      matchup: projection.matchup,
      title: `${favorite} model lean`,
      angle: `${projection.matchup.away} @ ${projection.matchup.home}: model probability favors ${favorite} at ${(favoritePct * 100).toFixed(1)}%.`,
      category: "Moneyline",
      grade: trendGrade,
      confidence: Number(confidence.toFixed(3)),
      hitRate: null,
      sample: null,
      edge: marketEdge,
      market: edge?.signal?.market ?? "moneyline",
      risk,
      source: edge?.signal ? "market-edge" : "sim-engine",
      actionHref,
      notes: [projection.read, intel?.governor?.noBet ? "Governor says no-bet unless market value improves." : "Cleared current model scan.", edge?.signal ? `Best market signal: ${edge.signal.market} ${edge.signal.strength}.` : "No matched sportsbook market yet."]
    });

    if (intel?.projectedTotal) {
      const totalEdge = pctEdge(edge?.edges?.totalRuns);
      liveSignals.push({
        id: `${game.leagueKey}-${game.id}-total`,
        league: game.leagueKey,
        gameId: game.id,
        matchup: projection.matchup,
        title: `${projection.matchup.away} / ${projection.matchup.home} total trend`,
        angle: `Projected total ${intel.projectedTotal.toFixed(1)} with volatility ${intel.volatilityIndex}.`,
        category: "Totals",
        grade: gradeFrom(confidence, totalEdge == null ? null : Math.abs(totalEdge) / 10, risk),
        confidence: Number(confidence.toFixed(3)),
        hitRate: null,
        sample: null,
        edge: totalEdge,
        market: totalEdge == null ? "total" : totalEdge >= 0 ? "over" : "under",
        risk,
        source: edge?.edges?.totalRuns == null ? "sim-engine" : "market-edge",
        actionHref,
        notes: [intel.uncertainty?.interval ? `80% conformal range ${intel.uncertainty.interval.low}-${intel.uncertainty.interval.high}.` : "Conformal range not trained yet.", totalEdge == null ? "Needs sportsbook total to calculate edge." : `Model total edge ${totalEdge.toFixed(2)} runs.`]
      });
    }
  }

  const research = args.includeResearch === false ? [] : RESEARCH_PATTERNS.filter((trend) => league === "ALL" || trend.league === league);
  const signals = [...liveSignals, ...research].map(applyTrendQuality).sort((a, b) => {
    const gradeRank = { A: 5, B: 4, Watch: 3, C: 2, Pass: 1 } as Record<TrendGrade, number>;
    return gradeRank[b.grade] - gradeRank[a.grade] || b.qualityScore - a.qualityScore || b.confidence - a.confidence;
  });

  return {
    ok: true,
    league,
    generatedAt: new Date().toISOString(),
    counts: {
      total: signals.length,
      live: liveSignals.length,
      research: research.length,
      attack: signals.filter((signal) => signal.grade === "A" || signal.grade === "B").length,
      watch: signals.filter((signal) => signal.grade === "Watch" || signal.grade === "C").length,
      pass: signals.filter((signal) => signal.grade === "Pass").length,
      hiddenQuality: signals.filter((signal) => signal.qualityTier === "HIDE").length
    },
    signals
  };
}
