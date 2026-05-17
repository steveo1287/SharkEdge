import type { UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

export type UfcFinalVerdictTone = "aqua" | "green" | "amber" | "red" | "slate";

export type UfcFinalVerdict = {
  code: "PLAY" | "WATCH" | "PASS" | "NEEDS_SIM";
  label: string;
  title: string;
  subtitle: string;
  tone: UfcFinalVerdictTone;
  priority: number;
  pickLabel: string;
  confidenceLabel: string;
  dataLabel: string;
  marketLabel: string;
  edgeLabel: string;
  primaryReason: string;
  reasons: string[];
  showPick: boolean;
};

type VerdictInput = UfcOperationalFeedCard | null | undefined;

function pct(value: number | null | undefined, digits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function edge(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function odds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value > 0 ? `+${value}` : String(value);
}

function gradeRank(value: string | null | undefined) {
  if (value === "A") return 4;
  if (value === "B") return 3;
  if (value === "C") return 2;
  if (value === "D") return 1;
  return 0;
}

function pickProbability(fight: UfcOperationalFeedCard | null | undefined) {
  if (!fight?.hasPrediction || !fight.pickFighterId) return null;
  return fight.pickFighterId === fight.fighterAId ? fight.fighterAWinProbability : fight.fighterBWinProbability;
}

function uniqueReasons(...groups: Array<Array<string | null | undefined> | string | null | undefined>) {
  const values: string[] = [];
  for (const group of groups) {
    const items = Array.isArray(group) ? group : [group];
    for (const item of items) {
      if (typeof item === "string" && item.trim()) values.push(item.trim());
    }
  }
  return [...new Set(values)].slice(0, 8);
}

function methodFallbackActive(fight: UfcOperationalFeedCard) {
  return fight.dangerFlags.includes("method-prior-fallback") || fight.dangerFlags.includes("winner-probability-shrunk-for-weak-inputs");
}

export function buildUfcFinalVerdict(fight: VerdictInput): UfcFinalVerdict {
  if (!fight || !fight.hasPrediction) {
    return {
      code: "NEEDS_SIM",
      label: "Needs sim",
      title: "No final verdict yet",
      subtitle: "This fight is loaded, but SharkSim has not generated a current projection.",
      tone: "amber",
      priority: 0,
      pickLabel: "Sim pending",
      confidenceLabel: "Pending",
      dataLabel: "Source loaded",
      marketLabel: "Line pending",
      edgeLabel: "--",
      primaryReason: "Run UFC precompute to produce one auditable verdict.",
      reasons: ["Run UFC precompute to produce one auditable verdict."],
      showPick: false
    };
  }

  const gate = fight.promotionGate;
  const gateStatus = gate?.status ?? (fight.isPromotable ? "PROMOTABLE" : fight.isWatchlist ? "WATCHLIST" : fight.isShadowOnly ? "SHADOW_ONLY" : null);
  const confidence = gate?.confidenceCap ?? fight.confidenceGrade ?? "--";
  const data = gate?.grade ?? fight.dataQualityGrade ?? "--";
  const probability = pickProbability(fight);
  const hasRealMarket = fight.marketAware?.hasRealMarket === true || (typeof fight.sportsbookOddsAmerican === "number" && Number.isFinite(fight.sportsbookOddsAmerican));
  const noMarketEdge = fight.marketAware?.noMarketEdge === true || fight.edgePct == null;
  const lowData = gradeRank(data) <= 1 || fight.simInputAudit?.grade === "D" || fight.simInputAudit?.fighterA?.grade === "D" || fight.simInputAudit?.fighterB?.grade === "D";
  const lowConfidence = confidence === "LOW";
  const weakMethodFallback = methodFallbackActive(fight);
  const probabilityTooThin = typeof probability === "number" && probability < 0.555;
  const cleanPlayableEdge = typeof fight.edgePct === "number" && fight.edgePct >= 1.5;
  const reasons = uniqueReasons(gate?.reasons, fight.marketAware?.reasonCodes.map((code) => `Market flag: ${code}.`), fight.simInputAudit?.blockers, fight.dangerFlags.map((flag) => `Danger flag: ${flag}.`));

  const base = {
    pickLabel: fight.pickName ?? "Pick pending",
    confidenceLabel: confidence,
    dataLabel: data,
    marketLabel: hasRealMarket ? odds(fight.sportsbookOddsAmerican) : "No real line",
    edgeLabel: edge(fight.edgePct)
  };

  if (lowData) {
    const primaryReason = "Profile/data quality is too weak for a bettable verdict.";
    return {
      code: "PASS",
      label: "Pass",
      title: "Pass — data not bettable",
      subtitle: `${base.pickLabel} is only a model lean. Do not treat this as a play until fighter profiles are repaired.`,
      tone: "red",
      priority: 1,
      ...base,
      primaryReason,
      reasons: uniqueReasons(primaryReason, reasons),
      showPick: false
    };
  }

  if (weakMethodFallback) {
    const primaryReason = "Method/winner output is using fallback protection, not a sharp fight-specific projection.";
    return {
      code: "PASS",
      label: "Pass",
      title: "Pass — fallback model active",
      subtitle: `${base.pickLabel} remains visible for audit, but the final verdict is no bet.`,
      tone: "red",
      priority: 2,
      ...base,
      primaryReason,
      reasons: uniqueReasons(primaryReason, reasons),
      showPick: false
    };
  }

  if (!hasRealMarket || noMarketEdge) {
    const primaryReason = hasRealMarket ? "No promotable edge after market and uncertainty checks." : "No real two-sided sportsbook price is attached.";
    return {
      code: "PASS",
      label: "Pass",
      title: hasRealMarket ? "Pass — no edge" : "Pass — no market line",
      subtitle: `${base.pickLabel} is not actionable without a clean market edge.`,
      tone: "red",
      priority: 3,
      ...base,
      primaryReason,
      reasons: uniqueReasons(primaryReason, reasons),
      showPick: false
    };
  }

  if (lowConfidence || probabilityTooThin || gateStatus === "SHADOW_ONLY") {
    const primaryReason = lowConfidence ? "Confidence cap is LOW." : probabilityTooThin ? `Pick probability is too close to coin flip (${pct(probability, 1)}).` : "Promotion gate held this fight in shadow mode.";
    return {
      code: "PASS",
      label: "Pass",
      title: "Pass — not strong enough",
      subtitle: `${base.pickLabel} does not clear the final confidence gate.`,
      tone: "red",
      priority: 4,
      ...base,
      primaryReason,
      reasons: uniqueReasons(primaryReason, reasons),
      showPick: false
    };
  }

  if (gateStatus === "PROMOTABLE" && cleanPlayableEdge && typeof probability === "number" && probability >= 0.555) {
    const primaryReason = "Projection, market edge, data quality, and confidence gate all cleared.";
    return {
      code: "PLAY",
      label: "Play",
      title: `Play — ${base.pickLabel}`,
      subtitle: `${pct(probability, 1)} win probability · ${base.edgeLabel} edge · book ${base.marketLabel}.`,
      tone: "green",
      priority: 6,
      ...base,
      primaryReason,
      reasons: uniqueReasons(primaryReason, reasons),
      showPick: true
    };
  }

  const primaryReason = gateStatus === "WATCHLIST" ? "Watchlist: some gates passed, but not enough for a play." : "Usable projection, but final promotion gate did not clear.";
  return {
    code: "WATCH",
    label: "Watch",
    title: `Watch — ${base.pickLabel}`,
    subtitle: `${pct(probability, 1)} win probability · ${base.edgeLabel} edge · wait for cleaner confirmation.`,
    tone: "amber",
    priority: 5,
    ...base,
    primaryReason,
    reasons: uniqueReasons(primaryReason, reasons),
    showPick: true
  };
}

export function buildUfcCardVerdict(fights: UfcOperationalFeedCard[]) {
  if (!fights.length) return { label: "Empty", tone: "slate" as UfcFinalVerdictTone, summary: "No fights loaded." };
  const verdicts = fights.map(buildUfcFinalVerdict);
  const plays = verdicts.filter((item) => item.code === "PLAY").length;
  const watches = verdicts.filter((item) => item.code === "WATCH").length;
  const needsSim = verdicts.filter((item) => item.code === "NEEDS_SIM").length;
  if (plays > 0) return { label: `${plays} play${plays === 1 ? "" : "s"}`, tone: "green" as UfcFinalVerdictTone, summary: `${plays} fight${plays === 1 ? "" : "s"} cleared the final gate.` };
  if (watches > 0) return { label: `${watches} watch`, tone: "amber" as UfcFinalVerdictTone, summary: `${watches} fight${watches === 1 ? "" : "s"} are watchlist only.` };
  if (needsSim === fights.length) return { label: "Needs sim", tone: "amber" as UfcFinalVerdictTone, summary: "All fights need precompute." };
  return { label: "No plays", tone: "red" as UfcFinalVerdictTone, summary: "Final gate currently rejects the card." };
}
