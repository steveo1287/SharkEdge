import type { OpportunityView } from "@/lib/types/opportunity";

export type OpportunityThesisClusterType =
  | "PLAYER_PROP_DIRECTION"
  | "PLAYER_PROP_FAMILY"
  | "EVENT_TOTAL"
  | "EVENT_SIDE"
  | "EVENT_MONEYLINE"
  | "EVENT_GENERIC";

export type OpportunityThesisClusterView = {
  clusterKey: string;
  correlationGroup: string;
  clusterType: OpportunityThesisClusterType;
  label: string;
  duplicateCount: number;
  correlationCount: number;
  overlapScore: number;
  relatedOpportunityIds: string[];
  primaryOpportunityId: string | null;
  isPrimary: boolean;
};

type ThesisLikeItem = {
  id?: string | null;
  eventId?: string | null;
  marketType?: string | null;
  selectionLabel?: string | null;
  rankingScore?: number | null;
  opportunityScore?: number | null;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function inferMarketFamily(marketType: string | null | undefined) {
  const normalized = normalizeText(marketType);
  if (normalized.startsWith("player ") || normalized.includes(" player ")) {
    return "player_prop";
  }
  if (normalized.includes("total")) return "total";
  if (normalized.includes("moneyline")) return "moneyline";
  if (normalized.includes("spread") || normalized.includes("side")) return "side";
  return normalized || "unknown";
}

function inferDirection(selectionLabel: string | null | undefined) {
  const normalized = normalizeText(selectionLabel);
  if (/\bover\b/.test(normalized)) return "over";
  if (/\bunder\b/.test(normalized)) return "under";
  if (/\bhome\b/.test(normalized)) return "home";
  if (/\baway\b/.test(normalized)) return "away";
  if (/\b\+\d/.test(normalized)) return "plus";
  if (/\b-\d/.test(normalized)) return "minus";
  return normalized.split(" ").slice(0, 2).join("_") || "generic";
}

function inferParticipantKey(selectionLabel: string | null | undefined) {
  const normalized = normalizeText(selectionLabel)
    .replace(/\b(over|under|alt|alternate|same game|sgp)\b/g, " ")
    .replace(/\b(points|point|rebounds|rebound|assists|assist|pra|par|hits|hit|runs|run|rbi|strikeouts|strikeout|shots|shot|goals|goal|saves|save|fantasy|bases|threes|three pointers|made threes|passing|rushing|receiving|yards|tds|touchdowns)\b/g, " ")
    .replace(/[-+]?\d+(\.\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized
    .split(" ")
    .filter((token) => token && token.length > 1 && !["the", "team", "vs", "v"].includes(token));

  if (tokens.length >= 2) {
    return tokens.slice(0, 2).join(" ");
  }
  if (tokens.length === 1) {
    return tokens[0];
  }
  return null;
}

export function buildThesisFingerprint(item: ThesisLikeItem) {
  const eventId = (item.eventId ?? "").trim();
  if (!eventId) {
    return null;
  }

  const marketFamily = inferMarketFamily(item.marketType);
  const direction = inferDirection(item.selectionLabel);
  const participantKey = marketFamily === "player_prop" ? inferParticipantKey(item.selectionLabel) : null;

  let clusterType: OpportunityThesisClusterType = "EVENT_GENERIC";
  let clusterKey = `${eventId}:generic:${marketFamily}:${direction}`;
  let correlationGroup = `${eventId}:generic:${marketFamily}`;
  let label = `${marketFamily.replace(/_/g, " ")} ${direction}`.trim();

  if (marketFamily === "player_prop" && participantKey) {
    clusterType = "PLAYER_PROP_DIRECTION";
    clusterKey = `${eventId}:player:${participantKey}:${direction}`;
    correlationGroup = `${eventId}:player:${participantKey}`;
    label = `${participantKey} ${direction} thesis`;
  } else if (marketFamily === "total") {
    clusterType = "EVENT_TOTAL";
    clusterKey = `${eventId}:total:${direction}`;
    correlationGroup = `${eventId}:total`;
    label = `game total ${direction}`;
  } else if (marketFamily === "side") {
    clusterType = "EVENT_SIDE";
    clusterKey = `${eventId}:side:${direction}`;
    correlationGroup = `${eventId}:side`;
    label = `side ${direction}`;
  } else if (marketFamily === "moneyline") {
    clusterType = "EVENT_MONEYLINE";
    clusterKey = `${eventId}:moneyline:${direction}`;
    correlationGroup = `${eventId}:moneyline`;
    label = `moneyline ${direction}`;
  }

  return {
    clusterKey,
    correlationGroup,
    clusterType,
    label,
    participantKey,
    marketFamily,
    direction,
  };
}

export function buildOpportunityThesisClusters(opportunities: OpportunityView[]) {
  const exactGroups = new Map<string, OpportunityView[]>();
  const correlationGroups = new Map<string, OpportunityView[]>();

  for (const opportunity of opportunities) {
    const fingerprint = buildThesisFingerprint({
      id: opportunity.id,
      eventId: opportunity.eventId,
      marketType: opportunity.marketType,
      selectionLabel: opportunity.selectionLabel,
      rankingScore: opportunity.ranking?.compositeScore ?? null,
      opportunityScore: opportunity.opportunityScore,
    });

    if (!fingerprint) {
      continue;
    }

    const exact = exactGroups.get(fingerprint.clusterKey) ?? [];
    exact.push(opportunity);
    exactGroups.set(fingerprint.clusterKey, exact);

    const correlation = correlationGroups.get(fingerprint.correlationGroup) ?? [];
    correlation.push(opportunity);
    correlationGroups.set(fingerprint.correlationGroup, correlation);
  }

  const result = new Map<string, OpportunityThesisClusterView>();

  for (const opportunity of opportunities) {
    const fingerprint = buildThesisFingerprint({
      id: opportunity.id,
      eventId: opportunity.eventId,
      marketType: opportunity.marketType,
      selectionLabel: opportunity.selectionLabel,
      rankingScore: opportunity.ranking?.compositeScore ?? null,
      opportunityScore: opportunity.opportunityScore,
    });

    if (!fingerprint) {
      continue;
    }

    const exact = [...(exactGroups.get(fingerprint.clusterKey) ?? [])];
    const correlation = [...(correlationGroups.get(fingerprint.correlationGroup) ?? [])];

    const sortByStrength = (left: OpportunityView, right: OpportunityView) => {
      const leftScore = left.ranking?.compositeScore ?? left.opportunityScore ?? 0;
      const rightScore = right.ranking?.compositeScore ?? right.opportunityScore ?? 0;
      return rightScore - leftScore;
    };

    exact.sort(sortByStrength);
    correlation.sort(sortByStrength);

    const primaryOpportunityId = correlation[0]?.id ?? null;
    const duplicateCount = exact.length;
    const correlationCount = correlation.length;
    const overlapScore =
      duplicateCount > 1
        ? 0.96
        : correlationCount > 1
          ? 0.74
          : 0.18;

    result.set(opportunity.id, {
      clusterKey: fingerprint.clusterKey,
      correlationGroup: fingerprint.correlationGroup,
      clusterType: fingerprint.clusterType,
      label: fingerprint.label,
      duplicateCount,
      correlationCount,
      overlapScore,
      relatedOpportunityIds: correlation.map((item) => item.id),
      primaryOpportunityId,
      isPrimary: primaryOpportunityId === opportunity.id,
    });
  }

  return result;
}
