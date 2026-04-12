import type { GameCardView } from "@/lib/types/domain";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";

export type WorkflowMarketFocus = "all" | "moneyline" | "spread" | "total";
export type WorkflowTargetMarket = Exclude<WorkflowMarketFocus, "all">;
export type WorkflowBoardLeague = "ALL" | "NBA" | "MLB";
export type WorkflowBoardSort = "edge" | "movement" | "start";

export type WorkflowBoardState = {
  league: WorkflowBoardLeague;
  market: WorkflowMarketFocus;
  sort: WorkflowBoardSort;
  focus?: string | null;
};

export type GameWorkflowTarget = {
  market: WorkflowTargetMarket;
  book: string | null;
  label: string;
};

function toSearchParam(value: string | null | undefined) {
  return value && value.trim().length ? value.trim() : null;
}

export function resolveGameWorkflowTarget(
  game: GameCardView,
  preferredMarket: WorkflowMarketFocus
): GameWorkflowTarget {
  if (preferredMarket !== "all") {
    const book = toSearchParam(game[preferredMarket].bestBook) ?? toSearchParam(game.selectedBook?.name) ?? null;
    return {
      market: preferredMarket,
      book,
      label: preferredMarket === "moneyline" ? "Moneyline" : preferredMarket === "spread" ? "Spread" : "Total"
    };
  }

  const candidates = (["moneyline", "spread", "total"] as const).map((market) => ({
    market,
    opportunity: buildGameMarketOpportunity(game, market),
    book: toSearchParam(game[market].bestBook) ?? toSearchParam(game.selectedBook?.name) ?? null
  }));

  const best = [...candidates].sort(
    (left, right) => right.opportunity.opportunityScore - left.opportunity.opportunityScore
  )[0] ?? candidates[0];

  return {
    market: best.market,
    book: best.book,
    label: best.market === "moneyline" ? "Moneyline" : best.market === "spread" ? "Spread" : "Total"
  };
}

export function buildBoardReturnHref(state: WorkflowBoardState) {
  const params = new URLSearchParams();

  if (state.league !== "ALL") {
    params.set("league", state.league);
  }

  if (state.market !== "all") {
    params.set("market", state.market);
  }

  if (state.sort !== "edge") {
    params.set("sort", state.sort);
  }

  if (state.focus) {
    params.set("focus", state.focus);
  }

  const query = params.toString();
  return query ? `/board?${query}` : "/board";
}

export function buildGameWorkflowHref(
  baseHref: string,
  boardState: WorkflowBoardState,
  target: GameWorkflowTarget
) {
  const params = new URLSearchParams();
  params.set("market", target.market);

  if (target.book) {
    params.set("book", target.book);
  }

  params.set("boardLeague", boardState.league);
  params.set("boardMarket", boardState.market);
  params.set("boardSort", boardState.sort);

  if (boardState.focus) {
    params.set("boardFocus", boardState.focus);
  }

  params.set("ref", "board");

  const query = params.toString();
  return query ? `${baseHref}?${query}` : baseHref;
}

export function appendBoardStateToHref(href: string, boardState: WorkflowBoardState) {
  const [pathAndQuery, hashFragment] = href.split("#");
  const [pathPart, queryPart] = pathAndQuery.split("?");
  const params = new URLSearchParams(queryPart ?? "");

  params.set("boardLeague", boardState.league);
  params.set("boardMarket", boardState.market);
  params.set("boardSort", boardState.sort);

  if (boardState.focus) {
    params.set("boardFocus", boardState.focus);
  }

  params.set("ref", "board");

  const query = params.toString();
  const base = pathPart || "";
  const hash = hashFragment ? `#${hashFragment}` : "";
  return `${base}${query ? `?${query}` : ""}${hash}`;
}
