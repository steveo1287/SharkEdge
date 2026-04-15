import type { FilterConditions, TrendStatsSummary } from "@/types/trends";

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function compactTeam(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  const words = trimmed.split(/\s+/);
  return words.length <= 2 ? titleCase(trimmed) : titleCase(words.slice(-2).join(" "));
}

function getSidePhrase(filters: FilterConditions) {
  if (filters.isUnderdog) return "Dog";
  if (filters.isFavorite) return "Favorite";
  if (filters.homeAway === "HOME") return "Home";
  if (filters.homeAway === "AWAY") return "Road";
  return "";
}

function getContextPhrase(filters: FilterConditions) {
  if (filters.backToBack === true) return "Back-to-Back";
  if (filters.restDays && filters.restDays.min >= 2) return "Rested";
  if (filters.lossStreak && filters.lossStreak.min >= 2) return "Bounce";
  if (filters.winStreak && filters.winStreak.min >= 3) return "Streak";
  if (filters.opponentName) return `Vs ${compactTeam(filters.opponentName)}`;
  if (filters.month?.length === 1) {
    return new Date(Date.UTC(2024, filters.month[0] - 1, 1)).toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC"
    });
  }
  return "";
}

function getBetPhrase(filters: FilterConditions) {
  if (filters.betType === "moneyline") return "Value";
  if (filters.betType === "total") {
    if (filters.totalRange?.max !== undefined && filters.totalRange.max <= 222) return "Under Run";
    return "Over Signal";
  }
  return "Edge";
}

export function generateTrendNaming(filters: FilterConditions, stats?: TrendStatsSummary) {
  const team = compactTeam(filters.team || filters.subject);
  const side = getSidePhrase(filters);
  const context = getContextPhrase(filters);
  const betPhrase = getBetPhrase(filters);

  const title =
    [team, context, side, betPhrase].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() ||
    "System Edge";

  const shortDescription = `${title} with ${filters.minGames}+ tracked games${stats ? ` and ${stats.winPercentage.toFixed(1)}% win rate` : ""}.`;
  const explanationBits = [
    filters.restDays ? `${filters.restDays.min}-${filters.restDays.max} days rest` : null,
    filters.backToBack === true ? "back-to-back spot" : null,
    filters.isFavorite ? "favorite pricing" : filters.isUnderdog ? "underdog pricing" : null,
    filters.opponentName ? `against ${compactTeam(filters.opponentName)}` : null
  ].filter(Boolean);

  return {
    title,
    shortDescription,
    explanation:
      explanationBits.length > 0
        ? `Triggered by ${explanationBits.join(", ")}.`
        : "Triggered by the current structured betting filters."
  };
}
