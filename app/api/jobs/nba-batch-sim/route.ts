import { batchBuildNbaSimCache } from "@/services/nba/nba-batch-sim-cache";
import { getPropsExplorerData } from "@/services/odds/props-service";

export async function GET() {
  try {
    const data = await getPropsExplorerData({
      league: "NBA",
      marketType: "ALL",
      team: "",
      player: "",
      sportsbook: "",
      valueFlag: "all",
      sortBy: "best_price"
    });
    const props = data.props ?? [];

    const result = await batchBuildNbaSimCache(props);

    return Response.json({ ok: true, result });
  } catch (error: any) {
    return Response.json({ ok: false, error: error?.message ?? "Batch sim failed" }, { status: 500 });
  }
}
