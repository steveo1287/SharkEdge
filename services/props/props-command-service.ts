import { applyNbaPropSafetyGate } from "@/services/props/nba-prop-safety-gate";
import { getNbaFullStatHealthSummary } from "@/services/simulation/nba-full-stat-health-summary";
import { getNbaFullStatProjectionView } from "@/services/simulation/nba-full-stat-projection-view";
import { buildPropsDeskPresentation } from "@/services/props/props-desk-presenter";

export async function getPropsCommandData(
  searchParams: Record<string, string | string[] | undefined>
) {
  const propsService = await import("@/services/odds/props-service");
  const filters = propsService.parsePropsFilters(searchParams);
  const data = await propsService.getPropsExplorerData(filters);
  const shouldLoadNbaFullStats = filters.league === "NBA" || filters.league === "ALL" || data.props.some((prop) => prop.leagueKey === "NBA");
  const fullStatProjectionView = shouldLoadNbaFullStats
    ? await getNbaFullStatProjectionView({ includeModelOnly: true, take: 500 })
    : null;
  const fullStatHealthSummary = shouldLoadNbaFullStats
    ? await getNbaFullStatHealthSummary({ includeModelOnly: true, take: 500 })
    : null;
  const nbaSafetyGate = shouldLoadNbaFullStats
    ? applyNbaPropSafetyGate({ props: data.props, fullStatProjectionView })
    : { props: data.props, summary: { gatedCount: 0, reasonCounts: [] } };
  const safeData = {
    ...data,
    props: nbaSafetyGate.props,
    sourceNote: nbaSafetyGate.summary.gatedCount
      ? `${data.sourceNote} NBA safety gate downgraded ${nbaSafetyGate.summary.gatedCount} prop row${nbaSafetyGate.summary.gatedCount === 1 ? "" : "s"} for projection/minutes/injury blockers.`
      : data.sourceNote
  };

  const presentation = buildPropsDeskPresentation({
    data: safeData,
    filters
  });

  return {
    filters,
    data: safeData,
    fullStatProjectionView,
    fullStatHealthSummary,
    nbaSafetyGateSummary: nbaSafetyGate.summary,
    ...presentation
  };
}
