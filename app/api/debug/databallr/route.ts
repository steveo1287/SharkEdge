import { diagnoseDataballrPlayerContext } from "@/services/nba/adapters/databallr-adapter";
import { getDataBallrDebugPayload } from "@/services/nba/databallr-player-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const player = searchParams.get("player") || "LeBron James";
  const team = searchParams.get("team");
  const opponent = searchParams.get("opponent");

  const [context, supabaseMetrics] = await Promise.all([
    diagnoseDataballrPlayerContext({
      playerName: player,
      team,
      opponent
    }).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })),
    getDataBallrDebugPayload()
  ]);

  return Response.json({
    ok: supabaseMetrics.fetched && supabaseMetrics.normalizedCount > 0,
    playerContextEndpoint: context,
    supabaseMetrics,
    interpretation: supabaseMetrics.fetched
      ? supabaseMetrics.normalizedCount > 0
        ? "DataBallr Supabase player metrics are flowing into the SharkEdge NBA player feed normalizer."
        : "DataBallr responded, but rows did not normalize. Inspect sampleRawKeys and extend field mappings."
      : "DataBallr Supabase feed failed. Check URL/auth/network access."
  });
}
