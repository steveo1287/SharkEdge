import { getNbaFullStatProjectionView } from "@/services/simulation/nba-full-stat-projection-view";
import { buildPropsDeskPresentation } from "@/services/props/props-desk-presenter";

export async function getPropsCommandData(
  searchParams: Record<string, string | string[] | undefined>
) {
  const propsService = await import("@/services/odds/props-service");
  const filters = propsService.parsePropsFilters(searchParams);
  const data = await propsService.getPropsExplorerData(filters);

  const presentation = buildPropsDeskPresentation({
    data,
    filters
  });

  const fullStatProjectionView = filters.league === "NBA" || filters.league === "ALL"
    ? await getNbaFullStatProjectionView({ includeModelOnly: true, take: 500 })
    : null;

  return {
    filters,
    data,
    fullStatProjectionView,
    ...presentation
  };
}
