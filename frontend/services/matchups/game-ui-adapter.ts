import type {
  MatchupDetailView,
  MatchupTrendCardView,
  ProviderHealthView
} from "@/lib/types/domain";

export type GameHubTab = {
  id: "for-you" | "markets" | "props" | "movement" | "splits" | "trends" | "kalshi" | "feed";
  label: string;
  href: string;
  active: boolean;
  count?: number | null;
};

export type GameHubMetric = {
  label: string;
  value: string;
  note: string;
};

export type GameHubSectionCard = {
  title: string;
  value: string;
  note: string;
  tone?: "default" | "success" | "premium" | "danger";
};

function formatSignedNumber(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatFairLine(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function buildTrapLabel(detail: MatchupDetailView) {
  const signal = detail.betSignals[0];
  const hasRiskFlags =
    Boolean(signal?.marketTruth?.flags?.length) ||
    Boolean(detail.providerHealth.warnings.length);

  if (!hasRiskFlags) {
    return "Clear";
  }

  const warningCount =
    (signal?.marketTruth?.flags?.length ?? 0) + detail.providerHealth.warnings.length;

  return `${warningCount} flags`;
}

function buildMovementCards(detail: MatchupDetailView): GameHubSectionCard[] {
  const cards: GameHubSectionCard[] = [];
  const opening = detail.lineMovement[0];
  const latest = detail.lineMovement[detail.lineMovement.length - 1];

  if (opening && latest) {
    const spreadMove =
      typeof opening.spreadLine === "number" && typeof latest.spreadLine === "number"
        ? latest.spreadLine - opening.spreadLine
        : null;

    const totalMove =
      typeof opening.totalLine === "number" && typeof latest.totalLine === "number"
        ? latest.totalLine - opening.totalLine
        : null;

    cards.push({
      title: "Spread move",
      value: formatSignedNumber(spreadMove) ?? "No tracked move",
      note: "Opening versus latest tracked spread snapshot.",
      tone:
        typeof spreadMove === "number" && Math.abs(spreadMove) >= 1
          ? "success"
          : "default"
    });

    cards.push({
      title: "Total move",
      value: formatSignedNumber(totalMove) ?? "No tracked move",
      note: "Opening versus latest tracked total snapshot.",
      tone:
        typeof totalMove === "number" && Math.abs(totalMove) >= 1
          ? "premium"
          : "default"
    });
  }

  for (const range of detail.marketRanges.slice(0, 2)) {
    cards.push({
      title: range.label,
      value: range.value,
      note: "Current range view from the active market analytics payload."
    });
  }

  if (!cards.length) {
    cards.push({
      title: "Movement coverage",
      value: "Pending",
      note: "No tracked movement snapshots are available for this matchup yet."
    });
  }

  return cards.slice(0, 4);
}

function buildSplitsCards(providerHealth: ProviderHealthView): GameHubSectionCard[] {
  const warning = providerHealth.warnings[0] ?? null;

  return [
    {
      title: "Public / money splits",
      value: "Not wired",
      note:
        "Current provider mesh does not expose ticket % and money % on this route yet.",
      tone: "default"
    },
    {
      title: "Provider health",
      value: providerHealth.label,
      note: providerHealth.summary,
      tone:
        providerHealth.state === "HEALTHY"
          ? "success"
          : providerHealth.state === "DEGRADED"
            ? "premium"
            : providerHealth.state === "OFFLINE"
              ? "danger"
              : "default"
    },
    {
      title: "First warning",
      value: warning ? "Raised" : "Clear",
      note: warning ?? "No current provider warning is raised for this matchup."
    }
  ];
}

function buildKalshiCards(trendCards: MatchupTrendCardView[]): GameHubSectionCard[] {
  return [
    {
      title: "Kalshi overlay",
      value: "Next pass",
      note:
        "Game shell is ready. Contract matching and probability-delta wiring belong in the next integration pass."
    },
    {
      title: "Prediction-market context",
      value: trendCards.length ? `${trendCards.length} related signals` : "None yet",
      note:
        "Historical or board-derived context is available now, but exchange-overlay fields are not yet attached."
    }
  ];
}

export function buildGameHubTabs(detail: MatchupDetailView): GameHubTab[] {
  return [
    { id: "for-you", label: "For You", href: "#for-you", active: true },
    { id: "markets", label: "Markets", href: "#markets", active: detail.hasVerifiedOdds },
    { id: "props", label: "Props", href: "#props", active: true, count: detail.props.length || null },
    {
      id: "movement",
      label: "Movement",
      href: "#movement",
      active: Boolean(detail.lineMovement.length || detail.marketRanges.length)
    },
    { id: "splits", label: "Splits", href: "#splits", active: true },
    {
      id: "trends",
      label: "Trends",
      href: "#trends",
      active: Boolean(detail.trendCards.length),
      count: detail.trendCards.length || null
    },
    { id: "kalshi", label: "Kalshi", href: "#kalshi", active: true },
    { id: "feed", label: "Feed", href: "#feed", active: true }
  ];
}

export function buildGameHubMetrics(
  detail: MatchupDetailView,
  postureLabel: string
): GameHubMetric[] {
  const headlineSignal = detail.betSignals[0] ?? null;

  return [
    {
      label: "Best angle",
      value: headlineSignal
        ? `${headlineSignal.selection} at ${headlineSignal.oddsAmerican > 0 ? "+" : ""}${headlineSignal.oddsAmerican}`
        : "No qualified edge",
      note: "Lead read only."
    },
    {
      label: "Posture",
      value: postureLabel,
      note: "Bet now, wait, watch, or pass."
    },
    {
      label: "Fair line",
      value: formatFairLine(headlineSignal?.fairPrice?.fairOddsAmerican),
      note: "Pricing anchor."
    },
    {
      label: "Trap risk",
      value: buildTrapLabel(detail),
      note: "Kill switch before conviction."
    }
  ];
}

export function buildGameHubMovementCards(detail: MatchupDetailView) {
  return buildMovementCards(detail);
}

export function buildGameHubSplitsCards(detail: MatchupDetailView) {
  return buildSplitsCards(detail.providerHealth);
}

export function buildGameHubKalshiCards(detail: MatchupDetailView) {
  return buildKalshiCards(detail.trendCards);
}