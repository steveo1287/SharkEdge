import { americanToDecimal, americanToImpliedProbability, calculatePotentialPayout, calculateToWin } from "@/lib/utils/odds";
import type {
  EventParticipantView,
  LedgerBetResult,
  LedgerEventStatus,
  LedgerMarketType,
  SupportedLeagueKey,
  SupportedSportCode
} from "@/lib/types/ledger";

export const SPORT_LABELS: Record<SupportedSportCode, string> = {
  BASKETBALL: "Basketball",
  BASEBALL: "Baseball",
  HOCKEY: "Hockey",
  FOOTBALL: "Football",
  MMA: "MMA",
  BOXING: "Boxing",
  OTHER: "Other"
};

export const LEAGUE_SPORT_MAP: Record<SupportedLeagueKey, SupportedSportCode> = {
  NBA: "BASKETBALL",
  NCAAB: "BASKETBALL",
  MLB: "BASEBALL",
  NHL: "HOCKEY",
  NFL: "FOOTBALL",
  NCAAF: "FOOTBALL",
  UFC: "MMA",
  BOXING: "BOXING"
};

export const LEAGUE_LABELS: Record<SupportedLeagueKey, string> = {
  NBA: "NBA",
  NCAAB: "NCAA Men's Basketball",
  MLB: "MLB",
  NHL: "NHL",
  NFL: "NFL",
  NCAAF: "College Football",
  UFC: "UFC",
  BOXING: "Boxing"
};

export const MARKET_LABELS: Record<LedgerMarketType, string> = {
  spread: "Spread",
  moneyline: "Moneyline",
  total: "Total",
  team_total: "Team Total",
  player_points: "Player Points",
  player_rebounds: "Player Rebounds",
  player_assists: "Player Assists",
  player_threes: "Player Threes",
  player_pitcher_outs: "Pitcher Outs",
  player_pitcher_strikeouts: "Pitcher Strikeouts",
  fight_winner: "Fight Winner",
  method_of_victory: "Method of Victory",
  round_total: "Round Total",
  round_winner: "Round Winner",
  other: "Other"
};

export function formatLedgerMarketType(marketType: LedgerMarketType) {
  return MARKET_LABELS[marketType] ?? marketType;
}

export function isSettledResult(result: LedgerBetResult) {
  return result !== "OPEN";
}

export function decimalToAmerican(decimal: number) {
  if (decimal <= 1) {
    return -10000;
  }

  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  }

  return Math.round(-100 / (decimal - 1));
}

export function calculateParlayOddsDecimal(americanPrices: number[]) {
  return Number(
    americanPrices.reduce((total, price) => total * americanToDecimal(price), 1).toFixed(4)
  );
}

export function calculateParlayToWin(stake: number, americanPrices: number[]) {
  const decimal = calculateParlayOddsDecimal(americanPrices);
  return Number((stake * (decimal - 1)).toFixed(2));
}

export function calculateBetToWin(stake: number, americanPrice: number) {
  return calculateToWin(stake, americanPrice);
}

export function calculatePayout(stake: number, americanPrice: number) {
  return calculatePotentialPayout(stake, americanPrice);
}

export function calculatePriceClv(openAmerican: number | null, closingAmerican: number | null) {
  if (typeof openAmerican !== "number" || typeof closingAmerican !== "number") {
    return null;
  }

  const openProbability = americanToImpliedProbability(openAmerican);
  const closingProbability = americanToImpliedProbability(closingAmerican);

  return Number(((closingProbability - openProbability) * 100).toFixed(2));
}

export function calculateLineClv(args: {
  marketType: LedgerMarketType;
  selection: string;
  line: number | null;
  closingLine: number | null;
}) {
  const { marketType, selection, line, closingLine } = args;

  if (typeof line !== "number" || typeof closingLine !== "number") {
    return null;
  }

  const upperSelection = selection.toUpperCase();

  if (marketType === "total" || marketType === "round_total") {
    if (upperSelection.includes("OVER")) {
      return Number((closingLine - line).toFixed(2));
    }

    if (upperSelection.includes("UNDER")) {
      return Number((line - closingLine).toFixed(2));
    }

    return null;
  }

  if (marketType === "spread" || marketType === "team_total") {
    if (line > 0 && closingLine > 0) {
      return Number((line - closingLine).toFixed(2));
    }

    if (line < 0 && closingLine < 0) {
      return Number((Math.abs(closingLine) - Math.abs(line)).toFixed(2));
    }
  }

  return null;
}

function normalizeSelection(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toNumericScore(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getOrderedParticipants(participants: EventParticipantView[]) {
  return [...participants].sort((left, right) => left.sortOrder - right.sortOrder);
}

function getTeamStyleParticipants(participants: EventParticipantView[]) {
  const home = participants.find((participant) => participant.role === "HOME");
  const away = participants.find((participant) => participant.role === "AWAY");

  return {
    home: home ?? null,
    away: away ?? null
  };
}

function findSelectedParticipant(
  selection: string,
  participants: EventParticipantView[]
) {
  const normalized = normalizeSelection(selection);

  return (
    participants.find((participant) => {
      const names = [
        participant.name,
        participant.abbreviation ?? "",
        `${participant.name} moneyline`,
        `${participant.name} spread`
      ]
        .map((value) => normalizeSelection(value))
        .filter(Boolean);

      return names.some((value) => value === normalized || normalized.includes(value));
    }) ?? null
  );
}

export function formatEventLabelFromParticipants(participants: EventParticipantView[]) {
  const ordered = getOrderedParticipants(participants);
  const { home, away } = getTeamStyleParticipants(ordered);

  if (home && away) {
    return `${away.name} @ ${home.name}`;
  }

  if (ordered.length >= 2) {
    return `${ordered[0]?.name ?? "TBD"} vs ${ordered[1]?.name ?? "TBD"}`;
  }

  return ordered[0]?.name ?? "Event";
}

export function formatScoreboardFromParticipants(participants: EventParticipantView[]) {
  const ordered = getOrderedParticipants(participants);
  const { home, away } = getTeamStyleParticipants(ordered);

  if (home && away && home.score && away.score) {
    return `${away.abbreviation ?? away.name} ${away.score} - ${home.abbreviation ?? home.name} ${home.score}`;
  }

  if (ordered.length >= 2 && ordered[0]?.score && ordered[1]?.score) {
    return `${ordered[0].name} ${ordered[0].score} - ${ordered[1].name} ${ordered[1].score}`;
  }

  return null;
}

export function deriveBetResultFromLegs(results: LedgerBetResult[]) {
  if (!results.length) {
    return "OPEN" as const;
  }

  if (results.includes("LOSS")) {
    return "LOSS" as const;
  }

  if (results.includes("OPEN")) {
    return "OPEN" as const;
  }

  if (results.every((result) => result === "PUSH")) {
    return "PUSH" as const;
  }

  if (results.every((result) => result === "VOID")) {
    return "VOID" as const;
  }

  if (results.every((result) => result === "WIN" || result === "PUSH" || result === "VOID")) {
    return results.some((result) => result === "WIN") ? ("WIN" as const) : ("PUSH" as const);
  }

  return "OPEN" as const;
}

export function gradeLegFromEvent(args: {
  marketType: LedgerMarketType;
  selection: string;
  side?: string | null;
  line?: number | null;
  eventStatus: LedgerEventStatus;
  participants: EventParticipantView[];
}) {
  const { marketType, selection, side, line, eventStatus, participants } = args;

  if (eventStatus !== "FINAL") {
    return "OPEN" as const;
  }

  const orderedParticipants = getOrderedParticipants(participants);
  const selectedParticipant = findSelectedParticipant(selection, orderedParticipants);
  const selectedScore = toNumericScore(selectedParticipant?.score);

  if (marketType === "moneyline" || marketType === "fight_winner") {
    if (!selectedParticipant) {
      return "OPEN" as const;
    }

    if (selectedParticipant.isWinner === true) {
      return "WIN" as const;
    }

    if (selectedParticipant.isWinner === false) {
      return "LOSS" as const;
    }

    const otherParticipant = orderedParticipants.find(
      (participant) => participant.id !== selectedParticipant.id
    );
    const otherScore = toNumericScore(otherParticipant?.score);

    if (selectedScore === null || otherScore === null) {
      return "OPEN" as const;
    }

    if (selectedScore > otherScore) {
      return "WIN" as const;
    }

    if (selectedScore < otherScore) {
      return "LOSS" as const;
    }

    return "PUSH" as const;
  }

  if (marketType === "spread") {
    const opponent = orderedParticipants.find(
      (participant) => participant.id !== selectedParticipant?.id
    );
    const opponentScore = toNumericScore(opponent?.score);

    if (!selectedParticipant || selectedScore === null || opponentScore === null || typeof line !== "number") {
      return "OPEN" as const;
    }

    const adjustedMargin = selectedScore + line - opponentScore;
    if (adjustedMargin > 0) {
      return "WIN" as const;
    }

    if (adjustedMargin < 0) {
      return "LOSS" as const;
    }

    return "PUSH" as const;
  }

  if (marketType === "total") {
    const totalScore = orderedParticipants.reduce((total, participant) => {
      const score = toNumericScore(participant.score);
      return score === null ? total : total + score;
    }, 0);

    const hasAllScores = orderedParticipants.every((participant) => toNumericScore(participant.score) !== null);
    const totalSelection = normalizeSelection(side ?? selection);

    if (!hasAllScores || typeof line !== "number") {
      return "OPEN" as const;
    }

    if (totalSelection.includes("over")) {
      if (totalScore > line) {
        return "WIN" as const;
      }

      if (totalScore < line) {
        return "LOSS" as const;
      }

      return "PUSH" as const;
    }

    if (totalSelection.includes("under")) {
      if (totalScore < line) {
        return "WIN" as const;
      }

      if (totalScore > line) {
        return "LOSS" as const;
      }

      return "PUSH" as const;
    }

    return "OPEN" as const;
  }

  return "OPEN" as const;
}

export function buildEventStateDetail(args: {
  status: LedgerEventStatus;
  stateJson: Record<string, unknown> | null | undefined;
}) {
  const detail = args.stateJson?.detail;
  const shortDetail = args.stateJson?.shortDetail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (typeof shortDetail === "string" && shortDetail.trim()) {
    return shortDetail;
  }

  switch (args.status) {
    case "LIVE":
      return "In progress";
    case "FINAL":
      return "Final";
    case "POSTPONED":
      return "Postponed";
    case "CANCELED":
      return "Canceled";
    case "DELAYED":
      return "Delayed";
    default:
      return "Scheduled";
  }
}

export function calculateLegClv(openOdds: number, closingOdds: number | null, line: number | null, closingLine: number | null, marketType: LedgerMarketType, selection: string) {
  return {
    price: calculatePriceClv(openOdds, closingOdds),
    line: calculateLineClv({
      marketType,
      selection,
      line,
      closingLine
    })
  };
}

export function formatSyncAge(lastUpdatedAt: string | null) {
  if (!lastUpdatedAt) {
    return "Never synced";
  }

  const deltaMs = Date.now() - new Date(lastUpdatedAt).getTime();
  const minutes = Math.max(Math.round(deltaMs / 60000), 0);

  if (minutes < 1) {
    return "Just updated";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
