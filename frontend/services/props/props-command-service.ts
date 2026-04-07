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

  return {
    filters,
    data,
    ...presentation
  };
}